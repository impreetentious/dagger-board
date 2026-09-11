# Build Decisions

## P0 foundation

- Runtime is Node 20.20.2, pinned in `.nvmrc`; npm 10 is the supported package manager.
- Framework majors are pinned by the generated lockfile: Next 16.2, React 19.2, Tailwind CSS 4, Zustand 5, and Zod 4.
- The app uses App Router with static export and trailing-slash output, so the built `out/` directory remains portable to a static host.
- Light and dark themes use CSS custom properties. A minimal inline pre-hydration script reads the persisted preference before the first paint.
- Runtime assets are local. The product does not load remote fonts, images, scripts, stylesheets, telemetry, or analytics.
- Superseded: the original plan had no CI workflow. GitHub Actions now runs the local gate chain on pull requests and pushes to `main`; Vercel remains the owner deployment path.
- Development uses port 3004. Static-export checks and Playwright use port 4004; Playwright browsers are installed and invoked with `PLAYWRIGHT_BROWSERS_PATH=0`.
