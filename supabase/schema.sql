-- ============================================================
-- Tuition teaching log — full database schema
--
-- Paste this whole file into Supabase → SQL Editor → Run.
--
-- Safe to run on an empty project OR on one that already has data. Every
-- statement is guarded, and the migration steps are written to be re-runnable:
-- constraints are dropped before being recreated, seeds skip rows that already
-- exist, and the widening updates only ever widen.
--
-- Class levels are integers so they sort and compare:
--   -3 = Hobby Centre, -2 = Nursery, -1 = LKG, 0 = UKG, 1..12 = Class 1..12
--   (see src/lib/grades.ts)
-- ============================================================

create extension if not exists "pgcrypto";


-- ============================================================
-- 1. Teachers
-- ============================================================
create table if not exists public.teachers (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Every new auth user automatically gets a teacher row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.teachers (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;   -- id is the primary key, so this always infers
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- 2. Subjects — one shared list for the whole tuition
-- ============================================================
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Which class levels this subject applies to. -1 = LKG, 0 = UKG.
  min_grade   int  not null default 1,
  max_grade   int  not null default 12,
  sort_order  int  not null default 0,
  active      boolean not null default true
);

-- Subject names are unique case-insensitively: a teacher typing "maths" must
-- not create a second subject beside "Maths", or the register grows two chips
-- meaning the same thing and every report splits down the middle.
--
-- This has to exist BEFORE the seeds at the bottom. Those use an untargeted
-- `on conflict do nothing`, which can only skip a row if there is some unique
-- index for it to violate. Without this, re-running the file would duplicate
-- every subject — and then this index could no longer be built.
--
-- If this line fails, case-variant duplicates already exist. Find them with:
--   select lower(trim(name)), count(*) from public.subjects
--   group by 1 having count(*) > 1;
create unique index if not exists subjects_name_lower_uniq
  on public.subjects (lower(trim(name)));


-- ============================================================
-- 3. Students — shared tuition-wide, not owned by one teacher
-- ============================================================
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- -1 = LKG, 0 = UKG, 1..12 = Class 1..12.
  grade       int  not null,
  school      text,
  active      boolean not null default true,
  created_by  uuid references public.teachers(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- The grade range is applied here rather than inline on the column, because
-- `create table if not exists` is a no-op on a database that already has the
-- table — an inline constraint would never reach it. Older databases carry
-- `check (grade between 1 and 12)`, which rejects the pre-primary years
-- outright — as does `between -1 and 12`, which predates Nursery, and
-- `between -2 and 12`, which predates the Hobby Centre.
--
-- Any existing check constraint mentioning grade is dropped by discovery, so
-- this works whatever Postgres happened to name it.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'students'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%grade%'
  loop
    execute format('alter table public.students drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.students
  add constraint students_grade_check check (grade between -3 and 12);

-- Stops two teachers creating a duplicate record for the same child. Partial,
-- so a retired student does not block re-adding the same name later.
create unique index if not exists students_name_grade_uniq
  on public.students (lower(trim(name)), grade) where active;


-- ============================================================
-- 4. Who teaches whom, and who wants to see which subjects
-- ============================================================
create table if not exists public.teacher_students (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (teacher_id, student_id)
);

-- Subjects stay ONE shared list. This only records which of them a teacher
-- wants to look at. No rows for a teacher = show everything, which is the right
-- default for someone taking a whole class rather than one subject across many.
create table if not exists public.teacher_subjects (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (teacher_id, subject_id)
);


-- ============================================================
-- 5. The daily log
-- ============================================================
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  -- restrict, not cascade: deleting a subject would destroy or orphan every
  -- lesson ever logged against it. Subjects are retired, never deleted.
  subject_id  uuid not null references public.subjects(id) on delete restrict,
  teacher_id  uuid not null references public.teachers(id) on delete cascade,
  taught_on   date not null,
  -- The chapter or topic covered, free text. Optional: logging that a subject
  -- happened stays one tap.
  note        text,
  created_at  timestamptz not null default now(),
  unique (student_id, subject_id, teacher_id, taught_on)
);

-- The `note` column was added after the first release.
alter table public.lessons add column if not exists note text;

create index if not exists lessons_date_idx    on public.lessons (taught_on desc);
create index if not exists lessons_student_idx on public.lessons (student_id, taught_on desc);


-- ============================================================
-- 6. Exams — per student, because every school sets its own
-- ============================================================
create table if not exists public.exams (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  -- null = a whole-school event with no single subject.
  subject_id  uuid references public.subjects(id) on delete cascade,
  title       text,
  exam_date   date not null,
  created_by  uuid references public.teachers(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (student_id, subject_id, exam_date)
);

create index if not exists exams_date_idx on public.exams (exam_date);


-- ============================================================
-- 6b. Attendance
--
-- Deliberately NOT per teacher. Whether a child turned up is a fact about the
-- child and the day, not about who taught them — two teachers marking the same
-- student would otherwise disagree. One row per student per day, so the unique
-- constraint below is what makes marking idempotent.
--
-- No row at all means "not marked yet", which is different from "absent". A
-- teacher who has not got to a student should not have them counted absent.
-- ============================================================
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  on_date     date not null,
  present     boolean not null,
  marked_by   uuid references public.teachers(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, on_date)
);

create index if not exists attendance_date_idx    on public.attendance (on_date desc);
create index if not exists attendance_student_idx on public.attendance (student_id, on_date desc);

-- ============================================================
-- 7. Row level security
--
-- One tuition, six trusted teachers: everyone can READ everything — that is
-- the point of a shared roster — but you can only edit or delete YOUR OWN
-- lesson entries.
-- ============================================================
alter table public.teachers         enable row level security;
alter table public.subjects         enable row level security;
alter table public.students         enable row level security;
alter table public.teacher_students enable row level security;
alter table public.teacher_subjects enable row level security;
alter table public.lessons          enable row level security;
alter table public.exams            enable row level security;
alter table public.attendance       enable row level security;

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

  -- teacher_subjects: likewise
  drop policy if exists tsub_read  on public.teacher_subjects;
  drop policy if exists tsub_write on public.teacher_subjects;
  create policy tsub_read  on public.teacher_subjects for select to authenticated using (true);
  create policy tsub_write on public.teacher_subjects for all    to authenticated
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

  -- attendance: shared like the roster is. Any teacher can mark any student,
  -- because whoever spots the empty chair is the one who should record it.
  drop policy if exists attendance_read  on public.attendance;
  drop policy if exists attendance_write on public.attendance;
  create policy attendance_read  on public.attendance for select to authenticated using (true);
  create policy attendance_write on public.attendance for all    to authenticated using (true) with check (true);
end $$;


-- ============================================================
-- 8. Seed subjects — edit these to match your tuition
--
-- `on conflict do nothing` carries NO column target on purpose. Naming one
-- makes Postgres infer a matching unique index and fail with 42P10 if it
-- cannot find an exact match. Untargeted, it simply skips any row that would
-- violate any unique constraint — which is what a seed wants, and which works
-- against the case-insensitive index created in section 2.
-- ============================================================
insert into public.subjects (name, min_grade, max_grade, sort_order) values
  ('Maths',           -3, 12,  1),
  ('English',         -3, 12,  2),
  ('Gujarati',        -3, 12,  3),
  ('Hindi',           -3, 12,  4),
  ('EVS',             -3, 12,  5),
  ('Science',         -3, 12,  6),
  ('Social Science',  -3, 12,  7),
  ('Sanskrit',        -3, 12,  8),
  ('Computer',        -3, 12,  9),
  ('Drawing',         -3, 12, 10),
  ('Rhymes',          -3, 12, 11),
  ('Handwriting',     -3, 12, 12)
on conflict do nothing;

-- Every subject is offered at every level, Hobby Centre through Class 12.
--
-- This is a deliberate choice, not a default: the tuition would rather see a
-- chip it does not need than lose one it does, and a teacher simply ignores
-- the chips that do not apply to the child in front of them.
--
-- NOTE: unlike the seed above, this overwrites ranges you have set by hand on
-- the Subjects screen. If you ever narrow a subject there and want it to stay
-- narrow, comment this block out before re-running this file.
update public.subjects
   set min_grade = -3, max_grade = 12
 where min_grade <> -3 or max_grade <> 12;


-- ============================================================
-- Done. Check what you ended up with:
--   select name, min_grade, max_grade, active from public.subjects order by sort_order;
-- ============================================================
