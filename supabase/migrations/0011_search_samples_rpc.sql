create or replace function public.search_samples(
  p_query text default null,
  p_moods text[] default null,
  p_categories text[] default null,
  p_sample_types text[] default null,
  p_bpm_min numeric default null,
  p_bpm_max numeric default null,
  p_musical_key text default null,
  p_loopable boolean default null,
  p_featured_only boolean default false,
  p_album_id uuid default null,
  p_sort text default 'relevance',
  p_page integer default 1,
  p_page_size integer default 24,
  p_seed text default null
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
    select
      nullif(
        lower(
          regexp_replace(
            regexp_replace(
              regexp_replace(replace(trim(coalesce(p_query, '')), '_', ' '), '[[:cntrl:]]+', ' ', 'g'),
              '[^[:alnum:] ''_-]+',
              '',
              'g'
            ),
            '\s+',
            ' ',
            'g'
          )
        ),
        ''
      ) as q,
      nullif(
        regexp_replace(
          regexp_replace(
            lower(
              regexp_replace(
                regexp_replace(trim(coalesce(p_query, '')), '[[:cntrl:]]+', ' ', 'g'),
                '\s+',
                '_',
                'g'
              )
            ),
            '[^a-z0-9_]+',
            '',
            'g'
          ),
          '_+',
          '_',
          'g'
        ),
        ''
      ) as q_slug,
      array(
        select distinct lower(trim(value))
        from unnest(coalesce(p_moods, array[]::text[])) as u(value)
        where trim(value) <> ''
        limit 5
      ) as moods,
      array(
        select distinct lower(trim(value))
        from unnest(coalesce(p_categories, array[]::text[])) as u(value)
        where trim(value) <> ''
        limit 7
      ) as categories,
      array(
        select distinct lower(trim(value))
        from unnest(coalesce(p_sample_types, array[]::text[])) as u(value)
        where trim(value) <> ''
        limit 6
      ) as sample_types,
      case
        when p_bpm_min is null then null
        else least(greatest(p_bpm_min, 1), 400)
      end as bpm_min,
      case
        when p_bpm_max is null then null
        else least(greatest(p_bpm_max, 1), 400)
      end as bpm_max,
      nullif(lower(trim(coalesce(p_musical_key, ''))), '') as musical_key_filter,
      coalesce(p_featured_only, false) as featured_only,
      case
        when nullif(trim(coalesce(p_query, '')), '') is null and coalesce(p_sort, 'relevance') = 'relevance' then 'newest'
        when p_sort in (
          'relevance',
          'newest',
          'most_played',
          'most_downloaded',
          'most_favorited',
          'featured',
          'random_seeded'
        ) then p_sort
        when nullif(trim(coalesce(p_query, '')), '') is null then 'newest'
        else 'relevance'
      end as sort_mode,
      greatest(coalesce(p_page, 1), 1) as page_number,
      least(greatest(coalesce(p_page_size, 24), 1), 60) as page_size,
      nullif(p_seed, '') as seed_value
  ), base as (
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
      sd.poetic_name_text,
      sd.display_title_text,
      sd.description_text,
      sd.category_text,
      sd.sample_type_text,
      sd.mood_text,
      sd.hidden_tag_text,
      sd.album_text,
      sd.search_vector,
      coalesce(sd.combined_fts, ''::tsvector) as combined_fts,
      prev.bucket as preview_bucket,
      prev.object_path as preview_object_path,
      wave.bucket as waveform_bucket,
      wave.object_path as waveform_object_path
    from normalized n
    join public.samples s on true
    join public.sample_search_documents sd on sd.sample_id = s.id
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
      and (cardinality(n.categories) = 0 or s.category_slug = any(n.categories))
      and (cardinality(n.sample_types) = 0 or s.sample_type_slug = any(n.sample_types))
      and (n.bpm_min is null or s.bpm >= n.bpm_min)
      and (n.bpm_max is null or s.bpm <= n.bpm_max)
      and (n.musical_key_filter is null or lower(s.musical_key) = n.musical_key_filter)
      and (p_loopable is null or s.loopable = p_loopable)
      and (n.featured_only is false or s.featured = true)
      and (
        p_album_id is null
        or exists (
          select 1
          from public.album_samples als
          join public.albums a on a.id = als.album_id
          where als.sample_id = s.id
            and als.album_id = p_album_id
            and a.status = 'published'
        )
      )
      and (
        cardinality(n.moods) = 0
        or exists (
          select 1
          from public.sample_moods sm
          where sm.sample_id = s.id
            and sm.mood_slug = any(n.moods)
        )
      )
  ), scored as (
    select
      b.*,
      (
        case
          when n.q is null then 0
          when lower(b.poetic_name) = n.q_slug then 8.0
          when lower(b.poetic_name) like n.q_slug || '%' then 6.0
          else 0
        end
        + case
            when n.q is null then 0
            else least(ts_rank_cd(b.combined_fts, plainto_tsquery('simple', n.q)) * 10, 6.0)
          end
        + case
            when n.q is null then 0
            else greatest(
              similarity(lower(b.poetic_name_text), n.q) * 4.0,
              similarity(lower(b.display_title_text), n.q) * 3.0,
              similarity(lower(b.search_vector), n.q) * 2.0
            )
          end
        + case
            when n.q is not null
              and (
                lower(b.poetic_name_text) like '%' || n.q || '%'
                or exists (
                  select 1
                  from regexp_split_to_table(n.q, '\s+') as t(token)
                  where token <> ''
                    and lower(b.poetic_name_text) like '%' || token || '%'
                )
              ) then 5.0
            else 0
          end
        + case
            when n.q is not null
              and (
                lower(b.display_title_text) like '%' || n.q || '%'
                or exists (
                  select 1
                  from regexp_split_to_table(n.q, '\s+') as t(token)
                  where token <> ''
                    and lower(b.display_title_text) like '%' || token || '%'
                )
              ) then 4.0
            else 0
          end
        + case
            when n.q is not null
              and (
                lower(b.mood_text) like '%' || n.q || '%'
                or exists (
                  select 1
                  from regexp_split_to_table(n.q, '\s+') as t(token)
                  where token <> ''
                    and lower(b.mood_text) like '%' || token || '%'
                )
              ) then 3.0
            else 0
          end
        + case
            when n.q is not null
              and (
                lower(b.hidden_tag_text) like '%' || n.q || '%'
                or exists (
                  select 1
                  from regexp_split_to_table(n.q, '\s+') as t(token)
                  where token <> ''
                    and lower(b.hidden_tag_text) like '%' || token || '%'
                )
              ) then 2.0
            else 0
          end
        + case
            when n.q is not null
              and (
                lower(b.description_text) like '%' || n.q || '%'
                or exists (
                  select 1
                  from regexp_split_to_table(n.q, '\s+') as t(token)
                  where token <> ''
                    and lower(b.description_text) like '%' || token || '%'
                )
              ) then 1.75
            else 0
          end
        + case
            when n.q is not null
              and (
                lower(b.category_text) like '%' || n.q || '%'
                or exists (
                  select 1
                  from regexp_split_to_table(n.q, '\s+') as t(token)
                  where token <> ''
                    and lower(b.category_text) like '%' || token || '%'
                )
              ) then 1.5
            else 0
          end
        + case
            when n.q is not null
              and (
                lower(b.sample_type_text) like '%' || n.q || '%'
                or exists (
                  select 1
                  from regexp_split_to_table(n.q, '\s+') as t(token)
                  where token <> ''
                    and lower(b.sample_type_text) like '%' || token || '%'
                )
              ) then 1.5
            else 0
          end
        + case
            when n.q is not null
              and (
                lower(b.album_text) like '%' || n.q || '%'
                or exists (
                  select 1
                  from regexp_split_to_table(n.q, '\s+') as t(token)
                  where token <> ''
                    and lower(b.album_text) like '%' || token || '%'
                )
              ) then 0.75
            else 0
          end
        + case when b.featured then 1.0 else 0 end
        + case
            when b.published_at >= now() - interval '7 days' then 0.5
            when b.published_at >= now() - interval '30 days' then 0.25
            else 0
          end
        + case
            when n.q is null then
              least(ln(1 + b.play_count) * 0.05, 0.25)
              + least(ln(1 + b.favorite_count) * 0.08, 0.3)
            else 0
          end
      )::numeric as computed_score
    from base b
    cross join normalized n
    where
      n.q is null
      or b.combined_fts @@ plainto_tsquery('simple', n.q)
      or lower(b.poetic_name) = n.q_slug
      or lower(b.poetic_name) like n.q_slug || '%'
      or similarity(lower(b.search_vector), n.q) >= 0.12
      or lower(b.poetic_name_text) like '%' || n.q || '%'
      or lower(b.display_title_text) like '%' || n.q || '%'
      or lower(b.mood_text) like '%' || n.q || '%'
      or lower(b.hidden_tag_text) like '%' || n.q || '%'
      or lower(b.description_text) like '%' || n.q || '%'
      or lower(b.category_text) like '%' || n.q || '%'
      or lower(b.sample_type_text) like '%' || n.q || '%'
      or lower(b.album_text) like '%' || n.q || '%'
      or exists (
        select 1
        from regexp_split_to_table(n.q, '\s+') as t(token)
        where token <> ''
          and lower(b.search_vector) like '%' || token || '%'
      )
  ), counted as (
    select
      scored.*,
      count(*) over() as total_count
    from scored
  )
  select
    c.id as sample_id,
    c.poetic_name,
    c.display_title,
    c.display_title_is_custom,
    c.short_description,
    c.category_slug,
    c.category_label,
    c.sample_type_slug,
    c.sample_type_label,
    c.bpm,
    c.musical_key,
    c.duration_seconds,
    c.loopable,
    c.featured,
    c.published_at,
    c.preview_bucket,
    c.preview_object_path,
    c.waveform_bucket,
    c.waveform_object_path,
    c.play_count,
    c.download_count,
    c.favorite_count,
    c.computed_score as score,
    c.total_count
  from counted c
  cross join normalized n
  order by
    case when n.sort_mode = 'featured' then c.featured end desc nulls last,
    case when n.sort_mode = 'most_played' then c.play_count end desc nulls last,
    case when n.sort_mode = 'most_downloaded' then c.download_count end desc nulls last,
    case when n.sort_mode = 'most_favorited' then c.favorite_count end desc nulls last,
    case when n.sort_mode = 'random_seeded' then md5(coalesce(n.seed_value, 'ais') || c.id::text) end asc nulls last,
    case when n.sort_mode = 'relevance' then c.computed_score end desc nulls last,
    case when n.sort_mode in ('newest', 'relevance', 'featured', 'most_played', 'most_downloaded', 'most_favorited') then c.published_at end desc nulls last,
    case when n.sort_mode = 'newest' then c.featured end desc nulls last,
    c.poetic_name asc
  offset ((select page_number from normalized) - 1) * (select page_size from normalized)
  limit (select page_size from normalized);
$$;

revoke all on function public.search_samples(
  text,
  text[],
  text[],
  text[],
  numeric,
  numeric,
  text,
  boolean,
  boolean,
  uuid,
  text,
  integer,
  integer,
  text
) from public;

grant execute on function public.search_samples(
  text,
  text[],
  text[],
  text[],
  numeric,
  numeric,
  text,
  boolean,
  boolean,
  uuid,
  text,
  integer,
  integer,
  text
) to anon, authenticated, service_role;
