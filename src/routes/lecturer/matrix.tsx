import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Grid3x3, Info, MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { FlagBadge } from "@/components/shared/FlagBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { buildMatrix, deviationFrom } from "@/lib/domain";
import { formatMark } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { classes, users } from "@/mocks/data";
import {
  getAssessment,
  getGroups,
  getPeerRatings,
  getRatingOptions,
  getResults,
  getSubmissions,
} from "@/services/peerly";

export const Route = createFileRoute("/lecturer/matrix")({
  component: MatrixPage,
});

const shortName = (id: string) => {
  const user = users.find((u) => u.id === id);
  return user ? `${user.name} ${user.surname.charAt(0)}.` : "Unknown";
};

const fullName = (id: string) => {
  const user = users.find((u) => u.id === id);
  return user ? `${user.name} ${user.surname}` : "Unknown student";
};

function MatrixPage() {
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
  const submissionsQuery = useQuery({
    queryKey: ["submissions", activeAssessmentId],
    queryFn: () => getSubmissions(activeAssessmentId),
  });
  const ratingsQuery = useQuery({
    queryKey: ["peer-ratings", activeAssessmentId],
    queryFn: () => getPeerRatings(activeAssessmentId),
  });
  const optionsQuery = useQuery({ queryKey: ["rating-options"], queryFn: getRatingOptions });
  const resultsQuery = useQuery({
    queryKey: ["results", activeAssessmentId],
    queryFn: () => getResults(activeAssessmentId),
  });

  const assessment = assessmentQuery.data;
  const groups = useMemo(
    () => (groupsQuery.data ?? []).filter((g) => assessment?.groupIds.includes(g.id)),
    [groupsQuery.data, assessment],
  );

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const group = groups.find((g) => g.id === selectedGroupId) ?? groups[0];

  const matrix = useMemo(
    () =>
      group
        ? buildMatrix(
            group,
            submissionsQuery.data ?? [],
            ratingsQuery.data ?? [],
            optionsQuery.data ?? [],
          )
        : null,
    [group, submissionsQuery.data, ratingsQuery.data, optionsQuery.data],
  );

  const flagsFor = (studentId: string) =>
    (resultsQuery.data ?? []).find((r) => r.studentId === studentId)?.flags ?? [];

  const loading =
    assessmentQuery.isPending ||
    groupsQuery.isPending ||
    submissionsQuery.isPending ||
    ratingsQuery.isPending ||
    optionsQuery.isPending;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!assessment || groups.length === 0 || !group || !matrix) {
    return (
      <>
        <PageHeader title="Evaluation matrix" />
        <EmptyState
          icon={Grid3x3}
          title="Nothing to show yet"
          description="Choose a class and an assessment with confirmed groups in the header, then come back."
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
        title="Evaluation matrix"
        description={
          <>
            {klass?.moduleCode} · {assessment.name} · who rated whom, and how far each rating sits
            from the group's average.
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="matrix-group" className="text-sm text-muted-foreground">
              Group
            </label>
            <Select value={group.id} onValueChange={setSelectedGroupId}>
              <SelectTrigger id="matrix-group" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    Group {option.groupNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 text-sm shadow-card">
        <div>
          <p className="text-muted-foreground">Group mean</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {formatMark(matrix.groupMean)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Submitted</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {matrix.rows.filter((row) => row.submitted).length} of {matrix.rows.length}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ArrowUp className="size-3.5 text-success" aria-hidden="true" />
            More than 12.5 above the group mean
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowDown className="size-3.5 text-danger" aria-hidden="true" />
            More than 12.5 below
          </span>
        </div>
      </Card>

      <div className="flex gap-2.5 rounded-md bg-muted p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Rows are the student doing the rating; columns are the student being rated. The small
          numbers are the scale values behind each label - these are lecturer-only and are never
          shown to students.
        </p>
      </div>

      {/* The matrix scrolls sideways rather than squashing; the evaluator column stays put. */}
      <div className="w-full overflow-x-auto rounded-lg border bg-card shadow-card">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Evaluation matrix for group {group.groupNumber}: rows are evaluators, columns are the
            students being evaluated.
          </caption>
          <thead>
            <tr className="border-b">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-44 bg-card px-3 py-2.5 text-left font-medium text-muted-foreground"
              >
                Evaluator ↓ / Evaluated →
              </th>
              {matrix.memberIds.map((memberId) => (
                <th
                  key={memberId}
                  scope="col"
                  className="min-w-36 border-l px-3 py-2.5 text-left align-top font-medium"
                >
                  <span className="block text-foreground" title={fullName(memberId)}>
                    {shortName(memberId)}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {flagsFor(memberId).map((flag) => (
                      <FlagBadge key={flag} flag={flag} />
                    ))}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="min-w-28 border-l bg-muted/40 px-3 py-2.5 text-right font-medium text-muted-foreground"
              >
                Mean given
              </th>
            </tr>
          </thead>

          <tbody>
            {matrix.rows.map((row) => (
              <tr
                key={row.evaluatorId}
                className={cn(
                  "border-b",
                  // A non-submitting evaluator gets a visually distinct row, so
                  // empty cells can never be misread as a rating of zero.
                  !row.submitted && "bg-warning-muted/40",
                )}
              >
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 px-3 py-2.5 text-left align-top font-normal",
                    row.submitted ? "bg-card" : "bg-warning-muted/60",
                  )}
                >
                  <span className="block font-medium text-foreground">
                    {fullName(row.evaluatorId)}
                  </span>
                  {!row.submitted ? (
                    <StatusBadge status="outstanding" label="Did not submit" className="mt-1" />
                  ) : null}
                </th>

                {row.cells.map((cell) => {
                  if (cell.isSelf) {
                    return (
                      <td
                        key={cell.evaluatedId}
                        className="border-l bg-muted/50 px-3 py-2.5 text-center text-muted-foreground"
                      >
                        <span aria-label="Not applicable - a student does not rate themselves">
                          -
                        </span>
                      </td>
                    );
                  }

                  if (!cell.ratingOption) {
                    return (
                      <td
                        key={cell.evaluatedId}
                        className="border-l px-3 py-2.5 text-sm text-muted-foreground italic"
                      >
                        Not rated
                      </td>
                    );
                  }

                  const deviation = deviationFrom(cell.ratingOption.hiddenValue, matrix.groupMean);

                  return (
                    <td
                      key={cell.evaluatedId}
                      className={cn(
                        "border-l px-3 py-2.5 align-top",
                        deviation === "above" && "bg-success-muted/60",
                        deviation === "below" && "bg-danger-muted/60",
                      )}
                    >
                      <span className="flex items-start gap-1.5">
                        {deviation === "above" ? (
                          <ArrowUp
                            className="mt-0.5 size-3.5 shrink-0 text-success"
                            aria-label="Above the group mean"
                          />
                        ) : deviation === "below" ? (
                          <ArrowDown
                            className="mt-0.5 size-3.5 shrink-0 text-danger"
                            aria-label="Below the group mean"
                          />
                        ) : null}
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block font-medium",
                              deviation === "above"
                                ? "text-success"
                                : deviation === "below"
                                  ? "text-danger"
                                  : "text-foreground",
                            )}
                          >
                            {cell.ratingOption.label}
                          </span>
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            {cell.ratingOption.hiddenValue}
                          </span>
                        </span>
                      </span>

                      {cell.comment ? (
                        <Popover>
                          <PopoverTrigger className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs text-primary hover:underline">
                            <MessageSquare className="size-3" aria-hidden="true" />
                            Comment
                          </PopoverTrigger>
                          <PopoverContent className="w-72 text-sm" align="start">
                            <p className="font-medium text-foreground">
                              {fullName(row.evaluatorId)} on {shortName(cell.evaluatedId)}
                            </p>
                            <p className="mt-1 text-muted-foreground">“{cell.comment}”</p>
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </td>
                  );
                })}

                <td className="border-l bg-muted/40 px-3 py-2.5 text-right font-medium tabular-nums">
                  {formatMark(row.rowMean)}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 bg-muted/40">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-muted/60 px-3 py-2.5 text-left font-medium text-foreground"
              >
                Mean received
              </th>
              {matrix.columnMeans.map((columnMean, index) => (
                <td
                  key={matrix.memberIds[index]}
                  className="border-l px-3 py-2.5 font-medium tabular-nums"
                >
                  {formatMark(columnMean)}
                </td>
              ))}
              <td className="border-l bg-muted/60 px-3 py-2.5 text-right font-semibold tabular-nums">
                {formatMark(matrix.groupMean)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <Card className="space-y-3 p-5 shadow-card">
        <h2 className="font-semibold text-foreground">Flags in this group</h2>
        {matrix.memberIds.every((id) => flagsFor(id).length === 0) ? (
          <p className="text-sm text-muted-foreground">
            Nothing looks unusual in this group's ratings.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {matrix.memberIds
              .filter((id) => flagsFor(id).length > 0)
              .map((id) => (
                <li key={id} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{fullName(id)}</span>
                  {flagsFor(id).map((flag) => (
                    <FlagBadge key={flag} flag={flag} />
                  ))}
                </li>
              ))}
          </ul>
        )}
      </Card>
    </>
  );
}
