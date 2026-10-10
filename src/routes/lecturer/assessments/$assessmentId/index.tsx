import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarClock,
  ChevronRight,
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
import { PanelHeader } from "@/components/shared/PanelHeader";
import { CalculationExplainer, ScaleEditor } from "@/components/shared/ScaleEditor";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { StatCard } from "@/components/shared/StatCard";
import { AssessmentStatusBadge } from "@/components/shared/AssessmentStatusBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { closedAtOf } from "@/lib/assessment-form";
import { formatDateTime, formatDateTimeLong, formatDeadline, isOverdue } from "@/lib/format";
import { useLecturerClasses } from "@/hooks/use-lecturer-context";
import { useSession } from "@/lib/session";

import {
  activateAssessment,
  closeAssessment,
  deleteAssessment,
  getAssessment,
  getAssessmentDeletionImpact,
  getAssessmentScale,
  getAssessments,
  getGroups,
  getSubmissions,
  reopenAssessment,
  updateAssessment,
  updateAssessmentScale,
  type ScaleChanges,
} from "@/services/peerly";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/lecturer/assessments/$assessmentId/")({
  head: () => titleHead("Assessment details"),
  component: AssessmentDetailPage,
});

type PendingAction = "open" | "close" | "reopen" | null;

const nextSteps = [
  { to: "/lecturer/monitor", label: "Submission monitor", icon: BarChart3 },
  { to: "/lecturer/matrix", label: "Evaluation matrix", icon: Grid3x3 },
  { to: "/lecturer/marks", label: "Marks & calculation", icon: Sigma },
] as const;

