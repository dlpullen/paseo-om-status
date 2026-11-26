import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// OM formats counts for the Pi process locale. Keep those strings intact.
const count = z.string().min(1).max(64);
const percentage = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const progress = z.object({
  tokens: count,
  budget: count,
  percent: percentage,
});
const counts = z.object({
  recorded: count,
  visible: count,
  added: count.optional(),
});
export const metricsSchema = z.object({
  compaction: progress,
  observation: progress,
  reflection: progress,
  observations: counts.extend({
    dropped: count,
    active: count,
    removed: count.optional(),
  }),
  reflections: counts,
  visiblePool: progress,
  activePool: progress,
  reflectionPool: count,
  passive: z.boolean(),
  inFlight: z.array(z.string().max(256)).max(3),
  errors: z.array(z.string().max(2048)).max(3),
});

export const identitySchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1).max(128),
  revision: z.uuid(),
});
export const sampleSchema = identitySchema.extend({ metrics: metricsSchema });
export const bridgeReplySchema = z.union([
  sampleSchema,
  identitySchema.extend({ inapplicable: z.literal(true) }),
]);
export const resultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), ...sampleSchema.shape }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("inapplicable") }),
]);
export type OmMetrics = z.infer<typeof metricsSchema>;
export type OmResult = z.infer<typeof resultSchema>;

export const readStatus = defineRpc({
  name: "om.status",
  input: z.object({
    agentId: z.uuid(),
    workspaceId: z.string().min(1).max(128),
    sessionId: identitySchema.shape.sessionId,
  }),
  output: resultSchema,
});
