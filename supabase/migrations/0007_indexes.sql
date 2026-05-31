create index samples_status_idx
  on public.samples (status);

create index samples_status_featured_idx
  on public.samples (status, featured)
  where status = 'published';

create index samples_category_status_idx
  on public.samples (category_slug, status);

create index samples_type_status_idx
  on public.samples (sample_type_slug, status);

create index samples_published_at_idx
  on public.samples (published_at desc)
  where status = 'published';

create index samples_file_hash_idx
  on public.samples (file_hash_sha256)
  where file_hash_sha256 is not null;

create index samples_poetic_name_idx
  on public.samples (poetic_name);

create index sample_search_documents_fts_idx
  on public.sample_search_documents using gin (combined_fts);

create index sample_search_documents_search_vector_trgm_idx
  on public.sample_search_documents using gin (search_vector gin_trgm_ops);

create index sample_search_documents_poetic_trgm_idx
  on public.sample_search_documents using gin (poetic_name_text gin_trgm_ops);

create index sample_search_documents_title_trgm_idx
  on public.sample_search_documents using gin (display_title_text gin_trgm_ops);

create index sample_moods_mood_slug_idx
  on public.sample_moods (mood_slug);

create index sample_hidden_tags_tag_slug_idx
  on public.sample_hidden_tags (tag_slug);

create index album_samples_album_sort_idx
  on public.album_samples (album_id, sort_order);

create index album_samples_sample_idx
  on public.album_samples (sample_id);

create index favorites_sample_id_idx
  on public.favorites (sample_id);

create index collections_user_id_idx
  on public.collections (user_id);

create index collection_items_sample_id_idx
  on public.collection_items (sample_id);

create index collection_items_collection_sort_idx
  on public.collection_items (collection_id, sort_order);

create index recently_played_user_played_at_idx
  on public.recently_played (user_id, played_at desc);

create index downloads_user_created_idx
  on public.downloads (user_id, created_at desc);

create index downloads_sample_created_idx
  on public.downloads (sample_id, created_at desc);

create index sample_play_events_sample_created_idx
  on public.sample_play_events (sample_id, created_at desc);

create index search_logs_created_idx
  on public.search_logs (created_at desc);

create index search_logs_no_results_idx
  on public.search_logs (created_at desc)
  where result_count = 0;

create index processing_jobs_status_created_idx
  on public.processing_jobs (status, created_at desc);

create index stripe_webhook_events_status_idx
  on public.stripe_webhook_events (processing_status, received_at desc);
