# AIS Source References

This implementation repository treats the AIS specification files one level up as canonical. Do not move, rename, duplicate, or replace them from inside this repo.

## Canonical Specification Paths

- `../01_Project_Overview_AIS-v1.md`
- `../02_Database_Schema_AIS_v1.md`
- `../03_Storage_Audio_Processing_Pipeline_AIS_v1.md`
- `../04_Web_Platform_Architecture_AIS_v1.md`
- `../05_Search_Discovery_Logic_AIS_v1.md`
- `../06_Auth_Subscriptions_Stripe_AIS_v1.md`
- `../07_Admin_Upload_Curation_Workflow_AIS_v1.md`
- `../08_CLAP_Plugin_Architecture_AIS_v1.md`
- `../09_UI_Design_System_AIS_v1.md`
- `../10_Local_Development_Producer_Workflow_AIS_v1.md`
- `../AIS UI Design System/README.md`

## Phase 0 Sections Read

- `../01_Project_Overview_AIS-v1.md` section 1, Vision & Philosophy
- `../01_Project_Overview_AIS-v1.md` section 2, What AIS Is Not
- `../01_Project_Overview_AIS-v1.md` section 11, Technology Stack
- `../01_Project_Overview_AIS-v1.md` section 22, Agent Workflow Rules
- `../01_Project_Overview_AIS-v1.md` section 24, Documentation Structure
- `../04_Web_Platform_Architecture_AIS_v1.md` WEB-05, Repository Structure
- `../08_CLAP_Plugin_Architecture_AIS_v1.md` PLUG-06, Repository Structure
- `../10_Local_Development_Producer_Workflow_AIS_v1.md` LOCAL-03, Local MacBook Environment
- `../10_Local_Development_Producer_Workflow_AIS_v1.md` LOCAL-04, Local Folder Structure
- `../10_Local_Development_Producer_Workflow_AIS_v1.md` LOCAL-13, Security & Environment Rules
- `../10_Local_Development_Producer_Workflow_AIS_v1.md` LOCAL-14.1, Phase L0: Local Foundation
- `../AIS UI Design System/README.md`, design asset folder map and usage rules

## Phase 1 Foundation Sections Read

- `../01_Project_Overview_AIS-v1.md` section 25, Phase 0 Foundation
- `../04_Web_Platform_Architecture_AIS_v1.md` WEB-01, Hard Principles
- `../04_Web_Platform_Architecture_AIS_v1.md` WEB-03, Final Architecture Decision
- `../04_Web_Platform_Architecture_AIS_v1.md` WEB-04, Technology Stack
- `../04_Web_Platform_Architecture_AIS_v1.md` WEB-06, App Router Route Map
- `../04_Web_Platform_Architecture_AIS_v1.md` WEB-08, Supabase Client Patterns
- `../04_Web_Platform_Architecture_AIS_v1.md` WEB-09, Environment Variables & Secrets
- `../04_Web_Platform_Architecture_AIS_v1.md` WEB-26, Zustand State Model
- `../04_Web_Platform_Architecture_AIS_v1.md` WEB-29, Styling & Design Token Rules
- `../04_Web_Platform_Architecture_AIS_v1.md` WEB-33, Local Development Workflow
- `../06_Auth_Subscriptions_Stripe_AIS_v1.md` AUTH-21, Environment Variables
- `../09_UI_Design_System_AIS_v1.md` UI-01, Core Visual Direction
- `../09_UI_Design_System_AIS_v1.md` UI-02, Hard UI Principles
- `../09_UI_Design_System_AIS_v1.md` UI-04, Color System
- `../09_UI_Design_System_AIS_v1.md` UI-05, Typography System
- `../09_UI_Design_System_AIS_v1.md` UI-20, Tailwind Token Contract
- `../AIS UI Design System/ais.css`
- `../AIS UI Design System/tailwind.tokens.js`
- `../10_Local_Development_Producer_Workflow_AIS_v1.md` LOCAL-01, Core Principle
- `../10_Local_Development_Producer_Workflow_AIS_v1.md` LOCAL-04.4, Local Path Tokenization

## Frontend/UI Handoff

Frontend and UI agents must read `../AIS UI Design System/README.md` before UI work and must pull tokens, component guidance, visual structure, interaction patterns, and implementation guidance from:

- `../AIS UI Design System/ais.css`
- `../AIS UI Design System/tailwind.tokens.js`
- `../AIS UI Design System/ais-primitives.jsx`
- `../AIS UI Design System/ais-cards.jsx`
- `../AIS UI Design System/ais-screens-public.jsx`
- `../AIS UI Design System/ais-screens-tools.jsx`
- `../AIS UI Design System/ais-app.jsx`

Treat `../AIS UI Design System/` as a read-only handoff source unless the project owner explicitly approves design-system edits.

The design folder contains visual reference mocks, not production React. Do not copy mock fixture behavior into production logic. Use it for visual structure, tokens, interaction patterns, and implementation guidance.

## Phase 0 Boundary

This phase creates the implementation repository boundary only. Do not scaffold the Next.js app, install packages, initialize Supabase, create migrations, or add plugin crates until a later approved phase.

## Agent Handoff Folder

Operational handoff notes live in `handoff/`. Agents must update that folder when they complete meaningful implementation, verification, or debugging work.
