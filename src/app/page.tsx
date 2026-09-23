import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { EXAMPLE_GALLERY } from "@/content/examples";

const surfaces = [
  ["01", "Draw", "Make the assumption visible before the analysis begins."],
  ["02", "Prove", "Read paths, identification strategies, and testable claims."],
  ["03", "Simulate", "Compare finite samples against the population target."],
  ["04", "Design", "Trade measurement, selection, precision, and bias deliberately."],
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-10 pt-8 sm:px-8 lg:px-12">
      <section className="shell-grid relative overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] px-6 py-14 shadow-[var(--shadow)] sm:px-12 sm:py-20">
        <div className="absolute right-[-6rem] top-[-7rem] h-72 w-72 rounded-full border border-[var(--signal)] opacity-30" />
        <div className="absolute right-16 top-24 h-32 w-32 rounded-full border border-dashed border-[var(--moss)] opacity-60" />
        <p className="relative mb-7 font-mono text-xs font-bold tracking-[0.2em] text-[var(--signal)]">
          PRE-DATA CAUSAL INSTRUMENT
        </p>
        <h1 className="relative max-w-4xl text-balance text-[clamp(1.75rem,9vw,6rem)] font-black tracking-[-0.065em]">
          {PRODUCT_NAME}
        </h1>
        <p className="relative mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
          Draw your assumptions. See your bias. Decide before the data makes a weak story look
          certain.
        </p>
        <div className="relative mt-10 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-bold text-[var(--surface)] transition-transform hover:-translate-y-0.5"
            href="/lab"
          >
            Open the workbench
          </Link>
          <Link
            className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-6 py-3 text-sm font-bold text-[var(--ink)] transition-colors hover:bg-[var(--moss-soft)]"
            href="/learn"
          >
            Learn the traps
          </Link>
        </div>
      </section>

      <section className="mt-10 grid gap-3 md:grid-cols-2">
        {surfaces.map(([index, label, description]) => (
          <article
            className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6"
            key={label}
          >
            <p className="font-mono text-xs tracking-[0.18em] text-[var(--signal)]">{index}</p>
            <h2 className="mt-8 text-2xl font-bold tracking-[-0.04em]">{label}</h2>
            <p className="mt-3 max-w-sm leading-7 text-[var(--muted)]">{description}</p>
          </article>
        ))}
      </section>

      <section
        aria-label="Example graphs"
        className="mt-10 rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-7 sm:p-10"
      >
        <p className="font-mono text-xs font-bold tracking-[0.2em] text-[var(--signal)]">GALLERY</p>
        <h2 className="mt-5 text-3xl font-black tracking-[-0.055em]">
          Load a canon graph. Break it. Rebuild it.
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {EXAMPLE_GALLERY.map((example) => (
            <article
              key={example.slug}
              className="rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-5"
            >
              <p className="font-mono text-xs tracking-[0.18em] text-[var(--signal)]">EXAMPLE</p>
              <h3 className="mt-4 text-xl font-bold tracking-[-0.03em]">{example.title}</h3>
              <p className="mt-2 leading-6 text-[var(--muted)]">{example.description}</p>
              <Link
                className="mt-5 inline-flex rounded-full border border-[var(--line)] px-4 py-2 text-sm font-bold hover:bg-[var(--moss-soft)]"
                href={`/learn/${example.slug === "chain" ? "overcontrol" : example.slug}`}
              >
                Play the lesson →
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
