"use client";

import { useState } from "react";
import { findWitnessPair, type WitnessPair } from "@/engine/witness";
import { useLabStore } from "@/store/lab-store";

/**
 * Shown only when the verdict is "not identified". A verdict of that shape is a claim about
 * every dataset that could ever be collected, and this is where the claim stops being an
 * assertion: two parameterizations of the drawn graph that no observable moment can tell
 * apart, disagreeing about the effect. Either can be loaded into Simulate, where the naive
 * estimate converges to the same number under both while the truth differs.
 */
export function WitnessCard(): React.JSX.Element {
  const graph = useLabStore((state) => state.graph);
  const parameters = useLabStore((state) => state.parameters);
  const setActiveSurface = useLabStore((state) => state.setActiveSurface);
  const setCoefficient = useLabStore((state) => state.setCoefficient);
  const setErrorSd = useLabStore((state) => state.setErrorSd);
  const setNotice = useLabStore((state) => state.setNotice);
  const [witness, setWitness] = useState<WitnessPair | null>(null);
  const [searching, setSearching] = useState(false);

  const name = (id: string) => graph.nodes.find((node) => node.id === id)?.name ?? id;
  const parameterLabel = (key: string, kind: "coefficient" | "errorSd"): string => {
    if (kind === "errorSd") return `σ(${name(key)})`;
    const [from, to] = key.split("\u0000");
    return `${name(from ?? "")} → ${name(to ?? "")}`;
  };

  const search = (): void => {
    setSearching(true);
    // The hill-climb is synchronous and runs close to a second on a graph at the
    // §3.1 cap. Running it straight from the click handler meant the "Searching…"
    // state was set but never painted — the button simply froze. Two frames hands
    // the browser one paint before the main thread is taken.
    const run = () => {
      try {
        setWitness(findWitnessPair({ graph, parameters }));
      } finally {
        setSearching(false);
      }
    };
    if (typeof requestAnimationFrame === "undefined") run();
    else requestAnimationFrame(() => requestAnimationFrame(run));
  };

  const load = (side: "left" | "right"): void => {
    const chosen = side === "left" ? witness?.left : witness?.right;
    if (!chosen) return;
    for (const [key, value] of Object.entries(chosen.parameters.edgeCoefficients)) {
      const [from, to] = key.split("\u0000");
      if (from && to) setCoefficient(from, to, value);
    }
    for (const [id, value] of Object.entries(chosen.parameters.errorSds)) setErrorSd(id, value);
    setActiveSurface("simulate");
    setNotice(
      side === "left"
        ? "Loaded the original world. Run the simulation, then load the other one."
        : "Loaded the impostor. Same seed, same n — watch the naive estimate land in the same place.",
    );
  };

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--line)] p-4">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">
          WITNESS
        </p>
        <h3 className="mt-1 text-lg font-black tracking-[-0.03em]">
          Not identified — and here is why, rather than that.
        </h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          A non-identification verdict says no estimator reading these variables can recover the
          effect. That is a claim worth demonstrating: the search below looks for two
          parameterizations of this exact graph that agree on every observable covariance and
          disagree about the effect of the exposure on the outcome. Nothing is reported unless the
          engine has verified both halves of that sentence.
        </p>
      </div>

      <button
        className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-bold"
        disabled={searching}
        onClick={search}
        type="button"
      >
        {searching ? "Searching…" : "Construct a witness pair"}
      </button>

      {witness ? (
        witness.status === "found" ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--muted)]">Your world&rsquo;s effect</dt>
                <dd className="font-mono tabular-nums">{witness.left!.totalEffect.toFixed(4)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">The impostor&rsquo;s effect</dt>
                <dd className="font-mono tabular-nums">{witness.right!.totalEffect.toFixed(4)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Largest observable disagreement</dt>
                <dd className="font-mono tabular-nums">
                  {witness.observedCovarianceGap.toExponential(2)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Effect gap</dt>
                <dd className="font-mono tabular-nums">{witness.effectGap.toFixed(4)}</dd>
              </div>
            </dl>
            <p className="text-sm leading-6">{witness.reason}</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <caption className="pb-2 text-left text-xs text-[var(--muted)]">
                  What the impostor changed. Every one of these is invisible in the observable
                  covariance.
                </caption>
                <thead className="bg-[var(--moss-soft)]">
                  <tr>
                    <th className="p-2">Parameter</th>
                    <th className="p-2">Yours</th>
                    <th className="p-2">Theirs</th>
                  </tr>
                </thead>
                <tbody>
                  {witness.movedParameters.slice(0, 8).map((moved) => (
                    <tr
                      className="border-t border-[var(--line)]"
                      key={`${moved.kind}:${moved.key}`}
                    >
                      <td className="p-2 font-bold">{parameterLabel(moved.key, moved.kind)}</td>
                      <td className="p-2 font-mono tabular-nums">{moved.from.toFixed(4)}</td>
                      <td className="p-2 font-mono tabular-nums">{moved.to.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-bold"
                onClick={() => load("left")}
                type="button"
              >
                Simulate your world
              </button>
              <button
                className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-bold"
                onClick={() => load("right")}
                type="button"
              >
                Simulate the impostor
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6">{witness.reason}</p>
        )
      ) : null}
    </section>
  );
}
