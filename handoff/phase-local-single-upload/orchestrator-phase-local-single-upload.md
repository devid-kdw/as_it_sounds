# Orchestrator Handoff - Local Single WAV Upload

Date: 2026-06-01

Phase goal: make single WAV upload work locally from admin UI through processing completion, with preview and waveform assets generated before the sample enters `needs_review`.

## Delegated Handoffs

- `handoff/phase-local-single-upload/admin-workflow-agent.md`
- `handoff/phase-local-single-upload/backend-agent.md`
- `handoff/phase-local-single-upload/audio-processing-agent.md`
- `handoff/phase-local-single-upload/frontend-agent.md`
- `handoff/phase-local-single-upload/testing-agent.md`

## Integrated Implementation

- Backend upload session creation now creates one draft sample, one queued `initial_upload` processing job, a private `ais-processing-temp` intake path, and scoped signed upload data.
- Backend finalize routes exist at both `POST /api/admin/upload-sessions/finalize` and `POST /api/admin/upload-sessions/[processingJobId]/finalize`; finalize checks object existence and is idempotent.
- Backend polling route `GET /api/admin/processing-jobs/[jobId]` returns safe job/sample state, attempts, retry eligibility, error fields, and timestamps without returning private paths or signed URLs.
- `/admin/upload` is now a client workflow with WAV selection/dropzone, taxonomy selectors, BPM for loops, declared validation, signed upload progress, finalize state, processing polling, failure messages, duplicate warnings, and review link on success.
- `/admin/processing` now lists recent processing jobs, visible failure details, attempts/timestamps, sample links, and retry controls.
- Audio worker can process queued `initial_upload` jobs locally: claim job, mark sample processing, download private intake WAV, validate/decode/hash/extract metadata, detect duplicates, copy original, generate MP3 preview and audiowaveform peaks JSON, write assets, and mark success as `needs_review` or failure as `failed`.
- Tests cover upload-session auth/validation/creation, finalize idempotency, processing asset rows, `needs_review`/`failed` sample transitions, duplicate warnings, no browser service-role/original path leaks, and failed job visibility.

## Verification

- `pnpm test` passed: 59 passed, 1 existing opt-in DB/RLS integration test skipped.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed outside the sandbox after the initial sandboxed Turbopack port-binding failure.

## Local Run Notes

To exercise the full flow locally, the app still needs real local environment values in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The worker also needs working audio binaries. `ffmpeg` and `ffprobe` were available locally during agent verification, but `audiowaveform` was not on PATH; set `AIS_AUDIOWAVEFORM_PATH` or install/pin the binary before expecting real waveform generation.

Expected local process:

```bash
pnpm dev
pnpm worker:audio -- --poll
```

or process one queued job:

```bash
pnpm worker:audio -- --job-id <processing_job_id>
```

## Residual Risks

- A live browser upload was not completed because the current local server lacked required Supabase env vars; the in-app browser reached the Next runtime overlay for missing `NEXT_PUBLIC_SUPABASE_URL`.
- DB/RLS integration tests remain opt-in and were not run without `AIS_RUN_DB_TESTS=1`.
- Processing result writes are sequential, not transaction/RPC-backed, so partial DB failure handling still relies on failure marking and later cleanup.
- The review edit page remains mostly a shell, so the success path links to the right route but does not yet render preview/waveform review UI there.
