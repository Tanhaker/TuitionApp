-- ============================================================
-- Tuition teaching log — full database schema
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run: everything is guarded with "if not exists".
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- teachers ----------
create table if not exists public.teachers (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- every new auth user automatically gets a teacher row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.teachers (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- subjects ----------
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  min_grade   int  not null default 1,
  max_grade   int  not null default 12,
  sort_order  int  not null default 0,
  active      boolean not null default true
);

-- ---------- students (shared across the whole tuition) ----------
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  grade       int  not null check (grade between 1 and 12),
  school      text,
  active      boolean not null default true,
  created_by  uuid references public.teachers(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- stops two teachers creating a duplicate record for the same child
create unique index if not exists students_name_grade_uniq
  on public.students (lower(trim(name)), grade) where active;

-- ---------- which teacher teaches which student ----------
create table if not exists public.teacher_students (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (teacher_id, student_id)
);

-- ---------- the daily log ----------
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  subject_id  uuid not null references public.subjects(id) on delete restrict,
  teacher_id  uuid not null references public.teachers(id) on delete cascade,
  taught_on   date not null,
  note        text,
  created_at  timestamptz not null default now(),
  unique (student_id, subject_id, teacher_id, taught_on)
);

create index if not exists lessons_date_idx    on public.lessons (taught_on desc);
create index if not exists lessons_student_idx on public.lessons (student_id, taught_on desc);

-- ---------- exams (per student, because every school differs) ----------
create table if not exists public.exams (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  subject_id  uuid references public.subjects(id) on delete cascade,
  title       text,
  exam_date   date not null,
  created_by  uuid references public.teachers(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (student_id, subject_id, exam_date)
);

create index if not exists exams_date_idx on public.exams (exam_date);

-- ============================================================
-- Row level security
-- One tuition, six trusted teachers: everyone can READ everything
-- (that is the point of shared students), but you can only edit
-- or delete YOUR OWN lesson entries.
-- ============================================================

alter table public.teachers         enable row level security;
alter table public.subjects         enable row level security;
alter table public.students         enable row level security;
alter table public.teacher_students enable row level security;
alter table public.lessons          enable row level security;
alter table public.exams            enable row level security;

do $$
begin
  -- teachers
  drop policy if exists teachers_read   on public.teachers;
  drop policy if exists teachers_update on public.teachers;
  create policy teachers_read   on public.teachers for select to authenticated using (true);
  create policy teachers_update on public.teachers for update to authenticated using (id = auth.uid());

  -- subjects
  drop policy if exists subjects_read  on public.subjects;
  drop policy if exists subjects_write on public.subjects;
  create policy subjects_read  on public.subjects for select to authenticated using (true);
  create policy subjects_write on public.subjects for all    to authenticated using (true) with check (true);

  -- students
  drop policy if exists students_read  on public.students;
  drop policy if exists students_write on public.students;
  create policy students_read  on public.students for select to authenticated using (true);
  create policy students_write on public.students for all    to authenticated using (true) with check (true);

  -- teacher_students: you manage your own links only
  drop policy if exists ts_read  on public.teacher_students;
  drop policy if exists ts_write on public.teacher_students;
  create policy ts_read  on public.teacher_students for select to authenticated using (true);
  create policy ts_write on public.teacher_students for all    to authenticated
    using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

  -- lessons: read all, write only your own
  drop policy if exists lessons_read   on public.lessons;
  drop policy if exists lessons_insert on public.lessons;
  drop policy if exists lessons_update on public.lessons;
  drop policy if exists lessons_delete on public.lessons;
  create policy lessons_read   on public.lessons for select to authenticated using (true);
  create policy lessons_insert on public.lessons for insert to authenticated with check (teacher_id = auth.uid());
  create policy lessons_update on public.lessons for update to authenticated using (teacher_id = auth.uid());
  create policy lessons_delete on public.lessons for delete to authenticated using (teacher_id = auth.uid());

  -- exams
  drop policy if exists exams_read  on public.exams;
  drop policy if exists exams_write on public.exams;
  create policy exams_read  on public.exams for select to authenticated using (true);
  create policy exams_write on public.exams for all    to authenticated using (true) with check (true);
end $$;

-- ============================================================
-- Seed subjects — edit these to match your tuition
-- ============================================================
insert into public.subjects (name, min_grade, max_grade, sort_order) values
  ('Maths',           1, 12,  1),
  ('English',         1, 12,  2),
  ('Gujarati',        1, 12,  3),
  ('Hindi',           3, 12,  4),
  ('EVS',             1,  5,  5),
  ('Science',         6, 12,  6),
  ('Social Science',  6, 12,  7),
  ('Sanskrit',        6, 12,  8),
  ('Computer',        3, 12,  9),
  ('Drawing',         1,  8, 10)
on conflict (name) do nothing;

-- ============================================================
-- Per-teacher subject filter
--
-- Subjects stay ONE shared list — "Maths" must be the same row for everyone or
-- coverage across two teachers stops adding up. This table only records which
-- of them a teacher wants to look at. No rows for a teacher = show everything,
-- which is the right default for someone taking a whole class.
-- ============================================================
create table if not exists public.teacher_subjects (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (teacher_id, subject_id)
);

alter table public.teacher_subjects enable row level security;

do $$
begin
  drop policy if exists tsub_read  on public.teacher_subjects;
  drop policy if exists tsub_write on public.teacher_subjects;
  create policy tsub_read  on public.teacher_subjects for select to authenticated using (true);
  create policy tsub_write on public.teacher_subjects for all    to authenticated
    using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
end $$;

-- Subject names are unique case-insensitively: a teacher typing "maths" must
-- not create a second subject alongside "Maths", or the register grows two
-- chips that mean the same thing and every report splits down the middle.
-- The plain unique constraint on (name) stays; this is strictly tighter.
--
-- If this line fails on an existing database, you already have case-variant
-- duplicates. Merge them first:
--   select lower(trim(name)), count(*) from public.subjects
--   group by 1 having count(*) > 1;
create unique index if not exists subjects_name_lower_uniq
  on public.subjects (lower(trim(name)));
