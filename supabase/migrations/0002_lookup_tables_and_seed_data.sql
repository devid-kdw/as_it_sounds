create table public.categories (
  slug text primary key,
  label text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_slug_format
    check (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

create table public.sample_types (
  slug text primary key,
  label text not null,
  description text,
  requires_bpm boolean not null default false,
  can_be_loopable boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sample_types_slug_format
    check (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

create table public.moods (
  slug text primary key,
  label text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint moods_slug_format
    check (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

create table public.mood_category_suggestions (
  mood_slug     text not null references public.moods(slug) on delete cascade,
  category_slug text not null references public.categories(slug) on delete cascade,
  weight        numeric(4,2) not null default 1.00,
  created_at    timestamptz not null default now(),

  primary key (mood_slug, category_slug),

  constraint mood_category_suggestions_weight_positive
    check (weight > 0)
);

create table public.hidden_tags (
  slug        text primary key,
  label       text not null,
  description text,
  is_active   boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint hidden_tags_slug_format
    check (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

insert into public.categories (slug, label, description, sort_order) values
('field_recordings', 'Field Recordings', 'Sounds captured in real environments.', 10),
('loops',            'Loops',            'Rhythmic or melodic material designed to loop.', 20),
('textures',         'Textures',         'Atmospheric non-rhythmic sound layers.', 30),
('drones',           'Drones',           'Sustained tones and evolving long-form sounds.', 40),
('percussive',       'Percussive',       'Drum hits, rhythmic elements, and organic percussion.', 50),
('one_shots',        'One-Shots',        'Single transient events, stabs, impacts, and transitions.', 60),
('processed',        'Processed',        'Heavily manipulated, granular, or experimental sounds.', 70);

insert into public.sample_types
  (slug, label, description, requires_bpm, can_be_loopable, sort_order) values
('loop',            'Loop',            'Rhythmic or melodic content intended to loop.',      true,  true,  10),
('one_shot',        'One-Shot',        'Single transient or event-based sound.',             false, false, 20),
('field_recording', 'Field Recording', 'Environmental recording captured outside a studio.', false, true,  30),
('texture',         'Texture',         'Atmospheric layer or non-rhythmic sound bed.',       false, true,  40),
('drone',           'Drone',           'Sustained tonal or textural sound.',                 false, true,  50),
('processed',       'Processed',       'Heavily manipulated or experimental sound.',         false, true,  60);

insert into public.moods (slug, label, sort_order) values
('melancholic', 'Melancholic', 10),
('tense',       'Tense',       20),
('peaceful',    'Peaceful',    30),
('mysterious',  'Mysterious',  40),
('euphoric',    'Euphoric',    50),
('dark',        'Dark',        60),
('organic',     'Organic',     70),
('industrial',  'Industrial',  80),
('fragile',     'Fragile',     90),
('ritual',      'Ritual',      100),
('distant',     'Distant',     110),
('warm',        'Warm',        120),
('cold',        'Cold',        130),
('haunted',     'Haunted',     140),
('intimate',    'Intimate',    150);

insert into public.mood_category_suggestions (mood_slug, category_slug, weight) values
('melancholic', 'textures', 1.00),
('melancholic', 'drones', 0.90),
('melancholic', 'loops', 0.55),
('melancholic', 'field_recordings', 0.50),
('tense', 'drones', 1.00),
('tense', 'processed', 0.90),
('tense', 'one_shots', 0.65),
('tense', 'loops', 0.55),
('peaceful', 'field_recordings', 1.00),
('peaceful', 'textures', 0.90),
('peaceful', 'drones', 0.55),
('peaceful', 'loops', 0.45),
('mysterious', 'processed', 1.00),
('mysterious', 'textures', 0.85),
('mysterious', 'drones', 0.75),
('mysterious', 'field_recordings', 0.55),
('euphoric', 'loops', 1.00),
('euphoric', 'textures', 0.85),
('euphoric', 'drones', 0.45),
('dark', 'drones', 1.00),
('dark', 'textures', 0.95),
('dark', 'processed', 0.80),
('dark', 'field_recordings', 0.55),
('organic', 'field_recordings', 1.00),
('organic', 'percussive', 0.90),
('organic', 'textures', 0.80),
('organic', 'one_shots', 0.45),
('industrial', 'processed', 1.00),
('industrial', 'percussive', 0.95),
('industrial', 'one_shots', 0.80),
('industrial', 'textures', 0.65),
('fragile', 'textures', 1.00),
('fragile', 'one_shots', 0.75),
('fragile', 'field_recordings', 0.65),
('fragile', 'drones', 0.45),
('ritual', 'percussive', 1.00),
('ritual', 'drones', 0.85),
('ritual', 'field_recordings', 0.75),
('ritual', 'processed', 0.55),
('distant', 'textures', 1.00),
('distant', 'field_recordings', 0.85),
('distant', 'drones', 0.80),
('distant', 'processed', 0.45),
('warm', 'loops', 0.90),
('warm', 'textures', 0.90),
('warm', 'field_recordings', 0.70),
('warm', 'drones', 0.50),
('cold', 'textures', 1.00),
('cold', 'drones', 0.90),
('cold', 'field_recordings', 0.70),
('cold', 'processed', 0.55),
('haunted', 'processed', 1.00),
('haunted', 'drones', 0.95),
('haunted', 'textures', 0.90),
('haunted', 'field_recordings', 0.45),
('intimate', 'field_recordings', 1.00),
('intimate', 'textures', 0.90),
('intimate', 'one_shots', 0.50),
('intimate', 'drones', 0.35)
on conflict (mood_slug, category_slug) do update set
  weight = excluded.weight;

insert into public.hidden_tags (slug, label, description) values
('slow_loops', 'Slow Loops', 'Slow rhythmic or melodic loops.'),
('dissonant_loops', 'Dissonant Loops', 'Loopable content with unstable harmony.'),
('melodic_loops', 'Melodic Loops', 'Clearly melodic loop material.'),
('soft_loops', 'Soft Loops', 'Gentle or low-transient loops.'),
('ambient_pads', 'Ambient Pads', 'Sustained harmonic atmospheric layers.'),
('bright_pads', 'Bright Pads', 'Light or lifted pad-like material.'),
('soft_textures', 'Soft Textures', 'Smooth low-intensity texture.'),
('distorted_textures', 'Distorted Textures', 'Saturated, degraded, or abrasive texture.'),
('natural_textures', 'Natural Textures', 'Natural material, air, foliage, water, soil.'),
('metallic_textures', 'Metallic Textures', 'Metal resonance, scrape, ring, clang.'),
('quiet_textures', 'Quiet Textures', 'Subtle low-volume textures.'),
('washed_textures', 'Washed Textures', 'Blurred, reverberant, smeared sound.'),
('uplifting_textures', 'Uplifting Textures', 'Light, rising, hopeful texture.'),
('ghostly_textures', 'Ghostly Textures', 'Spectral, haunted, voice-like or airy tone.'),
('low_tones', 'Low Tones', 'Bass-heavy or sub-weight material.'),
('sparse_drones', 'Sparse Drones', 'Minimal sustained tones with space.'),
('dissonant_drones', 'Dissonant Drones', 'Unstable sustained tones.'),
('reversed', 'Reversed', 'Clearly reversed motion.'),
('reversed_sounds', 'Reversed Sounds', 'Reversed hits, tails, or phrases.'),
('sparse', 'Sparse', 'Few events, lots of silence or negative space.'),
('processed_field_recordings', 'Processed Field Recordings', 'Manipulated environmental recording.'),
('ominous_field_recordings', 'Ominous Field Recordings', 'Field recording with threatening atmosphere.'),
('reverberant_field_recordings', 'Reverberant Field Recordings', 'Space-heavy environmental recording.'),
('icy_field_recordings', 'Icy Field Recordings', 'Cold, sharp, wintery or glassy recording.'),
('nature_sounds', 'Nature Sounds', 'Recognizable natural environment.'),
('organic_percussion', 'Organic Percussion', 'Body, wood, stone, found-object percussion.'),
('mechanical', 'Mechanical', 'Machine-like motion or rhythm.'),
('metallic', 'Metallic', 'Metal source or metal-like resonance.'),
('impacts', 'Impacts', 'Hit, slam, boom, accent, transition impact.'),
('small_movements', 'Small Movements', 'Tiny gestures, clicks, cloth, close movement.'),
('soft_one_shots', 'Soft One-Shots', 'Gentle single sounds without harsh transient.'),
('voice_fragments', 'Voice Fragments', 'Breath, syllables, human fragments, non-lyrical voice.'),
('analog_textures', 'Analog Textures', 'Tape, synth, circuit, warm electronic material.'),
('intimate_recordings', 'Intimate Recordings', 'Close-mic, small-room, personal space.'),
('close_recordings', 'Close Recordings', 'Very close source perspective.'),
('small_room_sounds', 'Small Room Sounds', 'Indoor close spatial tone.'),
('wood', 'Wood', 'Wood source or woody resonance.'),
('stone', 'Stone', 'Stone, ceramic, mineral, hard natural surface.'),
('water', 'Water', 'Liquid, drip, stream, wet texture.'),
('wind', 'Wind', 'Air movement or wind-like noise.'),
('tape', 'Tape', 'Tape noise, wow, flutter, hiss, degraded medium.'),
('dust', 'Dust', 'Dry, granular, old, worn texture.'),
('ritual_drums', 'Ritual Drums', 'Ceremonial or trance-like percussion.'),
('subtle_noise', 'Subtle Noise', 'Low-level noise usable as bed.'),
('dark_ambience', 'Dark Ambience', 'Broad dark atmospheric background.'),
('transitions', 'Transitions', 'Swells, risers, falls, scene shifts.');
