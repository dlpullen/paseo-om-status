import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createPaseoApi } from "@getpaseo/client";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";

const path = process.env.PASEO_OM_TEST_DIR;
const port = process.env.PASEO_OM_TEST_PORT;
const manual = process.argv[2] === "--try";
assert.ok(path && port, "Run bash test/paseo-smoke.sh");
const dc = new DaemonClient({
  url: `ws://127.0.0.1:${port}/ws`,
  clientId: randomUUID(),
  clientType: "browser",
  appVersion: "0.17.4",
  localCredential: () =>
    readFileSync(`${path}/paseo/local-credential`, "utf8").trim(),
  connectTimeoutMs: 5_000,
  reconnect: { enabled: false },
});

try {
  await dc.connect();
  const pluginId = "paseo-om-status";
  const catalog = (await dc.getPluginCatalog()).find(
    ({ id }) => id === pluginId,
  );
  assert.ok(
    catalog?.clientBundle,
    "The installed client bundle is in the catalog",
  );
  const plugin = (await dc.listPlugins()).find(({ id }) => id === pluginId);
  assert.equal(plugin?.status, "running");

  const paseo = createPaseoApi(dc);
  const work = await paseo.workspaces.create({
    title: manual ? "OM sandbox" : "OM smoke",
    source: { kind: "directory", path: `${path}/work` },
  });
  const config = { provider: "pi/openai/gpt-4o-mini" };
  const first = await work.agents.create({
    config,
    title: manual ? "OM disposable agent" : "OM agent A",
  });
  const a = (await first.refresh()).agent;
  assert.ok(a.runtimeInfo?.sessionId);

  const invoke = (agent, sessionId) =>
    dc.invokePluginRpc(pluginId, "om.status", {
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      sessionId,
    });
  const timeline = () =>
    first.timeline.refetch({ direction: "tail", limit: 20 });
  const before = await timeline();
  assert.ok(Array.isArray(before.entries));
  const status = await invoke(a, a.runtimeInfo.sessionId);
  assert.equal(status.kind, "ready", JSON.stringify(status));
  assert.equal(status.sessionId, a.runtimeInfo.sessionId);
  if (!manual) {
    const second = await work.agents.create({ config, title: "OM agent B" });
    const b = (await second.refresh()).agent;
    assert.ok(b.runtimeInfo?.sessionId);
    assert.notEqual(a.runtimeInfo.sessionId, b.runtimeInfo.sessionId);
    assert.equal(
      (await invoke(b, a.runtimeInfo.sessionId)).kind,
      "unavailable",
    );
    assert.equal((await invoke(b, b.runtimeInfo.sessionId)).kind, "ready");
  }
  const refreshed = await invoke(a, a.runtimeInfo.sessionId);
  assert.deepEqual(refreshed, status);
  assert.deepEqual((await timeline()).entries, before.entries);
  assert.deepEqual((await first.refresh()).agent.activeTurn, a.activeTurn);
  console.log(
    "Paseo 0.17.4: plugin running, client bundle available, selected-session RPC ready, timeline unchanged.",
  );

  if (manual) {
    console.log(
      `\nOpen http://127.0.0.1:${port}/ and select OM sandbox → OM disposable agent.`,
    );
    console.log(
      `Direct agent link: http://127.0.0.1:${port}/h/${dc.getLastServerInfoMessage().serverId}/agent/${a.id}`,
    );
  } else if (process.env.PASEO_OM_PLAYWRIGHT_PATH) {
    const { chromium } = await import(process.env.PASEO_OM_PLAYWRIGHT_PATH);
    const browser = await chromium.launch({
      executablePath: process.env.PASEO_OM_CHROMIUM,
    });
    try {
      for (const viewport of [
        { width: 1400, height: 900 },
        { width: 390, height: 740 },
      ]) {
        const page = await browser.newPage({ viewport });
        const target = `http://127.0.0.1:${port}/h/${dc.getLastServerInfoMessage().serverId}/agent/${a.id}`;
        try {
          await page.goto(`http://127.0.0.1:${port}/`);
          await page
            .getByText("OM smoke", { exact: true })
            .first()
            .waitFor({ state: "attached", timeout: 8_000 });
          await page.goto(target);
          const contextMeter = page
            .getByTestId("context-window-meter")
            .filter({ visible: true })
            .first();
          if (viewport.width < 600)
            await contextMeter.click({ trial: true, timeout: 10_000 });
          else await contextMeter.hover({ trial: true, timeout: 10_000 });
          await page
            .getByText(
              `OM · ${status.metrics.compaction.percent}% to compaction`,
              { exact: true },
            )
            .click({ timeout: 12_000 });
          await page
            .getByText("Next compaction", { exact: true })
            .waitFor({ timeout: 5_000 });
          await page
            .getByRole("button", {
              name: "Refresh observational memory status",
            })
            .click();
          await page
            .getByText("Reflection pool", { exact: true })
            .waitFor({ timeout: 5_000 });
          assert.deepEqual((await timeline()).entries, before.entries);
          console.log(
            `Paseo web ${viewport.width}px: status opened and refreshed; timeline unchanged.`,
          );
        } catch (error) {
          console.error(
            "Browser URL:",
            page.url(),
            "body:",
            (await page.locator("body").innerText()).slice(0, 1600),
          );
          throw error;
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await dc.close();
}
