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
