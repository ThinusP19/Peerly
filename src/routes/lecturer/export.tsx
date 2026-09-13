import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Info, Table2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeLong } from "@/lib/format";
import { useSession } from "@/lib/session";
import { classes } from "@/mocks/data";
import { getAssessment, getPeerRatings, getResultRows } from "@/services/peerly";

export const Route = createFileRoute("/lecturer/export")({
  component: ExportPage,
});

function ExportPage() {
  const { activeAssessmentId, activeClassId } = useSession();
  const klass = classes.find((c) => c.id === activeClassId);

  const assessmentQuery = useQuery({
    queryKey: ["assessment", activeAssessmentId],
    queryFn: () => getAssessment(activeAssessmentId),
  });
  const rowsQuery = useQuery({
    queryKey: ["result-rows", activeAssessmentId],
    queryFn: () => getResultRows(activeAssessmentId),
  });
  const ratingsQuery = useQuery({
    queryKey: ["peer-ratings", activeAssessmentId],
    queryFn: () => getPeerRatings(activeAssessmentId),
  });

  const [busy, setBusy] = useState(false);

  const assessment = assessmentQuery.data;
  const rows = rowsQuery.data ?? [];
  const ratings = ratingsQuery.data ?? [];

  if (assessmentQuery.isPending || rowsQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!assessment || rows.length === 0) {
    return (
      <>
        <PageHeader title="Export results" />
        <EmptyState
          icon={FileSpreadsheet}
          title="Nothing to export yet"
          description="Calculate marks for this assessment first - the export always reflects the latest calculation run."
          action={
            <Button asChild>
              <Link to="/lecturer/marks">Go to marks & calculation</Link>
            </Button>
          }
        />
      </>
    );
  }

  const fileName = `peerly_${klass?.moduleCode ?? "class"}_export.xlsx`;
  const generatedAt = new Date().toISOString();
  const overridden = rows.filter((row) => row.result.override).length;
  const flagged = rows.filter((row) => row.result.flags.length > 0).length;

  return (
    <>
      <PageHeader
        title="Export results"
        backTo="/lecturer/results"
        backLabel="Results"
        description="A single .xlsx workbook with two worksheets - one for the marks you'll upload, one for the raw ratings behind them."
      />

      <Card className="space-y-4 p-5 shadow-card">
        <h2 className="font-semibold text-foreground">What's in the file</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border p-4">
            <div className="flex items-center gap-2">
              <Table2 className="size-4 text-primary" aria-hidden="true" />
              <p className="font-medium text-foreground">Worksheet 1 - Results</p>
            </div>
            <p className="text-sm text-muted-foreground">
              One row per student: student number, name, group, mean received rating, adjustment
              factor, group base mark, final individual mark, flags and any override with its
              reason.
            </p>
            <p className="text-sm font-medium tabular-nums text-foreground">{rows.length} rows</p>
          </div>

          <div className="space-y-2 rounded-md border p-4">
            <div className="flex items-center gap-2">
              <Table2 className="size-4 text-primary" aria-hidden="true" />
              <p className="font-medium text-foreground">Worksheet 2 - Raw Ratings</p>
            </div>
            <p className="text-sm text-muted-foreground">
              One row per rating given: evaluator, student evaluated, the descriptive label, its
              scale value and any comment. This is the evidence behind every adjustment.
            </p>
            <p className="text-sm font-medium tabular-nums text-foreground">
              {ratings.length} rows
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5 shadow-card">
        <h2 className="font-semibold text-foreground">Header information</h2>
        <p className="text-sm text-muted-foreground">
          These lines are written at the top of the Results worksheet so the file can always be
          traced back to a specific calculation.
        </p>

        <dl className="divide-y rounded-md border text-sm">
          <div className="flex flex-wrap justify-between gap-2 px-3.5 py-2.5">
            <dt className="text-muted-foreground">Class</dt>
            <dd className="font-medium text-foreground">
              {klass?.moduleCode} - {klass?.name}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 px-3.5 py-2.5">
            <dt className="text-muted-foreground">Academic period</dt>
            <dd className="font-medium text-foreground">{klass?.academicPeriod}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 px-3.5 py-2.5">
            <dt className="text-muted-foreground">Assessment</dt>
            <dd className="font-medium text-foreground">{assessment.name}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 px-3.5 py-2.5">
            <dt className="text-muted-foreground">Generated</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {formatDateTimeLong(generatedAt)}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 px-3.5 py-2.5">
            <dt className="text-muted-foreground">Calculation run id</dt>
            <dd className="font-mono text-xs text-foreground">
              {assessment.calculationRunId ?? "not calculated yet"}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 px-3.5 py-2.5">
            <dt className="text-muted-foreground">Overrides included</dt>
            <dd className="font-medium tabular-nums text-foreground">{overridden}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 px-3.5 py-2.5">
            <dt className="text-muted-foreground">Flagged students</dt>
            <dd className="font-medium tabular-nums text-foreground">{flagged}</dd>
          </div>
        </dl>
      </Card>

      <Card className="flex flex-col gap-3 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium text-foreground">{fileName}</p>
            <p className="text-muted-foreground">
              Exporting is recorded in the audit log. Students never see this file.
            </p>
          </div>
        </div>

        <BusyButton
          busy={busy}
          busyLabel="Building the workbook…"
          onClick={async () => {
            setBusy(true);
            await new Promise((resolve) => setTimeout(resolve, 1200));
            setBusy(false);
            toast.success(`${fileName} downloaded`);
          }}
        >
          <Download aria-hidden="true" />
          Export to .xlsx
        </BusyButton>
      </Card>
    </>
  );
}
