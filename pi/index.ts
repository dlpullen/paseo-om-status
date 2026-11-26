import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { isAbsolute, join } from "node:path";
import {
  BRIDGE_DIRECTORY,
  BRIDGE_SOCKET,
  BRIDGE_TIMEOUT_MS,
  MAX_BRIDGE_BYTES,
  REVISION_HEADER,
  SESSION_HEADER,
} from "../shared/wire.ts";
import { parseStatus } from "./status-text.ts";

type Command = Parameters<ExtensionAPI["registerCommand"]>[1];
type Binding = { ctx: ExtensionContext; revision: string };

export default async function contribute(pi: ExtensionAPI): Promise<void> {
  const directory = process.env[BRIDGE_DIRECTORY];
  const address =
    directory && isAbsolute(directory) && process.platform !== "win32"
      ? join(directory, BRIDGE_SOCKET)
      : null;
  const { default: observationalMemory } =
    await import("pi-observational-memory/src/index.ts");
  let status: Command["handler"] | undefined;
  // Register normal OM regardless of Pi's version or whether Paseo can read status.
  await observationalMemory(
    address
      ? new Proxy(pi, {
          get(target, property, receiver) {
            if (property !== "registerCommand")
              return Reflect.get(target, property, receiver);
            return (name: string, command: Command) => {
              if (name === "om:status") status = command.handler;
              target.registerCommand(name, command);
            };
          },
        })
      : pi,
  );
  if (!address) return;

  let binding: Binding | null = null;
  const bridge = createServer(async (request, response) => {
    const active = binding;
    if (
      !active ||
      request.url !== "/status" ||
      (request.method !== "GET" && request.method !== "HEAD")
    ) {
      response.writeHead(404).end();
      return;
    }
    try {
      const sessionId = active.ctx.sessionManager.getSessionId();
      if (request.headers[SESSION_HEADER] !== sessionId) {
        response.writeHead(409).end();
        return;
      }
      const identity = { version: 1, sessionId, revision: active.revision };
      if (request.method === "HEAD") {
        response.writeHead(200, { [REVISION_HEADER]: identity.revision }).end();
        return;
      }
      if (!status) {
        response
          .writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          })
          .end(JSON.stringify({ ...identity, inapplicable: true }));
        return;
      }

      let text: string | undefined;
      // Audited against 3.1.4's handler. Provide only the four reads it needs (including
      // the captured notification). No native UI, prompt, mutation, or command context.
      await Reflect.apply(status, undefined, [
        "",
        {
          cwd: active.ctx.cwd,
          model: active.ctx.model,
          sessionManager: {
            getBranch: () => active.ctx.sessionManager.getBranch(),
          },
          ui: {
            notify: (message: string) => {
              text = message;
            },
          },
        },
      ]);
      const metrics =
        text && text.length <= MAX_BRIDGE_BYTES ? parseStatus(text) : null;
      if (
        binding !== active ||
        active.ctx.sessionManager.getSessionId() !== sessionId
      ) {
        response.writeHead(409).end();
        return;
      }
      if (!metrics) {
        // OM can keep working even if a newer release changes the report format.
        response.writeHead(503).end();
        return;
      }
      const body = JSON.stringify({ ...identity, metrics });
      if (Buffer.byteLength(body) > MAX_BRIDGE_BYTES) {
        response.writeHead(503).end();
        return;
      }
      response
        .writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
        })
        .end(body);
    } catch {
      response.writeHead(503).end();
    }
  });
  bridge.on("error", () => {
    binding = null;
  });
  bridge.setTimeout(BRIDGE_TIMEOUT_MS, (socket) => socket.destroy());
  bridge.maxConnections = 8;
  pi.on("session_start", (_event, ctx) => {
    binding = { ctx, revision: randomUUID() };
    if (!bridge.listening) {
      bridge.listen(address);
      bridge.unref();
    }
  });
  pi.on("session_shutdown", async () => {
    binding = null;
    // Shutdown also precedes native new/resume/fork and reload. The next extension
    // instance must not race this listener for the same launch-local pathname.
    await new Promise<void>((done) => {
      bridge.close(() => done());
      bridge.closeAllConnections();
    });
  });
}
