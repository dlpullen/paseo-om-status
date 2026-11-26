import type {
  PluginButtonContentProps,
  PluginButtonIconProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { useEffect } from "react";
import { View } from "react-native";
import { StatusPopover } from "./client/status-popover";
import {
  createStatusState,
  statusLabel,
  type StatusState,
} from "./client/status-state.ts";
import { readStatus } from "./shared/status.ts";

type DirectoryAgent = {
  id: string;
  workspaceId?: string | null;
  provider: string;
  status: string;
  archivedAt?: string | null;
  internal?: boolean;
  background?: boolean;
  model?: string | null;
  runtimeInfo?: { sessionId: string | null };
};
type Entry = { workspaceId: string; stop: () => void; model: StatusState };

export default function contribute(client: PluginClientContext) {
  const pills = new Map<string, Entry>();
  const lifetime = new AbortController();
  let scan = 0;
  let changes: Set<string> | null = null;

  const remove = (agentId: string) => {
    pills.get(agentId)?.stop();
    pills.delete(agentId);
  };
  const register = (agent: DirectoryAgent) => {
    if (lifetime.signal.aborted) return;
    const { workspaceId, id: agentId } = agent;
    if (
      !workspaceId ||
      agent.provider !== "pi" ||
      agent.archivedAt ||
      agent.background ||
      agent.internal
    ) {
      remove(agentId);
      return;
    }
    let entry = pills.get(agentId);
    if (entry && entry.workspaceId !== workspaceId) {
      remove(agentId);
      entry = undefined;
    }
    if (!entry) {
      const model = createStatusState((sessionId) =>
        client.rpc(readStatus, { agentId, workspaceId, sessionId }),
      );
      function Icon({ size, color, theme }: PluginButtonIconProps) {
        useEffect(() => model.activate(), []);
        return (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{
              height: size - 3,
              width: size - 3,
              borderRadius: size,
              borderWidth: 1.5,
              borderColor: color,
              borderTopColor: theme.colors.accent ?? theme.colors.foreground,
            }}
          />
        );
      }
      function Content(props: PluginButtonContentProps) {
        return props.context === "agent" &&
          props.agentId === agentId &&
          props.workspaceId === workspaceId ? (
          <StatusPopover {...props} model={model} />
        ) : null;
      }
      const pill: PluginButtonRegistration = client.addComposerPill({
        id: "om-status",
        agentId,
        workspaceId,
        button: {
          title: "Observational memory status",
          label: "OM",
          icon: Icon,
          behavior: { kind: "popover", Content },
        },
      });
      const unsubscribe = model.subscribe(() => {
        pill.update({ label: statusLabel(model.get()) });
      });
      entry = {
        workspaceId,
        model,
        stop: () => {
          unsubscribe();
          model.dispose();
          pill.remove();
        },
      };
      pills.set(agentId, entry);
    }
    const live =
      agent.status !== "closed" &&
      agent.status !== "initializing" &&
      agent.status !== "error";
    entry.model.select(
      live ? (agent.runtimeInfo?.sessionId ?? null) : null,
      agent.model ?? null,
    );
  };

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      if (lifetime.signal.aborted) return;
      subscription.subscribe({
        snapshot: ({ entries, pageInfo }) => {
          const current = ++scan;
          const observed = new Set<string>();
          const updated = new Set<string>();
          changes = updated;
          for (const { agent } of entries) {
            observed.add(agent.id);
            register(agent);
          }
          void (async () => {
            const isCurrent = () =>
              !lifetime.signal.aborted && current === scan;
            let cursor = pageInfo.nextCursor;
            while (cursor && isCurrent()) {
              const next = await client.paseo.agents.list({
                page: { cursor, limit: 200 },
                signal: lifetime.signal,
              });
              if (!isCurrent()) return;
              for (const { agent } of next.entries) {
                observed.add(agent.id);
                if (!updated.has(agent.id)) register(agent);
              }
              cursor = next.pageInfo.nextCursor;
            }
            if (!isCurrent()) return;
            changes = null;
            for (const id of pills.keys())
              if (!observed.has(id) && !updated.has(id)) remove(id);
          })().catch(() => {
            if (current === scan) changes = null;
          });
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") {
            changes?.add(update.agentId);
            remove(update.agentId);
          } else {
            changes?.add(update.agent.id);
            register(update.agent);
          }
        },
      });
    })
    .catch(() => {
      /* The host may disconnect while bootstrapping. */
    });

  return () => {
    lifetime.abort();
    for (const id of pills.keys()) remove(id);
  };
}
