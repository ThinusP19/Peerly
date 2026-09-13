import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarClock,
  Grid3x3,
  Lock,
  Pencil,
  RotateCcw,
  Sigma,
  Unlock,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DangerZone, UnexportedAcknowledgement } from "@/components/shared/DangerZone";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeLong, formatDeadline } from "@/lib/format";
import { useSession } from "@/lib/session";
import { allGroups, assessments, classes } from "@/mocks/data";
import {
  deleteAssessment,
  getAssessment,
  getSubmissions,
  hasUnexportedAssessmentData,
  setAssessmentStatus,
  updateAssessment,
} from "@/services/peerly";

export const Route = createFileRoute("/lecturer/assessments/$assessmentId/")({
  component: AssessmentDetailPage,
});

type PendingAction = "open" | "close" | "reopen" | null;

function AssessmentDetailPage() {
  const { assessmentId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, setActiveAssessmentId, setActiveClassId } = useSession();

  const assessmentQuery = useQuery({
    queryKey: ["assessment", assessmentId],
    queryFn: () => getAssessment(assessmentId),
  });
  const submissionsQuery = useQuery({
    queryKey: ["submissions", assessmentId],
    queryFn: () => getSubmissions(assessmentId),
  });

  const assessment = assessmentQuery.data;

  const [pending, setPending] = useState<PendingAction>(null);
  const [extendOpen, setExtendOpen] = useState(false);
  const [newClosesAt, setNewClosesAt] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Keep the header's context selector in step with whatever is being viewed.
  useEffect(() => {
    if (assessment) {
      setActiveAssessmentId(assessment.id);
      setActiveClassId(assessment.classId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment?.id]);

  if (assessmentQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <EmptyState
        title="We couldn't find that assessment"
        description="It may have been deleted, or it may belong to another lecturer's class."
        action={
          <Button asChild variant="outline">
            <Link to="/lecturer/assessments">Back to assessments</Link>
          </Button>
        }
      />
    );
  }

  const klass = classes.find((c) => c.id === assessment.classId);
  const groups = allGroups.filter((g) => assessment.groupIds.includes(g.id));
  const expected = groups.flatMap((g) => g.memberStudentIds).length;
  const submitted = (submissionsQuery.data ?? []).filter((s) => s.status === "submitted").length;
  const calculated = Boolean(assessment.calculatedAt);
  const unexported = hasUnexportedAssessmentData(assessment);

  const refresh = () => queryClient.invalidateQueries();

  return (
    <>
      <PageHeader
        title={assessment.name}
        backTo="/lecturer/assessments"
        backLabel="Assessments"
        description={
          klass ? `${klass.moduleCode} - ${klass.name} · ${klass.academicPeriod}` : undefined
        }
        actions={
          <Button asChild variant="outline">
            <Link
              to="/lecturer/assessments/$assessmentId/edit"
              params={{ assessmentId: assessment.id }}
            >
              <Pencil aria-hidden="true" />
              Edit setup
            </Link>
          </Button>
        }
      />

      {/* Status is the headline of this screen. */}
      <Card className="space-y-4 p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusBadge status={assessment.status} className="px-3 py-1 text-sm" />
            <p className="text-sm text-muted-foreground">
              {assessment.status === "draft"
                ? "Not visible to students yet."
                : assessment.status === "open"
                  ? `Students can submit until ${formatDateTimeLong(assessment.closesAt)} (${formatDeadline(assessment.closesAt)}).`
                  : `Closed on ${formatDateTimeLong(assessment.closesAt)}.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {assessment.status === "draft" ? (
              <Button onClick={() => setPending("open")}>
                <Unlock aria-hidden="true" />
                Open to students
              </Button>
            ) : null}

            {assessment.status === "open" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    const date = new Date(assessment.closesAt);
                    const pad = (v: number) => String(v).padStart(2, "0");
                    setNewClosesAt(
                      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,
                    );
                    setExtendOpen(true);
                  }}
                >
                  <CalendarClock aria-hidden="true" />
                  Extend deadline
                </Button>
                <Button variant="destructive" onClick={() => setPending("close")}>
                  <Lock aria-hidden="true" />
                  Close assessment
                </Button>
              </>
            ) : null}

            {assessment.status === "closed" ? (
              <Button variant="outline" onClick={() => setPending("reopen")}>
                <RotateCcw aria-hidden="true" />
                Re-open
              </Button>
            ) : null}
          </div>
        </div>

        {assessment.description ? (
          <p className="text-sm text-muted-foreground">{assessment.description}</p>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Groups" value={groups.length} icon={Users} />
        <StatCard label="Students" value={expected} />
        <StatCard
          label="Submitted"
          value={submitted}
          hint={expected ? `${expected - submitted} still outstanding` : undefined}
          tone={submitted === expected && expected > 0 ? "success" : "warning"}
          loading={submissionsQuery.isPending}
        />
        <StatCard
          label="Marks calculated"
          value={calculated ? "Yes" : "No"}
          hint={
            calculated
              ? `Run ${assessment.calculationRunId}`
              : "Enter every group's base mark first"
          }
          tone={calculated ? "success" : "default"}
        />
      </div>

      {assessment.status !== "draft" ? (
        <Card className="space-y-3 p-5 shadow-card">
          <h2 className="font-semibold text-foreground">Submission progress</h2>
          <ProgressBar
            value={submitted}
            max={expected}
            label={`${submitted} of ${expected} students submitted`}
            valueLabel={expected ? `${Math.round((submitted / expected) * 100)}%` : "0%"}
            tone={submitted === expected ? "success" : "warning"}
          />
        </Card>
      ) : null}

      <Card className="p-5 shadow-card">
        <h2 className="font-semibold text-foreground">Where to next</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Button asChild variant="outline" className="justify-start">
            <Link to="/lecturer/monitor">
              <BarChart3 aria-hidden="true" />
              Submission monitor
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link to="/lecturer/matrix">
              <Grid3x3 aria-hidden="true" />
              Evaluation matrix
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link to="/lecturer/marks">
              <Sigma aria-hidden="true" />
              Marks & calculation
            </Link>
          </Button>
        </div>
      </Card>

      <DangerZone
        title="Delete this assessment"
        description="Permanently removes it with every submission, rating, comment, base mark and calculated result."
        actionLabel="Delete assessment"
        onAction={() => {
          setAcknowledged(false);
          setDeleteOpen(true);
        }}
      />

      {/* --- Status change confirmations --- */}
      <ConfirmDialog
        open={pending === "open"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Open this assessment to students?"
        objectName={`${klass?.moduleCode ?? ""} · ${assessment.name}`}
        description={
          <p>
            All {expected} students in the {groups.length} selected{" "}
            {groups.length === 1 ? "group" : "groups"} will be able to rate their group members
            immediately, until {formatDateTimeLong(assessment.closesAt)}.
          </p>
        }
        consequence={
          <p>
            Once students start submitting, group membership for this class is locked until the
            assessment closes.
          </p>
        }
        confirmLabel="Open assessment"
        onConfirm={async () => {
          await setAssessmentStatus(assessment.id, "open");
          await refresh();
          toast.success(`“${assessment.name}” is now open to students.`);
          setPending(null);
        }}
      />

      <ConfirmDialog
        open={pending === "close"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Close this assessment now?"
        objectName={`${klass?.moduleCode ?? ""} · ${assessment.name}`}
        description={
          <p>
            Students will no longer be able to submit or change their ratings, even though the
            scheduled closing time is {formatDateTimeLong(assessment.closesAt)}.
          </p>
        }
        consequence={
          <p>
            {expected - submitted} of {expected} students haven't submitted yet. Their group members
            will be rated by fewer people, and they'll be flagged as not having submitted.
          </p>
        }
        destructive
        confirmLabel="Close assessment"
        onConfirm={async () => {
          await setAssessmentStatus(assessment.id, "closed");
          await refresh();
          toast.success(`“${assessment.name}” has been closed.`);
          setPending(null);
        }}
      />

      <ConfirmDialog
        open={pending === "reopen"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Re-open this assessment?"
        objectName={`${klass?.moduleCode ?? ""} · ${assessment.name}`}
        description={
          <p>
            Students will be able to submit and change their ratings again until{" "}
            {formatDateTimeLong(assessment.closesAt)}.
          </p>
        }
        consequence={
          calculated ? (
            <p>
              Marks have already been calculated for this assessment (run{" "}
              {assessment.calculationRunId}). Re-opening invalidates those results - you'll need to
              calculate again, and any exports you've already shared will be out of date.
            </p>
          ) : (
            <p>Re-opening is recorded in the audit log with your name against it.</p>
          )
        }
        destructive={calculated}
        confirmLabel="Re-open assessment"
        onConfirm={async () => {
          await setAssessmentStatus(assessment.id, "open");
          await refresh();
          toast.success(`“${assessment.name}” has been re-opened.`);
          setPending(null);
        }}
      />

      <ConfirmDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        title="Extend the closing time?"
        objectName={`${klass?.moduleCode ?? ""} · ${assessment.name}`}
        description={
          <p>
            It currently closes on {formatDateTimeLong(assessment.closesAt)}. Students who have
            already submitted keep their submission and can still amend it.
          </p>
        }
        confirmLabel="Extend deadline"
        onConfirm={async () => {
          if (!newClosesAt) return;
          await updateAssessment(assessment.id, { closesAt: new Date(newClosesAt).toISOString() });
          await refresh();
          toast.success(
            `“${assessment.name}” now closes ${formatDateTimeLong(new Date(newClosesAt).toISOString())}.`,
          );
        }}
      >
        <FormField label="New closing date and time" required>
          {(props) => (
            <Input
              {...props}
              type="datetime-local"
              value={newClosesAt}
              onChange={(event) => setNewClosesAt(event.target.value)}
            />
          )}
        </FormField>
      </ConfirmDialog>

      {/* --- Deletion (FR-28) --- */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this assessment permanently?"
        objectName={`${klass?.moduleCode ?? ""} · ${assessment.name}`}
        description={
          <p>
            This removes {submitted} submitted {submitted === 1 ? "evaluation" : "evaluations"} with
            all their ratings and comments
            {calculated ? ", the group base marks and the calculated marks" : ""}. Students will no
            longer see it.
          </p>
        }
        consequence={
          <p>
            This can't be undone. The audit log records that it was deleted and by whom, but none of
            its data.
          </p>
        }
        destructive
        confirmLabel="Delete assessment"
        confirmDisabled={unexported && !acknowledged}
        onConfirm={async () => {
          if (!user) return;
          const name = assessment.name;
          await deleteAssessment(assessment.id, user);
          const next = assessments.find((a) => a.classId === assessment.classId);
          if (next) setActiveAssessmentId(next.id);
          navigate({ to: "/lecturer/assessments" });
          void queryClient.invalidateQueries();
          toast.success(`“${name}” has been deleted.`);
        }}
      >
        {unexported ? (
          <UnexportedAcknowledgement
            subject="This assessment's"
            checked={acknowledged}
            onCheckedChange={setAcknowledged}
          />
        ) : null}
      </ConfirmDialog>
    </>
  );
}
