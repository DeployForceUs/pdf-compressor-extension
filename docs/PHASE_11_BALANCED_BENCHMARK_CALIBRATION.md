# Stage 11 Balanced Benchmark Calibration

Status: **calibration complete; production policy not approved**

## Reproducible harness

- `npm run engine:fixture -- /tmp/pdf-office-synthetic-24p.pdf`
- `npm run engine:benchmark -- /tmp/pdf-office-synthetic-24p.pdf /tmp/results`

The generator creates a 24-page, scanned-style, public synthetic PDF with no
customer/document content. The benchmark invokes Ghostscript through
`execFile`, never shell interpolation, and verifies that every output opens and
preserves page count.

## Local calibration result — 2026-07-17

- Ghostscript: `10.02.1` (`10.02.1~dfsg1-0ubuntu7.8`)
- Input: 24 pages, 7,605,505 bytes

| Candidate | DPI | Model quality candidate | GS QFactor | Duration | Output bytes | Output/input | Opens/pages |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| balanced-144-q65 | 144 | 65 | 0.40 | 1,119 ms | 2,047,627 | 0.2692 | yes/24 |
| balanced-180-q72 | 180 | 72 | 0.30 | 1,352 ms | 3,970,313 | 0.5220 | yes/24 |
| balanced-180-q78 | 180 | 78 | 0.22 | 1,367 ms | 5,225,315 | 0.6870 | yes/24 |
| balanced-220-q85 | 220 | 85 | 0.15 | 728 ms | 9,732,788 | 1.2797 | yes/24 |

First-page 144-DPI raster PSNR against the source was 32.74, 37.32, 37.37,
and 58.37 dB respectively. This is a diagnostic on one synthetic page, not a
readability guarantee or an AI quality claim.

## Decision

No numeric bounds are approved from this calibration alone. It proves that the
harness distinguishes candidate settings and that the highest candidate can
increase file size. Final approval still requires the Canon 220-page fixture,
a larger public scanned PDF, an image-heavy public PDF, and a mixed
text/vector/image PDF, plus visual inspection and recorded hardware.

The processing endpoint therefore remains blocked.

## Canon 220-page fixture — 2026-07-17

The canonical `Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01.pdf` fixture is an
owner-permission-encrypted, print-allowed, 220-page text/vector manual. The
harness reads only its structure with encryption ignored; Ghostscript remains
responsible for accepting or rejecting processing.

| Candidate | Output bytes | Output/input | Opens/pages |
| --- | ---: | ---: | --- |
| balanced-144-q65 | 6,520,108 | 1.0190 | yes/220 |
| balanced-180-q72 | 6,843,833 | 1.0696 | yes/220 |
| balanced-180-q78 | 7,793,894 | 1.2181 | yes/220 |
| balanced-220-q85 | 8,253,180 | 1.2899 | yes/220 |

Every candidate increased the 6,398,446-byte source. Therefore this fixture
does not justify an Office Balanced preset. It establishes a mandatory output
regression rule: an Engine result that is not smaller must not replace the
original valid file, and the planner should prefer Local/no-op behavior for a
profile of this kind. Scanned and image-heavy fixtures are still required to
approve Balanced parameters.

## Public fixture matrix — 2026-07-18

The remaining matrix used public downloads only in temporary storage; the
source PDFs and generated outputs are not committed to the repository.

| Class | Public source | SHA-256 | Pages | Input bytes |
| --- | --- | --- | ---: | ---: |
| scanned book | [Internet Archive scan](https://archive.org/details/blackbeauty00sewell) ([public-domain record](https://commons.wikimedia.org/wiki/File:Black_Beauty_(IA_blackbeauty00sewell).pdf)) | `4ff60801b4e2452c23746b1df77cf0a270a0b236b7e2458f3a4cf645f1888287` | 254 | 7,913,286 |
| image/map poster | [USGS What Do Maps Show?](https://www.usgs.gov/media/files/what-do-maps-show-poster) (public domain) | `fbb8b0944ee6a3755a2ad092f5e27c9059acc7a66a941a4e89de06ab5d1dd069` | 1 | 366,693 |
| mixed text/vector/image | [NASA ASAP 2024 Annual Report](https://www.nasa.gov/asap-reports/) | `88cdb6c9dae2b6afb708bf3b1aa7464459070b82d2c93a57a6de56c8d695f191` | 56 | 5,828,127 |

The benchmark ran with Ghostscript `10.02.1` and the same fixed candidate
matrix used for the synthetic and Canon fixtures. Every output opened and
preserved page count.

### Scanned book

| Candidate | Duration | Output bytes | Output/input |
| --- | ---: | ---: | ---: |
| balanced-144-q65 | 34,540 ms | 21,148,882 | 2.6726 |
| balanced-180-q72 | 34,232 ms | 28,156,846 | 3.5582 |
| balanced-180-q78 | 35,780 ms | 31,013,943 | 3.9192 |
| balanced-220-q85 | 35,787 ms | 43,960,192 | 5.5552 |

This scan was already efficiently encoded. All candidates are rejected by the
strictly-smaller output policy.

### USGS image/map poster

| Candidate | Duration | Output bytes | Output/input |
| --- | ---: | ---: | ---: |
| balanced-144-q65 | 156 ms | 411,642 | 1.1226 |
| balanced-180-q72 | 169 ms | 458,385 | 1.2501 |
| balanced-180-q78 | 147 ms | 513,117 | 1.3993 |
| balanced-220-q85 | 148 ms | 589,853 | 1.6086 |

This poster was also already optimized. All candidates are rejected by the
strictly-smaller output policy.

### NASA mixed report

| Candidate | Duration | Output bytes | Output/input |
| --- | ---: | ---: | ---: |
| balanced-144-q65 | 2,319 ms | 2,277,782 | 0.3908 |
| balanced-180-q72 | 2,116 ms | 3,783,992 | 0.6493 |
| balanced-180-q78 | 2,119 ms | 3,932,584 | 0.6748 |
| balanced-220-q85 | 2,120 ms | 4,150,518 | 0.7122 |

The lowest candidate saved the most space. A visual comparison rendered source
and `balanced-144-q65` pages 1, 20, and 45 at 120 DPI. No clipping, overlap,
missing glyphs, or unreadable text was observed; photographs showed mild
softening consistent with the lower-resolution candidate. This is a sampled
review, not a universal readability guarantee.

## Approval recommendation

The matrix does **not** support a numeric range. It supports at most one bounded
Balanced execution tuple: `quality=65`, `dpi=144`, with the existing
`targetPartSizeMb=20` delivery target and at most one retry. Execution must also
require a valid, page-count-preserving, strictly smaller result; otherwise the
original remains authoritative.

This tuple remains a recommendation until explicitly approved by the product
owner. Higher candidates remain preview-only because they consistently save
less space and can enlarge already-optimized documents.
