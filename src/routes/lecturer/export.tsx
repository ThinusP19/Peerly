import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Info, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { exportFileName, formatDateTimeLong } from "@/lib/format";
import { useLecturerClasses } from "@/hooks/use-lecturer-context";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { getAssessment, getPeerRatings, getResultRows, downloadResults } from "@/services/peerly";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/lecturer/export")({
  head: () => titleHead("Export results"),
  component: ExportPage,
});

function ExportPage() {
  const { user, activeAssessmentId, activeClassId } = useSession();
  const lecturerClasses = useLecturerClasses().data ?? [];
  const klass = lecturerClasses.find((c) => c.id === activeClassId);

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
  /** The name the last download was actually saved under, from the server. */
  const [downloaded, setDownloaded] = useState<string | null>(null);

  const assessment = assessmentQuery.data;
  const rows = rowsQuery.data ?? [];
  const ratings = ratingsQuery.data ?? [];

  if (assessmentQuery.isPending || rowsQuery.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  // The server exports only a current calculation, so the screen asks the same
  // question: after a re-open, a changed base mark or a changed maximum there
  // are no results to export until the marks are calculated again.
  if (!assessment || !assessment.calculatedAt || rows.length === 0) {
    return (
      <>
        <PageHeader title="Export results" />
        <EmptyState
          icon={FileSpreadsheet}
          title="Nothing to export yet"
          description="Calculate marks for this assessment first - the export always reflects the latest calculation run. If you re-opened the assessment or changed a group mark or the maximum since calculating, calculate again."
          action={
            <Button asChild>
              <Link to="/lecturer/marks">Go to marks & calculation</Link>
            </Button>
          }
        />
      </>
    );
  }

  const generatedAt = new Date().toISOString();
  // The same name the server gives the file, so the lecturer can find it in
  // their downloads; replaced by the name it was actually saved under.
  const fileName =
    downloaded ??
    exportFileName(klass?.moduleCode ?? "class", assessment.name, new Date(generatedAt));
  const overridden = rows.filter((row) => row.result.override).length;
  const flagged = rows.filter((row) => row.result.flags.length > 0).length;

  const worksheets = [
    {
      title: "Worksheet 1 - Results",
      body: "One row per student: student number, name, group, mean received rating, adjustment factor, group base mark, final individual mark, flags and any override with its reason.",
      rowCount: rows.length,
    },
    {
      title: "Worksheet 2 - Raw Ratings",
      body: "One row per rating given: evaluator, student evaluated, the descriptive label, its scale value and any comment. This is the evidence behind every adjustment.",
      rowCount: ratings.length,
    },
  ];

  const headerRows: Array<{ label: string; value: ReactNode; className?: string }> = [
    { label: "Class", value: `${klass?.moduleCode} - ${klass?.name}` },
    { label: "Academic period", value: klass?.academicPeriod },
    { label: "Assessment", value: assessment.name },
    { label: "Generated", value: formatDateTimeLong(generatedAt), className: "tabular-nums" },
    {
      label: "Calculation run id",
      value: assessment.calculationRunId ?? "not calculated yet",
      className: "font-mono text-xs break-all",
    },
    {
      label: "Calculated at",
      value: formatDateTimeLong(assessment.calculatedAt),
      className: "tabular-nums",
    },
    { label: "Overrides included", value: overridden, className: "tabular-nums" },
    { label: "Flagged students", value: flagged, className: "tabular-nums" },
  ];

  return (
    <>
      <PageHeader
        title="Export results"
        backTo="/lecturer/results"
        backLabel="Results"
        description="A single .xlsx workbook with two worksheets - one for the marks you'll upload, one for the raw ratings behind them."
      />

      <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
        <PanelHeader title="What's in the file" />

        <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-6">
          {worksheets.map((sheet) => (
            <div key={sheet.title} className="flex min-w-0 flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Table2 className="size-4" aria-hidden="true" />
                </span>
                <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                  {sheet.title}
                </p>
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-accent-foreground tabular-nums">
                  {sheet.rowCount} rows
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{sheet.body}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
        <PanelHeader
          title="Header information"
          description="These lines are written at the top of the Results worksheet so the file can always be traced back to a specific calculation."
        />

        <dl className="divide-y">
          {headerRows.map((row) => (
            <div
              key={row.label}
              className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6"
            >
              <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {row.label}
              </dt>
              <dd
                className={cn("text-sm break-words text-foreground sm:text-right", row.className)}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="flex flex-col gap-4 rounded-2xl border-0 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Info className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold break-all text-foreground">{fileName}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Exporting is recorded in the audit log. Students never see this file.
            </p>
          </div>
        </div>

        <BusyButton
          busy={busy}
          busyLabel="Building the workbook…"
          className="h-10 shrink-0 px-4"
          onClick={async () => {
            setBusy(true);
            try {
              // Downloading records the export server-side, so there is no
              // separate call to keep in step with it.
              const saved = await downloadResults(assessment.id);
              setDownloaded(saved);
              toast.success(`${saved} downloaded`);
            } catch (error) {
              // Refused (the marks need calculating again), signed out or
              // offline: say so, and give the button back.
              toast.error(
                error instanceof Error && error.message
                  ? error.message
                  : "We couldn't build the export. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download aria-hidden="true" />
          Export to .xlsx
        </BusyButton>
      </Card>
    </>
  );
}
