import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Info, Lock, Pencil, UsersRound } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useClassRoster, useLecturerClasses } from "@/hooks/use-lecturer-context";
import { useSession } from "@/lib/session";

import { getAssessments, getGroups, getSubmissions } from "@/services/peerly";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/lecturer/groups/")({
  head: () => titleHead("Groups"),
  component: GroupsOverview,
});

function GroupsOverview() {
  const { activeClassId } = useSession();
  const lecturerClasses = useLecturerClasses().data ?? [];
  const { byId: roster } = useClassRoster(activeClassId);
  const klass = lecturerClasses.find((c) => c.id === activeClassId);

  const groups = useQuery({
    queryKey: ["groups", activeClassId],
    queryFn: () => getGroups(activeClassId),
  });
  const assessments = useQuery({
    queryKey: ["assessments", activeClassId],
    queryFn: () => getAssessments(activeClassId),
  });

  const openAssessment = (assessments.data ?? []).find((a) => a.status === "open");

  const openSubmissions = useQuery({
    queryKey: ["submissions", openAssessment?.id],
    queryFn: () => getSubmissions(openAssessment!.id),
    enabled: Boolean(openAssessment),
  });

  // Business rule: once students have started rating each other, moving people
  // between groups would invalidate ratings that already exist.
  const locked = Boolean(openAssessment && (openSubmissions.data?.length ?? 0) > 0);

  const list = groups.data ?? [];
  const totalStudents = list.reduce((sum, group) => sum + group.memberStudentIds.length, 0);
  const smallGroups = list.filter((group) => group.memberStudentIds.length < 2);

  const editButton = (
    <Button asChild disabled={locked} className="h-10 px-4">
      <Link to="/lecturer/groups/generate">
        <Pencil aria-hidden="true" />
        {list.length ? "Edit groups" : "Generate groups"}
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Groups"
        description={
          klass
            ? `Confirmed groups for ${klass.moduleCode} - ${klass.name}.`
            : "Select a class in the header to see its groups."
        }
        actions={
          locked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button disabled className="h-10 px-4">
                    <Lock aria-hidden="true" />
                    Editing locked
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Students have already started rating each other in “{openAssessment?.name}”. Close
                that assessment before changing group membership.
              </TooltipContent>
            </Tooltip>
          ) : (
            editButton
          )
        }
      />

      {locked ? (
        <Card className="flex gap-3 rounded-2xl border border-warning/25 p-5 shadow-card sm:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-muted text-warning">
            <Info className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">
              Groups are locked while an assessment runs
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              “{openAssessment?.name}” is open and {openSubmissions.data?.length} students have
              already submitted. Moving someone now would leave ratings pointing at a group they're
              no longer in.
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Groups" value={list.length} icon={UsersRound} loading={groups.isPending} />
        <StatCard label="Students allocated" value={totalStudents} loading={groups.isPending} />
        <StatCard
          label="Groups under 2 members"
          value={smallGroups.length}
          hint={
            smallGroups.length ? "Peer rating needs at least 2 members" : "All groups are viable"
          }
          tone={smallGroups.length ? "warning" : "success"}
          loading={groups.isPending}
        />
      </div>

      {groups.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No groups yet"
          description="Generate groups from the class list, then review and confirm the allocation."
          action={editButton}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((group) => {
            const members = group.memberStudentIds.map((id) => roster.get(id)).filter(Boolean);

            return (
              <Card
                key={group.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card"
              >
                <PanelHeader
                  title={`Group ${group.groupNumber}`}
                  actions={
                    group.memberStudentIds.length < 2 ? (
                      <StatusBadge status="conflict" label="Too small" />
                    ) : (
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {group.memberStudentIds.length} members
                      </span>
                    )
                  }
                />
                <ul className="flex-1 divide-y">
                  {members.map((member) => (
                    <li
                      key={member!.id}
                      className="flex items-baseline justify-between gap-3 px-5 py-2.5 sm:px-6"
                    >
                      <span className="min-w-0 text-sm break-words text-foreground">
                        {member!.name} {member!.surname}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {member!.studentNumber}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
