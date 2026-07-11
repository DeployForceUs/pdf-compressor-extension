# PDF Compressor Extension

Phase 1 infrastructure based on specification v3.3.0.

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

## Phase 1 Scope

Implemented in this phase:

- WXT + React + TypeScript scaffold
- Manifest V3 configuration
- background service worker
- popup UI with Zustand
- typed popup/background messaging
- offscreen document
- IndexedDB smoke storage through `idb`
- privacy-safe logging
- optional Sentry bootstrap

Not implemented in Phase 1:

- PDF compression
- PDF splitting
- MuPDF integration
- `pdf-lib` processing
- licensing, limits, paywall, payments
- On-Premise / Enterprise features
