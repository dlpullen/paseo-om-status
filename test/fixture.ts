export const fixtureText = `── Memory ──
Observations: 6 recorded / 0 dropped / 6 active / 0 visible +6
Reflections:  3 recorded / 0 visible +3

── Activity ──
Next observation: ~5,059 / 10,000 tokens (51%)
Next reflection:  ~5,059 / 20,000 tokens (25%)
Next compaction:  ~41,609 / 81,000 estimated source tokens (51%)
Visible observation pool: ~0 / 20,000 tokens (0%)
Active observation pool: ~413 / 10,000 target tokens (4%)
Reflection pool:         ~0 tokens`;

export const fixtureMetrics = {
  compaction: { tokens: "41,609", budget: "81,000", percent: 51 },
  observation: { tokens: "5,059", budget: "10,000", percent: 51 },
  reflection: { tokens: "5,059", budget: "20,000", percent: 25 },
  observations: {
    recorded: "6",
    dropped: "0",
    active: "6",
    visible: "0",
    added: "6",
    removed: undefined,
  },
  reflections: { recorded: "3", visible: "0", added: "3" },
  visiblePool: { tokens: "0", budget: "20,000", percent: 0 },
  activePool: { tokens: "413", budget: "10,000", percent: 4 },
  reflectionPool: "0",
  passive: false,
  inFlight: [],
  errors: [],
};
