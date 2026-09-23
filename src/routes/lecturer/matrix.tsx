import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, CheckCircle2, Grid3x3, Info, MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { FlagBadge } from "@/components/shared/FlagBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
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
import { useClassRoster, useLecturerClasses } from "@/hooks/use-lecturer-context";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

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

/**
 * Names for the matrix axes.
 *
 * Built from the class roster the API returned, so a student who exists shows
 * their name. Looking them up in a fixture array meant every cell said
 * "Unknown" the moment the ids became real.
 */
type Roster = Map<string, { name: string; surname: string }>;

const shortName = (roster: Roster, id: string) => {
  const user = roster.get(id);
  return user ? `${user.name} ${user.surname.charAt(0)}.` : "Unknown";
};

const fullName = (roster: Roster, id: string) => {
  const user = roster.get(id);
  return user ? `${user.name} ${user.surname}` : "Unknown student";
};

const sectionLabel = "text-xs font-semibold tracking-wider text-muted-foreground uppercase";

// Sticky cells must be opaque, or the columns scrolling underneath show
// through. These mix the tint into the card colour instead of using an alpha.
const stickyHeadBg = "bg-[color-mix(in_oklab,var(--color-muted)_50%,var(--color-card))]";
const stickyWarningBg = "bg-[color-mix(in_oklab,var(--color-warning-muted)_60%,var(--color-card))]";
const stickyFootBg = "bg-[color-mix(in_oklab,var(--color-muted)_60%,var(--color-card))]";

function MatrixPage() {
  const { activeAssessmentId, activeClassId } = useSession();
  const lecturerClasses = useLecturerClasses().data ?? [];
  const { byId: roster } = useClassRoster(activeClassId);
  const klass = lecturerClasses.find((c) => c.id === activeClassId);

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
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
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

  const flagged = matrix.memberIds.filter((id) => flagsFor(id).length > 0);

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
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label
              htmlFor="matrix-group"
              className="shrink-0 text-sm font-medium text-muted-foreground"
            >
              Group
            </label>
            <Select value={group.id} onValueChange={setSelectedGroupId}>
              <SelectTrigger
                id="matrix-group"
                className="h-10 min-w-0 flex-1 rounded-lg sm:w-44 sm:flex-none"
              >
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

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border-0 px-5 py-4 text-sm shadow-card sm:px-6">
        <div>
          <p className={sectionLabel}>Group mean</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
            {formatMark(matrix.groupMean)}
          </p>
        </div>
        <div>
          <p className={sectionLabel}>Submitted</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
            {matrix.rows.filter((row) => row.submitted).length} of {matrix.rows.length}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:ml-auto">
          <span className="inline-flex items-center gap-1.5">
            <ArrowUp className="size-3.5 text-success" aria-hidden="true" />
            At least 5 above the group mean
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowDown className="size-3.5 text-danger" aria-hidden="true" />
            At least 5 below
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
        {/* The matrix scrolls sideways rather than squashing; the evaluator column stays put. */}
        <div className="relative w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Evaluation matrix for group {group.groupNumber}: rows are evaluators, columns are the
              students being evaluated.
            </caption>
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th
                  scope="col"
                  className={cn(
                    "sticky left-0 z-10 min-w-44 py-3 pr-4 pl-5 text-left align-top whitespace-nowrap sm:pl-6",
                    stickyHeadBg,
                    sectionLabel,
                  )}
                >
                  Evaluator ↓ / Evaluated →
                </th>
                {matrix.memberIds.map((memberId) => (
                  <th
                    key={memberId}
                    scope="col"
                    className="min-w-36 border-l px-4 py-3 text-left align-top font-normal"
                  >
                    <span
                      className="block font-semibold text-foreground"
                      title={fullName(roster, memberId)}
                    >
                      {shortName(roster, memberId)}
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
                  className={cn(
                    "min-w-28 border-l py-3 pr-5 pl-4 text-right align-top whitespace-nowrap sm:pr-6",
                    sectionLabel,
                  )}
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
                      "sticky left-0 z-10 py-3.5 pr-4 pl-5 text-left align-top font-normal sm:pl-6",
                      row.submitted ? "bg-card" : stickyWarningBg,
                    )}
                  >
                    <span className="block font-semibold text-foreground">
                      {fullName(roster, row.evaluatorId)}
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
                          className="border-l bg-muted/50 px-4 py-3.5 text-center text-muted-foreground"
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
                          className="border-l px-4 py-3.5 align-top text-sm text-muted-foreground italic"
                        >
                          Not rated
                        </td>
                      );
                    }

                    const deviation = deviationFrom(
                      cell.ratingOption.hiddenValue,
                      matrix.groupMean,
                    );

                    return (
                      <td
                        key={cell.evaluatedId}
                        className={cn(
                          "border-l px-4 py-3.5 align-top",
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
                                "block font-semibold",
                                deviation === "above"
                                  ? "text-success"
                                  : deviation === "below"
                                    ? "text-danger"
                                    : "text-foreground",
                              )}
                            >
                              {cell.ratingOption.label}
                            </span>
                            <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                              {cell.ratingOption.hiddenValue}
                            </span>
                          </span>
                        </span>

                        {cell.comment ? (
                          <Popover>
                            <PopoverTrigger className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline">
                              <MessageSquare className="size-3" aria-hidden="true" />
                              Comment
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-72 rounded-xl border-0 text-sm shadow-raised"
                              align="start"
                            >
                              <p className="font-semibold text-foreground">
                                {fullName(roster, row.evaluatorId)} on{" "}
                                {shortName(roster, cell.evaluatedId)}
                              </p>
                              <p className="mt-1 text-muted-foreground">“{cell.comment}”</p>
                            </PopoverContent>
                          </Popover>
                        ) : null}
                      </td>
                    );
                  })}

                  <td className="border-l bg-muted/40 py-3.5 pr-5 pl-4 text-right align-top font-medium tabular-nums sm:pr-6">
                    {formatMark(row.rowMean)}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="bg-muted/40">
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 py-3.5 pr-4 pl-5 text-left font-semibold text-foreground sm:pl-6",
                    stickyFootBg,
                  )}
                >
                  Mean received
                </th>
                {matrix.columnMeans.map((columnMean, index) => (
                  <td
                    key={matrix.memberIds[index]}
                    className="border-l px-4 py-3.5 font-medium tabular-nums"
                  >
                    {formatMark(columnMean)}
                  </td>
                ))}
                <td className="border-l bg-muted/60 py-3.5 pr-5 pl-4 text-right font-semibold tabular-nums sm:pr-6">
                  {formatMark(matrix.groupMean)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex gap-2.5 border-t bg-muted/40 px-5 py-3 text-xs text-muted-foreground sm:px-6">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <p>
            Rows are the student doing the rating; columns are the student being rated. The small
            numbers are the scale values behind each label - these are lecturer-only and are never
            shown to students.
          </p>
        </div>
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card">
        <PanelHeader title="Flags in this group" count={flagged.length} />
        {flagged.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Nothing looks unusual in this group's ratings.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {flagged.map((id) => (
              <li key={id} className="flex flex-wrap items-center gap-2 px-5 py-3.5 sm:px-6">
                <span className="text-sm font-semibold text-foreground">
                  {fullName(roster, id)}
                </span>
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
