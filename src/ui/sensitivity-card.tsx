"use client";

import { useMemo } from "react";
import { attenuateCovariance } from "@/engine/measurement";
import { buildScmModel, matrixTotalEffect } from "@/engine/scm";
import { evaluateSensitivity, sensitivitySummary } from "@/engine/sensitivity";
import { truncateCovariance } from "@/engine/truncation";
import { useLabStore } from "@/store/lab-store";

const WIDTH = 420;
const HEIGHT = 300;
const PAD = { top: 14, right: 18, bottom: 42, left: 52 };

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * The sensitivity surface, rendered. The axes are the two partial R² values that fully
 * determine an omitted confounder's bias, so every point on the plane is a hypothetical
 * confounder and every curve is the set of confounders that would move the estimate to one
 * particular value. The diagonal marker is the robustness value: the weakest confounder — in
 * the sense of being equally strong on both axes — that would kill the result.
 */
export function SensitivityCard({
  conditioningIds,
}: {
  conditioningIds: readonly string[];
}): React.JSX.Element | null {
  const graph = useLabStore((state) => state.graph);
  const parameters = useLabStore((state) => state.parameters);
  const selection = useLabStore((state) => state.selection);
  const reliability = useLabStore((state) => state.reliability);

  const report = useMemo(() => {
    const exposureId = graph.roles.exposureId;
    const outcomeId = graph.roles.outcomeId;
    if (!exposureId || !outcomeId) return null;
    try {
      const model = buildScmModel(graph, parameters);
      if (model.illConditioned) return null;
      const selected = selection ? truncateCovariance(model, selection) : model;
      const context = attenuateCovariance(
        { covariance: selected.covariance, indexById: model.indexById },
        reliability,
      );
      return evaluateSensitivity({
        graph,
        context,
        exposureId,
        outcomeId,
        conditioningIds,
        totalEffect: matrixTotalEffect(model, exposureId, outcomeId),
      });
    } catch {
      return null;
    }
  }, [conditioningIds, graph, parameters, reliability, selection]);

  if (!report) return null;
  const name = (id: string) => graph.nodes.find((node) => node.id === id)?.name ?? id;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const toX = (value: number) => PAD.left + value * plotWidth;
  const toY = (value: number) => PAD.top + plotHeight - value * plotHeight;

  const benchmarks = report.benchmarks.filter(
    (entry) => entry.exposureShare > 1e-6 && entry.outcomeShare > 1e-6,
  );

  return (
    <section
      aria-labelledby="sensitivity-title"
      className="space-y-3 rounded-2xl border border-[var(--line)] p-4"
    >
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.18em] text-[var(--signal)]">
          SENSITIVITY
        </p>
        <h3 className="mt-1 text-lg font-black tracking-[-0.03em]" id="sensitivity-title">
          What about the confounder you did not draw?
        </h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Every verdict on this screen assumes the drawn graph is complete. This is the price of
          that assumption being wrong, in the only currency an omitted confounder has: how much of
          the exposure and how much of the outcome it would need to explain.
        </p>
      </div>

      {report.degenerate ? (
        <p className="text-sm">{sensitivitySummary(report)}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--muted)]">Estimand</dt>
              <dd className="font-mono tabular-nums">{report.estimand.toFixed(4)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Robustness value</dt>
              <dd className="font-mono tabular-nums">{percent(report.robustnessValue)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">To reverse the sign</dt>
              <dd className="font-mono tabular-nums">{percent(report.robustnessValueSignFlip)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Bias per unit strength</dt>
              <dd className="font-mono tabular-nums">{report.biasScale.toFixed(4)}</dd>
            </div>
          </dl>

          <svg
            aria-labelledby="sensitivity-contour-title"
            className="w-full"
            role="group"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          >
            <title id="sensitivity-contour-title">
              Bias contours over hypothetical confounder strength. The curve through the marked
              point is the set of confounders that would bring the estimate to zero.
            </title>
            <rect
              className="fill-[var(--moss-soft)]"
              height={plotHeight}
              width={plotWidth}
              x={PAD.left}
              y={PAD.top}
            />
            {report.contour.map((level) => (
              <g key={level.value}>
                <path
                  d={level.points
                    .map(
                      (point, index) => `${index === 0 ? "M" : "L"}${toX(point.x)} ${toY(point.y)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke={level.value === 0 ? "var(--signal)" : "var(--muted)"}
                  strokeDasharray={level.value === 0 ? undefined : "4 3"}
                  strokeWidth={level.value === 0 ? 2 : 1.2}
                />
                {level.points[Math.floor(level.points.length / 2)] ? (
                  <text
                    className="fill-[var(--muted)] text-[9px]"
                    x={toX(level.points[Math.floor(level.points.length / 2)].x) + 4}
                    y={toY(level.points[Math.floor(level.points.length / 2)].y) - 4}
                  >
                    {level.value.toFixed(2)}
                  </text>
                ) : null}
              </g>
            ))}
            <line
              stroke="var(--line)"
              strokeDasharray="2 3"
              x1={PAD.left}
              x2={PAD.left + plotWidth}
              y1={PAD.top + plotHeight}
              y2={PAD.top}
            />
            <circle
              cx={toX(report.robustnessValue)}
              cy={toY(report.robustnessValue)}
              fill="var(--signal)"
              r={5}
            >
              <title>{`Robustness value ${percent(report.robustnessValue)}`}</title>
            </circle>
            {benchmarks.map((entry) => (
              <g key={entry.nodeId}>
                <circle
                  cx={toX(Math.min(1, entry.exposureShare))}
                  cy={toY(Math.min(1, entry.outcomeShare))}
                  fill="none"
                  r={4}
                  stroke="var(--moss)"
                  strokeWidth={1.5}
                />
                <text
                  className="fill-[var(--moss)] text-[9px]"
                  x={toX(Math.min(1, entry.exposureShare)) + 6}
                  y={toY(Math.min(1, entry.outcomeShare)) + 3}
                >
                  {name(entry.nodeId)}
                </text>
              </g>
            ))}
            <text className="fill-[var(--muted)] text-[10px]" x={PAD.left} y={HEIGHT - 22}>
              0
            </text>
            <text
              className="fill-[var(--muted)] text-[10px]"
              textAnchor="end"
              x={PAD.left + plotWidth}
              y={HEIGHT - 22}
            >
              100%
            </text>
            <text
              className="fill-[var(--muted)] text-[10px]"
              textAnchor="middle"
              x={PAD.left + plotWidth / 2}
              y={HEIGHT - 6}
            >
              share of the exposure the confounder explains
            </text>
            <text
              className="fill-[var(--muted)] text-[10px]"
              textAnchor="end"
              x={PAD.left - 6}
              y={PAD.top + 8}
            >
              100%
            </text>
            <text
              className="fill-[var(--muted)] text-[10px]"
              textAnchor="end"
              x={PAD.left - 6}
              y={PAD.top + plotHeight}
            >
              0
            </text>
          </svg>

          <p className="text-sm leading-6">{sensitivitySummary(report)}</p>

          {benchmarks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <caption className="pb-2 text-left text-xs text-[var(--muted)]">
                  Drawn nodes, placed on the same axes. These are not bounds: dropping an adjusted
                  node is a covariance computation, so the estimate it would leave behind is exact.
                </caption>
                <thead className="bg-[var(--moss-soft)]">
                  <tr>
                    <th className="p-2">Node</th>
                    <th className="p-2">Explains of X</th>
                    <th className="p-2">Explains of Y</th>
                    <th className="p-2">Estimate without it</th>
                    <th className="p-2">Strength needed, as a multiple</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((entry) => (
                    <tr className="border-t border-[var(--line)]" key={entry.nodeId}>
                      <td className="p-2 font-bold">{name(entry.nodeId)}</td>
                      <td className="p-2 font-mono tabular-nums">{percent(entry.exposureShare)}</td>
                      <td className="p-2 font-mono tabular-nums">{percent(entry.outcomeShare)}</td>
                      <td className="p-2 font-mono tabular-nums">
                        {entry.estimandWithout === null
                          ? "not adjusted for"
                          : entry.estimandWithout.toFixed(4)}
                      </td>
                      <td className="p-2 font-mono tabular-nums">
                        {entry.multipleToOverturn === null
                          ? "—"
                          : `${entry.multipleToOverturn.toFixed(2)}×`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
