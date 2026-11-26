import type { OmResult } from "../shared/status.ts";

type Ready = Extract<OmResult, { kind: "ready" }>;
export type Status =
  | Ready
  | { kind: "loading" | "unavailable" | "stale" | "inapplicable" };
const FRESHNESS_MS = 30_000;
const POLL_MS = 15_000;

export function statusLabel(status: Status): string {
  switch (status.kind) {
    case "ready":
      return `OM · ${status.metrics.compaction.percent}% to compaction`;
    case "unavailable":
      return "OM · unavailable";
    case "stale":
      return "OM · stale";
    case "inapplicable":
      return "OM · not supported";
    default:
      return "OM";
  }
}

export function createStatusState(
  read: (sessionId: string) => Promise<OmResult>,
) {
  const listeners = new Set<() => void>();
  let sessionId: string | null = null;
  let model: string | null = null;
  let request = 0;
  let consumers = 0;
  let disposed = false;
  let state: Status = { kind: "unavailable" };
  let expiration: ReturnType<typeof setTimeout> | undefined;
  let polling: ReturnType<typeof setInterval> | undefined;

  const publish = (next: Status) => {
    clearTimeout(expiration);
    state = next;
    if (next.kind === "ready")
      expiration = setTimeout(() => publish({ kind: "stale" }), FRESHNESS_MS);
    for (const listener of listeners) listener();
  };
  const refresh = async () => {
    if (disposed || !sessionId) return;
    const target = sessionId;
    const seq = ++request;
    if (state.kind === "unavailable") publish({ kind: "loading" });
    let result: OmResult;
    try {
      result = await read(target);
    } catch {
      result = { kind: "unavailable" };
    }
    if (seq !== request || target !== sessionId || disposed) return;
    publish(
      result.kind === "ready" && result.sessionId !== target
        ? { kind: "unavailable" }
        : result,
    );
  };
  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    select(next: string | null, nextModel: string | null = null) {
      if (disposed || (sessionId === next && model === nextModel)) return;
      request++;
      sessionId = next;
      model = nextModel;
      publish({ kind: next && consumers ? "loading" : "unavailable" });
      if (consumers) void refresh();
    },
    activate() {
      if (disposed) return () => {};
      if (consumers++ === 0) polling = setInterval(refresh, POLL_MS);
      void refresh();
      return () => {
        if (--consumers === 0) {
          clearInterval(polling);
          request++;
          if (!disposed) publish({ kind: "unavailable" });
        }
      };
    },
    dispose() {
      disposed = true;
      request++;
      clearInterval(polling);
      clearTimeout(expiration);
      listeners.clear();
    },
  };
}

export type StatusState = ReturnType<typeof createStatusState>;
