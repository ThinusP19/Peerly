import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Eye, Info, Lock, Pencil, UsersRound } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useClassRoster, useLecturerContext } from "@/hooks/use-lecturer-context";

import { getEnrolmentRows, getGroups, getGroupsEditable } from "@/services/peerly";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/lecturer/groups/")({
  head: () => titleHead("Groups"),
  component: GroupsOverview,
});

function GroupsOverview() {
  const {
    classId,
    klass,
    assessment,
    assessments,
    isLoading: contextLoading,
  } = useLecturerContext();
  const { byId: roster } = useClassRoster(classId);

  const groups = useQuery({
    queryKey: ["groups", classId],
    queryFn: () => getGroups(classId),
    enabled: Boolean(classId),
  });
  const editability = useQuery({
    queryKey: ["groups-editable", classId],
    queryFn: () => getGroupsEditable(classId),
    enabled: Boolean(classId),
  });
  const enrolments = useQuery({
    queryKey: ["enrolments", classId],
    queryFn: () => getEnrolmentRows(classId),
    enabled: Boolean(classId),
  });
  const locked = editability.data?.editable !== true;
  const lockReason = editability.isError
    ? "Couldn't check whether groups can be edited. Refresh and try again."
    : editability.data?.reason;

  const classGroups = groups.data ?? [];
  const list = assessment
    ? classGroups.filter((group) => assessment.groupIds.includes(group.id))
    : assessments.length === 0 && !contextLoading
      ? classGroups
      : [];
  const loading = groups.isPending || contextLoading || (assessments.length > 0 && !assessment);
  const totalStudents = list.reduce((sum, group) => sum + group.memberStudentIds.length, 0);
  const smallGroups = list.filter((group) => group.memberStudentIds.length < 2);

  const classGroupsButton = (
    <Button asChild className="h-10 px-4">
      <Link to="/lecturer/groups/generate">
        <Pencil aria-hidden="true" />
        {classGroups.length ? "Regenerate class groups" : "Generate class groups"}
      </Link>
    </Button>
  );

  const assessmentButton = assessment ? (
    <Button asChild className="h-10 px-4">
      <Link
        to={
          assessment.status === "draft"
            ? "/lecturer/assessments/$assessmentId/edit"
            : "/lecturer/assessments/$assessmentId"
        }
        params={{ assessmentId: assessment.id }}
      >
        {assessment.status === "draft" ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {assessment.status === "draft" ? "Choose assessment groups" : "View assessment setup"}
      </Link>
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Groups"
        description={
          klass
            ? assessment
              ? `Groups in ${assessment.name} for ${klass.moduleCode} - ${klass.name}.`
              : `Confirmed groups for ${klass.moduleCode} - ${klass.name}.`
            : "Select a class in the header to see its groups."
        }
        actions={
          assessmentButton ??
          (locked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button disabled className="h-10 px-4">
                    <Lock aria-hidden="true" />
                    Class groups locked
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {lockReason ?? "Checking whether groups can be edited."}
              </TooltipContent>
            </Tooltip>
          ) : (
            classGroupsButton
          ))
        }
      />

      {assessment ? (
        <Card className="flex flex-col gap-4 rounded-2xl border border-warning/25 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Class group allocation</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {lockReason
                ? `This allocation is shared by every assessment in this class. ${lockReason}`
                : locked
                  ? "Checking whether class groups can be changed."
                  : "Regenerating class groups changes the allocation used by every assessment in this class."}
            </p>
          </div>
          {!locked ? classGroupsButton : null}
        </Card>
      ) : lockReason ? (
        <Card className="flex gap-3 rounded-2xl border border-warning/25 p-5 shadow-card sm:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-muted text-warning">
            <Info className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Groups cannot be changed</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{lockReason}</p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Groups" value={list.length} icon={UsersRound} loading={loading} />
        <StatCard label="Students allocated" value={totalStudents} loading={loading} />
        <StatCard
          label="Groups under 2 members"
          value={smallGroups.length}
          hint={
            smallGroups.length ? "Peer rating needs at least 2 members" : "All groups are viable"
          }
          tone={smallGroups.length ? "warning" : "success"}
          loading={loading}
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={assessment ? "No groups in this assessment" : "No groups yet"}
          description={
            assessment
              ? assessment.status === "draft"
                ? "Choose participating groups when editing this assessment."
                : "No groups are linked to this assessment."
              : "Generate groups from the class list, then review and confirm the allocation."
          }
          action={locked || assessment ? undefined : classGroupsButton}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((group) => {
            const members = group.memberStudentIds.map((id) => roster.get(id)).filter(Boolean);
            const pending = (enrolments.data ?? []).filter(
              (row) =>
                row.groupNumber === group.groupNumber &&
                (!row.userId || !group.memberStudentIds.includes(row.userId)),
            );

            return (
              <Card
                key={group.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card"
              >
                <PanelHeader
                  title={`Group ${group.groupNumber}`}
                  description={group.groupName}
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
                        {group.leaderStudentId === member!.id ? (
                          <Badge variant="secondary" className="ml-2">
                            Group leader
                          </Badge>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {member!.studentNumber}
                      </span>
                    </li>
                  ))}
                  {pending.map((row) => (
                    <li key={row.id} className="space-y-1 px-5 py-2.5 sm:px-6">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 text-sm break-words text-foreground">
                          {row.importedName} {row.importedSurname}
                          {group.leaderStudentNumber === row.studentNumber ? (
                            <Badge variant="secondary" className="ml-2">
                              Group leader
                            </Badge>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {row.studentNumber}
                        </span>
                      </div>
                      <StatusBadge
                        status={row.matchStatus}
                        label={
                          row.matchStatus === "matched"
                            ? "Assignment pending — groups locked"
                            : row.matchStatus === "conflict"
                              ? "Account conflict"
                              : "Awaiting registration"
                        }
                      />
                    </li>
                  ))}
                </ul>
                {pending.length ? (
                  <p className="border-t px-5 py-3 text-xs text-muted-foreground sm:px-6">
                    {pending.length} CSV assignments pending. Students join automatically when
                    matched to an account, while group editing is allowed. Pending students cannot
                    evaluate yet.
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
