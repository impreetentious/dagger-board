"use client";

import { useMemo, useState } from "react";
import { proveGraph } from "@/engine/prove";
import { auditScmIntegrity, edgeParameterKey, matrixTotalEffect } from "@/engine/scm";
import { convergenceSeries, runSimulationAsync, type SimulationRun } from "@/engine/sim";
import { ivEstimand, olsEstimand } from "@/engine/stats";
import { useLabStore } from "@/store/lab-store";

function number(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(4);
}

function Sparkline({ values }: { values: Array<number | null> }) {
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (available.length < 2) return <p className="text-xs text-[var(--muted)]">Insufficient selected sample for a convergence line.</p>;
  const minimum = Math.min(...available);
  const maximum = Math.max(...available);
  const span = Math.max(1e-9, maximum - minimum);
  const points = values
    .map((value, index) => value === null ? null : `${(index / Math.max(1, values.length - 1)) * 180},${54 - ((value - minimum) / span) * 48}`)
    .filter((point): point is string => Boolean(point))
    .join(" ");
  return <svg aria-label="Estimator convergence" className="h-16 w-full" role="img" viewBox="0 0 180 60"><polyline fill="none" points={points} stroke="var(--signal)" strokeWidth="2" /><line stroke="var(--line)" x1="0" x2="180" y1="55" y2="55" /></svg>;
}

