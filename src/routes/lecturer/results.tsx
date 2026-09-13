import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Download, PencilLine, ScrollText, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { FlagList } from "@/components/shared/FlagBadge";
import { FormField } from "@/components/shared/FormField";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTimeLong, formatFactor, formatMark } from "@/lib/format";
import { useSession } from "@/lib/session";
import { classes } from "@/mocks/data";
import {
  getAssessment,
  getRatingOptions,
  getResultRows,
  overrideMark,
  type ResultRow,
} from "@/services/peerly";

export const Route = createFileRoute("/lecturer/results")({
  component: ResultsPage,
});

type Filter = "all" | "flagged" | "overridden";

function ResultsPage() {
  const { user, activeAssessmentId, activeClassId } = useSession();
  const klass = classes.find((c) => c.id === activeClassId);
  const queryClient = useQueryClient();

  const assessmentQuery = useQuery({
    queryKey: ["assessment", activeAssessmentId],
    queryFn: () => getAssessment(activeAssessmentId),
  });
  const rowsQuery = useQuery({
    queryKey: ["result-rows", activeAssessmentId],
    queryFn: () => getResultRows(activeAssessmentId),
  });
  const optionsQuery = useQuery({ queryKey: ["rating-options"], queryFn: getRatingOptions });

  const [filter, setFilter] = useState<Filter>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [drillDown, setDrillDown] = useState<ResultRow | null>(null);
  const [overriding, setOverriding] = useState<ResultRow | null>(null);

  const all = useMemo(() => rowsQuery.data ?? [], [rowsQuery.data]);
  const assessment = assessmentQuery.data;

  const groupNumbers = useMemo(
    () => Array.from(new Set(all.map((row) => row.group.groupNumber))).sort((a, b) => a - b),
    [all],
  );

  const rows = useMemo(
    () =>
      all.filter((row) => {
        if (filter === "flagged" && row.result.flags.length === 0) return false;
        if (filter === "overridden" && !row.result.override) return false;
        if (groupFilter !== "all" && String(row.group.groupNumber) !== groupFilter) return false;
        return true;
      }),
    [all, filter, groupFilter],
  );

  const finalMarkOf = (row: ResultRow) => row.result.override?.mark ?? row.result.finalMark;

  const meanFactor = all.length
    ? all.reduce((sum, row) => sum + row.result.adjustmentFactor, 0) / all.length
    : 0;
  const meanFinal = all.length
    ? all.reduce((sum, row) => sum + finalMarkOf(row), 0) / all.length
    : 0;
  const submittedCount = all.filter((row) => !row.result.flags.includes("no-submission")).length;

  const columns: Array<Column<ResultRow>> = [
    {
      key: "student",
      header: "Student",
      sortValue: (row) => `${row.student.surname} ${row.student.name}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold whitespace-nowrap text-foreground">
            {row.student.name} {row.student.surname}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {row.student.studentNumber}
          </p>
        </div>
      ),
    },
    {
      key: "group",
      header: "Group",
      sortValue: (row) => row.group.groupNumber,
      className: "whitespace-nowrap",
      cell: (row) => `Group ${row.group.groupNumber}`,
    },
    {
      key: "mean",
      header: "Mean received",
      sortValue: (row) => row.result.meanReceived,
      align: "right",
      className: "tabular-nums",
      cell: (row) => formatMark(row.result.meanReceived),
    },
    {
      key: "factor",
      header: "Adjustment",
      sortValue: (row) => row.result.adjustmentFactor,
      align: "right",
      className: "tabular-nums",
      cell: (row) => `× ${formatFactor(row.result.adjustmentFactor)}`,
    },
    {
      key: "base",
      header: "Group mark",
      sortValue: (row) => row.baseMark ?? -1,
      align: "right",
      className: "tabular-nums",
      cell: (row) =>
        row.baseMark == null ? (
          <span className="text-warning">Not entered</span>
        ) : (
          formatMark(row.baseMark)
        ),
    },
    {
      key: "final",
      header: "Final mark",
      sortValue: (row) => finalMarkOf(row),
      align: "right",
      className: "whitespace-nowrap tabular-nums font-semibold",
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {row.result.override ? (
            <span className="text-xs text-muted-foreground line-through">
              {formatMark(row.result.finalMark)}
            </span>
          ) : null}
          <span className={row.result.override ? "text-primary" : "text-foreground"}>
            {formatMark(finalMarkOf(row))}
          </span>
        </span>
      ),
    },
    {
      key: "override",
      header: "Overridden",
      sortValue: (row) => (row.result.override ? 1 : 0),
      cell: (row) =>
        row.result.override ? (
          // Same pill and "info" tone as StatusBadge.
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-accent px-2 py-0.5 text-xs font-medium whitespace-nowrap text-accent-foreground">
            <PencilLine className="size-3.5 shrink-0" aria-hidden="true" />
            Overridden
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">No</span>
        ),
    },
    {
      key: "flags",
      header: "Flags",
      cell: (row) => <FlagList flags={row.result.flags} />,
    },
  ];

  if (assessmentQuery.isPending || rowsQuery.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!assessment || all.length === 0) {
    return (
      <>
        <PageHeader title="Results" />
        <EmptyState
          icon={ScrollText}
          title="No results yet"
          description="Enter a base mark for every group and calculate marks - the individual results will appear here."
          action={
            <Button asChild>
              <Link to="/lecturer/marks">Go to marks & calculation</Link>
            </Button>
          }
        />
      </>
    );
  }

  const filtersApplied = filter !== "all" || groupFilter !== "all";

  return (
    <>
      <PageHeader
        title="Results"
        description={
          <>
            {klass?.moduleCode} · {assessment.name} · one individual mark per student. Click a row
            to see the ratings behind it.
          </>
        }
        actions={
          <Button asChild className="h-10 px-4">
            <Link to="/lecturer/export">
              <Download aria-hidden="true" />
              Export
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Submission rate"
          value={all.length ? `${Math.round((submittedCount / all.length) * 100)}%` : "-"}
          hint={`${submittedCount} of ${all.length} students submitted`}
          icon={Users}
          tone={submittedCount === all.length ? "success" : "warning"}
        />
        <StatCard
          label="Mean adjustment factor"
          value={formatFactor(meanFactor)}
          hint="1.00 means the group mark is unchanged"
          icon={TrendingUp}
        />
        <StatCard label="Mean final mark" value={formatMark(meanFinal)} />
        <StatCard
          label="Flagged students"
          value={all.filter((row) => row.result.flags.length > 0).length}
          hint="Worth a look before you publish"
          tone="warning"
        />
      </div>

      {/* One panel: the filter toolbar, then the results table flush beneath it. */}
      <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
        <div className="flex flex-col gap-3 border-b px-5 py-3 sm:flex-row sm:items-center sm:px-6">
          <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-52" aria-label="Filter results">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All students</SelectItem>
              <SelectItem value="flagged">Flagged only</SelectItem>
              <SelectItem value="overridden">Overridden only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-44" aria-label="Filter by group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groupNumbers.map((number) => (
                <SelectItem key={number} value={String(number)}>
                  Group {number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
            Showing {rows.length} of {all.length} students
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.student.id}
          onRowClick={setDrillDown}
          caption="Individual results for this assessment"
          className="rounded-none shadow-none"
          empty={
            <EmptyState
              title="No students match those filters"
              action={
                filtersApplied ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFilter("all");
                      setGroupFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
              className="rounded-none bg-transparent shadow-none"
            />
          }
        />
      </Card>

      {/* Drill-down: the ratings that produced this student's mark. */}
      <Sheet open={Boolean(drillDown)} onOpenChange={(open) => !open && setDrillDown(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {drillDown ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {drillDown.student.name} {drillDown.student.surname}
                </SheetTitle>
                <SheetDescription>
                  {drillDown.student.studentNumber} · Group {drillDown.group.groupNumber} ·{" "}
                  {assessment.name}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-5">
                <dl className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      Mean received
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-foreground tabular-nums">
                      {formatMark(drillDown.result.meanReceived)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      Adjustment factor
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-foreground tabular-nums">
                      × {formatFactor(drillDown.result.adjustmentFactor)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      Group base mark
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-foreground tabular-nums">
                      {formatMark(drillDown.baseMark)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      Final mark
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-primary tabular-nums">
                      {formatMark(finalMarkOf(drillDown))}
                    </dd>
                  </div>
                </dl>

                {drillDown.result.override ? (
                  <div className="space-y-1.5 rounded-xl border border-primary/25 bg-accent p-4 text-sm">
                    <p className="font-semibold text-accent-foreground">
                      Overridden from {formatMark(drillDown.result.finalMark)} to{" "}
                      {formatMark(drillDown.result.override.mark)}
                    </p>
                    <p className="text-muted-foreground">“{drillDown.result.override.reason}”</p>
                    <p className="text-xs text-muted-foreground">
                      {drillDown.result.override.by} ·{" "}
                      {formatDateTimeLong(drillDown.result.override.at)}
                    </p>
                  </div>
                ) : null}

                {drillDown.result.flags.length ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Flags</h3>
                    <FlagList flags={drillDown.result.flags} />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Ratings this student received ({drillDown.received.length})
                  </h3>
                  {drillDown.received.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nobody in this group rated this student.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-xl border">
                      {drillDown.received.map((entry) => {
                        const option = (optionsQuery.data ?? []).find(
                          (o) => o.id === entry.ratingOptionId,
                        );
                        return (
                          <li key={entry.evaluator.id} className="space-y-2 px-4 py-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-sm text-muted-foreground">
                                from {entry.evaluator.name} {entry.evaluator.surname}
                              </p>
                              <p className="text-sm font-semibold text-foreground">
                                {option?.label}{" "}
                                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                                  ({option?.hiddenValue})
                                </span>
                              </p>
                            </div>
                            {entry.comment ? (
                              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                                “{entry.comment}”
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <Button
                  className="h-10 w-full"
                  onClick={() => {
                    setOverriding(drillDown);
                    setDrillDown(null);
                  }}
                >
                  <PencilLine aria-hidden="true" />
                  Override mark
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <OverrideDialog
        row={overriding}
        actorName={`${user?.name} ${user?.surname}`}
        assessmentId={activeAssessmentId}
        onClose={() => setOverriding(null)}
        onSaved={() => queryClient.invalidateQueries()}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Override dialog
 * ------------------------------------------------------------------ */

function OverrideDialog({
  row,
  actorName,
  assessmentId,
  onClose,
  onSaved,
}: {
  row: ResultRow | null;
  actorName: string;
  assessmentId: string;
  onClose: () => void;
  onSaved: () => void | Promise<unknown>;
}) {
  const [mark, setMark] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ mark?: string; reason?: string }>({});
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (row && loadedFor !== row.student.id) {
    setLoadedFor(row.student.id);
    setMark(row.result.override ? String(row.result.override.mark) : "");
    setReason(row.result.override?.reason ?? "");
    setErrors({});
  }

  const calculated = row?.result.finalMark ?? 0;
  const reasonGiven = reason.trim().length > 0;

  const handleSave = async () => {
    if (!row) return;

    const next: { mark?: string; reason?: string } = {};
    const value = Number(mark);
    if (!mark.trim()) {
      next.mark = "Enter the mark you want this student to receive.";
    } else if (Number.isNaN(value)) {
      next.mark = "Enter the mark as a number, for example 52 or 52.5.";
    } else if (value < 0 || value > 100) {
      next.mark = "A final mark has to be between 0 and 100.";
    }
    if (!reasonGiven) {
      next.reason = "Explain why you're changing this mark - it's kept in the audit log.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    await overrideMark(assessmentId, row.student.id, value, reason.trim(), actorName);
    await onSaved();
    setBusy(false);
    toast.success(
      `${row.student.name} ${row.student.surname}'s mark has been overridden to ${formatMark(value)}.`,
    );
    onClose();
  };

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Override this student's mark</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">
                {row?.student.name} {row?.student.surname} · {row?.student.studentNumber} · Group{" "}
                {row?.group.groupNumber}
              </p>
              <p>
                The calculated mark stays on record. Overrides appear in the results table and in
                the audit log with your name and reason.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Calculated mark</p>
            <div className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground tabular-nums">
              {formatMark(calculated)} - group mark {formatMark(row?.baseMark)} × adjustment{" "}
              {formatFactor(row?.result.adjustmentFactor ?? 0)}
            </div>
          </div>

          <FormField label="New mark" error={errors.mark} required>
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={mark}
                onChange={(event) => setMark(event.target.value)}
                className="tabular-nums"
              />
            )}
          </FormField>

          <FormField
            label="Reason for the override"
            error={errors.reason}
            hint="Required. Write it so it still makes sense to someone reviewing marks months from now."
            required
          >
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Student submitted a medical certificate covering two weeks of the project."
              />
            )}
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} busyLabel="Saving…" disabled={!reasonGiven} onClick={handleSave}>
            Save override
          </BusyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
