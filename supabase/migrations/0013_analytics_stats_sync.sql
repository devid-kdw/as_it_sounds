create or replace function public.sync_sample_play_event_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sample_stats (sample_id, play_count, last_played_at, updated_at)
  values (new.sample_id, 1, new.created_at, now())
  on conflict (sample_id) do update set
    play_count = public.sample_stats.play_count + 1,
    last_played_at = greatest(
      coalesce(public.sample_stats.last_played_at, '-infinity'::timestamptz),
      excluded.last_played_at
    ),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists sample_play_events_sync_stats on public.sample_play_events;

create trigger sample_play_events_sync_stats
  after insert on public.sample_play_events
  for each row execute function public.sync_sample_play_event_stats();

create or replace function public.sync_download_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sample_stats (sample_id, download_count, last_downloaded_at, updated_at)
  values (new.sample_id, 1, new.created_at, now())
  on conflict (sample_id) do update set
    download_count = public.sample_stats.download_count + 1,
    last_downloaded_at = greatest(
      coalesce(public.sample_stats.last_downloaded_at, '-infinity'::timestamptz),
      excluded.last_downloaded_at
    ),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists downloads_sync_stats on public.downloads;

create trigger downloads_sync_stats
  after insert on public.downloads
  for each row execute function public.sync_download_stats();

create or replace function public.sync_similar_sample_event_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sample_stats (sample_id, similar_click_count, updated_at)
  values (new.clicked_sample_id, 1, now())
  on conflict (sample_id) do update set
    similar_click_count = public.sample_stats.similar_click_count + 1,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists similar_sample_events_sync_stats on public.similar_sample_events;

create trigger similar_sample_events_sync_stats
  after insert on public.similar_sample_events
  for each row execute function public.sync_similar_sample_event_stats();

create or replace function public.sync_wander_event_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.action = 'skipped' and new.sample_id is not null then
    insert into public.sample_stats (sample_id, wander_skip_count, updated_at)
    values (new.sample_id, 1, now())
    on conflict (sample_id) do update set
      wander_skip_count = public.sample_stats.wander_skip_count + 1,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists wander_events_sync_stats on public.wander_events;

create trigger wander_events_sync_stats
  after insert on public.wander_events
  for each row execute function public.sync_wander_event_stats();
