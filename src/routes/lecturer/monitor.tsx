import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, BellRing, CheckCircle2, Clock, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeLong, formatDeadline } from "@/lib/format";
import { useSession } from "@/lib/session";
import { classes } from "@/mocks/data";
import {
  getAssessment,
  getEnrolmentRows,
  getGroupProgress,
  type GroupProgressRow,
} from "@/services/peerly";

export const Route = createFileRoute("/lecturer/monitor")({
  component: SubmissionMonitorPage,
});

function SubmissionMonitorPage() {
  const { activeAssessmentId, activeClassId } = useSession();
  const klass = classes.find((c) => c.id === activeClassId);

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
      className: "font-medium whitespace-nowrap",
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
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
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

      <div className="grid gap-4 sm:grid-cols-3">
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
        <Card className="space-y-3 border-warning/30 bg-warning-muted/30 p-4 shadow-card">
          <div className="flex gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">
                {needsResolution.length} class list{" "}
                {needsResolution.length === 1 ? "entry needs" : "entries need"} resolving
              </p>
              <p className="text-sm text-muted-foreground">
                These students aren't in a group, so they can't rate anyone and nobody can rate
                them.
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {needsResolution.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {row.importedName} {row.importedSurname}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">{row.studentNumber}</p>
                </div>
                <StatusBadge status={row.matchStatus} />
              </li>
            ))}
          </ul>

          <Button asChild variant="outline" size="sm">
            <Link to="/lecturer/classes">Resolve on the class list</Link>
          </Button>
        </Card>
      ) : null}

      <div>
        <h2 className="mb-3 font-semibold text-foreground">Per-group breakdown</h2>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.group.id}
          loading={progressQuery.isPending}
          caption="Submission progress for each group"
          empty={
            <EmptyState
              title="No groups in this assessment"
              description="Edit the assessment setup to choose which groups take part."
            />
          }
        />
      </div>

      <Card className="shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold text-foreground">Outstanding students</h2>
            <p className="text-sm text-muted-foreground">
              {outstanding.length
                ? "A reminder goes only to the students listed here."
                : "Everyone has submitted."}
            </p>
          </div>
          <BusyButton
            busy={reminding}
            busyLabel="Sending…"
            disabled={outstanding.length === 0 || assessment.status !== "open"}
            onClick={async () => {
              setReminding(true);
              await new Promise((resolve) => setTimeout(resolve, 900));
              setReminding(false);
              toast.success(
                `Reminder sent to ${outstanding.length} outstanding ${outstanding.length === 1 ? "student" : "students"}.`,
              );
            }}
          >
            <BellRing aria-hidden="true" />
            Send reminder
          </BusyButton>
        </div>

        {progressQuery.isPending ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </div>
        ) : outstanding.length === 0 ? (
          <div className="flex items-center gap-2.5 p-5 text-sm text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            Every student in this assessment has submitted.
          </div>
        ) : (
          <ul className="divide-y">
            {rows.flatMap((row) =>
              row.outstanding.map((student) => (
                <li
                  key={student.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {student.name} {student.surname}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
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
