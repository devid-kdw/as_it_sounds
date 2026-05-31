create table public.downloads (
  id                             uuid primary key default gen_random_uuid(),
  user_id                        uuid references public.profiles(id) on delete set null,
  sample_id                      uuid not null references public.samples(id) on delete cascade,

  source                         public.download_source not null,
  subscription_state_at_download public.subscription_status,
  file_version                   text,
  ip                             inet,
  user_agent                     text,

  created_at                     timestamptz not null default now()
);

create table public.sample_play_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete set null,
  sample_id      uuid not null references public.samples(id) on delete cascade,
  source         public.play_source not null,
  seconds_played numeric(10,3),
  completed      boolean,
  created_at     timestamptz not null default now(),

  constraint sample_play_events_seconds_nonnegative
    check (seconds_played is null or seconds_played >= 0)
);

create table public.search_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles(id) on delete set null,
  source            public.search_source not null default 'web',
  query             text,
  filters           jsonb not null default '{}'::jsonb,
  result_count      integer not null default 0,
  clicked_sample_id uuid references public.samples(id) on delete set null,
  created_at        timestamptz not null default now(),

  constraint search_logs_result_count_nonnegative
    check (result_count >= 0)
);

create table public.wander_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  sample_id  uuid references public.samples(id) on delete set null,
  mood_slug  text references public.moods(slug) on delete set null,
  action     text not null,
  created_at timestamptz not null default now(),

  constraint wander_events_action_valid
    check (action in ('started', 'shown', 'skipped', 'played', 'favorited', 'downloaded'))
);

create table public.similar_sample_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles(id) on delete set null,
  source_sample_id  uuid not null references public.samples(id) on delete cascade,
  clicked_sample_id uuid not null references public.samples(id) on delete cascade,
  created_at        timestamptz not null default now(),

  constraint similar_sample_not_self
    check (source_sample_id <> clicked_sample_id)
);

create table public.sample_search_documents (
  sample_id          uuid primary key references public.samples(id) on delete cascade,

  poetic_name_text   text not null default '',
  display_title_text text not null default '',
  description_text   text not null default '',
  category_text      text not null default '',
  sample_type_text   text not null default '',
  mood_text          text not null default '',
  hidden_tag_text    text not null default '',
  album_text         text not null default '',

  combined_fts       tsvector,

  search_vector      text generated always as (
    coalesce(poetic_name_text, '') || ' ' ||
    coalesce(display_title_text, '') || ' ' ||
    coalesce(mood_text, '') || ' ' ||
    coalesce(hidden_tag_text, '') || ' ' ||
    coalesce(category_text, '') || ' ' ||
    coalesce(sample_type_text, '')
  ) stored,

  updated_at         timestamptz not null default now()
);

create table public.processing_jobs (
  id                   uuid primary key default gen_random_uuid(),
  sample_id            uuid references public.samples(id) on delete cascade,

  job_type             public.processing_job_type not null,
  status               public.processing_job_status not null default 'queued',

  input_bucket         text,
  input_path           text,
  output_preview_path  text,
  output_waveform_path text,

  attempts             integer not null default 0,
  max_attempts         integer not null default 3,

  last_error_code      text,
  last_error_message   text,
  metadata             jsonb not null default '{}'::jsonb,

  started_at           timestamptz,
  finished_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint processing_jobs_attempts_nonnegative
    check (attempts >= 0 and max_attempts > 0),

  constraint processing_jobs_finished_consistency
    check (
      status not in ('succeeded', 'failed', 'canceled', 'timed_out')
      or finished_at is not null
    )
);

create table public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  created_at    timestamptz not null default now()
);
