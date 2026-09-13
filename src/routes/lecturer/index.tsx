import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowRight, BookOpen, Plus, UploadCloud } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { submissionProgress, type SubmissionProgress } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { allGroups, submissions } from "@/mocks/data";
import type { Assessment, Class } from "@/mocks/types";
import { getAssessments, getClassSummaries } from "@/services/peerly";

export const Route = createFileRoute("/lecturer/")({
  component: LecturerDashboard,
});

const greetingFor = (hour: number) =>
  hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

/** Short reference shown under an assessment's name, e.g. asm-1 -> PA-001. */
const assessmentRef = (id: string) => `PA-${id.replace(/\D/g, "").padStart(3, "0")}`;

// Open assessments first, then drafts; soonest deadline first within each.
const statusOrder: Record<Assessment["status"], number> = { open: 0, draft: 1, closed: 2 };

interface Row {
  assessment: Assessment;
  klass: Class;
  groupCount: number;
  progress: SubmissionProgress;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function LecturerDashboard() {
  const { user } = useSession();
  const lecturerId = user!.id;

  const summaries = useQuery({
    queryKey: ["class-summaries", lecturerId],
    queryFn: () => getClassSummaries(lecturerId),
  });
  const allAssessments = useQuery({
    queryKey: ["assessments"],
    queryFn: () => getAssessments(),
  });

  if (summaries.isPending || allAssessments.isPending) return <DashboardSkeleton />;

  const owned = summaries.data ?? [];
  const classById = new Map<string, Class>(owned.map((s) => [s.klass.id, s.klass]));

  const rows: Row[] = (allAssessments.data ?? [])
    .filter((a) => classById.has(a.classId) && a.status !== "closed")
    .sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] || a.closesAt.localeCompare(b.closesAt),
    )
    .map((assessment) => {
      const groups = allGroups.filter((g) => assessment.groupIds.includes(g.id));
      return {
        assessment,
        klass: classById.get(assessment.classId)!,
        groupCount: groups.length,
        progress: submissionProgress(
          groups,
          submissions.filter((s) => s.assessmentId === assessment.id),
        ),
      };
    });

  const totalStudents = owned.reduce((sum, s) => sum + s.studentCount, 0);
  const ownedGroups = allGroups.filter((g) => classById.has(g.classId));
  const averageGroupSize = ownedGroups.length
    ? ownedGroups.reduce((sum, g) => sum + g.memberStudentIds.length, 0) / ownedGroups.length
    : 0;
  const openCount = rows.filter((r) => r.assessment.status === "open").length;
  const draftCount = rows.filter((r) => r.assessment.status === "draft").length;
  // Needs attention: open with students still to submit, or a draft still to open.
  const attentionCount = rows.filter(
    (r) =>
      r.assessment.status === "draft" ||
      (r.assessment.status === "open" && r.progress.outstanding > 0),
  ).length;

  const now = new Date();
  const period = owned[0]?.klass.academicPeriod;

  return (
    <>
      <section className="rounded-2xl bg-primary px-6 py-7 text-primary-foreground shadow-raised sm:px-8 sm:py-8">
        <p className="text-xs font-semibold tracking-[0.16em] uppercase opacity-80">
          {greetingFor(now.getHours())}, {format(now, "EEEE d MMMM yyyy")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Welcome back, {user!.name}
        </h1>
        <p className="mt-2 text-sm opacity-85 sm:text-base">
          {period ? `${period} · ` : ""}
          {attentionCount === 0
            ? "Nothing needs your attention right now"
            : `${plural(attentionCount, "assessment needs", "assessments need")} your attention`}
        </p>
      </section>

      {owned.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="You don't have any classes yet"
          description="Import a class list to create your first class in Peerly."
          action={
            <Button asChild>
              <Link to="/lecturer/classes/import">
                <UploadCloud aria-hidden="true" />
                Import a class list
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Total students"
              value={totalStudents}
              detail={`Across ${plural(owned.length, "class", "classes")}`}
            />
            <StatTile
              label="Groups"
              value={ownedGroups.length}
              detail={`Avg. ${averageGroupSize.toFixed(1)} members per group`}
            />
            <StatTile
              label="Open assessments"
              value={openCount}
              detail={`${plural(draftCount, "draft", "drafts")} pending`}
              tone="success"
            />
          </div>

          <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">Active assessments</h2>
                <p className="text-sm text-muted-foreground">
                  All open and draft peer assessments across your classes
                </p>
              </div>
              <Button asChild className="h-10 rounded-lg px-4">
                <Link to="/lecturer/assessments/new">
                  <Plus aria-hidden="true" />
                  Create new assessment
                </Link>
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="border-t px-6 py-10 text-center text-sm text-muted-foreground">
                No open or draft assessments. Create one to get started.
              </p>
            ) : (
              <>
                {/* Below xl: one card per assessment. The table needs ~830px,
                    which phones, tablets and laptops with the sidebar open
                    don't have, and a sideways-scrolling table hides the
                    status and the way in. */}
                <ul className="divide-y border-t xl:hidden">
                  {rows.map((row) => (
                    <li key={row.assessment.id} className="space-y-3 px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{row.assessment.name}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{assessmentRef(row.assessment.id)}</span>
                            <ModuleChip klass={row.klass} />
                          </p>
                        </div>
                        <StatusBadge status={row.assessment.status} />
                      </div>
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>{plural(row.groupCount, "group", "groups")}</span>
                        <span>Due {formatDate(row.assessment.closesAt)}</span>
                      </p>
                      <div className="flex items-center justify-between gap-3">
                        <SubmissionMeter
                          submitted={row.progress.submitted}
                          total={row.progress.total}
                        />
                        <ViewLink assessment={row.assessment} />
                      </div>
                    </li>
                  ))}
                </ul>

                {/* `relative` keeps the absolutely positioned sr-only labels
                    inside this scroll box; without it they escape and widen
                    the whole page. */}
                <div className="relative hidden overflow-x-auto xl:block">
                  <table className="w-full text-sm">
                    <thead className="border-y bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      <tr>
                        <th scope="col" className="px-6 py-3">
                          Assessment
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Class
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Groups
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Deadline
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Submissions
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Status
                        </th>
                        <th scope="col" className="px-6 py-3">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((row) => (
                        <tr key={row.assessment.id} className="transition-colors hover:bg-muted/40">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-foreground">{row.assessment.name}</p>
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                              {assessmentRef(row.assessment.id)}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <ModuleChip klass={row.klass} />
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-foreground">
                            {plural(row.groupCount, "group", "groups")}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-foreground">
                            {formatDate(row.assessment.closesAt)}
                          </td>
                          <td className="px-4 py-4">
                            <SubmissionMeter
                              submitted={row.progress.submitted}
                              total={row.progress.total}
                            />
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge status={row.assessment.status} />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <ViewLink assessment={row.assessment} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function StatTile({
  label,
  value,
  detail,
  tone = "brand",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "brand" | "success";
}) {
  return (
    <Card className="rounded-2xl border-0 p-6 shadow-card">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-3 text-4xl font-semibold tabular-nums",
          tone === "success" ? "text-success" : "text-primary",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </Card>
  );
}

function ModuleChip({ klass }: { klass: Class }) {
  return (
    <span
      className="inline-flex rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground"
      title={klass.name}
    >
      {klass.moduleCode}
    </span>
  );
}

function SubmissionMeter({ submitted, total }: { submitted: number; total: number }) {
  const percent = total ? Math.round((submitted / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={submitted}
        aria-label={`${submitted} of ${total} submitted`}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {submitted}/{total}
      </span>
    </div>
  );
}

/** Opens the assessment, and makes it (and its class) the working context. */
function ViewLink({ assessment }: { assessment: Assessment }) {
  const { setActiveClassId, setActiveAssessmentId } = useSession();
  return (
    <Link
      to="/lecturer/assessments/$assessmentId"
      params={{ assessmentId: assessment.id }}
      onClick={() => {
        setActiveClassId(assessment.classId);
        setActiveAssessmentId(assessment.id);
      }}
      className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-primary hover:underline"
    >
      View
      <span className="sr-only"> {assessment.name}</span>
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </>
  );
}
