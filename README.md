# Paseo OM Status

A per-agent **OM** pill in Paseo's track bar, above the composer. It opens a read-only Observational Memory snapshot and leaves Pi's separate context meter in the composer toolbar. Refreshing does not send a command to the agent or start a turn.

## Compatibility

Verified with Paseo **0.17.4**, Pi **1.6.1** or **0.84.2**, and npm-installed `pi-observational-memory` **3.1.4** on a Unix daemon. No Pi downgrade is needed for 1.6.1.

## Install from GitHub

Install both pieces on the Paseo daemon machine. Use the Pi profile that the daemon launches for agents.

```sh
pi install git:github.com/dlpullen/paseo-om-status@v0.1.1
paseo plugin install git:dlpullen/paseo-om-status --ref v0.1.1
```

Pi installs OM 3.1.4 automatically as a package dependency. No settings edit is needed. If `pi list` shows a separate `npm:pi-observational-memory` install (including the old v0.1.0 setup), run `pi remove npm:pi-observational-memory` after installing the new companion so two copies don't load. If the standalone OM package came from Git or a local path instead, remove that source as listed by Pi. This leaves your `observational-memory` settings intact. The companion still provides the normal `/om:status` command. If the Paseo side is already installed and running, you can leave it in place; the bridge protocol didn't change.

Check `paseo plugin ls paseo-om-status` reports `running`, then start a new Pi agent. The pill appears in the track bar above the composer. For an existing idle session, reopening the agent picks up the bridge; opening the pill itself never reopens a session.

The Paseo install requires plugins to be enabled on the daemon. Installing a plugin with a session-open hook may cause existing sessions to reopen before their next prompt; it does not interrupt an active turn.

## Try it with one disposable agent

From this checkout, run `npm ci` if needed, then `bash test/paseo-smoke.sh --try`. It starts a separate loopback-only Paseo daemon on port 16767 with one blank Pi agent. It does not install anything into your existing Paseo daemon or Pi profile. By default it uses the pinned Pi and OM test fixtures; see [Verify](#verify) to use an installed Pi executable instead.

Open the printed URL and choose **OM sandbox → OM disposable agent**. Tap **OM · 0% to compaction** above the composer and use **↻** to refresh. The blank agent should stay at 0% and opening or refreshing should add nothing to the chat. To compare the values to the manual command, submit `/om:status` separately; that command can add chat rows. This sandbox has no real model credentials, so use it for status only.

Press Enter or Ctrl+C in the original terminal to stop and remove the sandbox. If the daemon machine is remote, forward port 16767 over SSH and open the printed loopback URL on your own machine.

## Install from a local checkout

1. Use Node.js 22.22 or newer for development. Run `npm ci` in this checkout; Pi does not install dependencies for local paths.
2. Load the companion with `pi install /absolute/path/to/paseo-om-status`, or add `-e /absolute/path/to/paseo-om-status/pi/index.ts` to the compatible Pi launch wrapper. Remove any separately installed OM package as described above.
3. On the daemon, install the checkout with `paseo plugin install /absolute/path/to/paseo-om-status` (plugins must already be enabled). Start a new test agent or reopen an idle Pi agent to pick up the bridge. After a plugin reload, already-running Pi sessions need to be reopened to get a new socket.

The plugin reads only metrics from the selected live Pi session over a private local socket. It does not read session logs, Hindsight, or the Pi context count. If the session has no bridge, the pill shows unavailable. A bridge on an unsupported Pi version reports the session as inapplicable. Samples expire after 30 seconds and the pill polls only while mounted.

## Verify

```sh
npm ci
npm run typecheck
npm test
npm pack --dry-run --json
bash test/paseo-smoke.sh  # with the Paseo 0.17.4 CLI installed
```

The smoke test starts a disposable loopback daemon and two Pi agents. To exercise an installed Pi instead of the 0.84.2 fixture, set `PASEO_OM_TEST_PI` to the Pi executable. Both `npm test` and the smoke test accept this override and use the checkout's pinned OM dependency. To also test the bundled web UI at 1400 px and 390 px, set `PASEO_OM_PLAYWRIGHT_PATH` to a local `playwright-core/index.mjs` and `PASEO_OM_CHROMIUM` to a Chromium executable. No existing daemon or Pi profile is changed.

See the [handoff](HANDOFF.md), [compatibility notes](docs/paseo-0.17.4-compatibility.md), and approved [closed](docs/mockups/closed.png) and [open](docs/mockups/open.png) mockups for design context. The content follows the mockups, with the track-bar placement and compact bottom sheet provided by stock Paseo.
