import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, Loader2, Sigma } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { useLecturerClasses } from "@/hooks/use-lecturer-context";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { ApiError } from "@/lib/api";
import {
  calculateMarks,
  getAssessment,
  getGroupMarks,
  getGroups,
  getOverrides,
  setGroupBaseMark,
  updateAssessment,
} from "@/services/peerly";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/lecturer/marks")({
  head: () => titleHead("Marks & calculation"),
  component: MarkEntryPage,
});

type RowState = "idle" | "saving" | "saved" | "error";

function MarkEntryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeAssessmentId, activeClassId } = useSession();
  const lecturerClasses = useLecturerClasses().data ?? [];
  const klass = lecturerClasses.find((c) => c.id === activeClassId);

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

  // FR-24: a recalculation lists every override it affects and asks what to do
  // with them. Read from the overrides themselves, not the results: after a
  // re-open or a changed base mark the results are no longer served, but the
  // overrides are still there and the server still asks about them.
  const overridesQuery = useQuery({
    queryKey: ["overrides", activeAssessmentId],
    queryFn: () => getOverrides(activeAssessmentId),
  });
  const overridden = overridesQuery.data ?? [];
  const maxMark = assessment?.maxMark ?? 100;
  const groups = (groupsQuery.data ?? []).filter((g) => assessment?.groupIds.includes(g.id));

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overrideChoice, setOverrideChoice] = useState<"keep" | "withdraw" | null>(null);

  // Seed the inputs once the saved marks arrive.
  /**
   * Forget everything when the assessment changes.
   *
   * Switching assessment in the top bar does not remount this screen, so the
   * marks typed into it survived the switch - and the effect below deliberately
   * refuses to overwrite what is already there, so the new assessment's marks
   * never loaded. One assessment's marks were shown under another's name, and
   * "entered", "still outstanding" and whether Calculate was enabled all came
   * from that stale state. Declared before the effect that repopulates, so the
   * clear is queued first and the repopulate sees an empty object.
   */
  useEffect(() => {
    setValues({});
    setErrors({});
    setStates({});
  }, [activeAssessmentId]);

  useEffect(() => {
    if (!marksQuery.data) return;
    setValues((current) => {
      // Not while the lecturer is part-way through typing: this query is
      // invalidated after every save, and rebuilding from the response would
      // throw away a row they had already moved on to.
      if (Object.keys(current).length) return current;
      return Object.fromEntries(
        marksQuery.data.map((mark) => [
          mark.groupId,
          mark.baseMark == null ? "" : String(mark.baseMark),
        ]),
      );
    });
  }, [marksQuery.data]);

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

    // Leaving a box without changing it saves nothing: there is nothing to
    // write, and every write is a permanent audit entry.
    const next = raw.trim() ? Number(raw) : null;
    const stored = marksQuery.data?.find((mark) => mark.groupId === groupId)?.baseMark ?? null;
    if (next === stored) return;

    setStates((current) => ({ ...current, [groupId]: "saving" }));
    try {
      const { invalidatedCalculation } = await setGroupBaseMark(activeAssessmentId, groupId, next);
      if (invalidatedCalculation) {
        // FR-13: the results no longer match the marks on record.
        await queryClient.invalidateQueries();
        toast.warning(
          "The marks calculated earlier are now out of date. Calculate again before you look at results or export.",
        );
      } else {
        await queryClient.invalidateQueries({ queryKey: ["group-marks", activeAssessmentId] });
      }
    } catch (error) {
      // Refused or unreachable: say so on the row rather than leaving it at
      // "Saving…" with a value on screen that was never stored.
      setErrors((current) => ({
        ...current,
        [groupId]:
          (error instanceof ApiError && error.field("baseMark")) ||
          (error instanceof Error && error.message) ||
          "That mark wasn't saved. Please try again.",
      }));
      setStates((current) => ({ ...current, [groupId]: "error" }));
      return;
    }
    setStates((current) => ({ ...current, [groupId]: "saved" }));
    setTimeout(() => setStates((current) => ({ ...current, [groupId]: "idle" })), 2000);
  };

  // A mark the server refused is on screen but not stored: it is not entered,
  // and counting it would offer a calculation the server would then refuse.
  const entered = groups.filter((group) => {
    const raw = values[group.id];
    return raw != null && raw.trim() !== "" && !validate(raw) && states[group.id] !== "error";
  });
  const outstanding = groups.length - entered.length;
  /**
   * BR-06: only a closed assessment is calculated.
   *
   * The server refuses otherwise, and a button that offers what the server will
   * refuse is worse than one that explains itself. Marks worked out while the
   * assessment is open change as more students submit, so anything published
   * from them would already be wrong.
   */
  const notClosed = Boolean(assessment) && assessment?.status !== "closed";
  const marksAllIn = groups.length > 0 && outstanding === 0;
  const canCalculate = marksAllIn && !notClosed;

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
              {/* On a phone the mark input must stay in view, so the member
                  count steps aside and the mark heading wraps. */}
              <TableHead className="hidden sm:table-cell">Members</TableHead>
              <TableHead className="whitespace-normal sm:w-56 sm:whitespace-nowrap">
                Base mark (out of {maxMark})
              </TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const raw = values[group.id] ?? "";
              // Also checked against the stored value itself, so a mark saved
              // before a rule applied - two decimals, or above a maximum that
              // was lowered since - says what is wrong with it, rather than
              // showing "Entered" while the counts above call it missing.
              const error = errors[group.id] || validate(raw);
              const state = states[group.id] ?? "idle";
              const inputId = `base-mark-${group.id}`;
              const errorId = `${inputId}-error`;
              const missing = !raw.trim();

              return (
                <TableRow key={group.id} className={cn(missing && "bg-warning-muted/30")}>
                  <TableCell className="font-semibold whitespace-nowrap text-foreground">
                    Group {group.groupNumber}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
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
                      className="w-24 rounded-lg tabular-nums sm:w-32"
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
                : notClosed && marksAllIn
                  ? "This assessment is still open"
                  : `${outstanding} ${outstanding === 1 ? "group is" : "groups are"} still missing a base mark`}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {canCalculate
                ? "Calculating produces one individual mark per student from their peer ratings."
                : notClosed && marksAllIn
                  ? "Close it before calculating. While it is open more students may still submit, and every mark would change."
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
            This replaces the marks from any previous calculation for this assessment. Re-opening
            the assessment afterwards invalidates the results again.
          </p>
        }
        confirmLabel="Calculate marks"
        confirmDisabled={overridden.length > 0 && overrideChoice === null}
        onConfirm={async () => {
          const run = await calculateMarks(
            assessment.id,
            overridden.length > 0 ? (overrideChoice ?? undefined) : undefined,
          );
          await updateAssessment(assessment.id, {
            calculatedAt: new Date().toISOString(),
            calculationRunId: run.calculationRunId,
          });
          await queryClient.invalidateQueries();
          toast.success(`Marks calculated for ${groups.length} groups.`);
          setOverrideChoice(null);
          navigate({ to: "/lecturer/results" });
        }}
      >
        {overridden.length > 0 ? (
          <fieldset className="space-y-3 rounded-lg border p-3 text-sm">
            <legend className="px-1 font-semibold">
              {overridden.length === 1
                ? "1 student has an override"
                : `${overridden.length} students have overrides`}
            </legend>
            <ul className="space-y-1 text-muted-foreground">
              {overridden.map((override) => (
                <li key={override.studentId}>
                  {override.name} {override.surname}: overridden to {formatMark(override.mark)} -{" "}
                  {override.reason}
                </li>
              ))}
            </ul>
            <RadioGroup
              value={overrideChoice ?? ""}
              onValueChange={(value) => setOverrideChoice(value as "keep" | "withdraw")}
              aria-label="What should happen to these overrides?"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="keep" id="overrides-keep" className="mt-0.5" />
                <Label htmlFor="overrides-keep" className="font-normal leading-snug">
                  Keep them. Each stays in force beside its new calculated mark.
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="withdraw" id="overrides-withdraw" className="mt-0.5" />
                <Label htmlFor="overrides-withdraw" className="font-normal leading-snug">
                  Withdraw them. The new calculated marks stand.
                </Label>
              </div>
            </RadioGroup>
          </fieldset>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
