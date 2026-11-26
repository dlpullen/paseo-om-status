import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createStatusState, statusLabel } from "../client/status-state.ts";
import { parseStatus } from "../pi/status-text.ts";
import { readAgentStatus } from "../server/bridge.ts";
import type { OmResult } from "../shared/status.ts";
import { fixtureMetrics, fixtureText } from "./fixture.ts";

const ready = (sessionId: string) => ({
  kind: "ready" as const,
  version: 1 as const,
  sessionId,
  revision: randomUUID(),
  metrics: fixtureMetrics,
});

test("the parser preserves every fixture metric and rejects incomplete/ambiguous output", () => {
  assert.deepEqual(parseStatus(fixtureText), fixtureMetrics);
  assert.equal(
    parseStatus(fixtureText.replace(/Next compaction: .+\n/, "")),
    null,
  );
  assert.equal(parseStatus(fixtureText + "\nReflection pool: ~0 tokens"), null);
  const varied = parseStatus(
    fixtureText
      .replace(
        "41,609 / 81,000 estimated source tokens (51%)",
        "١٢٠٬٠٠٠ / ٨١٬٠٠٠ estimated source tokens (148%)",
      )
      .replace("0 visible +6", "0 visible +6 -2"),
  );
  assert.deepEqual(varied?.compaction, {
    tokens: "١٢٠٬٠٠٠",
    budget: "٨١٬٠٠٠",
    percent: 148,
  });
  assert.equal(varied?.observations.removed, "2");
});

test("the daemon rejects agent, Pi session, socket generation and bridge revision mismatches", async () => {
  const target = { agentId: randomUUID(), workspaceId: "test", sessionId: "a" };
  const active = {
    id: target.agentId,
    workspaceId: "test",
    provider: "pi",
    runtimeInfo: { sessionId: "a" },
  };
  const { kind, ...sample } = ready("a");
  let current = active;
  let path = "/first.sock";
  let delay = async () => {};
  let revision = sample.revision;
  let payload = sample;
  const deps = {
    snapshot: async () => current,
    socketPath: () => path,
    read: async (_socket: string, _sid: string, method: "GET" | "HEAD") => {
      if (method === "GET") await delay();
      return { body: JSON.stringify(payload), revision };
    },
  };
  assert.equal((await readAgentStatus(target, deps)).kind, kind);
  delay = async () => {
    current = { ...active, runtimeInfo: { sessionId: "b" } };
  };
  assert.equal((await readAgentStatus(target, deps)).kind, "unavailable");
  current = active;
  delay = async () => {
    path = "/new.sock";
  };
  assert.equal((await readAgentStatus(target, deps)).kind, "unavailable");
  delay = async () => {};
  revision = randomUUID();
  assert.equal((await readAgentStatus(target, deps)).kind, "unavailable");
  revision = sample.revision;
  payload = { ...sample, sessionId: "different" };
  assert.equal((await readAgentStatus(target, deps)).kind, "unavailable");
  assert.equal(
    (await readAgentStatus(target, { ...deps, socketPath: () => undefined }))
      .kind,
    "unavailable",
  );
  assert.equal(
    (
      await readAgentStatus(target, {
        ...deps,
        read: async () => {
          throw new Error("timed out");
        },
      })
    ).kind,
    "unavailable",
  );
  current = { ...active, provider: "codex" };
  assert.equal((await readAgentStatus(target, deps)).kind, "inapplicable");
});

test("pending requests from a different Pi session and older refreshes cannot replace the current label", async () => {
  const pending = new Map<string, Array<(response: OmResult) => void>>();
  const model = createStatusState(
    (id) =>
      new Promise((resolve) => {
        const queue = pending.get(id) ?? [];
        queue.push(resolve);
        pending.set(id, queue);
      }),
  );
  try {
    model.select("a");
    const first = model.refresh();
    model.select("b");
    const second = model.refresh();
    const third = model.refresh();
    pending.get("b")?.[1](ready("b"));
    await third;
    pending.get("a")?.[0](ready("a"));
    pending.get("b")?.[0]({ kind: "unavailable" });
    await Promise.all([first, second]);
    assert.equal(statusLabel(model.get()), "OM · 51% to compaction");
    model.select("c");
    assert.equal(statusLabel(model.get()), "OM · unavailable");
  } finally {
    model.dispose();
  }
});

test("leaving an agent invalidates its pending request without changing the new agent's pill", async () => {
  let finishFirst: ((value: OmResult) => void) | undefined;
  const first = createStatusState(
    () =>
      new Promise((resolve) => {
        finishFirst = resolve;
      }),
  );
  const second = createStatusState(async (id) => ({
    ...ready(id),
    metrics: {
      ...fixtureMetrics,
      compaction: { ...fixtureMetrics.compaction, percent: 74 },
    },
  }));
  first.select("pi-a");
  second.select("pi-b");
  const leaveFirst = first.activate();
  try {
    leaveFirst();
    await second.refresh();
    assert.ok(finishFirst);
    finishFirst(ready("pi-a"));
    await Promise.resolve();
    assert.equal(statusLabel(first.get()), "OM · unavailable");
    assert.equal(statusLabel(second.get()), "OM · 74% to compaction");
  } finally {
    first.dispose();
    second.dispose();
  }
});

test("an expired sample leaves no percentage on the pill", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const model = createStatusState(async (id) => ready(id));
  try {
    model.select("a");
    await model.refresh();
    assert.equal(model.get().kind, "ready");
    t.mock.timers.tick(30_000);
    assert.deepEqual(model.get(), { kind: "stale" });
    assert.equal(statusLabel(model.get()), "OM · stale");
  } finally {
    model.dispose();
  }
});
