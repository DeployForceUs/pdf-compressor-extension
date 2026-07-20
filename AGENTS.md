# AGENTS.md

# PDF Compressor Extension

This file defines mandatory engineering rules for AI agents working in this repository.

---

# Mission

Build a privacy-first PDF processing platform where AI plans work and deterministic engines execute.

AI is an advisor.

The PDF engine is the executor.

Never replace deterministic processing with AI.

---

# Read before coding

Before making any code changes, always read:

1. AGENTS.md
2. README.md
3. docs/PHASE_ROADMAP.md
4. docs/OPENAI_BUILD_WEEK_EXECUTION_PLAN.md
5. docs/BUILD_WEEK_GPT56_OFFICE_ENGINE_ADDENDUM.md
6. docs/PHASE_11_BUILD_WEEK_EXECUTION_REPORT.md

Never modify code before understanding the current phase.

---

# Core principles

- Privacy first.
- Local first.
- Deterministic processing.
- Small incremental changes.
- Evidence before assumptions.

---

# Architecture

Popup

↓

Background

↓

Offscreen

↓

Office Engine (optional)

↓

Deterministic PDF Engine

↓

Result

GPT Planner produces plans only.

Planner never edits PDFs.

Planner never executes PDF processing.

Execution belongs to deterministic engines.

---

# Engineering rules

- One logical change per commit.
- Keep commits small.
- Preserve backward compatibility.
- Never mix infrastructure fixes with Planner changes.
- Never mix unrelated features in one commit.

---

# Debugging workflow

1. Create checkpoint.
2. Make one change.
3. Build.
4. Test.
5. Review logs.
6. Commit.
7. Create next checkpoint.

Never stack speculative fixes.

---

# Diagnostics

If something is unclear:

Do not guess.

Add diagnostics.

Collect evidence.

Then fix.

Evidence always wins over assumptions.

---

# Logging

Prefer structured logging.

Logs should identify:

- component
- stage
- success/failure
- elapsed time

Avoid random console.log spam.

---

# Build identification

Every diagnostic build must expose a unique Build ID visible in the UI.

---

# Office Engine

Stabilize lifecycle first.

Add features second.

Infrastructure comes before Planner.

---

# Planner

Planner must:

- produce structured JSON
- never execute processing
- never modify PDF directly

Planner advises.

Deterministic engines execute.

---

# Living document

This document evolves with the project.

Whenever a new engineering rule becomes recurring,
add it here so every future AI agent follows it automatically.
