create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),

  constraint app_settings_key_format
    check (key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

insert into public.app_settings (key, value, description) values
(
  'free_launch_downloads_enabled',
  'false'::jsonb,
  'When true, authenticated users with free-launch access may download during the free launch phase. Keep false for local_owner and paid modes unless explicitly testing free launch.'
);

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,

  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  stripe_price_id        text,

  status                 public.subscription_status not null default 'free_launch_access',

  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_end              timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  unique (user_id)
);

create table public.entitlement_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles(id) on delete set null,
  subscription_id   uuid references public.subscriptions(id) on delete set null,

  stripe_event_id   text,
  stripe_event_type text,
  previous_status   public.subscription_status,
  new_status        public.subscription_status,
  payload           jsonb,

  created_at        timestamptz not null default now()
);

create table public.stripe_webhook_events (
  stripe_event_id   text primary key,
  event_type        text not null,
  processing_status public.webhook_processing_status not null default 'received',
  payload           jsonb not null,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  error_message     text
);
