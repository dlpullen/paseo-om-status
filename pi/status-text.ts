import type { OmMetrics } from "../shared/status.ts";

// Decode the OM status format verified with 3.1.4, never chat or a session log.
// OM localized these strings already; neither the parser nor the UI recalculates them.
const number = String.raw`(\p{Nd}[\p{Nd}\p{Zs}.,'’٬]*)`;
const progress = (label: string, unit: string) =>
  new RegExp(
    String.raw`^${label}: +~${number} / ${number} ${unit} \((\d+)%\)$`,
    "u",
  );
const observationsPattern = new RegExp(
  String.raw`^Observations: (\d+) recorded / (\d+) dropped / (\d+) active / (\d+) visible(?: \+${number})?(?: -${number})?$`,
  "u",
);
const reflectionsPattern = new RegExp(
  String.raw`^Reflections: +(\d+) recorded / (\d+) visible(?: \+${number})?$`,
  "u",
);
const reflectionPoolPattern = new RegExp(
  String.raw`^Reflection pool: +~${number} tokens$`,
  "u",
);
const patterns = [
  progress("Next compaction", "estimated source tokens"),
  progress("Next observation", "tokens"),
  progress("Next reflection", "tokens"),
  progress("Visible observation pool", "tokens"),
  progress("Active observation pool", "target tokens"),
];

export function parseStatus(text: string): OmMetrics | null {
  const lines = text.split("\n");
  const match = (pattern: RegExp) => {
    const matching = lines.filter((line) => pattern.test(line));
    return matching.length === 1 ? pattern.exec(matching[0]) : null;
  };
  const resolution = patterns.map((pattern) => {
    const entry = match(pattern);
    if (!entry) return null;
    const [, tokens, budget, pct] = entry;
    const percent = Number(pct);
    return Number.isSafeInteger(percent) ? { tokens, budget, percent } : null;
  });
  const [compaction, observation, reflection, visiblePool, activePool] =
    resolution;
  const obs = match(observationsPattern);
  const refl = match(reflectionsPattern);
  const pool = match(reflectionPoolPattern);
  if (
    !compaction ||
    !observation ||
    !reflection ||
    !visiblePool ||
    !activePool ||
    !obs ||
    !refl ||
    !pool
  )
    return null;
  const [, recorded, dropped, active, visible, added, removed] = obs;
  return {
    compaction,
    observation,
    reflection,
    visiblePool,
    activePool,
    observations: { recorded, dropped, active, visible, added, removed },
    reflections: { recorded: refl[1], visible: refl[2], added: refl[3] },
    reflectionPool: pool[1],
    passive: lines.includes("── Mode ──"),
    inFlight: lines.filter((line) =>
      /^(Consolidation|Auto-compaction|Compaction hook): /.test(line),
    ),
    errors: lines.filter((line) =>
      /^(Observer|Reflector|Dropper): /.test(line),
    ),
  };
}
