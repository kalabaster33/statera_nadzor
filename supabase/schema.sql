-- ============================================
-- NADZOR PWA - Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable extensions
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Projects (construction objects)
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  location text,
  client_info text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Visits (weekly site logs)
create table if not exists visits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  date date not null default current_date,
  weather text,
  notes text,
  ai_summary text,
  -- Lifecycle status: draft until engineer finalises for monthly report
  status text default 'draft' check (status in ('draft', 'final')),
  -- Observation severity flag (new)
  record_status text default 'Normal' check (record_status in ('Normal', 'Critical')),
  -- GPS captured at visit time (new)
  latitude double precision,
  longitude double precision,
  location_accuracy real,  -- metres
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Photos (linked to visits)
create table if not exists photos (
  id uuid primary key default uuid_generate_v4(),
  visit_id uuid references visits(id) on delete cascade,
  -- Compressed version (always present, used in-app and in reports)
  storage_url text not null,
  storage_path text,
  -- Full original upload (new — may be null for older records)
  hi_res_url text,
  hi_res_path text,
  caption text,
  -- Original image dimensions in pixels (new)
  original_width integer,
  original_height integer,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_visits_project_id on visits(project_id);
create index if not exists idx_visits_date on visits(date desc);
create index if not exists idx_visits_user_id on visits(user_id);
create index if not exists idx_visits_record_status on visits(record_status);
create index if not exists idx_photos_visit_id on photos(visit_id);
create index if not exists idx_projects_user_id on projects(user_id);

-- ============================================
-- MIGRATION: add new columns to existing tables
-- (safe to run on an existing DB — alter table
--  add column if not exists is idempotent)
-- ============================================
alter table visits
  add column if not exists record_status text default 'Normal'
    check (record_status in ('Normal', 'Critical')),
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_accuracy real;

alter table photos
  add column if not exists hi_res_url text,
  add column if not exists hi_res_path text,
  add column if not exists original_width integer,
  add column if not exists original_height integer;

-- ============================================
-- STORAGE BUCKET
-- ============================================
insert into storage.buckets (id, name, public)
values ('site-photos', 'site-photos', true)
on conflict (id) do nothing;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table projects enable row level security;
alter table visits enable row level security;
alter table photos enable row level security;

-- Projects policies
drop policy if exists "Users can view own projects" on projects;
create policy "Users can view own projects" on projects
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own projects" on projects;
create policy "Users can insert own projects" on projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own projects" on projects;
create policy "Users can update own projects" on projects
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own projects" on projects;
create policy "Users can delete own projects" on projects
  for delete using (auth.uid() = user_id);

-- Visits policies
drop policy if exists "Users can view own visits" on visits;
create policy "Users can view own visits" on visits
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own visits" on visits;
create policy "Users can insert own visits" on visits
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own visits" on visits;
create policy "Users can update own visits" on visits
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own visits" on visits;
create policy "Users can delete own visits" on visits
  for delete using (auth.uid() = user_id);

-- Photos policies (via visit ownership)
drop policy if exists "Users can view photos of own visits" on photos;
create policy "Users can view photos of own visits" on photos
  for select using (
    exists (select 1 from visits where visits.id = photos.visit_id and visits.user_id = auth.uid())
  );

drop policy if exists "Users can insert photos to own visits" on photos;
create policy "Users can insert photos to own visits" on photos
  for insert with check (
    exists (select 1 from visits where visits.id = photos.visit_id and visits.user_id = auth.uid())
  );

drop policy if exists "Users can delete photos of own visits" on photos;
create policy "Users can delete photos of own visits" on photos
  for delete using (
    exists (select 1 from visits where visits.id = photos.visit_id and visits.user_id = auth.uid())
  );

-- Storage policies
drop policy if exists "Authenticated users can upload photos" on storage.objects;
create policy "Authenticated users can upload photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-photos');

drop policy if exists "Public can view photos" on storage.objects;
create policy "Public can view photos" on storage.objects
  for select using (bucket_id = 'site-photos');

drop policy if exists "Users can delete own photos" on storage.objects;
create policy "Users can delete own photos" on storage.objects
  for delete to authenticated using (bucket_id = 'site-photos' and auth.uid()::text = (storage.foldername(name))[1]);


-- Indexes for performance
create index if not exists idx_visits_project_id on visits(project_id);
create index if not exists idx_visits_date on visits(date desc);
create index if not exists idx_visits_user_id on visits(user_id);
create index if not exists idx_photos_visit_id on photos(visit_id);
create index if not exists idx_projects_user_id on projects(user_id);

-- ============================================
-- STORAGE BUCKET
-- ============================================
insert into storage.buckets (id, name, public)
values ('site-photos', 'site-photos', true)
on conflict (id) do nothing;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table projects enable row level security;
alter table visits enable row level security;
alter table photos enable row level security;

-- Projects policies
drop policy if exists "Users can view own projects" on projects;
create policy "Users can view own projects" on projects
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own projects" on projects;
create policy "Users can insert own projects" on projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own projects" on projects;
create policy "Users can update own projects" on projects
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own projects" on projects;
create policy "Users can delete own projects" on projects
  for delete using (auth.uid() = user_id);

-- Visits policies
drop policy if exists "Users can view own visits" on visits;
create policy "Users can view own visits" on visits
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own visits" on visits;
create policy "Users can insert own visits" on visits
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own visits" on visits;
create policy "Users can update own visits" on visits
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own visits" on visits;
create policy "Users can delete own visits" on visits
  for delete using (auth.uid() = user_id);

-- Photos policies (via visit ownership)
drop policy if exists "Users can view photos of own visits" on photos;
create policy "Users can view photos of own visits" on photos
  for select using (
    exists (select 1 from visits where visits.id = photos.visit_id and visits.user_id = auth.uid())
  );

drop policy if exists "Users can insert photos to own visits" on photos;
create policy "Users can insert photos to own visits" on photos
  for insert with check (
    exists (select 1 from visits where visits.id = photos.visit_id and visits.user_id = auth.uid())
  );

drop policy if exists "Users can delete photos of own visits" on photos;
create policy "Users can delete photos of own visits" on photos
  for delete using (
    exists (select 1 from visits where visits.id = photos.visit_id and visits.user_id = auth.uid())
  );

-- Storage policies
drop policy if exists "Authenticated users can upload photos" on storage.objects;
create policy "Authenticated users can upload photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-photos');

drop policy if exists "Public can view photos" on storage.objects;
create policy "Public can view photos" on storage.objects
  for select using (bucket_id = 'site-photos');

drop policy if exists "Users can delete own photos" on storage.objects;
create policy "Users can delete own photos" on storage.objects
  for delete to authenticated using (bucket_id = 'site-photos' and auth.uid()::text = (storage.foldername(name))[1]);
