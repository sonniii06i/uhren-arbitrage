alter table listings add column if not exists discord_last_posted_at timestamptz;
alter table listings add column if not exists discord_last_posted_disc numeric(5,2);
create index if not exists listings_discord_posted_at_idx on listings(discord_last_posted_at);
NOTIFY pgrst, 'reload schema';
