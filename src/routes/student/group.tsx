import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Info, UsersRound } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/format";
import { useSession } from "@/lib/session";
import { getStudentAssessments } from "@/services/peerly";

export const Route = createFileRoute("/student/group")({
  component: MyGroupPage,
});

function MyGroupPage() {
  const { user } = useSession();
  const studentId = user!.id;

  const views = useQuery({
    queryKey: ["student-assessments", studentId],
    queryFn: () => getStudentAssessments(studentId),
  });

  if (views.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    );
  }

  // One card per class the student is grouped in, deduplicated by group.
  const seen = new Set<string>();
  const groups = (views.data ?? []).filter((view) => {
    if (seen.has(view.group.id)) return false;
    seen.add(view.group.id);
    return true;
  });

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My group</h1>
        <p className="text-sm text-muted-foreground">
          The people you'll be rating, and who'll be rating you.
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="You're not in a group yet"
          description="Your lecturer allocates groups before an assessment opens."
        />
      ) : (
        groups.map((view) => (
          <Card key={view.group.id} className="overflow-hidden shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-accent px-4 py-3 sm:px-5">
              <div>
                <p className="text-xs font-medium tracking-wide text-accent-foreground/70 uppercase">
                  {view.klass.moduleCode} · {view.klass.name}
                </p>
                <h2 className="text-base font-semibold text-accent-foreground">
                  Group {view.group.groupNumber}
                </h2>
              </div>
              <span className="text-sm font-medium text-accent-foreground">
                {view.members.length + 1} members
              </span>
            </div>

            <ul className="divide-y">
              <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {initials(user!.name, user!.surname)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {user!.name} {user!.surname}
                  </span>
                  <span className="block text-xs text-muted-foreground">You</span>
                </span>
              </li>

              {view.members.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {initials(member.name, member.surname)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {member.name} {member.surname}
                    </span>
                    <span className="block text-xs text-muted-foreground">You'll rate them</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      <div className="flex gap-2.5 rounded-md bg-muted p-3.5 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Group members can't see what you rate them. Only your lecturer sees individual ratings.
        </p>
      </div>
    </>
  );
}
