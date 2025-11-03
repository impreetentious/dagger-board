"use client";

import { useMemo } from "react";
import { evaluateDesign } from "@/engine/design";
import { useLabStore } from "@/store/lab-store";

function value(number: number | null): string {
  return number === null || !Number.isFinite(number) ? "—" : number.toFixed(4);
}

export function DesignPanel() {
  const graph = useLabStore((state) => state.graph);
  const parameters = useLabStore((state) => state.parameters);
  const measured = useLabStore((state) => state.measured);
  const conditioning = useLabStore((state) => state.conditioning);
  const selection = useLabStore((state) => state.selection);
  const n = useLabStore((state) => state.n);
  const setMeasured = useLabStore((state) => state.setMeasured);
  const setConditioning = useLabStore((state) => state.setConditioning);
  const setSelection = useLabStore((state) => state.setSelection);
  const setSampleSize = useLabStore((state) => state.setSampleSize);
  const setNotice = useLabStore((state) => state.setNotice);
  const selectionNodes = graph.nodes.filter((node) => node.kind === "selection");
  const name = (id: string) => graph.nodes.find((node) => node.id === id)?.name ?? id;
  const report = useMemo(() => {
    try {
      return evaluateDesign(graph, parameters, measured, selection ?? undefined, n);
    } catch (error) {
      return error instanceof Error ? error : new Error("Design table unavailable.");
    }
  }, [graph, measured, n, parameters, selection]);

  if (report instanceof Error) {
    return <section><p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">DESIGN</p><h1 className="mt-2 text-2xl font-black tracking-[-0.05em]">Designate X and Y to compare designs.</h1><p className="mt-3 text-sm text-[var(--muted)]">{report.message}</p></section>;
  }

  const topPercent = selection ? (1 - selection.quantile) * 100 : 100;
  return (
    <section aria-labelledby="design-panel-title" className="space-y-5">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">DESIGN</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.05em]" id="design-panel-title">Compare feasible estimators before data exists.</h1>
      </div>
      <details open>
        <summary className="cursor-pointer text-sm font-bold">What will this design measure?</summary>
        <div className="mt-3 space-y-2 text-sm">
          {graph.nodes.filter((node) => node.kind === "observed").map((node) => {
            const roleBound = node.id === graph.roles.exposureId || node.id === graph.roles.outcomeId;
            return <label className="flex items-center justify-between gap-3" key={node.id}><span>{node.name}{roleBound ? " (required)" : ""}</span><input aria-label={`Measure ${node.name}`} checked={measured[node.id] ?? true} disabled={roleBound} onChange={(event) => setMeasured(node.id, event.target.checked)} type="checkbox" /></label>;
          })}
        </div>
      </details>
      <details>
        <summary className="cursor-pointer text-sm font-bold">Conditioning set</summary>
        <div className="mt-3 space-y-2 text-sm">
          {graph.nodes.filter((node) => node.kind === "observed" && node.id !== graph.roles.exposureId && node.id !== graph.roles.outcomeId).map((node) => <label className="flex items-center gap-2" key={node.id}><input checked={conditioning.includes(node.id)} onChange={(event) => setConditioning(event.target.checked ? [...conditioning, node.id] : conditioning.filter((id) => id !== node.id))} type="checkbox" />{node.name}</label>)}
        </div>
      </details>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <label className="flex items-center justify-between gap-3 text-sm font-bold">
          Active selection
          <input
            aria-label="Active selection"
            checked={Boolean(selection)}
            disabled={selectionNodes.length === 0}
            onChange={(event) => {
              if (event.target.checked) setSelection({ nodeId: selectionNodes[0].id, quantile: 0.5 });
              else setSelection(null);
            }}
            type="checkbox"
          />
        </label>
        {selection ? (
          <>
            <label className="mt-3 block text-xs font-bold">Selection node<select className="field-input mt-1" onChange={(event) => setSelection({ ...selection, nodeId: event.target.value })} value={selection.nodeId}>{selectionNodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
            <label className="mt-3 block text-xs font-bold">Keep the top {topPercent.toFixed(0)}%<input aria-label="Selection cutoff quantile" className="mt-2 w-full accent-[var(--signal)]" max="0.99" min="0.01" onChange={(event) => setSelection({ ...selection, quantile: Number(event.target.value) })} step="0.01" type="range" value={selection.quantile} /></label>
          </>
        ) : <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Add a selection-kind node in Draw to model one active filter.</p>}
      </div>
      <label className="block text-sm font-bold">Generated rows: {n.toLocaleString()}<input aria-label="Design sample size" className="mt-2 w-full accent-[var(--signal)]" max="1000000" min="100" onChange={(event) => setSampleSize(Number(event.target.value))} step="100" type="range" value={n} /></label>
      <p className="text-xs leading-5 text-[var(--muted)]">Effective n: {report.effectiveN.toFixed(0)}{selection ? ". Selection-free identification and selection-aware exact bias can legitimately differ." : ""}</p>

      <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table className="w-full min-w-[35rem] border-collapse text-left text-xs">
          <thead className="bg-[var(--moss-soft)]"><tr><th className="p-2">Estimator</th><th className="p-2">{report.selectionActive ? "Identified (selection ignored)" : "Identified?"}</th><th className="p-2">Population bias</th><th className="p-2">SE / power</th></tr></thead>
          <tbody>
            {report.rows.map((row) => <tr className={row.id === report.bestRowId ? "bg-[var(--signal-soft)]" : "border-t border-[var(--line)]"} key={row.id}>
              <td className="p-2 font-bold">{row.kind === "iv" ? `IV ${name(row.instrumentId ?? "")}${row.conditioningIds.length ? ` | ${row.conditioningIds.map(name).join(", ")}` : ""}` : row.kind === "naive" ? "Naive (∅)" : `Adjust | ${row.conditioningIds.map(name).join(", ")}`}</td>
              <td className="p-2">{row.identified ? "Yes" : "No"}</td>
              <td className="p-2">{value(row.populationBias)}{row.ivStatus === "weak" ? " · weak" : ""}{row.ivStatus === "undefined" ? " · undefined" : ""}</td>
              <td className="p-2">{row.smallSelectedSample ? "Insufficient selected sample" : row.kind === "iv" ? "v1.1 preview" : `${value(row.standardError)} / ${row.power === null ? "—" : `${(row.power * 100).toFixed(0)}%`}`}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {report.frontdoorMediatorIds.length ? <p className="rounded-xl border border-[var(--line)] p-3 text-xs leading-5">Front-door identifies through {report.frontdoorMediatorIds.map(name).join(", ")}; estimator preview is v1.1.</p> : null}
      {selection && <button className="text-left text-xs text-[var(--signal)] underline" onClick={() => setNotice("Selection certification remains out of scope; the table reports exact selected-sample bias.")} type="button">Why do the identification and bias columns differ?</button>}
    </section>
  );
}
