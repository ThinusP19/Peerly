import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, BellRing, CheckCircle2, Clock, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { formatDateTimeLong, formatDeadline } from "@/lib/format";
import { useLecturerClasses } from "@/hooks/use-lecturer-context";
import { useSession } from "@/lib/session";

import {
  getAssessment,
  getEnrolmentRows,
  getGroupProgress,
  sendSubmissionReminders,
  type GroupProgressRow,
} from "@/services/peerly";

export const Route = createFileRoute("/lecturer/monitor")({
  component: SubmissionMonitorPage,
});

function SubmissionMonitorPage() {
  const { activeAssessmentId, activeClassId } = useSession();
  const lecturerClasses = useLecturerClasses().data ?? [];
  const klass = lecturerClasses.find((c) => c.id === activeClassId);

  const assessmentQuery = useQuery({
    queryKey: ["assessment", activeAssessmentId],
    queryFn: () => getAssessment(activeAssessmentId),
  });
  const progressQuery = useQuery({
    queryKey: ["group-progress", activeAssessmentId],
    queryFn: () => getGroupProgress(activeAssessmentId),
  });
  const enrolmentsQuery = useQuery({
    queryKey: ["enrolment-rows", activeClassId],
    queryFn: () => getEnrolmentRows(activeClassId),
  });

  const [reminding, setReminding] = useState(false);

  const assessment = assessmentQuery.data;
  const rows = progressQuery.data ?? [];

  const total = rows.reduce((sum, row) => sum + row.members.length, 0);
  const submitted = rows.reduce((sum, row) => sum + row.submittedIds.length, 0);
  const outstanding = rows.flatMap((row) => row.outstanding);

  const needsResolution = (enrolmentsQuery.data ?? []).filter(
    (row) => row.matchStatus !== "matched",
  );

  const columns: Array<Column<GroupProgressRow>> = [
    {
      key: "group",
      header: "Group",
      sortValue: (row) => row.group.groupNumber,
      className: "font-semibold whitespace-nowrap text-foreground",
      cell: (row) => `Group ${row.group.groupNumber}`,
    },
    {
      key: "members",
      header: "Members",
      sortValue: (row) => row.members.length,
      align: "right",
      className: "tabular-nums",
      cell: (row) => row.members.length,
    },
    {
      key: "submitted",
      header: "Submitted",
      sortValue: (row) => row.submittedIds.length,
      align: "right",
      className: "tabular-nums",
      cell: (row) => row.submittedIds.length,
    },
    {
      key: "draft",
      header: "Started, not submitted",
      sortValue: (row) => row.draftIds.length,
      align: "right",
      className: "tabular-nums",
      cell: (row) =>
        row.draftIds.length ? (
          <span className="text-warning">{row.draftIds.length}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
    {
      key: "progress",
      header: "Progress",
      className: "min-w-40",
      sortValue: (row) => (row.members.length ? row.submittedIds.length / row.members.length : 0),
      cell: (row) => (
        <ProgressBar
          value={row.submittedIds.length}
          max={row.members.length}
          size="sm"
          valueLabel={`${row.submittedIds.length} of ${row.members.length}`}
          tone={row.outstanding.length === 0 ? "success" : "warning"}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "whitespace-nowrap",
      cell: (row) =>
        row.outstanding.length === 0 ? (
          <StatusBadge status="submitted" label="Complete" />
        ) : (
          <StatusBadge status="outstanding" label={`${row.outstanding.length} outstanding`} />
        ),
    },
  ];

  if (assessmentQuery.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <>
        <PageHeader title="Submission monitor" />
        <EmptyState
          title="No assessment selected"
          description="Choose a class and an assessment in the header to see who has submitted."
          action={
            <Button asChild variant="outline">
              <Link to="/lecturer/assessments">Go to assessments</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Submission monitor"
        description={
          <>
            {klass?.moduleCode} · {assessment.name} ·{" "}
            {assessment.status === "open"
              ? `closes ${formatDateTimeLong(assessment.closesAt)} (${formatDeadline(assessment.closesAt)})`
              : assessment.status === "closed"
                ? `closed ${formatDateTimeLong(assessment.closesAt)}`
                : "not open yet"}
          </>
        }
        actions={<StatusBadge status={assessment.status} className="px-3 py-1 text-sm" />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Submitted"
          value={submitted}
          hint={total ? `${Math.round((submitted / total) * 100)}% of the class` : undefined}
          icon={CheckCircle2}
          tone="success"
          loading={progressQuery.isPending}
        />
        <StatCard
          label="Outstanding"
          value={outstanding.length}
          hint={outstanding.length ? "Haven't submitted yet" : "Everyone is in"}
          icon={Clock}
          tone={outstanding.length ? "warning" : "success"}
          loading={progressQuery.isPending}
        />
        <StatCard
          label="Students in this assessment"
          value={total}
          icon={Users}
          loading={progressQuery.isPending}
        />
      </div>

      {needsResolution.length ? (
        <Card className="space-y-4 rounded-2xl border border-warning/25 p-5 shadow-card sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-muted text-warning">
                <AlertTriangle className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold text-foreground">
                  {needsResolution.length} class list{" "}
                  {needsResolution.length === 1 ? "entry needs" : "entries need"} resolving
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  These students aren't in a group, so they can't rate anyone and nobody can rate
                  them.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button asChild variant="outline" className="h-10 px-4">
                <Link to="/lecturer/classes">Resolve on the class list</Link>
              </Button>
            </div>
          </div>

          <ul className="divide-y rounded-xl border bg-card">
            {needsResolution.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {row.importedName} {row.importedSurname}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {row.studentNumber}
                  </p>
                </div>
                <StatusBadge status={row.matchStatus} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card">
        <PanelHeader
          title="Per-group breakdown"
          size="lg"
          count={progressQuery.isPending ? undefined : rows.length}
        />
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.group.id}
          loading={progressQuery.isPending}
          caption="Submission progress for each group"
          className="rounded-none shadow-none"
          empty={
            <EmptyState
              title="No groups in this assessment"
              description="Edit the assessment setup to choose which groups take part."
              className="rounded-none bg-transparent shadow-none"
            />
          }
        />
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card">
        <PanelHeader
          title="Outstanding students"
          count={progressQuery.isPending ? undefined : outstanding.length}
          description={
            outstanding.length
              ? "A reminder goes only to the students listed here."
              : "Everyone has submitted."
          }
          actions={
            <BusyButton
              busy={reminding}
              busyLabel="Sending…"
              disabled={outstanding.length === 0 || assessment.status !== "open"}
              className="h-10 px-4"
              onClick={async () => {
                setReminding(true);
                try {
                  // The count comes from the server, which decided who was
                  // outstanding. Reporting the length of the list on screen
                  // would be a guess, and wrong if it is a refetch behind.
                  const { sent } = await sendSubmissionReminders(assessment.id);
                  toast.success(
                    `Reminder sent to ${sent} outstanding ${sent === 1 ? "student" : "students"}.`,
                  );
                } catch (error) {
                  toast.error(
                    error instanceof ApiError
                      ? error.message
                      : "The reminders couldn't be sent. Please try again.",
                  );
                } finally {
                  setReminding(false);
                }
              }}
            >
              <BellRing aria-hidden="true" />
              Send reminder
            </BusyButton>
          }
        />

        {progressQuery.isPending ? (
          <div className="space-y-2 px-5 py-5 sm:px-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </div>
        ) : outstanding.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Every student in this assessment has submitted.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {rows.flatMap((row) =>
              row.outstanding.map((student) => (
                <li
                  key={student.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {student.name} {student.surname}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {student.studentNumber} · Group {row.group.groupNumber}
                    </p>
                  </div>
                  <StatusBadge
                    status={row.draftIds.includes(student.id) ? "in-progress" : "not-started"}
                  />
                </li>
              )),
            )}
          </ul>
        )}
      </Card>
    </>
  );
}
