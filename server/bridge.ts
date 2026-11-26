import { request } from "node:http";
import {
  BRIDGE_TIMEOUT_MS,
  MAX_BRIDGE_BYTES,
  REVISION_HEADER,
  SESSION_HEADER,
} from "../shared/wire.ts";
import { bridgeReplySchema, type OmResult } from "../shared/status.ts";

export type Target = {
  agentId: string;
  workspaceId: string;
  sessionId: string;
};
export type AgentIdentity = {
  id: string;
  provider: string;
  workspaceId?: string;
  archivedAt?: string | null;
  runtimeInfo?: { sessionId: string | null };
};
type Dependencies = {
  snapshot(agentId: string): Promise<AgentIdentity | null>;
  socketPath(agentId: string): string | undefined;
  read?: typeof readBridge;
};

export async function readAgentStatus(
  target: Target,
  deps: Dependencies,
): Promise<OmResult> {
  const unavailable = { kind: "unavailable" } as const;
  const applicable = (agent: AgentIdentity | null) =>
    agent &&
    agent.id === target.agentId &&
    agent.provider === "pi" &&
    agent.workspaceId === target.workspaceId &&
    !agent.archivedAt;
  const read = deps.read ?? readBridge;
  try {
    const agent = await deps.snapshot(target.agentId);
    if (!applicable(agent)) return { kind: "inapplicable" };
    const socket = deps.socketPath(target.agentId);
    if (!socket || agent?.runtimeInfo?.sessionId !== target.sessionId)
      return unavailable;

    const reply = await read(socket, target.sessionId, "GET");
    const sample = bridgeReplySchema.safeParse(JSON.parse(reply.body));
    if (!sample.success || sample.data.sessionId !== target.sessionId)
      return unavailable;

    const current = await deps.snapshot(target.agentId);
    if (
      !applicable(current) ||
      current?.runtimeInfo?.sessionId !== target.sessionId
    )
      return unavailable;
    const { revision } = await read(socket, target.sessionId, "HEAD");
    if (
      revision !== sample.data.revision ||
      deps.socketPath(target.agentId) !== socket
    )
      return unavailable;
    return "inapplicable" in sample.data
      ? { kind: "inapplicable" }
      : { kind: "ready", ...sample.data };
  } catch {
    return unavailable;
  }
}

export function readBridge(
  socketPath: string,
  sessionId: string,
  method: "GET" | "HEAD",
) {
  return new Promise<{ body: string; revision: string | undefined }>(
    (resolve, reject) => {
      const req = request({
        socketPath,
        path: "/status",
        method,
        agent: false,
        headers: { [SESSION_HEADER]: sessionId },
      });
      const timer = setTimeout(
        () => req.destroy(new Error("OM bridge timed out")),
        BRIDGE_TIMEOUT_MS,
      );
      req.on("close", () => clearTimeout(timer));
      req.on("error", reject);
      req.on("response", (res) => {
        if (res.statusCode !== 200) {
          res.destroy();
          reject(new Error("OM bridge unavailable"));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        res.on("error", reject);
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_BRIDGE_BYTES) {
            res.destroy(new Error("OM bridge response too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const revision = res.headers[REVISION_HEADER];
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            revision: typeof revision === "string" ? revision : undefined,
          });
        });
      });
      req.end();
    },
  );
}
