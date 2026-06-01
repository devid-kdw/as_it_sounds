import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function migration(file) {
  return readFile(path.join(root, "supabase/migrations", file), "utf8");
}

function extractPolicy(source, policyName) {
  const escaped = policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`create policy "${escaped}"[\\s\\S]+?;`));
  assert.ok(match, `Missing policy "${policyName}"`);
  return match[0];
}

test("Phase 6 search documents refresh when samples are published or metadata changes", async () => {
  const triggers = await migration("0009_triggers_and_functions.sql");

  assert.match(
    triggers,
    /create trigger refresh_search_on_samples\s+after insert or update on public\.samples\s+for each row execute function public\.refresh_sample_search_document_trigger\(\);/i,
    "samples trigger must fire on every insert/update, including publish status changes and metadata edits",
  );
  assert.match(
    triggers,
    /if tg_table_name = 'samples' then\s+perform public\.refresh_sample_search_document\(new\.id\);/i,
    "sample updates must refresh the changed sample search document",
  );
  assert.match(
    triggers,
    /on conflict \(sample_id\) do update set[\s\S]+poetic_name_text\s+= excluded\.poetic_name_text[\s\S]+display_title_text = excluded\.display_title_text[\s\S]+description_text\s+= excluded\.description_text/i,
    "search document refresh must upsert edited identity and description fields",
  );
});

test("Phase 6 admin audit log RLS is admin-only for reads", async () => {
  const tables = await migration("0006_events_analytics_search_processing_audit_tables.sql");
  const policies = await migration("0008_rls_helpers_and_policies.sql");
  const auditPolicy = extractPolicy(policies, "admin can read audit log");

  assert.match(tables, /create table public\.admin_audit_log/i);
  assert.match(policies, /alter table public\.admin_audit_log enable row level security;/i);
  assert.match(auditPolicy, /on public\.admin_audit_log for select using \(public\.is_admin\(\)\)/i);
  assert.doesNotMatch(
    policies,
    /on public\.admin_audit_log for select using \((true|auth\.uid\(\) is not null)\)/i,
    "audit rows must not be readable by anonymous or normal authenticated users",
  );
});

test("Phase 6 public RLS exposes samples only after they are published", async () => {
  const policies = await migration("0008_rls_helpers_and_policies.sql");
  const samplePolicy = extractPolicy(policies, "public can read published samples");
  const assetPolicy = extractPolicy(policies, "public can read published preview and waveform assets");
  const moodPolicy = extractPolicy(policies, "public can read moods for published samples");

  assert.match(policies, /alter table public\.samples enable row level security;/i);
  assert.match(samplePolicy, /on public\.samples for select using \(status = 'published'\)/i);
  assert.match(assetPolicy, /kind in \('preview_audio', 'waveform_peaks'\)/i);
  assert.match(assetPolicy, /s\.status = 'published'/i);
  assert.match(moodPolicy, /s\.status = 'published'/i);
});
