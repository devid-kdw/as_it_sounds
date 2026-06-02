create or replace function public.similar_samples(
  p_sample_id uuid,
  p_limit integer default 6,
  p_album_context boolean default false
)
returns table (
  sample_id uuid,
  poetic_name text,
  display_title text,
  display_title_is_custom boolean,
  short_description text,
  category_slug text,
  category_label text,
  sample_type_slug text,
  sample_type_label text,
  bpm numeric,
  musical_key text,
  duration_seconds numeric,
  loopable boolean,
  featured boolean,
  published_at timestamptz,
  preview_bucket text,
  preview_object_path text,
  waveform_bucket text,
  waveform_object_path text,
  play_count bigint,
  download_count bigint,
  favorite_count bigint,
  score numeric,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select least(greatest(coalesce(p_limit, 6), 1), 12) as safe_limit
  ), source_sample as (
    select *
    from public.samples
    where id = p_sample_id
      and status = 'published'
  ), source_moods as (
    select mood_slug
    from public.sample_moods
    where sample_id = p_sample_id
  ), source_tags as (
    select tag_slug
    from public.sample_hidden_tags
    where sample_id = p_sample_id
  ), source_albums as (
    select album_id
    from public.album_samples
    where sample_id = p_sample_id
  ), candidate_base as (
    select
      s.id,
      s.poetic_name,
      s.display_title,
      s.display_title_is_custom,
      s.short_description,
      s.category_slug,
      c.label as category_label,
      s.sample_type_slug,
      st.label as sample_type_label,
      s.bpm,
      s.musical_key,
      s.duration_seconds,
      s.loopable,
      s.is_melodic,
      s.featured,
      s.published_at,
      coalesce(ss.play_count, 0) as play_count,
      coalesce(ss.download_count, 0) as download_count,
      coalesce(ss.favorite_count, 0) as favorite_count,
      prev.bucket as preview_bucket,
      prev.object_path as preview_object_path,
      wave.bucket as waveform_bucket,
      wave.object_path as waveform_object_path,
      (
        select ca.album_id
        from public.album_samples ca
        where ca.sample_id = s.id
          and ca.album_id in (select album_id from source_albums)
        order by ca.sort_order asc, ca.album_id asc
        limit 1
      ) as matching_album_id
    from public.samples s
    join source_sample src on true
    join public.categories c on c.slug = s.category_slug
    join public.sample_types st on st.slug = s.sample_type_slug
    left join public.sample_stats ss on ss.sample_id = s.id
    left join public.sample_assets prev
      on prev.sample_id = s.id
      and prev.kind = 'preview_audio'
      and prev.access_level = 'public'
    left join public.sample_assets wave
      on wave.sample_id = s.id
      and wave.kind = 'waveform_peaks'
      and wave.access_level = 'public'
    where s.status = 'published'
      and s.id <> p_sample_id
  ), scored as (
    select
      b.*,
      (
        (
          select count(*) * 4.0
          from public.sample_moods cm
          where cm.sample_id = b.id
            and cm.mood_slug in (select mood_slug from source_moods)
        )
        + case when b.category_slug = src.category_slug then 3.0 else 0 end
        + case when b.sample_type_slug = src.sample_type_slug then 2.0 else 0 end
        + (
          select count(*) * 1.0
          from public.sample_hidden_tags ct
          where ct.sample_id = b.id
            and ct.tag_slug in (select tag_slug from source_tags)
        )
        + case
            when b.bpm is not null
              and src.bpm is not null
              and (b.loopable = true or src.loopable = true or b.sample_type_slug = src.sample_type_slug)
              and abs(b.bpm - src.bpm) <= 3 then 2.0
            when b.bpm is not null
              and src.bpm is not null
              and (b.loopable = true or src.loopable = true or b.sample_type_slug = src.sample_type_slug)
              and abs(b.bpm - src.bpm) <= 8 then 1.25
            when b.bpm is not null
              and src.bpm is not null
              and (b.loopable = true or src.loopable = true or b.sample_type_slug = src.sample_type_slug)
              and abs(b.bpm - src.bpm) <= 15 then 0.5
            else 0
          end
        + case when b.matching_album_id is not null then 0.75 else 0 end
        + case when b.loopable = true and src.loopable = true then 0.5 else 0 end
        + case
            when b.is_melodic = true
              and src.is_melodic = true
              and b.musical_key is not null
              and b.musical_key = src.musical_key then 0.75
            else 0
          end
        + case when b.featured then 0.25 else 0 end
      )::numeric as similarity_score
    from candidate_base b
    join source_sample src on true
  ), diversified as (
    select
      s.*,
      row_number() over (
        partition by coalesce(s.matching_album_id::text, s.id::text)
        order by s.similarity_score desc, s.published_at desc nulls last, s.id asc
      ) as album_rank
    from scored s
    where s.similarity_score > 0
  ), limited as (
    select *
    from diversified d
    cross join normalized n
    where p_album_context = true
      or d.matching_album_id is null
      or d.album_rank <= 2
    order by d.similarity_score desc, d.published_at desc nulls last, d.id asc
    limit (select safe_limit from normalized)
  )
  select
    l.id,
    l.poetic_name,
    l.display_title,
    l.display_title_is_custom,
    l.short_description,
    l.category_slug,
    l.category_label,
    l.sample_type_slug,
    l.sample_type_label,
    l.bpm,
    l.musical_key,
    l.duration_seconds,
    l.loopable,
    l.featured,
    l.published_at,
    l.preview_bucket,
    l.preview_object_path,
    l.waveform_bucket,
    l.waveform_object_path,
    l.play_count,
    l.download_count,
    l.favorite_count,
    l.similarity_score,
    count(*) over() as total_count
  from limited l;
