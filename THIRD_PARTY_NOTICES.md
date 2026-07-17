# Third-Party Notices

This repository is distributed under `AGPL-3.0-or-later`; see `LICENSE`.
Third-party components remain governed by their respective licenses.

## MuPDF.js

- Package: `mupdf`
- Version used by the contest build: `1.28.0`
- Copyright: Artifex Software, Inc. and MuPDF contributors
- License: `AGPL-3.0-or-later`
- Package metadata and source repository: https://www.npmjs.com/package/mupdf/v/1.28.0 and https://cgit.ghostscript.com/mupdf.git/
- Upstream licensing information: https://artifex.com/licensing

The production build copies MuPDF JavaScript/WASM runtime files from the
installed package into the Extension bundle. The complete GNU Affero General
Public License text is included in `LICENSE`.

## Ghostscript

Ghostscript is not yet included in this repository or its current Extension
build. If the Office Engine adds Ghostscript, the exact version, copyright,
license, source location, build instructions, and corresponding-source offer
must be added here before publishing a Docker image or hosted service.

## Other packages

Other JavaScript packages are installed from `package-lock.json`. Their license
metadata and license files are retained in the installed packages. Before a
redistributable release artifact is published, its generated third-party
license inventory must be reviewed alongside this notice.
