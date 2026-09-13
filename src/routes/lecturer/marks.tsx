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

  // Seed the inputs once the saved marks arrive.
  useEffect(() => {
    if (!marksQuery.data) return;
    setValues((current) => {
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
  const canCalculate = groups.length > 0 && outstanding === 0;

  if (assessmentQuery.isPending || groupsQuery.isPending || marksQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
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
        title="Group marks & calculation"
        description={
          <>
            {klass?.moduleCode} · {assessment.name} · enter the mark each group earned for the work
            itself. Peerly then adjusts it per student using their peer ratings.
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
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

      <div className="w-full overflow-x-auto rounded-lg border bg-card shadow-card">
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
                  <TableCell className="font-medium whitespace-nowrap">
                    Group {group.groupNumber}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
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
                      className="w-32 tabular-nums"
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
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        Saving…
                      </span>
                    ) : state === "saved" ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-sm text-success"
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

      <Card className="flex flex-col gap-3 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2.5">
          {canCalculate ? (
            <Sigma className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          )}
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {canCalculate
                ? "Every group has a base mark"
                : `${outstanding} ${outstanding === 1 ? "group is" : "groups are"} still missing a base mark`}
            </p>
            <p className="text-muted-foreground">
              {canCalculate
                ? "Calculating produces one individual mark per student from their peer ratings."
                : "Calculation stays disabled until every group has a mark, so nobody ends up with a mark of zero by accident."}
            </p>
          </div>
        </div>

        <Button disabled={!canCalculate} onClick={() => setConfirmOpen(true)}>
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
          const run = await calculateMarks(assessment.id);
          await updateAssessment(assessment.id, {
            calculatedAt: new Date().toISOString(),
            calculationRunId: run.calculationRunId,
          });
          await queryClient.invalidateQueries();
          toast.success(`Marks calculated for ${groups.length} groups.`);
          navigate({ to: "/lecturer/results" });
        }}
      />
    </>
  );
}
