# Phase 12.1 — Separate AI Lab Build

## Goal

Create a visually and operationally distinct experimental build without changing Smart Planner routing, PDF processing, Office Engine behavior, or the accepted Phase 11 runtime.

## Build commands

### Stable-compatible build from this branch

```bash
npm run build
```

Output:

```text
.output/chrome-mv3
```

Manifest identity remains:

```text
PDF Compressor
```

### AI Lab build

```bash
npm run build:ai
```

Output:

```text
.output/chrome-mv3-ai-lab
```

Manifest identity becomes:

```text
PDF Compressor AI Lab
```

The custom WXT mode is `ai-lab`. WXT appends the custom mode suffix to the output directory, so the AI Lab build does not overwrite the normal production output.

## Chrome loading procedure

Open:

```text
chrome://extensions
```

Enable `Developer mode`, then use `Load unpacked` for each desired build.

Stable-compatible build path:

```text
~/pdf-compressor-extension/.output/chrome-mv3
```

AI Lab build path:

```text
~/pdf-compressor-extension/.output/chrome-mv3-ai-lab
```

Because these are loaded from separate directories, Chrome treats them as separate unpacked extension installations. Their `chrome.storage` data remains isolated by extension installation identity.

## Safety boundary

Phase 12.1 changes only build identity and output separation.

It does not change:

- PDF profiling;
- Smart Planner requests or routing;
- Local Engine behavior;
- Office Engine behavior;
- entitlement;
- processing presets;
- execution messages;
- storage formats already used by the accepted runtime.

Dedicated Phase 12 orchestration storage keys will be introduced only when Phase 12.2 adds interview state. No new orchestration state exists yet.

## Acceptance checks

Run:

```bash
npm run check
npm run build
npm run build:ai
```

Confirm:

1. TypeScript check passes.
2. `.output/chrome-mv3/manifest.json` contains `PDF Compressor` through the existing locale identity.
3. `.output/chrome-mv3-ai-lab/manifest.json` contains `PDF Compressor AI Lab`.
4. Both directories exist simultaneously.
5. Both builds can be loaded in Chrome.
6. Existing PDF analysis and processing behavior is unchanged in the AI Lab build.

## Recovery

The accepted Phase 11 branch remains untouched:

```bash
git switch feature/phase11-content-blind-profiler-runtime
```

Return to the AI Lab branch:

```bash
git switch feature/phase12-ai-orchestrator
```
