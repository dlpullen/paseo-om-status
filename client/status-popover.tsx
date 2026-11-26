import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { OmMetrics } from "../shared/status.ts";
import type { StatusState } from "./status-state.ts";

type Colors = PluginTheme["colors"];
type Progress = OmMetrics["compaction"];
const estimate = ({ tokens, budget, percent }: Progress) =>
  `~${tokens} / ${budget} · ${percent}%`;
const drift = (added?: string, removed?: string) => {
  const changes = [added && `+${added}`, removed && `−${removed}`].filter(
    Boolean,
  );
  return changes.length ? ` (${changes.join(" · ")})` : "";
};

function Divider({
  colors,
  children,
}: {
  colors: Colors;
  children: ReactNode;
}) {
  return (
    <View style={[styles.section, { borderColor: colors.border }]}>
      {children}
    </View>
  );
}

function Row({
  colors,
  title,
  value,
  important,
}: {
  colors: Colors;
  title: string;
  value: string;
  important?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.label,
          { color: important ? colors.foreground : colors.foregroundMuted },
          important && styles.bold,
        ]}
      >
        {title}
      </Text>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export function StatusPopover({
  theme,
  layout,
  model,
}: PluginButtonContentProps & { model: StatusState }) {
  const status = useSyncExternalStore(model.subscribe, model.get, model.get);
  const colors = theme.colors;
  useEffect(() => model.activate(), [model]);
  const statusText =
    status.kind === "loading"
      ? "Reading the current Pi session…"
      : status.kind === "stale"
        ? "This status has expired. Refresh to read the current Pi session."
        : status.kind === "inapplicable"
          ? "This session does not support Observational Memory status."
          : "No live OM status is available for this Pi session. Check the companion setup and refresh.";

  return (
    <View style={[styles.body, !layout.compact && styles.wide]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Observational memory
        </Text>
        <Text
          style={[
            styles.code,
            { color: colors.foregroundMuted, backgroundColor: colors.surface2 },
          ]}
        >
          /om:status
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh observational memory status"
          hitSlop={6}
          onPress={() => {
            void model.refresh();
          }}
          style={({ pressed }) => [
            styles.refresh,
            pressed && { backgroundColor: colors.surface2 },
          ]}
        >
          <Text style={{ color: colors.foreground, fontSize: 19 }}>↻</Text>
        </Pressable>
      </View>
      {status.kind === "ready" ? (
        <Metrics metrics={status.metrics} colors={colors} />
      ) : (
        <Divider colors={colors}>
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.foregroundMuted }}
          >
            {statusText}
          </Text>
        </Divider>
      )}
    </View>
  );
}

function Metrics({ metrics, colors }: { metrics: OmMetrics; colors: Colors }) {
  const { compaction, observations, reflections } = metrics;
  return (
    <>
      <Divider colors={colors}>
        <Row
          colors={colors}
          title="Next compaction"
          value={`${compaction.percent}%`}
          important
        />
        <View style={[styles.progress, { backgroundColor: colors.surface2 }]}>
          <View
            style={[
              styles.progress,
              {
                backgroundColor: colors.accent ?? colors.foreground,
                width: `${Math.min(100, compaction.percent)}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.small, { color: colors.foregroundMuted }]}>
          {`~${compaction.tokens} / ${compaction.budget} estimated source tokens`}
        </Text>
        <Row
          colors={colors}
          title="Next observation"
          value={estimate(metrics.observation)}
        />
        <Row
          colors={colors}
          title="Next reflection"
          value={estimate(metrics.reflection)}
        />
      </Divider>
      <Divider colors={colors}>
        <Row
          colors={colors}
          title="Observations"
          value={`${observations.recorded} recorded · ${observations.active} active`}
          important
        />
        <Text style={[styles.small, { color: colors.foregroundMuted }]}>
          {`${observations.dropped} dropped · ${observations.visible} visible${drift(observations.added, observations.removed)}`}
        </Text>
        <Row
          colors={colors}
          title="Reflections"
          value={`${reflections.recorded} recorded · ${reflections.visible} visible${drift(reflections.added)}`}
        />
      </Divider>
      <Divider colors={colors}>
        <Row
          colors={colors}
          title="Visible observation pool"
          value={estimate(metrics.visiblePool)}
        />
        <Row
          colors={colors}
          title="Active observation pool"
          value={estimate(metrics.activePool)}
        />
        <Row
          colors={colors}
          title="Reflection pool"
          value={`~${metrics.reflectionPool} tokens`}
        />
      </Divider>
      {(metrics.passive ||
        metrics.inFlight.length > 0 ||
        metrics.errors.length > 0) && (
        <Divider colors={colors}>
          {metrics.passive && (
            <Text style={[styles.small, { color: colors.foregroundMuted }]}>
              Passive mode: automatic memory workers and auto-compaction are
              disabled.
            </Text>
          )}
          {[...metrics.inFlight, ...metrics.errors].map((line, index) => (
            <Text
              key={index}
              style={[styles.small, { color: colors.foregroundMuted }]}
            >
              {line}
            </Text>
          ))}
        </Divider>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 8, maxWidth: "100%" },
  wide: { width: 336 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  title: { fontSize: 16, fontWeight: "600", flex: 1 },
  code: {
    fontSize: 11,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  refresh: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 4 },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    columnGap: 8,
  },
  label: { fontSize: 12, flexShrink: 1 },
  value: {
    fontSize: 12,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  small: { fontSize: 11 },
  bold: { fontWeight: "600" },
  progress: { height: 4, borderRadius: 3 },
});
