"use client";

import { useMemo } from "react";
import { proveGraph } from "@/engine/prove";
import { useLabStore } from "@/store/lab-store";

function setLabel(ids: readonly string[], names: (id: string) => string): string {
  return ids.length === 0 ? "∅" : ids.map(names).join(", ");
}

export function ProvePanel() {
  const graph = useLabStore((state) => state.graph);
  const conditioning = useLabStore((state) => state.conditioning);
  const selection = useLabStore((state) => state.selection);
  const setConditioning = useLabStore((state) => state.setConditioning);
  const names = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node.name])), [graph.nodes]);
  const name = (id: string) => names.get(id) ?? id;
  const report = useMemo(
    () => proveGraph(graph, new Set(conditioning), selection ? { nodeId: selection.nodeId } : undefined),
    [conditioning, graph, selection],
  );
  const observedCandidates = graph.nodes.filter(
    (node) => node.kind === "observed" && node.id !== graph.roles.exposureId && node.id !== graph.roles.outcomeId,
  );

  if (report.verdict === "design-incomplete") {
    return (
      <section className="space-y-4">
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">PROVE</p>
        <h2 className="text-2xl font-black tracking-[-0.05em]">Designate X and Y to inspect a claim.</h2>
        <p className="text-sm leading-6 text-[var(--muted)]">The engine only reads analyzable snapshots: one observed exposure and one observed outcome.</p>
      </section>
    );
  }

  const verdictCopy = {
    "zero-total-effect": "TE ≡ 0 under your own assumptions.",
    adjustment: "Identified via covariate adjustment.",
    frontdoor: "Identified via a singleton front-door mediator.",
    instrument: "Identified via a conditional instrument.",
    unsupported: "No supported strategy identifies this effect.",
  }[report.verdict];

  return (
    <section aria-labelledby="prove-panel-title" className="space-y-5">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">PROVE</p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.05em]" id="prove-panel-title">Read what the graph commits you to.</h2>
      </div>
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <p className="text-base font-black">{verdictCopy}</p>
        {report.verdict === "unsupported" ? (
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">v1 checks covariate adjustment, front-door, and conditional instruments; effects identifiable only by more general machinery (do-calculus/ID) are beyond v1&apos;s verdict.</p>
        ) : null}
        {selection ? <p className="mt-2 text-xs leading-5 text-[var(--signal)]">Selection is conditioning your sample; adjustment certification above is selection-free. Inspect exact bias on Simulate or Design.</p> : null}
      </article>

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
            <p className="rounded-xl bg-[var(--signal-soft)] p-2 text-xs leading-5 text-[var(--ink)]" key={warning.type}>
              Forbidden adjustment: {setLabel(warning.nodeIds, name)} descends from a causal-path node and can bias the total effect.
            </p>
          ))}
        </div>
      </details>

      <details open>
        <summary className="cursor-pointer text-sm font-bold">Adjustment sets</summary>
        <div className="mt-3 space-y-2 text-sm">
          {report.adjustment?.minimalSets.length ? report.adjustment.minimalSets.map((set) => (
            <p className="rounded-xl border border-[var(--line)] px-3 py-2" key={set.join("-") || "empty"}>{setLabel(set, name)}</p>
          )) : <p className="text-[var(--muted)]">No valid adjustment set exists. The canonical candidate leaves: {report.adjustment?.noSetWitnessPaths.map((path) => path.map(name).join(" → ")).join("; ") || "an unresolved biasing path"}.</p>}
        </div>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-bold">Paths ({report.paths?.paths.length ?? 0})</summary>
        <ul className="mt-3 space-y-2 text-xs leading-5">
          {report.paths?.paths.map((path) => (
            <li className="rounded-xl border border-[var(--line)] p-2" key={path.nodeIds.join("-")}>
              <span className="font-bold">{path.nodeIds.map(name).join(" → ")}</span>
              <span className="ml-2 text-[var(--signal)]">{path.primaryLabel.replaceAll("-", " ")}</span>
              {!path.evaluation.isOpen ? <span className="block text-[var(--muted)]">blocked by {path.evaluation.blockers.map((blocker) => name(blocker.nodeId)).join(", ")}</span> : null}
            </li>
          ))}
        </ul>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-bold">Front-door and instruments</summary>
        <div className="mt-3 space-y-3 text-sm">
          <p>Front-door: {report.frontdoor?.mediatorIds.length ? setLabel(report.frontdoor.mediatorIds, name) : report.frontdoor?.reason === "no-directed-path" ? "no mediated path — TE = 0 structurally" : "no singleton witness"}.</p>
          {report.instruments.length ? report.instruments.map((instrument) => <p key={instrument.instrumentId}>{name(instrument.instrumentId)} with {instrument.conditioningSets.map((set) => setLabel(set, name)).join(" or ")}</p>) : <p className="text-[var(--muted)]">No conservative conditional instrument.</p>}
        </div>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-bold">Testable implications</summary>
        <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
          {report.implications.length ? report.implications.map((implication) => <li key={`${implication.leftId}-${implication.rightId}-${implication.separatorIds.join("-")}`}>{name(implication.leftId)} ⟂ {name(implication.rightId)} | {setLabel(implication.separatorIds, name)}</li>) : <li>No observed minimal separator is implied.</li>}
        </ul>
      </details>
    </section>
  );
}