export function SimulatePanel() {
  const graph = useLabStore((state) => state.graph);
  const parameters = useLabStore((state) => state.parameters);
  const conditioning = useLabStore((state) => state.conditioning);
  const selection = useLabStore((state) => state.selection);
  const seed = useLabStore((state) => state.seed);
  const n = useLabStore((state) => state.n);
  const setCoefficient = useLabStore((state) => state.setCoefficient);
  const setErrorSd = useLabStore((state) => state.setErrorSd);
  const setSeed = useLabStore((state) => state.setSeed);
  const setSampleSize = useLabStore((state) => state.setSampleSize);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exposureId = graph.roles.exposureId;
  const outcomeId = graph.roles.outcomeId;
  const names = new Map(graph.nodes.map((node) => [node.id, node.name]));
  const name = (id: string) => names.get(id) ?? id;
  const report = useMemo(
    () => proveGraph(graph, new Set(conditioning), selection ? { nodeId: selection.nodeId } : undefined),
    [conditioning, graph, selection],
  );
  const selectedInstrument = useMemo(
    () =>
      report.instruments[0]
        ? { instrumentId: report.instruments[0].instrumentId, conditioningIds: report.instruments[0].conditioningSets[0] ?? [] }
        : null,
    [report.instruments],
  );

  const readout = useMemo(() => {
    if (!run || !exposureId || !outcomeId) return null;
    try {
      const totalEffect = matrixTotalEffect(run.model, exposureId, outcomeId);
      const exactContext = run.truncation ?? run.model;
      const exactOls = olsEstimand(exactContext, exposureId, outcomeId, conditioning, totalEffect);
      const sampleOls = run.sample.sampleSize < 50 ? null : olsEstimand(run.sample, exposureId, outcomeId, conditioning, totalEffect);
      const exactIv = selectedInstrument
        ? ivEstimand(exactContext, selectedInstrument.instrumentId, exposureId, outcomeId, selectedInstrument.conditioningIds, totalEffect)
        : null;
      const sampleIv = selectedInstrument && run.sample.sampleSize >= 50
        ? ivEstimand(run.sample, selectedInstrument.instrumentId, exposureId, outcomeId, selectedInstrument.conditioningIds, totalEffect)
        : null;
      const series = convergenceSeries(run.data, {
        kind: "ols",
        exposureId,
        outcomeId,
        conditionedIds: conditioning,
        totalEffect,
      });
      return {
        audit: auditScmIntegrity(run.model, exposureId, outcomeId),
        totalEffect,
        exactOls,
        sampleOls,
        exactIv,
        sampleIv,
        series,
      };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Simulation readout failed." };
    }
  }, [conditioning, exposureId, outcomeId, run, selectedInstrument]);

  const launch = async () => {
    if (!exposureId || !outcomeId) {
      setError("Designate observed X and Y before running the SCM.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setRun(await runSimulationAsync(graph, parameters, exposureId, outcomeId, { seed, n, selection: selection ?? undefined }));
    } catch (cause) {
      setRun(null);
      setError(cause instanceof Error ? cause.message : "Simulation could not run.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="simulate-panel-title" className="space-y-5">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">SIMULATE</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.05em]" id="simulate-panel-title">Show the finite sample beside its population target.</h1>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold">Seed<input aria-label="Simulation seed" className="field-input mt-1" max="4294967295" min="0" onChange={(event) => setSeed(Number(event.target.value))} type="number" value={seed} /></label>
        <label className="text-xs font-bold">Rows<input aria-label="Simulation rows" className="field-input mt-1" max="1000000" min="100" onChange={(event) => setSampleSize(Number(event.target.value))} type="number" value={n} /></label>
      </div>
      <button className="w-full rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-bold text-[var(--surface)] disabled:opacity-60" disabled={busy} onClick={() => void launch()} type="button">
        {busy ? "Running deterministic sample…" : "Run simulation"}
      </button>
      {error ? <p className="rounded-xl bg-[var(--signal-soft)] p-3 text-xs leading-5">{error}</p> : null}

      <details>
        <summary className="cursor-pointer text-sm font-bold">Structural parameters</summary>
        <div className="mt-3 space-y-2 text-xs">
          {graph.edges.map((edge) => (
            <label className="flex items-center justify-between gap-2" key={`${edge.from}-${edge.to}`}>
              <span>{name(edge.from)} → {name(edge.to)}</span>
              <input aria-label={`${name(edge.from)} to ${name(edge.to)} coefficient`} className="field-input w-24" max="2" min="-2" onChange={(event) => setCoefficient(edge.from, edge.to, Number(event.target.value))} step="0.05" type="number" value={parameters.edgeCoefficients[edgeParameterKey(edge.from, edge.to)]} />
            </label>
          ))}
          {graph.nodes.map((node) => (
            <label className="flex items-center justify-between gap-2" key={node.id}>
              <span>σ {node.name}</span>
              <input aria-label={`${node.name} error SD`} className="field-input w-24" max="3" min="0.05" onChange={(event) => setErrorSd(node.id, Number(event.target.value))} step="0.05" type="number" value={parameters.errorSds[node.id]} />
            </label>
          ))}
        </div>
      </details>

      {readout && "error" in readout ? <p className="rounded-xl bg-[var(--signal-soft)] p-3 text-xs">{readout.error}</p> : null}
      {readout && !("error" in readout) ? (
        <>
          <div className={`rounded-2xl border p-3 text-xs ${readout.audit.ok ? "border-[var(--moss)] bg-[var(--moss-soft)]" : "border-[var(--signal)] bg-[var(--signal-soft)]"}`}>
            {readout.audit.ok ? "Integrity check passes: matrix/trek Σ and matrix/path TE agree." : "Engine integrity error — results withheld."}
          </div>
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">OLS {conditioning.length ? `| ${conditioning.map(name).join(", ")}` : "| ∅"}</p>
            <p className="mt-2 text-2xl font-black">{readout.sampleOls ? number(readout.sampleOls.estimand) : "Insufficient selected sample"}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Exact estimand {number(readout.exactOls.estimand)} · exact population bias {number(readout.exactOls.populationBias)} · TE {number(readout.totalEffect)}</p>
            <div className="mt-3"><Sparkline values={readout.series.map((point) => point.estimate)} /></div>
          </article>
          {selectedInstrument ? (
            <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">IV · {name(selectedInstrument.instrumentId)}</p>
              <p className="mt-2 text-2xl font-black">{number(readout.sampleIv?.estimand)}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Exact estimand {number(readout.exactIv?.estimand)} · population bias {number(readout.exactIv?.populationBias)} {readout.exactIv?.status === "weak" ? "· weak-instrument warning" : ""}{readout.exactIv?.status === "undefined" ? "· first stage undefined" : ""}</p>
            </article>
          ) : null}
          {selection ? <p className="text-xs leading-5 text-[var(--muted)]">Selected sample: {run?.sample.sampleSize ?? 0} kept rows. Exact references use the truncated covariance; under 50 kept rows, estimator readouts stay insufficient.</p> : null}
          {report.frontdoor?.mediatorIds.length ? <p className="text-xs leading-5 text-[var(--muted)]">Front-door identifies through {report.frontdoor.mediatorIds.map(name).join(", ")}; its sampling estimator is planned for v1.1.</p> : null}
        </>
      ) : null}
    </section>
  );
}
