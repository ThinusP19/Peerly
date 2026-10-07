import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Info, UsersRound } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { GroupLeaderBadge } from "@/components/shared/GroupLeaderBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getStudentAssessments } from "@/services/peerly";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/student/group")({
  head: () => titleHead("My group"),
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
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
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
      <PageHeader
        title="My group"
        description="The people you'll be rating, and who'll be rating you."
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="You're not in a group yet"
          description="Your lecturer allocates groups before an assessment opens."
        />
      ) : (
        // A lone group keeps the full width; two or more pair up on xl.
        <div className={cn("grid gap-3", groups.length > 1 && "xl:grid-cols-2")}>
          {groups.map((view) => (
            <Card
              key={view.group.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card"
            >
              <PanelHeader
                eyebrow={`${view.klass.moduleCode} · ${view.klass.name}`}
                title={`Group ${view.group.groupNumber}`}
                description={view.group.groupName}
                actions={
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {view.members.length + 1} members
                  </span>
                }
              />

              <ul className="divide-y">
                <li className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {initials(user!.name, user!.surname)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold break-words text-foreground">
                      {user!.name} {user!.surname}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">You</span>
                  </span>
                  <GroupLeaderBadge leader={view.group.leaderStudentId === studentId} />
                </li>

                {view.members.map((member) => (
                  <li key={member.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {initials(member.name, member.surname)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold break-words text-foreground">
                        {member.name} {member.surname}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        You'll rate them
                      </span>
                    </span>
                    <GroupLeaderBadge leader={view.group.leaderStudentId === member.id} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Card className="flex items-start gap-3 rounded-2xl border-0 p-5 shadow-card sm:items-center sm:px-6">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Info className="size-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 text-sm text-foreground">
          Group members can't see what you rate them. Only your lecturer sees individual ratings.
        </p>
      </Card>
    </>
  );
}
