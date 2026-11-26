import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { parseStatus } from "../pi/status-text.ts";
import { readBridge } from "../server/bridge.ts";
import { sampleSchema } from "../shared/status.ts";
import { BRIDGE_DIRECTORY, BRIDGE_SOCKET } from "../shared/wire.ts";

test(
  "reads real OM status without Pi output, messages or turns, and rejects a switched session",
  {
    skip: process.platform === "win32",
    timeout: 15_000,
  },
  async () => {
    const cwd = await mkdtemp("/tmp/paseo-om-test-");
    const piDir = join(cwd, "agent");
    const bridgeDir = join(cwd, "bridge");
    await mkdir(bridgeDir);
    // There must be no separately installed OM in this profile.
    await mkdir(piDir);
    const executable = process.env.PASEO_OM_TEST_PI;
    const pi = spawn(
      executable ?? process.execPath,
      [
        ...(executable ? [] : [resolve("node_modules/.bin/pi")]),
        "--mode",
        "rpc",
        "--no-session",
        "--no-extensions",
        "-e",
        resolve("pi/index.ts"),
      ],
      {
        cwd,
        env: {
          PATH: process.env.PATH,
          HOME: cwd,
          PI_OFFLINE: "1",
          PI_CODING_AGENT_DIR: piDir,
          [BRIDGE_DIRECTORY]: bridgeDir,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const exit = once(pi, "exit");
    const messages: Array<Record<string, unknown>> = [];
    let stderr = "";
    pi.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    const lines = createInterface({ input: pi.stdout });
    lines.on("line", (line) => {
      messages.push(JSON.parse(line));
    });
    let request = 0;
    const waitFor = async (
      predicate: (event: Record<string, unknown>) => boolean,
    ) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        const found = messages.find(predicate);
        if (found) return found;
        if (pi.exitCode !== null) break;
        await delay(25);
      }
      throw new Error(`Expected Pi RPC reply; stderr: ${stderr}`);
    };
    const rpc = async (type: string, params = {}) => {
      const id = String(++request);
      pi.stdin.write(JSON.stringify({ id, type, ...params }) + "\n");
      const reply = await waitFor(
        (event) => event.type === "response" && event.id === id,
      );
      assert.equal(reply.success, true, JSON.stringify(reply));
      return reply.data;
    };
    const session = async () => {
      const state = (await rpc("get_state")) as {
        sessionId: string;
        messageCount: number;
      };
      assert.equal(state.messageCount, 0);
      return state.sessionId;
    };
    try {
      const original = await session();
      const { commands } = (await rpc("get_commands")) as {
        commands: Array<{ name: string }>;
      };
      assert.deepEqual(
        commands
          .map(({ name }) => name)
          .filter((name) => name.startsWith("om:"))
          .sort(),
        ["om:status", "om:view"],
      );
      await rpc("prompt", { message: "/om:status" }); // separate, human-command control
      const notify = await waitFor(
        (event) =>
          event.method === "notify" &&
          typeof event.message === "string" &&
          event.message.includes("Next compaction:"),
      );
      assert.equal(typeof notify.message, "string");
      const control = parseStatus(notify.message as string);
      assert.ok(control);

      const socket = join(bridgeDir, BRIDGE_SOCKET);
      const before = messages.length;
      for (let i = 0; i < 2; i++) {
        const reply = sampleSchema.parse(
          JSON.parse((await readBridge(socket, original, "GET")).body),
        );
        assert.deepEqual(reply.metrics, JSON.parse(JSON.stringify(control)));
        assert.equal(
          (await readBridge(socket, original, "HEAD")).revision,
          reply.revision,
        );
      }
      assert.equal(await session(), original);
      assert.deepEqual(
        messages.slice(before).map(({ type, command }) => [type, command]),
        [["response", "get_state"]],
      );
      assert.equal(
        messages.some(
          ({ type }) => type === "agent_start" || type === "turn_start",
        ),
        false,
      );

      await rpc("new_session");
      const switched = await session();
      assert.notEqual(switched, original);
      await assert.rejects(readBridge(socket, original, "GET"), /unavailable/);
      assert.equal(
        sampleSchema.parse(
          JSON.parse((await readBridge(socket, switched, "GET")).body),
        ).sessionId,
        switched,
      );
    } finally {
      pi.kill();
      await exit;
      lines.close();
      await rm(cwd, { recursive: true, force: true });
    }
  },
);
