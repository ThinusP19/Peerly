import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Info, Lock, Pencil, UsersRound } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/lib/session";
import { classes, users } from "@/mocks/data";
import { getAssessments, getGroups, getSubmissions } from "@/services/peerly";

export const Route = createFileRoute("/lecturer/groups/")({
  component: GroupsOverview,
});

function GroupsOverview() {
  const { activeClassId } = useSession();
  const klass = classes.find((c) => c.id === activeClassId);

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
    <Button asChild disabled={locked}>
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
                  <Button disabled>
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
        <Card className="flex gap-2.5 border-warning/30 bg-warning-muted/40 p-4 shadow-card">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              Groups are locked while an assessment runs
            </p>
            <p className="mt-0.5 text-muted-foreground">
              “{openAssessment?.name}” is open and {openSubmissions.data?.length} students have
              already submitted. Moving someone now would leave ratings pointing at a group they're
              no longer in.
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-52 rounded-lg" />
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((group) => {
            const members = group.memberStudentIds
              .map((id) => users.find((u) => u.id === id))
              .filter(Boolean);

            return (
              <Card key={group.id} className="flex flex-col shadow-card">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                  <h2 className="font-semibold text-foreground">Group {group.groupNumber}</h2>
                  {group.memberStudentIds.length < 2 ? (
                    <StatusBadge status="conflict" label="Too small" />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {group.memberStudentIds.length} members
                    </span>
                  )}
                </div>
                <ul className="flex-1 divide-y">
                  {members.map((member) => (
                    <li
                      key={member!.id}
                      className="flex items-baseline justify-between gap-2 px-4 py-2.5"
                    >
                      <span className="text-sm text-foreground">
                        {member!.name} {member!.surname}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
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
