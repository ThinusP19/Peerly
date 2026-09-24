import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, Loader2, Sigma } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMark } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { classes } from "@/mocks/data";
import {
  calculateMarks,
  getAssessment,
  getGroupMarks,
  getGroups,
  setGroupBaseMark,
  updateAssessment,
} from "@/services/peerly";

export const Route = createFileRoute("/lecturer/marks")({
  component: MarkEntryPage,
});

type RowState = "idle" | "saving" | "saved" | "error";

function MarkEntryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeAssessmentId, activeClassId } = useSession();
  const klass = classes.find((c) => c.id === activeClassId);

  const assessmentQuery = useQuery({
    queryKey: ["assessment", activeAssessmentId],
    queryFn: () => getAssessment(activeAssessmentId),
  });
  const groupsQuery = useQuery({
    queryKey: ["groups", activeClassId],
    queryFn: () => getGroups(activeClassId),
  });
  const marksQuery = useQuery({
    queryKey: ["group-marks", activeAssessmentId],
    queryFn: () => getGroupMarks(activeAssessmentId),
  });

  const assessment = assessmentQuery.data;
  const maxMark = assessment?.maxMark ?? 100;
  const groups = (groupsQuery.data ?? []).filter((g) => assessment?.groupIds.includes(g.id));

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Seed the inputs once the saved marks for *this* assessment arrive, and
  // reseed whenever the lecturer switches to a different assessment - the
  // previous guard only seeded once ever, so switching assessments left the
  // old assessment's typed values on screen (see #6).
  const seededAssessmentId = useRef<string | null>(null);
  useEffect(() => {
    if (!marksQuery.data) return;
    if (seededAssessmentId.current === activeAssessmentId) return;
    seededAssessmentId.current = activeAssessmentId;
    setValues(
      Object.fromEntries(
        marksQuery.data.map((mark) => [
          mark.groupId,
          mark.baseMark == null ? "" : String(mark.baseMark),
        ]),
      ),
    );
    setErrors({});
    setStates({});
  }, [activeAssessmentId, marksQuery.data]);

  const validate = (raw: string): string | null => {
    if (!raw.trim()) return null; // blank simply means "not entered yet"
    const value = Number(raw);
    if (Number.isNaN(value)) return "Enter the mark as a number, for example 74 or 74.5.";
    if (value < 0) return "A mark can't be less than 0.";
    if (value > maxMark)
      return `This assessment is out of ${maxMark}, so the mark can't be higher.`;
    if (!/^\d+(\.\d)?$/.test(raw.trim()))
      return "Use whole numbers or one decimal place, e.g. 74.5.";
    return null;
  };

  const save = async (groupId: string, raw: string) => {
    const message = validate(raw);
    setErrors((current) => ({ ...current, [groupId]: message }));
    if (message) {
      setStates((current) => ({ ...current, [groupId]: "error" }));
      return;
    }

    setStates((current) => ({ ...current, [groupId]: "saving" }));
    await setGroupBaseMark(activeAssessmentId, groupId, raw.trim() ? Number(raw) : null);
    await queryClient.invalidateQueries({ queryKey: ["group-marks", activeAssessmentId] });
    setStates((current) => ({ ...current, [groupId]: "saved" }));
    setTimeout(() => setStates((current) => ({ ...current, [groupId]: "idle" })), 2000);
  };

  const entered = groups.filter((group) => {
    const raw = values[group.id];
    return raw != null && raw.trim() !== "" && !validate(raw);
  });
  const outstanding = groups.length - entered.length;
  // BR-06: calculation only runs once the assessment is closed - marks
  // calculated while it's still open could change before the deadline, and a
  // draft assessment has no real submissions to calculate from yet.
  const stillOpen = assessment?.status !== "closed";
  const canCalculate = groups.length > 0 && outstanding === 0 && !stillOpen;

  if (assessmentQuery.isPending || groupsQuery.isPending || marksQuery.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!assessment || groups.length === 0) {
    return (
      <>
        <PageHeader title="Marks & calculation" />
        <EmptyState
          icon={Sigma}
          title="Nothing to mark yet"
          description="Choose an assessment with confirmed groups in the header first."
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
        title="Marks & calculation"
        description={
          <>
            {klass?.moduleCode} · {assessment.name} · enter the mark each group earned for the work
            itself. Peerly then adjusts it per student using their peer ratings.
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Groups" value={groups.length} />
        <StatCard
          label="Marks entered"
          value={entered.length}
          tone={canCalculate ? "success" : "default"}
        />
        <StatCard
          label="Still outstanding"
          value={outstanding}
          hint={outstanding ? "Calculation is blocked until these are in" : "Ready to calculate"}
          tone={outstanding ? "warning" : "success"}
        />
      </div>

      {/* The Table primitive scrolls sideways inside its own wrapper. */}
      <div className="relative w-full overflow-hidden rounded-2xl bg-card shadow-card">
        <Table>
          <caption className="sr-only">Base mark for each group in this assessment</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Group</TableHead>
              <TableHead>Members</TableHead>
              <TableHead className="w-56">Base mark (out of {maxMark})</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const raw = values[group.id] ?? "";
              const error = errors[group.id];
              const state = states[group.id] ?? "idle";
              const inputId = `base-mark-${group.id}`;
              const errorId = `${inputId}-error`;
              const missing = !raw.trim();

              return (
                <TableRow key={group.id} className={cn(missing && "bg-warning-muted/30")}>
                  <TableCell className="font-semibold whitespace-nowrap text-foreground">
                    Group {group.groupNumber}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {group.memberStudentIds.length}
                  </TableCell>
                  <TableCell>
                    <label htmlFor={inputId} className="sr-only">
                      Base mark for group {group.groupNumber}, out of {maxMark}
                    </label>
                    <Input
                      id={inputId}
                      inputMode="decimal"
                      value={raw}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? errorId : undefined}
                      onChange={(event) => {
                        const next = event.target.value;
                        setValues((current) => ({ ...current, [group.id]: next }));
                        setErrors((current) => ({ ...current, [group.id]: validate(next) }));
                      }}
                      onBlur={(event) => save(group.id, event.target.value)}
                      className="w-32 rounded-lg tabular-nums"
                      placeholder="-"
                    />
                    {error ? (
                      <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
                        {error}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {state === "saving" ? (
                      <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        Saving…
                      </span>
                    ) : state === "saved" ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-success"
                        role="status"
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        Saved
                      </span>
                    ) : missing ? (
                      <StatusBadge status="outstanding" label="No mark yet" />
                    ) : error ? (
                      <StatusBadge status="conflict" label="Fix this mark" />
                    ) : (
                      <StatusBadge status="submitted" label="Entered" />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Card className="flex flex-col gap-4 rounded-2xl border-0 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              canCalculate ? "bg-accent text-accent-foreground" : "bg-warning-muted text-warning",
            )}
          >
            {canCalculate ? (
              <Sigma className="size-4" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">
              {canCalculate
                ? "Every group has a base mark"
                : `${outstanding} ${outstanding === 1 ? "group is" : "groups are"} still missing a base mark`}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {canCalculate
                ? "Calculating produces one individual mark per student from their peer ratings."
                : "Calculation stays disabled until every group has a mark, so nobody ends up with a mark of zero by accident."}
            </p>
          </div>
        </div>

        <Button
          disabled={!canCalculate}
          onClick={() => setConfirmOpen(true)}
          className="h-10 shrink-0 px-4"
        >
          <Sigma aria-hidden="true" />
          Calculate marks
        </Button>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Calculate individual marks?"
        objectName={`${klass?.moduleCode ?? ""} · ${assessment.name} · ${groups.length} groups`}
        description={
          <p>
            Each student's mark is their group's base mark adjusted by how their group rated them.
            Base marks in this run:{" "}
            {groups
              .map((group) => `Group ${group.groupNumber} ${formatMark(Number(values[group.id]))}`)
              .join(", ")}
            .
          </p>
        }
        consequence={
          <p>
            This replaces any marks from a previous calculation for this assessment, including
            overrides you've entered. Re-opening the assessment afterwards invalidates the results
            again.
          </p>
        }
        confirmLabel="Calculate marks"
       onConfirm={async () => {
  try {
    const run = await calculateMarks(assessment.id);

    await updateAssessment(assessment.id, {
      calculatedAt: new Date().toISOString(),
      calculationRunId: run.calculationRunId,
    });

    await queryClient.invalidateQueries();

    toast.success(
      `Marks calculated for ${groups.length} groups.`,
    );

    navigate({ to: "/lecturer/results" });
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : "Could not complete the calculation. Please try again.",
    );
  }
}}
      />
    </>
  );
}
