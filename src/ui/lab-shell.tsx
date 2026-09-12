"use client";

import { useEffect } from "react";
import { decodeGraphFragment } from "@/lib/codec";
import { DrawPanel } from "@/ui/draw-panel";
import { GraphCanvas } from "@/ui/graph-canvas";
import { ProvePanel } from "@/ui/prove-panel";
import { SimulatePanel } from "@/ui/simulate-panel";
import { DesignPanel } from "@/ui/design-panel";
import { CommunicatePanel } from "@/ui/communicate-panel";
import { useLabStore, type LabSurface } from "@/store/lab-store";

const surfaces: Array<{ id: LabSurface; label: string; index: string }> = [
  { id: "draw", label: "Draw", index: "01" },
  { id: "prove", label: "Prove", index: "02" },
  { id: "simulate", label: "Simulate", index: "03" },
  { id: "design", label: "Design", index: "04" },
  { id: "communicate", label: "Communicate", index: "05" },
];

export function LabShell() {
  const activeSurface = useLabStore((state) => state.activeSurface);
  const setActiveSurface = useLabStore((state) => state.setActiveSurface);
  const loadSnapshot = useLabStore((state) => state.loadSnapshot);
  const setNotice = useLabStore((state) => state.setNotice);
  const notice = useLabStore((state) => state.notice);
  useEffect(() => {
    if (!window.location.hash.startsWith("#g=")) return;
    void decodeGraphFragment(window.location.hash)
      .then((snapshot) => loadSnapshot(snapshot, "Shared model loaded."))
      .catch(() => setNotice("The graph fragment could not be decoded."));
  }, [loadSnapshot, setNotice]);
  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col px-4 pb-10 pt-6 sm:px-8 lg:px-10">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">
            WORKBENCH
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.06em] sm:text-4xl">
            One model, multiple checks.
          </h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-[var(--muted)]">
          Draw the causal claim once. Every rail reads the same graph, parameters, conditioning set,
          and selection rule.
        </p>
      </header>
      <p aria-live="polite" className="min-h-5 text-sm text-[var(--muted)]">
        {notice}
      </p>
      <div
        className="mb-4 flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Workbench surfaces"
      >
        {surfaces.map((surface) => (
          <button
            aria-selected={activeSurface === surface.id}
            className={`surface-tab ${activeSurface === surface.id ? "surface-tab-active" : ""}`}
            key={surface.id}
            onClick={() => setActiveSurface(surface.id)}
            role="tab"
            type="button"
          >
            <span>{surface.index}</span> {surface.label}
          </button>
        ))}
      </div>
      <section className="grid overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)] xl:grid-cols-[minmax(0,1.55fr)_25rem]">
        <div className="min-w-0 p-4 sm:p-6">
          <GraphCanvas />
        </div>
        <section className="border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-raised)_82%,transparent)] p-5 sm:p-7 xl:border-l xl:border-t-0">
          {activeSurface === "draw" ? <DrawPanel /> : null}
          {activeSurface === "prove" ? <ProvePanel /> : null}
          {activeSurface === "simulate" ? <SimulatePanel /> : null}
          {activeSurface === "design" ? <DesignPanel /> : null}
          {activeSurface === "communicate" ? <CommunicatePanel /> : null}
        </section>
      </section>
    </main>
  );
}
