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

The optional Office Engine container installs the Debian 12 `ghostscript`
package and reports its exact runtime version from `/api/v1/health`. Ghostscript
is Copyright Artifex Software, Inc. and contributors and is licensed under
`AGPL-3.0-or-later`. Debian package metadata and corresponding source are
available from https://packages.debian.org/bookworm/ghostscript and
https://sources.debian.org/src/ghostscript/. The complete GNU Affero General
Public License text is included in `LICENSE`.

## Poppler

The optional Office Engine container installs Debian 12 `poppler-utils` to
validate PDF page counts before accepting an output artifact. Poppler is
Copyright the Poppler contributors and is primarily licensed under
`GPL-2.0-or-later`; component-specific notices remain in the Debian package.
Package metadata and corresponding source are available from
https://packages.debian.org/bookworm/poppler-utils and
https://sources.debian.org/src/poppler/.

## Other packages

Other JavaScript packages are installed from `package-lock.json`. Their license
metadata and license files are retained in the installed packages. Before a
redistributable release artifact is published, its generated third-party
license inventory must be reviewed alongside this notice.
