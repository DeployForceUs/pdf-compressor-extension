# AGENTS.md

## Git Workflow

- `main` must always remain stable and releasable.
- Each implementation phase must use its own branch.
- Branch naming:
  - `feature/phase1-infrastructure`
  - `feature/phase2-localization`
  - `feature/phase3-pdf-input`
  - continue the same pattern for later phases.
- One phase = one branch = one Pull Request.
- Do not start the next phase before the current phase PR is merged into `main`.
- Never commit implementation work directly to `main`.

## Starting a Phase

1. Checkout `main`.
2. Pull the latest changes.
3. Create a new phase branch.
4. Confirm the current branch before modifying files.

## Finishing a Phase

1. Run all required validation.
2. Update the phase execution report.
3. Commit all changes.
4. Push the phase branch.
5. Open a Pull Request into `main`.
6. Do not begin the next phase until the PR is reviewed and merged.

## Scope Control

- Work only within the scope of the current phase.
- Do not add future-phase features.
- Do not change architecture outside the current task without explicit approval.
- Keep terminal summaries short.
- Store complete implementation and validation details in the phase report.
