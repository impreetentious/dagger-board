import Link from "next/link";
import { LEARN_SCENARIOS } from "@/content/learn/scenarios";

export default function LearnPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-10 pt-8 sm:px-8 lg:px-12">
      <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-7 sm:p-10">
        <p className="font-mono text-xs font-bold tracking-[0.2em] text-[var(--signal)]">LEARN</p>
        <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-[-0.055em] sm:text-6xl">
          Commit to a choice. Then inspect its consequences.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">
          Six canonical traps, each a playable scenario. Make the analysis call first — the engine
          then reveals the path anatomy, the exact bias, and a one-click route to the workbench.
        </p>
      </section>
      <section aria-label="Lessons" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LEARN_SCENARIOS.map((scenario) => (
          <article
            className="flex flex-col rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6"
            key={scenario.slug}
          >
            <p className="font-mono text-xs text-[var(--signal)]">
              LESSON {String(scenario.ordinal).padStart(2, "0")}
            </p>
            <h2 className="mt-8 text-2xl font-bold tracking-[-0.04em]">{scenario.title}</h2>
            <p className="mt-3 flex-1 leading-7 text-[var(--muted)]">{scenario.oneLiner}</p>
            <Link
              className="mt-6 inline-flex w-fit rounded-full border border-[var(--line)] px-4 py-2 text-sm font-bold hover:bg-[var(--moss-soft)]"
              href={`/learn/${scenario.slug}`}
            >
              Play scenario →
            </Link>
          </article>
        ))}
      </section>
      <Link
        className="mt-7 inline-flex rounded-full border border-[var(--line)] px-5 py-3 text-sm font-bold hover:bg-[var(--moss-soft)]"
        href="/lab"
      >
        Return to the workbench
      </Link>
    </main>
  );
}
