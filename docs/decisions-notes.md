# Architecture decisions

- Node 22.23.3 is pinned in `.nvmrc`; npm 10 is the supported package manager.
- Next.js uses the App Router, static export, and trailing-slash output so the
  generated `out/` directory remains portable across static hosts.
- Light and dark themes use CSS custom properties. A small pre-hydration script
  applies the locally persisted preference before first paint.
- Runtime assets are local. The application does not load remote fonts, images,
  scripts, stylesheets, telemetry, or analytics.
- GitHub Actions runs the same version, type, lint, citation, formatting, test,
  build, security-header, and bundle gates exposed by the package scripts.
- Development uses port 3004. Static preview and Playwright use port 4004.
