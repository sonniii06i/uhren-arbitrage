create extension if not exists pgcrypto;

create table if not exists watches (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  ref text not null,
  tier text not null check (tier in ('fast_mover', 'mid', 'slow')),
  created_at timestamptz not null default now(),
  unique (brand, ref)
);

create index if not exists watches_ref_idx on watches(ref);
create index if not exists watches_tier_idx on watches(tier);

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('chrono24','ebay','chronext','uhren2000','marks','haegele')),
  source_listing_id text not null,
  url text not null,
  watch_id uuid references watches(id),
  brand text,
  model text,
  ref text,
  year int,
  has_box boolean,
  has_papers boolean,
  full_set boolean generated always as (coalesce(has_box,false) and coalesce(has_papers,false)) stored,
  condition text,
  price_eur numeric(12,2),
  currency text default 'EUR',
  seller_type text,
  seller_country text,
  title text,
  description text,
  images jsonb,
  raw jsonb,
  enriched_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  unique (source, source_listing_id)
);

create index if not exists listings_watch_idx on listings(watch_id);
create index if not exists listings_ref_year_idx on listings(ref, year);
create index if not exists listings_source_idx on listings(source);
create index if not exists listings_active_idx on listings(active) where active = true;

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  price_eur numeric(12,2) not null,
  seen_at timestamptz not null default now()
);

create index if not exists price_history_listing_idx on price_history(listing_id);

create table if not exists reference_prices (
  id uuid primary key default gen_random_uuid(),
  ref text not null,
  year_bucket int not null,
  full_set boolean not null,
  median_eur numeric(12,2) not null,
  p25_eur numeric(12,2),
  p75_eur numeric(12,2),
  sample_size int not null,
  computed_at timestamptz not null default now(),
  unique (ref, year_bucket, full_set)
);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  reference_price_eur numeric(12,2) not null,
  ask_price_eur numeric(12,2) not null,
  discount_pct numeric(5,2) not null,
  estimated_profit_eur numeric(12,2) not null,
  score numeric(5,2) not null,
  sample_size int not null,
  confidence text not null check (confidence in ('low','medium','high')),
  ai_flags jsonb,
  computed_at timestamptz not null default now()
);

create index if not exists deals_score_idx on deals(score desc);
create index if not exists deals_listing_idx on deals(listing_id);
create index if not exists deals_computed_idx on deals(computed_at desc);

create or replace view latest_deals as
select distinct on (listing_id) d.*, l.url, l.source, l.brand, l.model, l.ref, l.year, l.full_set, l.title
from deals d
join listings l on l.id = d.listing_id
where l.active = true
order by listing_id, computed_at desc;
