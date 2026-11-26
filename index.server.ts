import type { PluginServerContext } from "@getpaseo/plugin/server";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAgentStatus } from "./server/bridge.ts";
import { readStatus } from "./shared/status.ts";
import { BRIDGE_DIRECTORY, BRIDGE_SOCKET } from "./shared/wire.ts";

export default function contribute(server: PluginServerContext) {
  const launches = new Map<string, string>();
  let root: string | undefined;
  let stopped = false;
  const remove = (agentId: string) => {
    const directory = launches.get(agentId);
    launches.delete(agentId);
    if (directory) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        /* No longer addressable. */
      }
    }
  };

  server.addHook("agent.open.before", async ({ request }) => {
    if (
      stopped ||
      process.platform === "win32" ||
      request.provider !== "pi" ||
      request.purpose !== "interactive" ||
      !request.workspaceId ||
      request.background
    )
      return;
    remove(request.agentId);
    try {
      root ??= mkdtempSync(join(tmpdir(), "paseo-om-"));
      const directory = mkdtempSync(join(root, "s-"));
      if (Buffer.byteLength(join(directory, BRIDGE_SOCKET)) > 103) {
        rmSync(directory, { recursive: true, force: true });
        return;
      }
      launches.set(request.agentId, directory);
      return {
        ...request,
        env: { ...request.env, [BRIDGE_DIRECTORY]: directory },
      };
    } catch {
      // OM availability cannot prevent the agent from opening.
      return;
    }
  });
  server.addHook("agent.archive.after", async ({ agent }) => {
    remove(agent.id);
  });

  server.handle(readStatus, (target, { paseo }) =>
    readAgentStatus(target, {
      snapshot: async (agentId) =>
        (await paseo.agents.ref(agentId).refresh())?.agent ?? null,
      socketPath: (agentId) => {
        const directory = launches.get(agentId);
        return directory && join(directory, BRIDGE_SOCKET);
      },
    }),
  );

  return () => {
    stopped = true;
    launches.clear();
    if (root) rmSync(root, { recursive: true, force: true });
  };
}