function AssessmentDetailPage() {
  const { assessmentId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, setActiveAssessmentId, setActiveClassId } = useSession();

  const assessmentQuery = useQuery({
    queryKey: ["assessment", assessmentId],
    queryFn: () => getAssessment(assessmentId),
  });
  // OR-19: the values this assessment will be calculated with.
  const scaleQuery = useQuery({
    queryKey: ["assessment-scale", assessmentId],
    queryFn: () => getAssessmentScale(assessmentId),
  });
  const saveScale = async (changes: ScaleChanges | null) => {
    const { scale, invalidatedCalculation } = await updateAssessmentScale(assessmentId, changes);
    queryClient.setQueryData(["assessment-scale", assessmentId], scale);
    if (invalidatedCalculation) {
      // FR-13: the calculated marks used the old values.
      await queryClient.invalidateQueries();
      toast.warning(
        "Rating values saved. The marks calculated earlier are now out of date, so calculate again before you look at results or export.",
      );
    } else {
      toast.success(
        changes
          ? "Rating values saved for this assessment."
          : "This assessment now uses the system defaults.",
      );
    }
  };
  // FR-28: whether deleting would lose the only copy of these results. Asked of
  // the server, because it is a fact about what is stored rather than about
  // what this screen happens to have loaded.
  //
  // Placed with the other hooks, above the early returns: React requires the
  // same hooks in the same order on every render, and the "not found" branch
  // below returns before this point.
  const impactQuery = useQuery({
    queryKey: ["assessment-impact", assessmentId],
    queryFn: () => getAssessmentDeletionImpact(assessmentId),
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

  // Hooks belong above the early returns below: React requires the same hooks
  // in the same order on every render, and both the loading and not-found
  // branches return before this point.
  const lecturerClasses = useLecturerClasses().data ?? [];
  const groupsQuery = useQuery({
    queryKey: ["groups", assessment?.classId],
    queryFn: () => getGroups(assessment!.classId),
    enabled: Boolean(assessment?.classId),
  });

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
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
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

  const klass = lecturerClasses.find((c) => c.id === assessment.classId);
  const groups = (groupsQuery.data ?? []).filter((g) => assessment.groupIds.includes(g.id));
  const expected = groups.flatMap((g) => g.memberStudentIds).length;
  const submitted = (submissionsQuery.data ?? []).filter((s) => s.status === "submitted").length;
  const calculated = Boolean(assessment.calculatedAt);
  const unexported = (impactQuery.data?.unexportedAssessments.length ?? 0) > 0;

  const refresh = () => queryClient.invalidateQueries();

  // BR-05: once the closing time has passed nobody can submit, whatever the
  // status says. Opening or re-opening then needs a new closing time, and the
  // server refuses without one.
  const deadlinePassed = isOverdue(assessment.closesAt);
  const newClosingIso = newClosesAt ? new Date(newClosesAt).toISOString() : "";
  const newClosingValid = Boolean(newClosesAt) && new Date(newClosesAt) > new Date();
  const closedAt = closedAtOf(assessment);
  const closedEarly = new Date(closedAt) < new Date(assessment.closesAt);

  const askForStatus = (action: Exclude<PendingAction, null>) => {
    setNewClosesAt("");
    setPending(action);
  };

  const newClosingField = (
    <FormField
      label="New closing date and time"
      required
      hint="Has to be in the future, so students have time to submit."
      error={
        newClosesAt && !newClosingValid
          ? "That time has already passed. Choose a later one."
          : undefined
      }
    >
      {(props) => (
        <Input
          {...props}
          type="datetime-local"
          value={newClosesAt}
          onChange={(event) => setNewClosesAt(event.target.value)}
        />
      )}
    </FormField>
  );

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
          <Button asChild variant="outline" className="h-10 px-4">
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

      {/* Status is the headline of this screen. The actions only sit beside the
          text on wide screens, where the long deadline sentence still fits. */}
      <Card className="flex flex-col gap-4 rounded-2xl border-0 p-5 shadow-card sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <AssessmentStatusBadge assessment={assessment} className="px-3 py-1 text-sm" />
            <p className="min-w-0 text-sm text-foreground">
              {assessment.status === "draft"
                ? "Not visible to students yet."
                : assessment.status === "open"
                  ? deadlinePassed
                    ? `The closing time passed on ${formatDateTimeLong(assessment.closesAt)}, so students can no longer submit. Extend the deadline to give them more time, or close it so you can calculate marks.`
                    : new Date(assessment.opensAt) > new Date()
                      ? `Students can see it now and submit from ${formatDateTimeLong(assessment.opensAt)} until ${formatDateTimeLong(assessment.closesAt)}.`
                      : `Students can submit until ${formatDateTimeLong(assessment.closesAt)} (${formatDeadline(assessment.closesAt)}).`
                  : closedEarly
                    ? `Closed on ${formatDateTimeLong(closedAt)}, before its scheduled closing time of ${formatDateTimeLong(assessment.closesAt)}.`
                    : `Closed on ${formatDateTimeLong(closedAt)}.`}
            </p>
          </div>
          {assessment.description ? (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{assessment.description}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {assessment.status === "draft" ? (
            <Button className="h-10 px-4" onClick={() => askForStatus("open")}>
              <Unlock aria-hidden="true" />
              Open to students
            </Button>
          ) : null}

          {assessment.status === "open" ? (
            <>
              <Button
                variant="outline"
                className="h-10 px-4"
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
              <Button
                variant="destructive"
                className="h-10 px-4"
                onClick={() => setPending("close")}
              >
                <Lock aria-hidden="true" />
                Close assessment
              </Button>
            </>
          ) : null}

          {assessment.status === "closed" ? (
            <Button variant="outline" className="h-10 px-4" onClick={() => askForStatus("reopen")}>
              <RotateCcw aria-hidden="true" />
              Re-open
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              ? `Calculated ${formatDateTime(assessment.calculatedAt!)}`
              : assessment.status === "closed"
                ? "Enter the group marks, then calculate on the Marks page"
                : "Close the assessment first, then calculate on the Marks page"
          }
          tone={calculated ? "success" : "default"}
        />
      </div>

      {assessment.status !== "draft" ? (
        <Card className="space-y-3 rounded-2xl border-0 p-5 shadow-card sm:px-6">
          <h2 className="text-base font-semibold text-foreground">Submission progress</h2>
          <ProgressBar
            value={submitted}
            max={expected}
            label={`${submitted} of ${expected} students submitted`}
            valueLabel={expected ? `${Math.round((submitted / expected) * 100)}%` : "0%"}
            tone={submitted === expected ? "success" : "warning"}
          />
        </Card>
      ) : null}

      {scaleQuery.data ? (
        <>
          <ScaleEditor
            scale={scaleQuery.data}
            title="Rating values for this assessment"
            description="The value behind each rating option when this assessment's marks are calculated. Students never see these. Change them here to differ from the system defaults for this assessment only."
            showDefaults
            onSave={(changes) => saveScale(changes)}
            onReset={() => saveScale(null)}
          />
          <CalculationExplainer scale={scaleQuery.data} />
        </>
      ) : null}

      <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card">
        <PanelHeader title="Where to next" />
        <ul className="divide-y">
          {nextSteps.map((step) => (
            <li key={step.to}>
              <Link
                to={step.to}
                className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50 sm:px-6"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <step.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                  {step.label}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
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
          deadlinePassed ? (
            <p>
              Its closing time, {formatDateTimeLong(assessment.closesAt)}, has already passed, so
              students couldn't submit anything. Choose a new closing time to open it.
            </p>
          ) : (
            <p>
              All {expected} students in the {groups.length} selected{" "}
              {groups.length === 1 ? "group" : "groups"} will be able to rate their group members{" "}
              {new Date(assessment.opensAt) > new Date()
                ? `from its opening time, ${formatDateTimeLong(assessment.opensAt)}. Until then they see it as coming up.`
                : "immediately"}
              {new Date(assessment.opensAt) > new Date()
                ? ` They can submit until ${formatDateTimeLong(assessment.closesAt)}.`
                : `, until ${formatDateTimeLong(assessment.closesAt)}.`}
            </p>
          )
        }
        consequence={
          <p>
            Once students start submitting, group membership for this class is locked until the
            assessment closes.
          </p>
        }
        confirmLabel="Open assessment"
        confirmDisabled={deadlinePassed && !newClosingValid}
        onConfirm={async () => {
          // A refusal is shown inside the dialog by ConfirmDialog itself.
          await activateAssessment(assessment.id, deadlinePassed ? newClosingIso : undefined);
          await refresh();
          toast.success(`“${assessment.name}” is now open to students.`);
          setPending(null);
        }}
      >
        {deadlinePassed ? newClosingField : null}
      </ConfirmDialog>

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
          await closeAssessment(assessment.id);
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
          deadlinePassed ? (
            <p>
              Its closing time, {formatDateTimeLong(assessment.closesAt)}, has already passed, so
              re-opening it as it is would let nobody submit. Choose a new closing time.
            </p>
          ) : (
            <p>
              Students will be able to submit and change their ratings again until{" "}
              {formatDateTimeLong(assessment.closesAt)}.
            </p>
          )
        }
        consequence={
          calculated ? (
            <p>
              Marks have already been calculated for this assessment
              {assessment.calculatedAt ? ` (${formatDateTime(assessment.calculatedAt)})` : ""}.
              Re-opening invalidates those results - you'll need to calculate again, and any exports
              you've already shared will be out of date.
            </p>
          ) : (
            <p>Re-opening is recorded in the audit log with your name against it.</p>
          )
        }
        destructive={calculated}
        confirmLabel="Re-open assessment"
        confirmDisabled={deadlinePassed && !newClosingValid}
        onConfirm={async () => {
          await reopenAssessment(assessment.id, deadlinePassed ? newClosingIso : undefined);
          await refresh();
          toast.success(`“${assessment.name}” has been re-opened.`);
          setPending(null);
        }}
      >
        {deadlinePassed ? newClosingField : null}
      </ConfirmDialog>

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
        // An extension has to move the closing time later; anything else isn't an extension.
        confirmDisabled={!newClosesAt || new Date(newClosesAt) <= new Date(assessment.closesAt)}
        onConfirm={async () => {
          await updateAssessment(assessment.id, { closesAt: new Date(newClosesAt).toISOString() });
          await refresh();
          toast.success(
            `“${assessment.name}” now closes ${formatDateTimeLong(new Date(newClosesAt).toISOString())}.`,
          );
        }}
      >
        <FormField
          label="New closing date and time"
          required
          hint="Has to be later than the current closing time."
          error={
            newClosesAt && new Date(newClosesAt) < new Date(assessment.closesAt)
              ? "That's earlier than the current closing time. Choose a later date."
              : undefined
          }
        >
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
          const next = (await getAssessments(assessment.classId)).find(
            (a) => a.id !== assessment.id,
          );
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
