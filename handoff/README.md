# AIS Agent Handoff

This folder is the operational handoff journal for agents working on the AIS implementation repository.

The canonical product specifications still live one level up in `../*.md`, and the canonical design handoff still lives in `../AIS UI Design System/`. This folder does not replace those sources. It records what agents actually did, what was verified, what remains blocked, and what the next agent should do.

## How Agents Must Use This Folder

Every agent that completes meaningful work must leave a short handoff note here before ending the phase or task.

Each handoff note should include:

- Date
- Agent role
- Scope
- Files or areas changed
- Verification performed
- Known blockers or risks
- Recommended next steps

Keep handoff notes factual. Do not use this folder for speculative product decisions, hidden assumptions, or undocumented feature expansion.

## Folder Layout

- `phase-0-repo-boundary/` records the repository boundary setup.
- `phase-1-foundation-skeleton/` records the local development skeleton setup.
- `phase-2-database-supabase/` records database, Supabase, RLS, and generated type work.
- `phase-auth-local-owner/` records authentication, local owner access, entitlement, and billing-disabled work.
- `next-steps.md` records the recommended next implementation path.

Keep phase-specific handoff notes inside the matching phase folder. Leave this `README.md` and broad planning notes in the root of `handoff/`.

## Standing Rules

- Do not move or rewrite source specifications from this repo.
- Do not edit `../AIS UI Design System/` unless the project owner explicitly approves design-system changes.
- Do not copy mock fixture behavior from the design folder into production logic.
- Do not expose server-only secrets or local absolute paths to client code.
- Do not add major product behavior without a matching specification section.
