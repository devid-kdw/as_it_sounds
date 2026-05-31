create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.sample_status as enum (
  'draft',
  'processing',
  'needs_review',
  'published',
  'archived',
  'failed'
);

create type public.album_status as enum (
  'draft',
  'published',
  'archived'
);

create type public.license_status as enum (
  'unverified',
  'verified',
  'restricted',
  'blocked',
  'archived'
);

create type public.source_type as enum (
  'original_recording',
  'synthesized',
  'field_recording',
  'processed_original',
  'licensed_source'
);

create type public.asset_kind as enum (
  'original_wav',
  'preview_audio',
  'waveform_peaks',
  'album_artwork'
);

create type public.asset_access_level as enum (
  'public',
  'private',
  'entitlement_required'
);

create type public.processing_job_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'timed_out'
);

create type public.processing_job_type as enum (
  'initial_upload',
  'reprocess_preview',
  'reprocess_waveform',
  'reprocess_metadata'
);

create type public.download_source as enum (
  'web',
  'plugin'
);

create type public.play_source as enum (
  'web',
  'plugin'
);

create type public.search_source as enum (
  'web',
  'plugin'
);

create type public.subscription_status as enum (
  'free_launch_access',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'lifetime_granted'
);

create type public.webhook_processing_status as enum (
  'received',
  'processed',
  'failed',
  'ignored'
);

create type public.profile_role as enum (
  'user',
  'admin'
);

create type public.collection_visibility as enum (
  'private'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
