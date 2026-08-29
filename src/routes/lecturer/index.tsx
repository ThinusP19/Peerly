import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  TriangleAlert,
  UploadCloud,
  Users,
  UsersRound,
} from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { submissionProgress } from "@/lib/domain";
import { formatDate, formatDeadline } from "@/lib/format";
import { useSession } from "@/lib/session";
import { allGroups, submissions } from "@/mocks/data";
import { getClassSummaries, type ClassSummary } from "@/services/peerly";

export const Route = createFileRoute("/lecturer/")({
  component: LecturerDashboard,
});

function LecturerDashboard() {
  const { user, setActiveClassId, setActiveAssessmentId } = useSession();
  const lecturerId = user!.id;

  const summaries = useQuery({
    queryKey: ["class-summaries", lecturerId],
    queryFn: () => getClassSummaries(lecturerId),
  });

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user!.name}`}
        description="Your classes and where each one stands. Pick a class to work in, or jump straight to what needs attention."
        actions={
          <Button asChild variant="outline">
            <Link to="/lecturer/classes/import">
              <UploadCloud aria-hidden="true" />
              Import a class list
            </Link>
          </Button>
        }
      />

      {summaries.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : (summaries.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="You don't have any classes yet"
          description="Import a class list to create your first class in Peerly."
          action={
            <Button asChild>
              <Link to="/lecturer/classes/import">Import a class list</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {summaries.data!.map((summary) => (
            <ClassCard
              key={summary.klass.id}
              summary={summary}
              onOpen={() => {
                setActiveClassId(summary.klass.id);
                if (summary.activeAssessment) setActiveAssessmentId(summary.activeAssessment.id);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ClassCard({ summary, onOpen }: { summary: ClassSummary; onOpen: () => void }) {
  const { klass, activeAssessment } = summary;
  const needsAttention = summary.unmatchedCount + summary.conflictCount;

  const groupsForAssessment = activeAssessment
    ? allGroups.filter((g) => activeAssessment.groupIds.includes(g.id))
    : [];
  const progress = activeAssessment
    ? submissionProgress(
        groupsForAssessment,
        submissions.filter((s) => s.assessmentId === activeAssessment.id),
      )
    : null;

  return (
    <Card className="flex flex-col gap-4 p-5 shadow-card">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {klass.academicPeriod}
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          {klass.moduleCode} — {klass.name}
        </h2>
      </div>

      <dl className="grid grid-cols-3 gap-3 rounded-md bg-muted/60 p-3 text-center">
        <div>
          <dt className="text-xs text-muted-foreground">Students</dt>
          <dd className="text-lg font-semibold tabular-nums text-foreground">
            {summary.studentCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Groups</dt>
          <dd className="text-lg font-semibold tabular-nums text-foreground">
            {summary.groupCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Assessments</dt>
          <dd className="text-lg font-semibold tabular-nums text-foreground">
            {summary.assessmentCount}
          </dd>
        </div>
      </dl>

      {needsAttention > 0 ? (
        <div className="flex gap-2.5 rounded-md border border-warning/30 bg-warning-muted p-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            {needsAttention} {needsAttention === 1 ? "student needs" : "students need"} attention on
            the class list — {summary.unmatchedCount} unmatched, {summary.conflictCount}{" "}
            conflicting.
          </p>
        </div>
      ) : null}

      <div className="flex-1 space-y-2 rounded-md border p-3">
        {activeAssessment ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {activeAssessment.status === "open" ? "Currently open" : "Next up"}
                </p>
                <p className="truncate font-medium text-foreground">{activeAssessment.name}</p>
              </div>
              <StatusBadge status={activeAssessment.status} />
            </div>

            {activeAssessment.status === "open" && progress ? (
              <ProgressBar
                value={progress.submitted}
                max={progress.total}
                size="sm"
                valueLabel={`${progress.submitted} of ${progress.total} submitted · closes ${formatDeadline(activeAssessment.closesAt)}`}
                tone={progress.outstanding > 0 ? "warning" : "success"}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Opens {formatDate(activeAssessment.opensAt)} · closes{" "}
                {formatDate(activeAssessment.closesAt)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No assessments yet for this class.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild onClick={onOpen}>
          <Link to="/lecturer/assessments">
            <ClipboardList aria-hidden="true" />
            Assessments
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" onClick={onOpen}>
          <Link to="/lecturer/classes">
            <Users aria-hidden="true" />
            Class list
          </Link>
        </Button>
        <Button asChild variant="outline" onClick={onOpen}>
          <Link to="/lecturer/groups">
            <UsersRound aria-hidden="true" />
            Groups
          </Link>
        </Button>
      </div>
    </Card>
  );
}
