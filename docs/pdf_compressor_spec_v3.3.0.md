# PDF Compressor Browser Extension — Specification v3.3.0-MVP

**Date:** 2026-07-11  
**Target:** Chromium-based browsers  
**Manifest:** V3

## Product

A browser extension for local PDF compression and splitting. All processing must happen on the user's device; files must not leave the browser.

## Phase 1 scope

Implement only the technical foundation:

- initialize a WXT + React + TypeScript project;
- configure Manifest V3;
- create a Background Service Worker;
- create a minimal React Popup UI with Zustand;
- implement typed Popup ↔ Background messaging;
- add IndexedDB binary storage through `idb`;
- create and validate an Offscreen Document;
- configure MV3-compatible CSP;
- add privacy-safe Logging and optional Sentry initialization.

## Out of scope for Phase 1

Do not implement:

- PDF compression;
- PDF splitting;
- MuPDF;
- `pdf-lib` processing;
- JPEG2000;
- licensing;
- daily limits;
- device fingerprinting;
- rate limiting;
- paywall;
- payments;
- On-Premise or Enterprise functionality.

## Architecture target

```text
Popup UI
   ↓
Typed Messaging
   ↓
Background Service Worker
   ↓
Offscreen Document
   ↓
IndexedDB
   ↓
Logging / Sentry
```

## Required Phase 1 permissions

Use least privilege. Start with only:

```text
storage
offscreen
```

Do not add host permissions or unrelated permissions unless technically required and documented.

## Definition of Done

Phase 1 is complete when:

- `npm install` succeeds;
- `npm run dev` starts without fatal errors;
- `npm run build` succeeds;
- extension loads unpacked in Chrome;
- Popup opens and renders;
- Popup ↔ Background health check works;
- Offscreen Document opens, responds, closes, and reopens;
- IndexedDB saves, reads, byte-compares, and deletes a deterministic test `ArrayBuffer`;
- critical test errors reach local Logging and optional Sentry;
- no remote scripts are used;
- no unnecessary permissions are present;
- Phase 1 smoke-test and implementation reports are produced.

## Privacy rules

Never log or transmit:

- PDF bytes;
- file contents;
- full file paths;
- tokens or license keys;
- Authorization headers;
- user-provided sensitive text.

Sentry must be optional and disabled by default in local development.

## Required reports

Create:

```text
reports/phase1_implementation_report.md
reports/phase1_smoke_test_report.md
```

## Source of truth

This file defines the frozen implementation scope for Phase 1 of specification v3.3.0-MVP.
