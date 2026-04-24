create table if not exists sold_listings (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('ebay','chrono24','chronext','uhren2000','marks','haegele')),
  source_listing_id text not null,
  url text,
  ref text not null,
  brand text,
  model text,
  year int,
  has_box boolean,
  has_papers boolean,
  full_set boolean generated always as (coalesce(has_box,false) and coalesce(has_papers,false)) stored,
  condition text,
  price_eur numeric(12,2) not null,
  title text,
  sold_at timestamptz,
  seen_at timestamptz not null default now(),
  unique (source, source_listing_id)
);

create index if not exists sold_listings_ref_idx on sold_listings(ref);
create index if not exists sold_listings_ref_year_idx on sold_listings(ref, year);
create index if not exists sold_listings_full_set_idx on sold_listings(full_set);
create index if not exists sold_listings_price_idx on sold_listings(price_eur);

alter table deals add column if not exists comparables jsonb;
alter table deals add column if not exists discord_posted_at timestamptz;

create or replace view latest_deals as
select distinct on (listing_id) d.*, l.url, l.source, l.brand, l.model, l.ref, l.year, l.full_set, l.title, l.images
from deals d
join listings l on l.id = d.listing_id
where l.active = true
order by listing_id, computed_at desc;
