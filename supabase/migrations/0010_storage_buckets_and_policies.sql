insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'ais-originals',
    'ais-originals',
    false,
    524288000,
    array['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave']
  ),
  (
    'ais-previews',
    'ais-previews',
    true,
    104857600,
    array['audio/mpeg', 'audio/mp3']
  ),
  (
    'ais-waveforms',
    'ais-waveforms',
    true,
    10485760,
    array['application/json']
  ),
  (
    'ais-album-artwork',
    'ais-album-artwork',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'ais-processing-temp',
    'ais-processing-temp',
    false,
    524288000,
    array['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave']
  )
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "AIS public storage buckets are readable"
  on storage.objects for select
  using (
    bucket_id in (
      'ais-previews',
      'ais-waveforms',
      'ais-album-artwork'
    )
  );

create policy "AIS admins can manage storage objects"
  on storage.objects for all
  using (
    public.is_admin()
    and bucket_id in (
      'ais-originals',
      'ais-previews',
      'ais-waveforms',
      'ais-album-artwork',
      'ais-processing-temp'
    )
  )
  with check (
    public.is_admin()
    and bucket_id in (
      'ais-originals',
      'ais-previews',
      'ais-waveforms',
      'ais-album-artwork',
      'ais-processing-temp'
    )
  );
