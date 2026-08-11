import { notFound } from "next/navigation";
import Link from "next/link";
import { LEARN_SCENARIOS, openInLabSnapshot, scenarioBySlug } from "@/content/learn/scenarios";
import { LearnPlayer } from "@/ui/learn-player";

export function generateStaticParams() {
  return LEARN_SCENARIOS.map((scenario) => ({ slug: scenario.slug }));
}

interface Params {
  slug: string;
}

export default async function LessonPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const scenario = scenarioBySlug(slug);
  if (!scenario) notFound();
  const snapshot = openInLabSnapshot(scenario);
  if (!snapshot) notFound();
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-12 pt-8 sm:px-8">
      <nav className="mb-4 text-sm">
        <Link className="text-[var(--muted)] hover:text-[var(--ink)]" href="/learn">
          ← All lessons
        </Link>
      </nav>
      <LearnPlayer scenario={scenario} snapshot={snapshot} />
    </main>
  );
}
