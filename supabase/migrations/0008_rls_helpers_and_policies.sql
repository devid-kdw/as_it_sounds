create or replace function public.current_profile_role()
returns public.profile_role
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_profile_role() = 'admin', false)
$$;

create or replace function public.free_launch_downloads_enabled()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select (value #>> '{}')::boolean
      from public.app_settings
      where key = 'free_launch_downloads_enabled'
    ),
    false
  )
$$;

create or replace function public.has_download_entitlement()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() is not null
    and (
      public.is_admin()
      or public.free_launch_downloads_enabled()
      or exists (
        select 1
        from public.subscriptions s
        where s.user_id = auth.uid()
          and s.status in ('trialing', 'active', 'lifetime_granted')
      )
    )
$$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.sample_types enable row level security;
alter table public.moods enable row level security;
alter table public.mood_category_suggestions enable row level security;
alter table public.hidden_tags enable row level security;

alter table public.albums enable row level security;
alter table public.samples enable row level security;
alter table public.sample_assets enable row level security;
alter table public.sample_moods enable row level security;
alter table public.sample_hidden_tags enable row level security;
alter table public.album_samples enable row level security;
alter table public.sample_stats enable row level security;

alter table public.favorites enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.recently_played enable row level security;

alter table public.app_settings enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlement_events enable row level security;
alter table public.stripe_webhook_events enable row level security;

alter table public.downloads enable row level security;
alter table public.sample_play_events enable row level security;
alter table public.search_logs enable row level security;
alter table public.wander_events enable row level security;
alter table public.similar_sample_events enable row level security;
alter table public.sample_search_documents enable row level security;

alter table public.processing_jobs enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "public can read active categories"
  on public.categories for select using (is_active = true);

create policy "public can read active sample types"
  on public.sample_types for select using (is_active = true);

create policy "public can read active moods"
  on public.moods for select using (is_active = true);

create policy "public can read mood category suggestions"
  on public.mood_category_suggestions for select using (true);

create policy "admin can manage categories"
  on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

create policy "admin can manage sample types"
  on public.sample_types for all
  using (public.is_admin()) with check (public.is_admin());

create policy "admin can manage moods"
  on public.moods for all
  using (public.is_admin()) with check (public.is_admin());

create policy "admin can manage mood category suggestions"
  on public.mood_category_suggestions for all
  using (public.is_admin()) with check (public.is_admin());

create policy "admin can manage hidden tags"
  on public.hidden_tags for all
  using (public.is_admin()) with check (public.is_admin());

create policy "users can read own profile"
  on public.profiles for select using (id = auth.uid());

create policy "users can update own non-admin profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_profile_role());

create policy "admin can read all profiles"
  on public.profiles for select using (public.is_admin());

create policy "admin can update profiles"
  on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

create policy "public can read published samples"
  on public.samples for select using (status = 'published');

create policy "admin can manage samples"
  on public.samples for all
  using (public.is_admin()) with check (public.is_admin());

create policy "public can read published albums"
  on public.albums for select using (status = 'published');

create policy "admin can manage albums"
  on public.albums for all
  using (public.is_admin()) with check (public.is_admin());

create policy "public can read published preview and waveform assets"
  on public.sample_assets for select
  using (
    kind in ('preview_audio', 'waveform_peaks')
    and exists (
      select 1 from public.samples s
      where s.id = sample_assets.sample_id
        and s.status = 'published'
    )
  );

create policy "admin can manage sample assets"
  on public.sample_assets for all
  using (public.is_admin()) with check (public.is_admin());

create policy "public can read moods for published samples"
  on public.sample_moods for select
  using (
    exists (
      select 1 from public.samples s
      where s.id = sample_moods.sample_id and s.status = 'published'
    )
  );

create policy "admin can manage sample moods"
  on public.sample_moods for all
  using (public.is_admin()) with check (public.is_admin());

create policy "admin can manage sample hidden tags"
  on public.sample_hidden_tags for all
  using (public.is_admin()) with check (public.is_admin());

create policy "public can read album samples when both published"
  on public.album_samples for select
  using (
    exists (
      select 1 from public.albums a
      where a.id = album_samples.album_id and a.status = 'published'
    )
    and exists (
      select 1 from public.samples s
      where s.id = album_samples.sample_id and s.status = 'published'
    )
  );

create policy "admin can manage album samples"
  on public.album_samples for all
  using (public.is_admin()) with check (public.is_admin());

create policy "public can read sample stats for published samples"
  on public.sample_stats for select
  using (
    exists (
      select 1 from public.samples s
      where s.id = sample_stats.sample_id and s.status = 'published'
    )
  );

create policy "users can read own favorites"
  on public.favorites for select using (user_id = auth.uid());

create policy "users can create favorites for published samples"
  on public.favorites for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.samples s
      where s.id = sample_id and s.status = 'published'
    )
  );

create policy "users can delete own favorites"
  on public.favorites for delete using (user_id = auth.uid());

create policy "users can manage own collections"
  on public.collections for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users can read own collection items"
  on public.collection_items for select
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id and c.user_id = auth.uid()
    )
  );

create policy "users can add items to own collections for published samples"
  on public.collection_items for insert
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id and c.user_id = auth.uid()
    )
    and exists (
      select 1 from public.samples s
      where s.id = sample_id and s.status = 'published'
    )
  );

create policy "users can update own collection items"
  on public.collection_items for update
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id and c.user_id = auth.uid()
    )
  );

create policy "users can delete own collection items"
  on public.collection_items for delete
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id and c.user_id = auth.uid()
    )
  );

create policy "users can read own recently played"
  on public.recently_played for select using (user_id = auth.uid());

create policy "users can upsert own recently played for published samples"
  on public.recently_played for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.samples s
      where s.id = sample_id and s.status = 'published'
    )
  );

create policy "users can update own recently played"
  on public.recently_played for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users can insert own play events for published samples"
  on public.sample_play_events for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.samples s
      where s.id = sample_id and s.status = 'published'
    )
  );

create policy "admin can read all play events"
  on public.sample_play_events for select using (public.is_admin());

create policy "users can read own subscription"
  on public.subscriptions for select using (user_id = auth.uid());

create policy "admin can read all subscriptions"
  on public.subscriptions for select using (public.is_admin());

create policy "admin can read entitlement events"
  on public.entitlement_events for select using (public.is_admin());

create policy "admin can read webhook events"
  on public.stripe_webhook_events for select using (public.is_admin());

create policy "users can read own downloads"
  on public.downloads for select using (user_id = auth.uid());

create policy "admin can read all downloads"
  on public.downloads for select using (public.is_admin());

create policy "admin can manage search documents"
  on public.sample_search_documents for all
  using (public.is_admin()) with check (public.is_admin());

create policy "authenticated users can insert own search logs"
  on public.search_logs for insert
  with check (user_id = auth.uid() or user_id is null);

create policy "admin can read search logs"
  on public.search_logs for select using (public.is_admin());

create policy "users can insert own wander events"
  on public.wander_events for insert
  with check (user_id = auth.uid() or user_id is null);

create policy "users can insert own similar sample events"
  on public.similar_sample_events for insert
  with check (user_id = auth.uid() or user_id is null);

create policy "admin can manage processing jobs"
  on public.processing_jobs for all using (public.is_admin());

create policy "admin can read audit log"
  on public.admin_audit_log for select using (public.is_admin());
