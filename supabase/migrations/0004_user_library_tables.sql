create table public.favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  sample_id  uuid not null references public.samples(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, sample_id)
);

create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  description text,
  visibility  public.collection_visibility not null default 'private',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint collections_name_not_empty
    check (length(trim(name)) > 0)
);

create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  sample_id     uuid not null references public.samples(id) on delete cascade,
  sort_order    integer not null default 0,
  added_at      timestamptz not null default now(),

  primary key (collection_id, sample_id)
);

create table public.recently_played (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  sample_id uuid not null references public.samples(id) on delete cascade,
  source    public.play_source not null,
  played_at timestamptz not null default now(),

  primary key (user_id, sample_id)
);
