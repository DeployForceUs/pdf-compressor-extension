# Stage 5 JPEG2000 / OpenJPEG Preflight

## Status

Preflight is complete. Runtime implementation has not started.

The canonical Stage 5 product requirement is JPEG2000 (`/JPXDecode`) support. The current specification prescribes a separate `openjpeg.js` WASM loader, but the repository already ships MuPDF WASM and the installed MuPDF API can decode JPEG2000 image XObjects through the existing image-recompression boundary.

The recommended implementation is therefore **GO with the existing MuPDF decoder path**, subject to explicit approval that the separate `openjpeg.js` implementation detail is superseded by the current architecture.

## Canonical Specification Scope

Specification v3.3.0 requires:

- JPEG2000 support in canonical Stage 5;
- `openjpeg.js` WASM decoding;
- three load retries with exponential backoff;
- Cache API persistence for the separate decoder;
- real exotic-PDF validation;
- JBIG2 remaining deferred because of licensing constraints.

The product behavior and the prescribed decoder implementation are separate concerns. This preflight does not remove JPEG2000 from MVP scope and does not promote JBIG2 into scope.

## Existing Runtime Boundary

The existing compression pipeline already:

1. discovers image XObjects and records stable indirect references;
2. classifies masks, colorspaces, filters, shared references, dimensions, and stream sizes;
3. resolves the live XObject by reference;
4. calls `PDFDocument.loadImage(targetObject)`;
5. calls `Image.toPixmap()`;
6. calls `Pixmap.asJPEG(quality)`;
7. rewrites only when the JPEG candidate is smaller;
8. reopens and validates the resulting PDF;
9. falls back to the structural PDF when validation or final-size checks fail.

`JPXDecode` is currently stopped only by the classifier, which returns `UNSUPPORTED / JPX_DECODE` before the existing decode boundary is reached.

## Empirical Browser-Runtime-Compatible Proof

A temporary deterministic fixture was generated from a 96 × 64 RGB gradient and encoded as JPEG2000. A minimal PDF was then constructed with a real image XObject using `/Filter /JPXDecode`.

The installed `mupdf` package successfully executed the same API boundary used by production recompression:

```text
PDFDocument.loadImage(imageReference)
→ Image.toPixmap()
→ Pixmap.asJPEG(60)
```

Observed result:

```json
{
  "pages": 1,
  "filter": "/JPXDecode",
  "object": {
    "reference": "5 0 R",
    "indirect": true,
    "stream": true,
    "resolvedStream": false
  },
  "decoded": {
    "width": 96,
    "height": 64,
    "components": 3,
    "jpegBytes": 813,
    "jpegHeader": [255, 216, 255]
  }
}
```

This proves the first critical boundary: MuPDF can load and rasterize a genuine JPX image from a PDF object and produce valid JPEG bytes. It does not yet prove end-to-end classification, rewrite, persistence, or Chrome acceptance; those belong to implementation slices.

## Dependency and Licensing Review

The OpenJPEG project is BSD-2-Clause licensed. However, the specification does not identify an authoritative maintained JavaScript/WASM package or a pinned upstream build.

Registry candidates inspected during preflight have material risks:

| Candidate | Observed state | Preflight assessment |
| --- | --- | --- |
| `@abasb75/jpeg2000-decoder` | Approximately 2.6 MB unpacked; registry metadata did not expose a license field | Do not adopt without provenance and license resolution |
| `@cornerstonejs/codec-openjpeg` | MIT; approximately 2.0 MB unpacked; registry repository metadata points to `localhost` | Do not adopt without provenance resolution |
| `OpenJPEG.js` | MIT; old package line last published in 2016 | Too stale to select without a dedicated security review |
| `jpeg2000` | Apache-2.0 pure JavaScript decoder, not OpenJPEG WASM | Does not match the prescribed implementation |

Adding any of these now would duplicate decode capability already present in the shipped MuPDF WASM and would add supply-chain, bundle-size, caching, and maintenance surface.

The repository already depends on MuPDF. Its licensing obligations must continue to be handled as a project-wide distribution concern; Stage 5 does not create that dependency.

