create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text unique,
  display_name text,
  role         public.profile_role not null default 'user',
  avatar_url   text,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.hidden_tags
  add constraint hidden_tags_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

create table public.albums (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  description      text,
  status           public.album_status not null default 'draft',
  cover_image_path text,
  created_by       uuid references public.profiles(id) on delete set null,
  published_at     timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint albums_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),

  constraint albums_publish_consistency
    check (
      (status = 'published' and published_at is not null)
      or status <> 'published'
    )
);

create table public.samples (
  id uuid primary key default gen_random_uuid(),

  poetic_name             text not null unique,
  display_title           text not null,
  display_title_is_custom boolean not null default false,
  short_description       text,

  category_slug    text not null references public.categories(slug),
  sample_type_slug text not null references public.sample_types(slug),

  bpm                   numeric(6,2),
  musical_key           text,
  is_melodic            boolean not null default false,
  unknown_key_confirmed boolean not null default false,
  duration_seconds      numeric(10,3),
  loopable              boolean not null default false,

  file_hash_sha256 text,
  file_size_bytes  bigint,
  sample_rate      integer,
  bit_depth        integer,
  channels         integer,

  status         public.sample_status not null default 'draft',
  license_status public.license_status not null default 'unverified',
  source_type    public.source_type not null default 'original_recording',

  rights_owner           text,
  commercial_use_allowed boolean not null default true,
  redistribution_allowed boolean not null default false,
  attribution_required   boolean not null default false,
  license_notes          text,
  license_confirmed_at   timestamptz,
  license_confirmed_by   uuid references public.profiles(id) on delete set null,

  featured    boolean not null default false,
  uploaded_by uuid references public.profiles(id) on delete set null,

  published_at timestamptz,
  archived_at  timestamptz,
  failed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint samples_poetic_name_format
    check (poetic_name ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),

  constraint samples_bpm_positive
    check (bpm is null or (bpm > 0 and bpm <= 400)),

  constraint samples_duration_positive
    check (duration_seconds is null or duration_seconds > 0),

  constraint samples_file_size_positive
    check (file_size_bytes is null or file_size_bytes > 0),

  constraint samples_sample_rate_valid
    check (sample_rate is null or sample_rate in (44100, 48000, 88200, 96000, 176400, 192000)),

  constraint samples_bit_depth_valid
    check (bit_depth is null or bit_depth in (16, 24, 32)),

  constraint samples_channels_valid
    check (channels is null or channels in (1, 2)),

  constraint samples_loop_requires_bpm
    check (sample_type_slug <> 'loop' or bpm is not null),

  constraint samples_melodic_key_rule
    check (
      is_melodic = false
      or musical_key is not null
      or unknown_key_confirmed = true
    ),

  constraint samples_redistribution_never_allowed
    check (redistribution_allowed = false),

  constraint samples_published_requirements
    check (
      status <> 'published'
      or (
        published_at is not null
        and license_status = 'verified'
        and license_confirmed_at is not null
        and commercial_use_allowed = true
        and redistribution_allowed = false
      )
    ),

  constraint samples_archived_timestamp
    check (status <> 'archived' or archived_at is not null)
);

create table public.sample_assets (
  id              uuid primary key default gen_random_uuid(),
  sample_id       uuid not null references public.samples(id) on delete cascade,
  kind            public.asset_kind not null,
  bucket          text not null,
  object_path     text not null,
  mime_type       text,
  file_size_bytes bigint,
  checksum_sha256 text,
  access_level    public.asset_access_level not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (sample_id, kind),

  constraint sample_assets_file_size_positive
    check (file_size_bytes is null or file_size_bytes > 0),

  constraint sample_assets_original_private
    check (
      kind <> 'original_wav'
      or access_level in ('private', 'entitlement_required')
    ),

  constraint sample_assets_waveform_public
    check (
      kind <> 'waveform_peaks'
      or access_level = 'public'
    )
);

create table public.sample_moods (
  sample_id  uuid not null references public.samples(id) on delete cascade,
  mood_slug  text not null references public.moods(slug),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  primary key (sample_id, mood_slug)
);

create table public.sample_hidden_tags (
  sample_id  uuid not null references public.samples(id) on delete cascade,
  tag_slug   text not null references public.hidden_tags(slug),
  created_at timestamptz not null default now(),

  primary key (sample_id, tag_slug)
);

create table public.album_samples (
  album_id   uuid not null references public.albums(id) on delete cascade,
  sample_id  uuid not null references public.samples(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  primary key (album_id, sample_id)
);

create table public.sample_stats (
  sample_id           uuid primary key references public.samples(id) on delete cascade,
  play_count          bigint not null default 0,
  download_count      bigint not null default 0,
  favorite_count      bigint not null default 0,
  wander_skip_count   bigint not null default 0,
  similar_click_count bigint not null default 0,
  last_played_at      timestamptz,
  last_downloaded_at  timestamptz,
  updated_at          timestamptz not null default now(),

  constraint sample_stats_nonnegative
    check (
      play_count >= 0
      and download_count >= 0
      and favorite_count >= 0
      and wander_skip_count >= 0
      and similar_click_count >= 0
    )
);
