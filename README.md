# PDF Compressor Extension

Local-first Chrome extension for PDF compression and splitting, based on specification v3.3.0.

## Project Status

- Stages 1-4 are merged into `main`.
- Canonical Stage 5 JPEG2000 support is deferred and not implemented.
- Canonical Stage 6 PDF Split is implemented, manually accepted in Chrome, and merged into `main` under the historical branch/report label "Phase 5".
- Canonical Stage 7 Freemium and licensing is implemented on `feature/phase7-freemium-licensing`; browser acceptance has passed and the branch is awaiting review and merge.

See [`docs/PHASE_ROADMAP.md`](docs/PHASE_ROADMAP.md) before creating a phase branch or interpreting historical `PHASE_5_*` reports.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

WXT starts a local dev server and builds the extension into `.output/chrome-mv3-dev/`.

## Production Build

```bash
npm run build
```

Production output is written to `.output/chrome-mv3/`.

## Current Capabilities

Implemented on the current cumulative feature branch:

- WXT + React + TypeScript scaffold
- Manifest V3 configuration
- background service worker
- popup UI with Zustand
- localized English and Spanish UI
- local PDF selection and validation
- typed popup/background/offscreen/worker messaging
- offscreen document
- client-side MuPDF compression with conservative image recompression
- PDF splitting by pages, maximum size, and manual ranges
- single ZIP, individual PDF, and separate ZIP output modes
- IndexedDB persistence and restored downloads
- Free daily limits with a shared cooldown and persistent usage display
- offline ES256 Pro-license activation and Pro-only Split recompression
- persistent compression quality and device-memory-aware PDF size limits

Not yet implemented:

- JPEG2000 / OpenJPEG
- URL/viewer/context-menu PDF acquisition required by the full specification
- On-Premise / Enterprise features
