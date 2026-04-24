alter table listings add column if not exists tax_scheme text check (tax_scheme in ('margin', 'standard', 'private', 'unknown'));
create index if not exists listings_tax_scheme_idx on listings(tax_scheme);

create or replace view latest_deals as
select distinct on (listing_id) d.*, l.url, l.source, l.brand, l.model, l.ref, l.year, l.full_set, l.title, l.images, l.tax_scheme
from deals d
join listings l on l.id = d.listing_id
where l.active = true
order by listing_id, computed_at desc;

NOTIFY pgrst, 'reload schema';