## Recommended Architecture

Use the existing MuPDF boundary for conservative JPX recompression:

- recognize a single primary `JPXDecode` filter as eligible for JPX evaluation;
- preserve all current exclusions for image masks, alpha dependencies, shared references, malformed dictionaries, and unresolved/unsupported colorspaces;
- begin with the already supported `DeviceRGB` and `DeviceGray` colorspaces;
- decode through `PDFDocument.loadImage(ref).toPixmap()`;
- encode through `Pixmap.asJPEG(selectedQuality)`;
- rewrite only when the candidate stream is smaller;
- preserve cancellation, validation, structural fallback, and diagnostics;
- keep `JBIG2Decode` unsupported.

The separate `openjpeg.js` loader, retry loop, and Cache API layer would not exist in this architecture because there is no second runtime module to fetch or initialize. The existing locally packaged MuPDF asset continues to load through the established Worker boundary.

## Required Implementation Slices

1. **Permanent fixture and decode contract**
   - Add a small deterministic PDF containing a real `/JPXDecode` XObject.
   - Prove discovery, stable reference resolution, MuPDF load, rasterization, and JPEG encoding.

2. **Conservative classifier support**
   - Promote eligible JPX candidates without broadening mask, shared-reference, or colorspace support.
   - Preserve explicit diagnostics for excluded JPX candidates.

3. **Recompression integration**
   - Reuse the existing live-object rewrite loop.
   - Preserve the smaller-candidate rule, cancellation, validation, and structural fallback.

4. **Resource safety**
   - Add an explicit decoded-raster safety policy before enabling large JPX images.
   - The specification does not define a decoded-pixel or decoded-byte ceiling, so no numeric limit may be invented during implementation. This requires an approved engineering constraint or a specification update.

5. **Regression and browser acceptance**
   - Run TypeScript, production build, Worker-boundary guard, existing compression/Split tests, and the new Stage 5 fixture tests.
   - Manually validate a real JPX PDF in Chrome for Free and Pro compression paths, cancellation, persistence, download, and readable output.

## Exact Decision Required Before Runtime Changes

Approve or reject the following statement:

> Stage 5 will satisfy the JPEG2000 product requirement through the already shipped MuPDF WASM decoder. The separate `openjpeg.js` loader, retry loop, and Cache API implementation in specification v3.3.0 are superseded by the current architecture.

If rejected, implementation must pause until an authoritative, pinned OpenJPEG WASM artifact, its license/provenance, its initialization API, and its integrity/distribution policy are supplied.

## Sources

- Canonical product specification: [`../docs/pdf_compressor_spec_v3.3.0.md`](../docs/pdf_compressor_spec_v3.3.0.md)
- Current image classifier: [`../src/lib/pdf/image-xobject-classifier.ts`](../src/lib/pdf/image-xobject-classifier.ts)
- Current recompression runtime: [`../src/lib/pdf/image-xobject-recompression.ts`](../src/lib/pdf/image-xobject-recompression.ts)
- OpenJPEG project: <https://www.openjpeg.org/>
- OpenJPEG source and BSD-2-Clause license: <https://github.com/uclouvain/openjpeg>
- MuPDF JavaScript Pixmap API: <https://mupdf.readthedocs.io/en/1.27.0/reference/javascript/types/Pixmap.html>
- MuPDF npm package: <https://www.npmjs.com/package/mupdf>

## SPECIFICATION COMPLIANCE

- Keeping canonical Stage 5 as JPEG2000 support: **Fully matches specification**.
- Supporting real `/JPXDecode` image XObjects and keeping JBIG2 deferred: **Fully matches specification**.
- Reusing MuPDF WASM instead of adding a separate `openjpeg.js` WASM module: **Requires future specification update**.
- Omitting the separate OpenJPEG retry and Cache API layers when no separate module exists: **Requires future specification update**.
- Restricting the first implementation to existing safe masks, references, and colorspaces: **Partially matches specification** until real exotic-PDF acceptance proves the supported coverage.
- Adding a decoded-raster safety policy: **Requires future specification update** because the current specification defines no numeric ceiling.
