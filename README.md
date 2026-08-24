# Tuition Register

A daily teaching log for a mixed-grade tuition. Six teachers, **one shared student
roster**, one tap per subject taught. Installs to the phone home screen.

Stack: Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Row Level Security).
No Tailwind, no UI library — one hand-written stylesheet, so nothing to fight later.

---

## What it does

| Screen | Purpose |
|---|---|
| **Today** | Pick a date, tap subject chips per student. One tap = one logged lesson. Shows days since you last taught that subject, and days to that student's exam. |
| **Board** | One day, every teacher. What each colleague logged, who has not filed yet, who was absent — read-only, and shareable as a message. Replaces the evening WhatsApp round. |
| **Plan** | Ranked list of what to teach next — exam pressure + how long a student has gone without a subject. Not a fixed timetable, deliberately. |
| **Reports** | Per student, last-taught date and session count per subject over 7/30/90 days, colour-coded gaps, CSV export. |
| **Students** | Shared roster. Add a child, mark them as yours, enter their exam dates, copy one student's exam timetable to classmates from the same school. |

### Design decisions worth knowing

- **Classes run Nursery to Class 12.** Grades are integers so ordering and
  subject ranges work by plain comparison: Nursery is -2, LKG -1, UKG 0. See
  `src/lib/grades.ts` — and re-run `supabase/schema.sql` after any change there,
  because the students grade check constraint carries the same bound.
- **Students belong to the tuition, not to a teacher.** Each teacher marks which
  students are theirs. Two teachers teaching the same child see one record and one
  exam timetable — no duplicates, no split history.
- **Exam dates are per student**, because every child's school sets its own.
  The "copy to classmates" button makes entering a whole batch fast.
- **No auto-generated timetable.** A generated schedule breaks the first time a
  student is absent or a chapter runs long. The Plan screen ranks instead and
  re-sorts itself around whatever actually happened.
- **You can only edit your own log entries.** Enforced in the database (RLS), not
  just in the UI. Everyone can read everything — that's the point of a shared roster.

---

## 1. Supabase (about 10 minutes)

1. Create a project at supabase.com. Pick the Mumbai/Singapore region.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Authentication → Users → Add user** for each teacher (email + password, tick
   *Auto Confirm User*). In the User Metadata box put `{"name": "Bhakti"}` so their
   name appears in the app. Repeat for all six.
4. **Project Settings → API** → copy the Project URL and the `anon` public key.

Edit the seeded subject list at the bottom of `schema.sql` before running it, or
edit the `subjects` table later in the Supabase table editor. `min_grade` /
`max_grade` control which subjects appear for which class — that's why a Class 3
row shows EVS and a Class 7 row shows Science.

## 2. Run it locally

```bash
cp .env.local.example .env.local     # paste your URL + anon key
npm install
npm run dev                          # http://localhost:3000
```

Node 20 or newer.

## 3. Deploy

```bash
git init && git add . && git commit -m "tuition register"
# push to a private GitHub repo, then import it at vercel.com
```

In Vercel, add the two environment variables from `.env.local`. Deploy. Done.

## 4. Put it on the teachers' phones

- **Android / Chrome**: open the Vercel URL → menu → *Add to Home screen*. It
  installs as a real app: own icon, no browser bars.
- **iPhone / Safari**: open the URL → Share → *Add to Home Screen*.

Each teacher signs in once and stays signed in.

---

## Honest limitations

- **Offline logging is not supported.** The service worker caches the shell so the
  app opens without a network, but taps need a connection. Faking a save that
  might not land is worse than showing an error. If the tuition has bad signal,
  say so and this becomes the next thing to build (a local queue that syncs).
- **No attendance, no fees, no parent accounts.** Deliberately out of scope for v1.
  The schema leaves room: attendance is a table with `student_id, date, present`,
  and parent access would need a separate role and stricter RLS.
- **Any teacher can edit any student record and any exam date.** Fine for six
  people who know each other; wrong for a bigger centre. Tighten the
  `students_write` and `exams_write` policies in `schema.sql` if that changes.
- **Free-tier Supabase pauses a project after a week of no activity.** Daily use
  means you'll never hit it, but a long holiday break will need a click to resume.

---

## File map

```
supabase/schema.sql          tables, RLS policies, seed subjects
src/middleware.ts            auth guard on every route
src/app/page.tsx             Today (the screen that matters)
src/components/LogGrid.tsx   tap-to-log grid, optimistic
src/app/plan/page.tsx        ranking logic lives here, in score()
src/app/reports/page.tsx     coverage + CSV
src/app/students/page.tsx    roster + exam dates
src/app/actions.ts           every database write
src/app/globals.css          the whole design system
```
