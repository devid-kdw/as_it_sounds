# AIS Platform

This folder is the implementation repository for **As It Sounds (AIS)**.

The canonical AIS source specifications live one level up:

```text
../*.md
```

The canonical UI design assets live one level up:

```text
../AIS UI Design System/
```

Frontend and UI agents must read the design handoff before starting UI work:

```text
../AIS UI Design System/README.md
```

The design folder is a read-only handoff source unless the project owner explicitly approves design-system edits.

Agent implementation notes live in:

```text
handoff/
```

All agents should record completed work, verification, blockers, and next steps there before ending a phase or task.

## Local Development

This repo is prepared for the AIS local foundation workflow. Source specifications and design assets remain one level up and are treated as the source of truth.

Start local services from this folder:

```bash
supabase start
pnpm dev
pnpm worker:audio
```

The first two commands are active in this foundation skeleton. `pnpm worker:audio` is a placeholder for the future audio worker phase.

Useful local commands:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:start
pnpm db:reset
```

Environment templates:

- `.env.example` documents the variable contract.
- `.env.local.example` is the local owner mode starting point.
- `.env.local` must stay uncommitted.
