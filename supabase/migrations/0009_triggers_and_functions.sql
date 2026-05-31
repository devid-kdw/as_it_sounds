create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger set_sample_types_updated_at
  before update on public.sample_types
  for each row execute function public.set_updated_at();

create trigger set_moods_updated_at
  before update on public.moods
  for each row execute function public.set_updated_at();

create trigger set_hidden_tags_updated_at
  before update on public.hidden_tags
  for each row execute function public.set_updated_at();

create trigger set_albums_updated_at
  before update on public.albums
  for each row execute function public.set_updated_at();

create trigger set_samples_updated_at
  before update on public.samples
  for each row execute function public.set_updated_at();

create trigger set_sample_assets_updated_at
  before update on public.sample_assets
  for each row execute function public.set_updated_at();

create trigger set_sample_stats_updated_at
  before update on public.sample_stats
  for each row execute function public.set_updated_at();

create trigger set_collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create trigger set_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger set_sample_search_documents_updated_at
  before update on public.sample_search_documents
  for each row execute function public.set_updated_at();

create trigger set_processing_jobs_updated_at
  before update on public.processing_jobs
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', null)
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, status)
  values (new.id, 'free_launch_access')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.refresh_sample_search_document(target_sample_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sample_row public.samples%rowtype;
  category_text_value text;
  sample_type_text_value text;
  mood_text_value text;
  hidden_tag_text_value text;
  album_text_value text;
  combined_fts_value tsvector;
begin
  select * into sample_row
  from public.samples
  where id = target_sample_id;

  if sample_row.id is null then
    delete from public.sample_search_documents where sample_id = target_sample_id;
    return;
  end if;

  select coalesce((
    select c.label
    from public.categories c
    where c.slug = sample_row.category_slug
  ), '') into category_text_value;

  select coalesce((
    select st.label
    from public.sample_types st
    where st.slug = sample_row.sample_type_slug
  ), '') into sample_type_text_value;

  select coalesce((
    select string_agg(m.label || ' ' || m.slug, ' ')
    from public.sample_moods sm
    join public.moods m on m.slug = sm.mood_slug
    where sm.sample_id = sample_row.id
  ), '') into mood_text_value;

  select coalesce((
    select string_agg(ht.label || ' ' || ht.slug, ' ')
    from public.sample_hidden_tags sht
    join public.hidden_tags ht on ht.slug = sht.tag_slug
    where sht.sample_id = sample_row.id
  ), '') into hidden_tag_text_value;

  select coalesce((
    select string_agg(a.title || ' ' || a.slug, ' ')
    from public.album_samples als
    join public.albums a on a.id = als.album_id
    where als.sample_id = sample_row.id
  ), '') into album_text_value;

  combined_fts_value :=
    setweight(to_tsvector('simple', coalesce(sample_row.poetic_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(sample_row.display_title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(sample_row.short_description, '')), 'B') ||
    setweight(to_tsvector('simple', mood_text_value), 'B') ||
    setweight(to_tsvector('simple', hidden_tag_text_value), 'C') ||
    setweight(to_tsvector('simple', category_text_value), 'D') ||
    setweight(to_tsvector('simple', sample_type_text_value), 'D') ||
    setweight(to_tsvector('simple', album_text_value), 'D');

  insert into public.sample_search_documents (
    sample_id, poetic_name_text, display_title_text, description_text,
    category_text, sample_type_text, mood_text, hidden_tag_text, album_text,
    combined_fts, updated_at
  )
  values (
    sample_row.id,
    coalesce(sample_row.poetic_name, ''),
    coalesce(sample_row.display_title, ''),
    coalesce(sample_row.short_description, ''),
    category_text_value,
    sample_type_text_value,
    mood_text_value,
    hidden_tag_text_value,
    album_text_value,
    combined_fts_value,
    now()
  )
  on conflict (sample_id) do update set
    poetic_name_text   = excluded.poetic_name_text,
    display_title_text = excluded.display_title_text,
    description_text   = excluded.description_text,
    category_text      = excluded.category_text,
    sample_type_text   = excluded.sample_type_text,
    mood_text          = excluded.mood_text,
    hidden_tag_text    = excluded.hidden_tag_text,
    album_text         = excluded.album_text,
    combined_fts       = excluded.combined_fts,
    updated_at         = now();
end;
$$;

create or replace function public.refresh_sample_search_document_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_sample_search_document(old.sample_id);
    return old;
  end if;

  if tg_table_name = 'samples' then
    perform public.refresh_sample_search_document(new.id);
  else
    perform public.refresh_sample_search_document(new.sample_id);
  end if;

  return new;
end;
$$;

create trigger refresh_search_on_samples
  after insert or update on public.samples
  for each row execute function public.refresh_sample_search_document_trigger();

create trigger refresh_search_on_sample_moods
  after insert or update or delete on public.sample_moods
  for each row execute function public.refresh_sample_search_document_trigger();

create trigger refresh_search_on_sample_hidden_tags
  after insert or update or delete on public.sample_hidden_tags
  for each row execute function public.refresh_sample_search_document_trigger();

create trigger refresh_search_on_album_samples
  after insert or update or delete on public.album_samples
  for each row execute function public.refresh_sample_search_document_trigger();

create or replace function public.sync_sample_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.sample_stats (sample_id, favorite_count, updated_at)
    values (new.sample_id, 1, now())
    on conflict (sample_id) do update set
      favorite_count = public.sample_stats.favorite_count + 1,
      updated_at = now();
    return new;
  elsif tg_op = 'DELETE' then
    update public.sample_stats
    set favorite_count = greatest(favorite_count - 1, 0),
        updated_at = now()
    where sample_id = old.sample_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger favorites_sync_stats
  after insert or delete on public.favorites
  for each row execute function public.sync_sample_favorite_count();

create or replace function public.create_sample_stats_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sample_stats (sample_id)
  values (new.id)
  on conflict (sample_id) do nothing;
  return new;
end;
$$;

create trigger create_stats_for_sample
  after insert on public.samples
  for each row execute function public.create_sample_stats_row();

create or replace function public.enforce_max_moods_per_sample()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mood_count integer;
begin
  select count(*) into mood_count
  from public.sample_moods
  where sample_id = new.sample_id;

  if mood_count >= 3 then
    raise exception 'A sample may not have more than 3 mood tags. Current count: %', mood_count;
  end if;

  return new;
end;
$$;

create trigger enforce_mood_limit
  before insert on public.sample_moods
  for each row execute function public.enforce_max_moods_per_sample();
