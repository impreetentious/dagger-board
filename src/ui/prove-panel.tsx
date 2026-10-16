"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pathSpecificEffects } from "@/engine/effects";
import { analyzeSingleEdgeVariants, proveGraph } from "@/engine/prove";
import { graphicalSnapshotJson, pruneLabSnapshot, type LabSnapshot } from "@/lib/codec";
import { useLabStore } from "@/store/lab-store";
import { WitnessCard } from "@/ui/witness-card";

function setLabel(ids: readonly string[], names: (id: string) => string): string {
  return ids.length === 0 ? "∅" : ids.map(names).join(", ");
}

export function ProvePanel() {
  const state = useLabStore();
  const identity = graphicalSnapshotJson(state);
  const [sensitivity, setSensitivity] = useState<{
    identity: string;
    snapshot: LabSnapshot;
    result: Awaited<ReturnType<typeof analyzeSingleEdgeVariants>>;
  } | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    identity: string;
  } | null>(null);
  const [sensitivityError, setSensitivityError] = useState<string | null>(null);
  const request = useRef<{ token: number; controller: AbortController } | null>(null);
  const generation = useRef(0);
  function stopSensitivity() {
    generation.current += 1;
    request.current?.controller.abort();
    request.current = null;
    setSensitivity(null);
    setProgress(null);
    setSensitivityError(null);
  }
  useEffect(() => {
    let previous = graphicalSnapshotJson(useLabStore.getState());
    const unsubscribe = useLabStore.subscribe((next) => {
      const latest = graphicalSnapshotJson(next);
      if (latest === previous) return;
      previous = latest;
      generation.current += 1;
      request.current?.controller.abort();
      request.current = null;
      setSensitivity(null);
      setProgress(null);
      setSensitivityError(null);
    });
    return () => {
      generation.current += 1;
      request.current?.controller.abort();
      unsubscribe();
    };
  }, []);
  async function analyzeEdges() {
    stopSensitivity();
    const snapshot = structuredClone(pruneLabSnapshot(useLabStore.getState()));
    const sourceIdentity = graphicalSnapshotJson(snapshot),
      token = ++generation.current;
    const controller = new AbortController();
    request.current = { token, controller };
    const current = () =>
      token === generation.current &&
      graphicalSnapshotJson(useLabStore.getState()) === sourceIdentity;
    setProgress({ done: 0, total: 0, identity: sourceIdentity });
    try {
      const result = await analyzeSingleEdgeVariants(
        snapshot.graph,
        new Set(snapshot.conditioning),
        snapshot.selection ? { nodeId: snapshot.selection.nodeId } : undefined,
        controller.signal,
        (done, total) => {
          if (current()) setProgress({ done, total, identity: sourceIdentity });
        },
      );
      if (current()) setSensitivity({ identity: sourceIdentity, snapshot, result });
    } catch (error) {
      if (current())
        setSensitivityError(error instanceof Error ? error.message : "Edge analysis unavailable.");
    } finally {
      if (current()) {
        request.current = null;
        setProgress(null);
      }
    }
  }
  const currentSensitivity = sensitivity?.identity === identity ? sensitivity : null;
  const graph = useLabStore((state) => state.graph);
  const parameters = useLabStore((state) => state.parameters);
  const conditioning = useLabStore((state) => state.conditioning);
  const selection = useLabStore((state) => state.selection);
  const setConditioning = useLabStore((state) => state.setConditioning);
  const setHighlightedPath = useLabStore((state) => state.setHighlightedPath);
  const names = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.name])),
    [graph.nodes],
  );
  const name = (id: string) => names.get(id) ?? id;
  const report = useMemo(
    () =>
      proveGraph(
        graph,
        new Set(conditioning),
        selection ? { nodeId: selection.nodeId } : undefined,
      ),
    [conditioning, graph, selection],
  );
  const effects = useMemo(() => {
    const exposureId = graph.roles.exposureId;
    const outcomeId = graph.roles.outcomeId;
    return exposureId && outcomeId
      ? pathSpecificEffects(graph, parameters, exposureId, outcomeId)
      : null;
  }, [graph, parameters]);
  const observedCandidates = graph.nodes.filter(
    (node) =>
      node.kind === "observed" &&
      node.id !== graph.roles.exposureId &&
      node.id !== graph.roles.outcomeId,
  );

  if (report.verdict === "design-incomplete") {
    return (
      <section className="space-y-4">
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">PROVE</p>
        <h2 className="text-2xl font-black tracking-[-0.05em]">
          Designate X and Y to inspect a claim.
        </h2>
        <p className="text-sm leading-6 text-[var(--muted)]">
          The engine only reads analyzable snapshots: one observed exposure and one observed
          outcome.
        </p>
      </section>
    );
  }

  const frontdoorSets = report.frontdoorSets?.minimalSets ?? [];
  const verdictCopy = {
    "zero-total-effect": "TE ≡ 0 under your own assumptions.",
    adjustment: "Identified via covariate adjustment.",
    frontdoor: frontdoorSets.some((entry) => entry.mediatorIds.length > 1)
      ? "Identified via a front-door mediator set."
      : "Identified via a front-door mediator.",
    instrument: "Identified via a conditional instrument.",
    unsupported: "No supported strategy identifies this effect.",
  }[report.verdict];

  return (
    <section aria-labelledby="prove-panel-title" className="space-y-5">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">PROVE</p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.05em]" id="prove-panel-title">
          Read what the graph commits you to.
        </h2>
      </div>
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <p className="text-base font-black">{verdictCopy}</p>
        {report.verdict === "unsupported" ? (
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            This instrument checks covariate adjustment, front-door, and conditional instruments;
            effects identifiable only by more general machinery (do-calculus/ID) are beyond its
            verdict.
          </p>
        ) : null}
        {selection ? (
          <p className="mt-2 text-xs leading-5 text-[var(--signal)]">
            Selection is conditioning your sample; adjustment certification above is selection-free.
            Inspect exact bias on Simulate or Design.
          </p>
        ) : null}
        {report.verdict === "unsupported" ? (
          <div className="mt-4">
            <WitnessCard />
          </div>
        ) : null}
      </article>

      <section aria-label="Single-edge assumption changes">
        <button className="tool-button" type="button" onClick={() => void analyzeEdges()}>
          Analyze single-edge changes
        </button>
        {progress?.identity === identity ? (
          <>
            <button type="button" className="tool-button" onClick={stopSensitivity}>
              Cancel edge analysis
            </button>
            <p role="status">
              {progress.done}/{progress.total} admissible variants inspected.
            </p>
          </>
        ) : null}
        <p>
          Directed edge deletion/addition only. Roles, conditioning, node kinds and selection stay
          fixed; at most 128 acyclic variants are inspected. This is not robustness to all causal
          models.
        </p>
        {sensitivityError ? <p role="status">{sensitivityError}</p> : null}
        {currentSensitivity ? (
          <>
            <p role="status">
              {currentSensitivity.result.inspected}/{currentSensitivity.result.total} inspected.{" "}
              {currentSensitivity.result.incomplete
                ? "Incomplete: 128-variant cap reached."
                : "All structurally admissible single-edge variants inspected."}
            </p>
            <ul>
              {currentSensitivity.result.entries.map((entry) => (
                <li key={`${entry.change.kind}:${entry.change.from}:${entry.change.to}`}>
                  {entry.change.kind} {name(entry.change.from)} → {name(entry.change.to)}:{" "}
                  {entry.refusal ??
                    (entry.changed
                      ? `changed conclusion: ${entry.report!.verdict}; adjustment ${entry.report!.adjustment?.minimalSets.map((ids) => `{${ids.map(name).join(",")}}`).join(" / ") || "none"}`
                      : "unchanged verdict and minimal adjustment sets")}
                  .
                  <button
                    className="tool-button"
                    type="button"
                    onClick={() => {
                      if (
                        graphicalSnapshotJson(useLabStore.getState()) !==
                        currentSensitivity.identity
                      )
                        return;
                      useLabStore.getState().loadSnapshot(
                        pruneLabSnapshot({
                          ...pruneLabSnapshot(useLabStore.getState()),
                          graph: {
                            ...entry.graph,
                            nodes: entry.graph.nodes.map((node) => ({
                              ...node,
                              position:
                                useLabStore
                                  .getState()
                                  .graph.nodes.find((current) => current.id === node.id)
                                  ?.position ?? node.position,
                            })),
                          },
                        }),
                        "Single-edge variant applied; undo restores the original graph.",
                      );
                    }}
                  >
                    Apply this edge change
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <details open>
        <summary className="cursor-pointer text-sm font-bold">Conditioning playground</summary>
        <div className="mt-3 space-y-2">
          {observedCandidates.map((node) => (
            <label className="flex items-center gap-2 text-sm" key={node.id}>
              <input
                checked={conditioning.includes(node.id)}
                onChange={(event) =>
                  setConditioning(
                    event.target.checked
                      ? [...conditioning, node.id]
                      : conditioning.filter((id) => id !== node.id),
                  )
                }
                type="checkbox"
              />
              {node.name}
            </label>
          ))}
          {report.paths?.warnings.map((warning) => (
            <p
              className="rounded-xl bg-[var(--signal-soft)] p-2 text-xs leading-5 text-[var(--ink)]"
              key={warning.type}
            >
              Forbidden adjustment: {setLabel(warning.nodeIds, name)} descends from a causal-path
              node and can bias the total effect.
            </p>
          ))}
        </div>
      </details>

      <details open>
        <summary className="cursor-pointer text-sm font-bold">Adjustment sets</summary>
        <div className="mt-3 space-y-2 text-sm">
          {report.adjustment?.emptySetValid ? (
            <p className="rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] px-3 py-2 font-semibold">
              No adjustment needed: the empty set is valid for the total effect.
            </p>
          ) : null}
          {report.adjustment?.minimalSets.length ? (
            report.adjustment.minimalSets
              .filter((set) => set.length > 0)
              .map((set) => {
                const isMinimumSize = report.adjustment?.minimumSizeSets.some(
                  (candidate) =>
                    candidate.length === set.length && candidate.every((id) => set.includes(id)),
                );
                return (
                  <p
                    className="rounded-xl border border-[var(--line)] px-3 py-2"
                    key={set.join("-") || "empty"}
                  >
                    {setLabel(set, name)}{" "}
                    {isMinimumSize ? (
                      <span className="ml-2 text-xs text-[var(--signal)]">minimum size</span>
                    ) : null}
                  </p>
                );
              })
          ) : (
            <p className="text-[var(--muted)]">
              No valid adjustment set exists. The canonical candidate leaves:{" "}
              {report.adjustment?.noSetWitnessPaths
                .map((path) => path.map(name).join(" → "))
                .join("; ") || "an unresolved biasing path"}
              .
            </p>
          )}
        </div>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-bold">
          Paths ({report.paths?.paths.length ?? 0})
        </summary>
        <ul className="mt-3 space-y-2 text-xs leading-5">
          {report.paths?.paths.map((path) => (
            <li
              className="rounded-xl border border-[var(--line)] p-2"
              key={path.nodeIds.join("-")}
              onBlur={() => setHighlightedPath(null)}
              onFocus={() => setHighlightedPath(path.nodeIds)}
              onMouseEnter={() => setHighlightedPath(path.nodeIds)}
              onMouseLeave={() => setHighlightedPath(null)}
              tabIndex={0}
            >
              <span className="font-bold">{path.nodeIds.map(name).join(" → ")}</span>
              <span className="ml-2 text-[var(--signal)]">
                {path.primaryLabel.replaceAll("-", " ")}
              </span>
              {!path.evaluation.isOpen ? (
                <span className="block text-[var(--muted)]">
                  blocked by{" "}
                  {path.evaluation.blockers.map((blocker) => name(blocker.nodeId)).join(", ")}
                </span>
              ) : null}
              {path.colliderOpeningWitnesses.length > 0 ? (
                <span className="block text-[var(--muted)]">
                  {path.colliderOpeningWitnesses
                    .map(
                      (witness) =>
                        `open because you conditioned on ${setLabel(witness.nodeIds, name)}, descendant${witness.nodeIds.length === 1 ? "" : "s"} of collider ${name(witness.colliderId)}`,
                    )
                    .join("; ")}
                </span>
              ) : null}
              {path.overcontrolNodeIds.length > 0 ? (
                <span className="block text-[var(--muted)]">
                  blocked by the mediator {setLabel(path.overcontrolNodeIds, name)} — overcontrol.
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-bold">Front-door and instruments</summary>
        <div className="mt-3 space-y-3 text-sm">
          <p>
            Front-door:{" "}
            {frontdoorSets.length
              ? frontdoorSets.map((entry) => setLabel(entry.mediatorIds, name)).join(" or ")
              : report.frontdoor?.reason === "no-directed-path"
                ? "no mediated path — TE = 0 structurally"
                : "no witness"}
            .
          </p>
          {report.instruments.length ? (
            report.instruments.map((instrument) => (
              <p key={instrument.instrumentId}>
                {name(instrument.instrumentId)} with{" "}
                {instrument.conditioningSets.map((set) => setLabel(set, name)).join(" or ")}
              </p>
            ))
          ) : (
            <p className="text-[var(--muted)]">No conservative conditional instrument.</p>
          )}
        </div>
      </details>

      {effects ? (
        <details>
          <summary className="cursor-pointer text-sm font-bold">Path decomposition</summary>
          <div className="mt-3 space-y-2 text-xs leading-5 text-[var(--muted)]">
            <p>
              Direct X → Y coefficient: {effects.directEdgeCoefficient.toFixed(4)} · total path sum:{" "}
              {effects.totalEffect.toFixed(4)}.
            </p>
            {effects.paths.length ? (
              <ul className="space-y-1">
                {effects.paths.map((path) => (
                  <li key={path.nodeIds.join("-")}>
                    {path.nodeIds.map(name).join(" → ")}: {path.contribution.toFixed(4)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No directed X → Y path is present, so the structural total effect is zero.</p>
            )}
            <p>
              These are structural path contributions, not an identification verdict; the verdict
              remains about the total effect.
            </p>
          </div>
        </details>
      ) : null}

      <details>
        <summary className="cursor-pointer text-sm font-bold">Testable implications</summary>
        <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
          {report.implications.length ? (
            report.implications.map((implication) => (
              <li
                key={`${implication.leftId}-${implication.rightId}-${implication.separatorIds.join("-")}`}
              >
                {name(implication.leftId)} ⟂ {name(implication.rightId)} |{" "}
                {setLabel(implication.separatorIds, name)}
              </li>
            ))
          ) : (
            <li>No observed minimal separator is implied.</li>
          )}
        </ul>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-bold">
          Which arrows are assumptions? (equivalence class)
        </summary>
        <div className="mt-3 space-y-2 text-xs">
          <p className="text-[var(--muted)]">
            {report.cpdag.compelled.length} of{" "}
            {report.cpdag.compelled.length + report.cpdag.reversible.length} edges are{" "}
            <strong>compelled</strong> by the data-testable independencies;{" "}
            {report.cpdag.reversible.length} are <strong>reversible</strong> — modelling assumptions
            whose direction observational data cannot decide.
          </p>
          {report.cpdag.reversible.length ? (
            <ul className="space-y-1 text-[var(--muted)]">
              {report.cpdag.reversible.map((edge) => (
                <li key={`${edge.a}-${edge.b}`}>
                  {name(edge.a)} — {name(edge.b)}{" "}
                  <span className="text-[var(--signal)]">(reversible)</span>
                </li>
              ))}
            </ul>
          ) : report.cpdag.compelled.length ? (
            <p className="text-[var(--muted)]">
              Every drawn arrow is compelled — this DAG is the only member of its equivalence class.
            </p>
          ) : (
            <p className="text-[var(--muted)]">Draw some edges to classify them.</p>
          )}
        </div>
      </details>
    </section>
  );
}
