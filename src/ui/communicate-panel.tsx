"use client";

import { useEffect, useMemo, useState } from "react";
import { buildAdrDocument, type AdrDocument } from "@/engine/adr";
import { APP_VERSION } from "@/lib/app-version";
import { graphToSvg } from "@/lib/svg-export";
import { useLabStore } from "@/store/lab-store";

function download(name: string, payload: string, type = "application/json") {
  const blob = new Blob([payload], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function nodeNameLookup(document: AdrDocument): Record<string, string> {
  return Object.fromEntries(document.nodes.map((node) => [node.id, node.name]));
}

export function CommunicatePanel() {
  const graph = useLabStore((state) => state.graph);
  const conditioning = useLabStore((state) => state.conditioning);
  const parameters = useLabStore((state) => state.parameters);
  const reliability = useLabStore((state) => state.reliability);
  const selection = useLabStore((state) => state.selection);
  const seed = useLabStore((state) => state.seed);
  const n = useLabStore((state) => state.n);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const svg = useMemo(() => graphToSvg(graph), [graph]);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimestamp(new Date().toISOString()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const doc = useMemo<AdrDocument>(
    () =>
      buildAdrDocument({
        graph,
        conditioning: new Set(conditioning),
        selection,
        seed,
        n,
        timestamp: timestamp ?? "",
        appVersion: APP_VERSION,
        svg,
        parameters,
        reliability,
      }),
    [graph, conditioning, selection, seed, n, timestamp, svg, parameters, reliability],
  );

  const names = nodeNameLookup(doc);
  const missingRoles = !doc.exposureId || !doc.outcomeId;

  return (
    <section aria-labelledby="communicate-panel-title" className="space-y-5 adr-panel">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">
          COMMUNICATE
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.05em]" id="communicate-panel-title">
          Ship the reasoning, not just the plot.
        </h2>
      </div>
      {missingRoles ? (
        <p className="rounded-2xl border border-dashed border-[var(--line)] p-4 text-sm leading-6 text-[var(--muted)]">
          Designate an exposure and outcome in Draw before exporting the Analysis Design Record.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="tool-button"
          data-testid="adr-download"
          onClick={() =>
            download(`daggerboard-adr-${doc.appVersion}.json`, JSON.stringify(doc, null, 2))
          }
          type="button"
        >
          Download ADR JSON
        </button>
        <button
          className="tool-button"
          data-testid="svg-download"
          onClick={() => download("daggerboard-dag.svg", svg, "image/svg+xml")}
          type="button"
        >
          Download DAG SVG
        </button>
        <button className="tool-button" onClick={() => window.print()} type="button">
          Print / save as PDF
        </button>
      </div>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 space-y-3">
        <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">
          MODEL
        </p>
        <p className="text-sm">
          Exposure:{" "}
          <span className="font-mono">{doc.exposureId ? names[doc.exposureId] : "—"}</span>.
          Outcome: <span className="font-mono">{doc.outcomeId ? names[doc.outcomeId] : "—"}</span>.
        </p>
        <p className="text-sm">
          Verdict: <span className="font-bold">{doc.identificationVerdict}</span>. Timestamp:{" "}
          <span className="font-mono">{doc.timestamp || "—"}</span> ({doc.appVersion}).
        </p>
        {doc.robustness ? (
          <p className="text-sm leading-6">
            <span className="font-bold">Robustness.</span> {doc.robustness.statement}
          </p>
        ) : null}
      </div>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">
          DAG
        </p>
        <div
          aria-label="Exported DAG preview"
          className="mt-3 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
          tabIndex={0}
        />
      </div>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">
          ASSUMED ABSENT
        </p>
        <ul
          aria-label="Assumed absent edges"
          className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-[var(--muted)]"
          tabIndex={0}
        >
          {doc.absentEdges.map((edge) => (
            <li key={`${edge.u}--${edge.v}`}>
              no direct effect between <span className="font-mono">{names[edge.u]}</span> and{" "}
              <span className="font-mono">{names[edge.v]}</span> in either direction (as drawn)
            </li>
          ))}
          <li>
            all disturbances are mutually independent — no common causes beyond the latent nodes
            explicitly drawn
          </li>
          {doc.selection ? (
            <li>
              selection rule active: keep the top {((1 - doc.selection.quantile) * 100).toFixed(0)}%
              of <span className="font-mono">{doc.selection.nodeName}</span>
            </li>
          ) : null}
        </ul>
      </div>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">
          KNOWN THREATS
        </p>
        {doc.threats.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            No open biasing paths under the current design.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {doc.threats.map((threat, index) => (
              <li key={index}>
                <span className="font-mono">
                  {threat.pathIds.map((id) => names[id] ?? id).join(" → ")}
                </span>{" "}
                <span className="text-[var(--muted)]">— {threat.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
