# PDF Compressor Extension

Local-first Chrome extension for PDF compression and splitting, based on specification v3.3.0.

## Project Status

- Stages 1-3 are merged into `main`.
- Stage 4 client-side compression is implemented on feature branches but is not yet merged into `main`.
- Canonical Stage 5 JPEG2000 support is deferred and not implemented.
- Canonical Stage 6 PDF Split is implemented and manually accepted in Chrome under the historical branch/report label "Phase 5"; it is not yet merged into `main`.
- Canonical Stage 7 Freemium and licensing has not started.

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

Not yet implemented:

- JPEG2000 / OpenJPEG
- Free daily limits and rate limiting
- production Pro-license verification and activation
- quality slider persistence
- URL/viewer/context-menu PDF acquisition required by the full specification
- On-Premise / Enterprise features
