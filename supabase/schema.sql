-- ============================================
-- NADZOR PWA - Supabase Schema
-- Run this in Supabase SQL Editor (idempotent)
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
  -- Observation severity flag
  record_status text default 'Normal' check (record_status in ('Normal', 'Critical')),
  -- Sequential visit number within a project (supervision diary reference, e.g. "Посета бр. 14")
  visit_number integer,
  -- GPS captured at visit time
  latitude double precision,
  longitude double precision,
  location_accuracy real,  -- metres
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Monthly report narratives (AI-generated technical narrative,
-- persisted per project + month so it is not regenerated on every session)
create table if not exists monthly_reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  -- Month key in 'YYYY-MM' format (matches the reports page filter)
  month text not null,
  summary text not null,
  generated_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, month)
);

-- Photos (linked to visits)
create table if not exists photos (
  id uuid primary key default uuid_generate_v4(),
  visit_id uuid references visits(id) on delete cascade,
  -- Compressed version (always present, used in-app and in reports)
  storage_url text not null,
  storage_path text,
  -- Full original upload (may be null for older records)
  hi_res_url text,
  hi_res_path text,
  caption text,
  -- Original image dimensions in pixels
  original_width integer,
  original_height integer,
  created_at timestamptz default now()
);

-- Project Documents
create table if not exists project_documents (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  storage_url text not null,
  storage_path text not null,
  size_bytes bigint,
  created_at timestamptz default now()
);

-- ============================================
-- AUTH DEFAULTS
-- user_id is stamped server-side from the JWT, so client inserts
-- never need to (and cannot falsely) set ownership.
-- ============================================
alter table projects        alter column user_id set default auth.uid();
alter table visits          alter column user_id set default auth.uid();
alter table monthly_reports alter column user_id set default auth.uid();

-- ============================================
-- MIGRATION: add new columns to existing tables
-- (idempotent — safe to run on an existing DB)
-- ============================================
alter table visits
  add column if not exists record_status text default 'Normal'
    check (record_status in ('Normal', 'Critical')),
  add column if not exists visit_number integer,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_accuracy real;

alter table photos
  add column if not exists hi_res_url text,
  add column if not exists hi_res_path text,
  add column if not exists original_width integer,
  add column if not exists original_height integer;

-- Backfill visit_number for existing rows (per project, ordered by date then created_at)
update visits v set visit_number = sub.rn
from (
  select id, row_number() over (partition by project_id order by date, created_at) as rn
  from visits
) sub
where v.id = sub.id and v.visit_number is null;

-- ============================================
-- MIGRATION: claim legacy ownerless rows
-- Pre-auth data has user_id = null, which RLS would hide forever.
-- Assign it to the FIRST user created in this instance (the firm owner).
-- Review before running on a multi-user instance.
-- ============================================
update projects set user_id = (select id from auth.users order by created_at limit 1)
  where user_id is null;
update visits set user_id = (select id from auth.users order by created_at limit 1)
  where user_id is null;
update monthly_reports set user_id = (select id from auth.users order by created_at limit 1)
  where user_id is null;

-- ============================================
-- INDEXES
-- ============================================
create index if not exists idx_visits_project_id on visits(project_id);
create index if not exists idx_visits_date on visits(date desc);
create index if not exists idx_visits_user_id on visits(user_id);
create index if not exists idx_visits_record_status on visits(record_status);
create index if not exists idx_visits_project_visit_number on visits(project_id, visit_number);
create index if not exists idx_photos_visit_id on photos(visit_id);
create index if not exists idx_projects_user_id on projects(user_id);
create index if not exists idx_project_documents_project_id on project_documents(project_id);
create index if not exists idx_monthly_reports_project_month on monthly_reports(project_id, month);

-- ============================================
-- STORAGE BUCKETS — PRIVATE
-- Photos and documents are served via short-lived signed URLs only.
-- ============================================
insert into storage.buckets (id, name, public)
values ('site-photos', 'site-photos', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do update set public = false;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table projects          enable row level security;
alter table visits            enable row level security;
alter table photos            enable row level security;
alter table monthly_reports   enable row level security;
alter table project_documents enable row level security;

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

drop policy if exists "Users can update photos of own visits" on photos;
create policy "Users can update photos of own visits" on photos
  for update using (
    exists (select 1 from visits where visits.id = photos.visit_id and visits.user_id = auth.uid())
  );

drop policy if exists "Users can delete photos of own visits" on photos;
create policy "Users can delete photos of own visits" on photos
  for delete using (
    exists (select 1 from visits where visits.id = photos.visit_id and visits.user_id = auth.uid())
  );

-- Monthly reports policies
drop policy if exists "Users can view own monthly reports" on monthly_reports;
create policy "Users can view own monthly reports" on monthly_reports
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own monthly reports" on monthly_reports;
create policy "Users can insert own monthly reports" on monthly_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own monthly reports" on monthly_reports;
create policy "Users can update own monthly reports" on monthly_reports
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own monthly reports" on monthly_reports;
create policy "Users can delete own monthly reports" on monthly_reports
  for delete using (auth.uid() = user_id);

-- Project documents policies (via project ownership)
drop policy if exists "Users can view documents of own projects" on project_documents;
create policy "Users can view documents of own projects" on project_documents
  for select using (
    exists (select 1 from projects where projects.id = project_documents.project_id and projects.user_id = auth.uid())
  );

drop policy if exists "Users can insert documents to own projects" on project_documents;
create policy "Users can insert documents to own projects" on project_documents
  for insert with check (
    exists (select 1 from projects where projects.id = project_documents.project_id and projects.user_id = auth.uid())
  );

drop policy if exists "Users can delete documents of own projects" on project_documents;
create policy "Users can delete documents of own projects" on project_documents
  for delete using (
    exists (select 1 from projects where projects.id = project_documents.project_id and projects.user_id = auth.uid())
  );

-- ============================================
-- STORAGE POLICIES — authenticated only
-- (drop every legacy public/anonymous policy first)
-- ============================================
drop policy if exists "Public can upload photos" on storage.objects;
drop policy if exists "Public can view photos" on storage.objects;
drop policy if exists "Public can delete photos" on storage.objects;
drop policy if exists "Public can upload documents" on storage.objects;
drop policy if exists "Public can view documents" on storage.objects;
drop policy if exists "Public can delete documents" on storage.objects;
drop policy if exists "Authenticated users can upload photos" on storage.objects;
drop policy if exists "Users can delete own photos" on storage.objects;

create policy "Authenticated can upload site photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-photos');

create policy "Authenticated can view site photos" on storage.objects
  for select to authenticated using (bucket_id = 'site-photos');

create policy "Authenticated can delete site photos" on storage.objects
  for delete to authenticated using (bucket_id = 'site-photos');

create policy "Authenticated can upload project documents" on storage.objects
  for insert to authenticated with check (bucket_id = 'project-documents');

create policy "Authenticated can view project documents" on storage.objects
  for select to authenticated using (bucket_id = 'project-documents');

create policy "Authenticated can delete project documents" on storage.objects
  for delete to authenticated using (bucket_id = 'project-documents');
