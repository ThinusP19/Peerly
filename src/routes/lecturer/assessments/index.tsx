import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Plus } from "lucide-react";

import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { classes } from "@/mocks/data";
import { getAssessmentRows, type AssessmentRow } from "@/services/peerly";

export const Route = createFileRoute("/lecturer/assessments/")({
  component: AssessmentListPage,
});

function AssessmentListPage() {
  const { activeClassId, setActiveAssessmentId } = useSession();
  const klass = classes.find((c) => c.id === activeClassId);

  const rows = useQuery({
    queryKey: ["assessment-rows", activeClassId],
    queryFn: () => getAssessmentRows(activeClassId),
  });

  const columns: Array<Column<AssessmentRow>> = [
    {
      key: "name",
      header: "Assessment",
      sortValue: (row) => row.assessment.name,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground">{row.assessment.name}</p>
          <p className="text-xs text-muted-foreground">
            {row.groupCount} {row.groupCount === 1 ? "group" : "groups"} · {row.expected} students
          </p>
        </div>
      ),
    },
    {
      key: "dates",
      header: "Open period",
      sortValue: (row) => row.assessment.opensAt,
      className: "whitespace-nowrap text-muted-foreground tabular-nums",
      cell: (row) => (
        <>
          {formatDate(row.assessment.opensAt)} – {formatDate(row.assessment.closesAt)}
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.assessment.status,
      cell: (row) => <StatusBadge status={row.assessment.status} />,
    },
    {
      key: "progress",
      header: "Submissions",
      sortValue: (row) => (row.expected ? row.submitted / row.expected : 0),
      className: "min-w-44",
      cell: (row) =>
        row.assessment.status === "draft" ? (
          <span className="text-sm text-muted-foreground">Not open yet</span>
        ) : (
          <ProgressBar
            value={row.submitted}
            max={row.expected}
            size="sm"
            valueLabel={`${row.submitted} of ${row.expected}`}
            tone={
              row.submitted === row.expected
                ? "success"
                : row.assessment.status === "closed"
                  ? "danger"
                  : "warning"
            }
          />
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (row) => (
        <Button
          asChild
          variant="outline"
          size="sm"
          onClick={() => setActiveAssessmentId(row.assessment.id)}
        >
          <Link
            to="/lecturer/assessments/$assessmentId"
            params={{ assessmentId: row.assessment.id }}
          >
            Open
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Assessments"
        description={
          klass
            ? `Peer assessments for ${klass.moduleCode} — ${klass.name}.`
            : "Select a class in the header to see its assessments."
        }
        actions={
          <Button asChild>
            <Link to="/lecturer/assessments/new">
              <Plus aria-hidden="true" />
              New assessment
            </Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={rows.data ?? []}
        getRowKey={(row) => row.assessment.id}
        loading={rows.isPending}
        caption="Peer assessments for this class"
        empty={
          <EmptyState
            icon={ClipboardList}
            title="No assessments for this class yet"
            description="Create an assessment, choose which groups take part, and set when it opens and closes."
            action={
              <Button asChild>
                <Link to="/lecturer/assessments/new">Create the first assessment</Link>
              </Button>
            }
          />
        }
      />
    </>
  );
}
