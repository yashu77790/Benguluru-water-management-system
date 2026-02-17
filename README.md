# GreenGrid India SPA Prototype

## Overview
GreenGrid India is a modular single-page application prototype for community-driven cleanup reporting. It uses a browser-based mock backend (localStorage) with a structured schema, theme-aware UI, Leaflet maps, and Chart.js analytics.

## Run Locally
```bash
npm install
npm run dev
```

## Build & Preview
```bash
npm run build
npm run preview
```

## Default Admin Login
- **Email:** admin@greengrid.com
- **Password:** admin123

## Dev Helpers (Hidden)
Press **Ctrl + Shift + H** to reveal Developer Helpers.

Available tools:
- **Seed fake users & spots**
- **Simulate time** with `simulateNow(offsetDays)`
- **Adjust AI approval probability** (default 0.7)
- **Reset all app data**

These helpers are useful for QA and showcasing the AI approval workflow.

## Security Note (Client-only Limitations)
This prototype uses client-side hashing and localStorage for persistence. This is **not secure** for production. A real implementation should:
- Hash passwords server-side using strong salted algorithms.
- Issue secure auth tokens (HTTP-only cookies or short-lived JWTs).
- Enforce rate limits and validation server-side.
- Store images in secure object storage with access controls and malware scanning.

## Feature Highlights
- Theme-aware Leaflet tiles and SVG markers.
- Premium membership flow with 2x points.
- Admin dashboard with charts and user controls.
- Leaderboard, streaks, and exports.
- Map decay logic: spots older than 7 days revert to unverified.

## Notes
- Only base64 thumbnails (size-limited) are persisted for image uploads.
- AI approval probability can be tuned from the Dev Helpers panel.
