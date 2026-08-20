import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import Nav from "@/components/Nav";
import SubjectManager from "@/components/SubjectManager";
import type { Subject } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  const supabase = await createClient();
  const userId = await requireUserId();

  // Retired subjects are included here — this is the one screen where you can
  // see and restore them.
  const [{ data: subjects }, { data: mine }] = await Promise.all([
    supabase.from("subjects").select("*").order("active", { ascending: false }).order("sort_order"),
    supabase.from("teacher_subjects").select("subject_id").eq("teacher_id", userId),
  ]);

  return (
    <>
      <TopBar eyebrow="Shared list" title="Subjects" />
      <main className="wrap">
        <SubjectManager
          subjects={(subjects ?? []) as Subject[]}
          mySubjectIds={(mine ?? []).map((r) => r.subject_id as string)}
        />
      </main>
      <Nav />
    </>
  );
}
