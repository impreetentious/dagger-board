import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { ThemeToggle } from "@/ui/theme-toggle";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--canvas)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link className="font-mono text-sm font-black tracking-[-0.06em]" href="/">
            {PRODUCT_NAME}
          </Link>
          <nav aria-label="Primary navigation" className="flex items-center gap-1 sm:gap-2">
            <Link
              className="rounded-full px-3 py-2 text-sm font-bold hover:bg-[var(--moss-soft)]"
              href="/lab"
            >
              Lab
            </Link>
            <Link
              className="rounded-full px-3 py-2 text-sm font-bold hover:bg-[var(--moss-soft)]"
              href="/learn"
            >
              Learn
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-[var(--line)] px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-sm text-[var(--muted)] sm:flex-row">
          <p>Local-first causal reasoning. No accounts, telemetry, or runtime API calls.</p>
          <p>{PRODUCT_NAME} · MIT © Sidakpreet Singh</p>
        </div>
      </footer>
    </div>
  );
}
