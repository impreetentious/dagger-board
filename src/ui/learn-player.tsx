"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LearnChoice, LearnScenario } from "@/content/learn/scenarios";
import { encodeGraphFragment, type LabSnapshot } from "@/lib/codec";
import { LearnPathAnatomy } from "@/ui/learn-path-anatomy";

type Stage = "setup" | "act" | "observe" | "reveal";

const PROGRESS_KEY = "daggerboard.learn.progress.v1";

interface Props {
  scenario: LearnScenario;
  snapshot: LabSnapshot;
}

function markCompleted(slug: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[slug] = true;
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // Local storage can be disabled; progress then degrades silently without telemetry.
  }
}

export function LearnPlayer({ scenario, snapshot }: Props) {
  const [stage, setStage] = useState<Stage>("setup");
  const [choice, setChoice] = useState<LearnChoice | null>(null);
  const [labHref, setLabHref] = useState<string>("/lab");
  useEffect(() => {
    let cancelled = false;
    encodeGraphFragment(snapshot)
      .then((fragment) => {
        if (!cancelled) setLabHref(`/lab${fragment}`);
      })
      .catch(() => {
        // A browser without deflate compression can't carry the graph in the
        // URL; degrade to the plain workbench link instead of leaving an
        // unhandled rejection and a permanently stale href.
        if (!cancelled) setLabHref("/lab");
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot]);
  useEffect(() => {
    if (stage === "reveal") markCompleted(scenario.slug);
  }, [stage, scenario.slug]);

  return (
    <article className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-10">
      <p className="font-mono text-xs font-bold tracking-[0.2em] text-[var(--signal)]">
        LESSON {String(scenario.ordinal).padStart(2, "0")} · {stage.toUpperCase()}
      </p>
      <h1 className="mt-4 text-3xl font-black tracking-[-0.055em] sm:text-4xl">{scenario.title}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">{scenario.oneLiner}</p>

      {stage === "setup" ? (
        <section className="mt-8 space-y-5" aria-label="Scenario setup">
          <p className="leading-7">{scenario.setup}</p>
          <button className="tool-button" onClick={() => setStage("act")} type="button">
            Continue to the choice
          </button>
        </section>
      ) : null}

      {stage === "act" ? (
        <section className="mt-8 space-y-5" aria-label="Commit to a choice">
          <p className="text-lg font-bold tracking-[-0.02em]">{scenario.actQuestion}</p>
          <div className="grid gap-3">
            {scenario.choices.map((option) => (
              <button
                aria-pressed={choice?.id === option.id}
                className="tool-button text-left"
                key={option.id}
                onClick={() => {
                  setChoice(option);
                  setStage("observe");
                }}
                type="button"
              >
                <span className="block font-bold">{option.label}</span>
                <span className="mt-1 block text-[var(--muted)]">{option.detail}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {stage === "observe" && choice ? (
        <section className="mt-8 space-y-5" aria-label="Observed outcome">
          <p className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--muted)]">
            You chose: <strong className="text-[var(--ink)]">{choice.label}</strong>
          </p>
          <p className="leading-7">{scenario.observe}</p>
          <button className="tool-button" onClick={() => setStage("reveal")} type="button">
            Show the anatomy
          </button>
        </section>
      ) : null}

      {stage === "reveal" && choice ? (
        <section className="mt-8 space-y-5" aria-label="Reveal">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">
              LESSON
            </p>
            <p className="mt-2 leading-7">{scenario.reveal.lesson}</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">
              POPULATION BIAS
            </p>
            <p className="mt-2 leading-7">{scenario.reveal.populationBias}</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
            <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">
              PATH ANATOMY
            </p>
            <p className="mt-2 leading-7">{scenario.reveal.pathAnatomy}</p>
            <div className="mt-4">
              <LearnPathAnatomy snapshot={snapshot} />
            </div>
          </div>
          {scenario.secondaryReference ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
              <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-[var(--signal)]">
                {scenario.secondaryReference.label.toUpperCase()}
              </p>
              <p className="mt-2 leading-7">{scenario.secondaryReference.value}</p>
            </div>
          ) : null}
          <p
            aria-live="polite"
            data-testid="learn-choice-result"
            className="text-sm text-[var(--muted)]"
          >
            Your choice was{" "}
            {choice.correct
              ? "the recommended read."
              : "an instructive miss — the reveal shows why."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="tool-button" data-testid="open-in-lab" href={labHref}>
              Open in the workbench
            </Link>
            <Link className="tool-button" href="/learn">
              Return to the curriculum
            </Link>
          </div>
        </section>
      ) : null}
    </article>
  );
}
