# Implementation handoff

Build a single discreet per-agent composer pill labeled `OM · 51% to compaction` for the sample state. Place it near Paseo’s Pi context indicator and keep the existing indicator visible. Tapping the pill opens a read-only popover showing the selected Pi session’s `/om:status` metrics. Opening and refreshing status must produce zero chat messages and model turns. Follow the approved [closed](docs/mockups/closed.png) and [open](docs/mockups/open.png) screenshots and the [HTML mockup](docs/mockups/mock.html).

## First task

Inspect the installed Paseo 0.17.4 client, daemon, and SDK contracts for composer pills, anchored popovers, placement, and selected Pi session identity. Verify whether a narrowly scoped structured read-only status route exists for that exact session. If it requires an adapter, choose one after inspecting both sides and document the constraints. Keep `pi-observational-memory` authoritative for the counts, budgets, and percentages. Leave Hindsight, memory storage, and Pi’s independent context count out of the data path. Display OM’s calculations as supplied.

Handle unavailable and stale status explicitly and treat unsupported agents or sessions as inapplicable. Never substitute zero values or data from another agent or session. Account for late responses during agent and session switches.

## Approved fixture

These values are design fixtures, not live telemetry.

| Metric | Fixture |
| --- | --- |
| Compaction | 41,609 / 81,000 estimated source tokens (51%) |
| Observation | 5,059 / 10,000 (51%) |
| Reflection | 5,059 / 20,000 (25%) |
| Observations | 6 recorded, 0 dropped, 6 active, 0 visible, +6 drift |
| Reflections | 3 recorded, 0 visible, +3 drift |
| Visible observation pool | ~0 / 20,000 (0%) |
| Active observation pool | ~413 / 10,000 (4%) |
| Reflections pool | ~0 |

## Acceptance

- Match the approved closed and open layouts on wide and narrow clients, including proximity to the Pi context indicator and continued access to it.
- Compare all displayed fields against real `/om:status` for the same agent and Pi session. Verify that opening and refreshing leave the conversation and model turn count untouched.
- Switch agents and Pi sessions, including while a request is pending. Check unavailable, stale, and inapplicable states.
- Run `npm ci`, `npm run typecheck`, and `npm pack --dry-run --json`. Check that all runtime files and assets are included.

## References

- [Paseo plugin quickstart](https://paseo.sh/docs/plugins.md) and [plugin reference](https://paseo.sh/docs/plugins/reference.md). Verify version-sensitive details against the installed 0.17.4 SDK and host.
- [pi-observational-memory upstream](https://github.com/elpapi42/pi-observational-memory). The reference version is 3.1.4, installed under the Pi profile's `npm/node_modules/pi-observational-memory`. Start with `package.json` and `src/commands/status.ts`.

## Starter prompt

> Read the applicable repository instructions and HANDOFF.md. Build the Pi Observational Memory status pill and popover in this workspace using the approved mockups. Start by verifying Paseo 0.17.4 placement and popover support and tracing a structured, read-only status route for the selected Pi session. Base any adapter on the installed contracts and keep the displayed numbers identical to OM’s own status. Validate the acceptance checks in HANDOFF.md and report any host limitation that affects the design.