$$;

create or replace function public.wander_samples(
  p_mood text default null,
  p_category text default null,
  p_exclude uuid[] default null,
  p_limit integer default 1,
  p_user_id uuid default null,
  p_source text default 'web'
)
returns table (
  sample_id uuid,
  poetic_name text,
  display_title text,
  display_title_is_custom boolean,
  short_description text,
  category_slug text,
  category_label text,
  sample_type_slug text,
  sample_type_label text,
  bpm numeric,
  musical_key text,
  duration_seconds numeric,
  loopable boolean,
  featured boolean,
  published_at timestamptz,
  preview_bucket text,
  preview_object_path text,
  waveform_bucket text,
  waveform_object_path text,
  play_count bigint,
  download_count bigint,
  favorite_count bigint,
  score numeric,
  total_count bigint
)
language sql
volatile
security definer
set search_path = public
as $$
  with normalized as (
    select
      nullif(lower(trim(coalesce(p_mood, ''))), '') as mood_slug,
      nullif(lower(trim(coalesce(p_category, ''))), '') as category_slug,
      array(
        select distinct id
        from unnest(coalesce(p_exclude, array[]::uuid[])) as excluded(id)
        limit 20
      ) as excluded_ids,
      least(greatest(coalesce(p_limit, 1), 1), 12) as safe_limit,
      case when p_source = 'plugin' then 'plugin' else 'web' end as safe_source
  ), recent as (
    select rp.sample_id
    from public.recently_played rp
    where p_user_id is not null
      and rp.user_id = p_user_id
    order by rp.played_at desc
    limit 20
  ), eligible as (
    select
      s.id,
      s.poetic_name,
      s.display_title,
      s.display_title_is_custom,
      s.short_description,
      s.category_slug,
      c.label as category_label,
      s.sample_type_slug,
      st.label as sample_type_label,
      s.bpm,
      s.musical_key,
      s.duration_seconds,
      s.loopable,
      s.featured,
      s.published_at,
      coalesce(ss.play_count, 0) as play_count,
      coalesce(ss.download_count, 0) as download_count,
      coalesce(ss.favorite_count, 0) as favorite_count,
      prev.bucket as preview_bucket,
      prev.object_path as preview_object_path,
      wave.bucket as waveform_bucket,
      wave.object_path as waveform_object_path,
      case
        when n.mood_slug is not null and exists (
          select 1
          from public.sample_moods sm
          where sm.sample_id = s.id
            and sm.mood_slug = n.mood_slug
        ) then true
        else false
      end as has_mood_context,
      case when n.category_slug is not null and s.category_slug = n.category_slug then true else false end as has_category_context
    from normalized n
    join public.samples s on true
    join public.categories c on c.slug = s.category_slug
    join public.sample_types st on st.slug = s.sample_type_slug
    left join public.sample_stats ss on ss.sample_id = s.id
    left join public.sample_assets prev
      on prev.sample_id = s.id
      and prev.kind = 'preview_audio'
      and prev.access_level = 'public'
    left join public.sample_assets wave
      on wave.sample_id = s.id
      and wave.kind = 'waveform_peaks'
      and wave.access_level = 'public'
    where s.status = 'published'
      and s.id <> all(n.excluded_ids)
      and not exists (select 1 from recent r where r.sample_id = s.id)
      and (n.category_slug is null or s.category_slug = n.category_slug)
      and (
        n.mood_slug is null
        or exists (
          select 1
          from public.sample_moods sm
          where sm.sample_id = s.id
            and sm.mood_slug = n.mood_slug
        )
      )
  ), scored as (
    select
      e.*,
      (
        1.0
        + case when e.featured then 0.35 else 0 end
        + (0.60 / (1 + ln(1 + e.play_count)))
        + case when e.has_mood_context then 0.50 else 0 end
        + case when e.has_category_context then 0.25 else 0 end
        + case when e.published_at >= now() - interval '30 days' then 0.15 else 0 end
        - least(ln(1 + e.play_count) * 0.03, 0.30)
      )::numeric as wander_weight
    from eligible e
  ), candidate_pool as (
    select *
    from scored
    order by wander_weight desc, published_at desc nulls last
    limit 500
  ), picked as (
    select *
    from candidate_pool
    order by (-ln(greatest(random(), 0.000001)) / greatest(wander_weight, 0.01)) asc
    limit (select safe_limit from normalized)
  ), logged as (
    insert into public.wander_events (user_id, sample_id, mood_slug, action)
    select p_user_id, p.id, n.mood_slug, 'shown'
    from picked p
    cross join normalized n
    on conflict do nothing
    returning sample_id
  )
  select
    p.id,
    p.poetic_name,
    p.display_title,
    p.display_title_is_custom,
    p.short_description,
    p.category_slug,
    p.category_label,
    p.sample_type_slug,
    p.sample_type_label,
    p.bpm,
    p.musical_key,
    p.duration_seconds,
    p.loopable,
    p.featured,
    p.published_at,
    p.preview_bucket,
    p.preview_object_path,
    p.waveform_bucket,
    p.waveform_object_path,
    p.play_count,
    p.download_count,
    p.favorite_count,
    p.wander_weight,
    count(*) over() as total_count
  from picked p;
$$;
