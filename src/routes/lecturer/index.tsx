import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileEdit,
  Link2Off,
  Plus,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { BrandMark } from "@/components/layout/BrandMark";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { submissionProgress, type SubmissionProgress } from "@/lib/domain";
import { formatDate, formatDeadline, isOverdue } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { allGroups, submissions } from "@/mocks/data";
import type { Assessment, Class } from "@/mocks/types";
import { getAssessments, getClassSummaries, type ClassSummary } from "@/services/peerly";

export const Route = createFileRoute("/lecturer/")({
  component: LecturerDashboard,
});

/*
 * Layout, widest first:
 * - 2xl: two columns filling the viewport height. Left: banner, then the
 *   assessments card stretched to the bottom. Right: needs-attention and
 *   classes.
 * - xl: one column; the side panels sit side by side under the assessments.
 * - below xl: everything stacks, and assessments become cards.
 * Scrollbars are hidden app-wide, so nothing here may scroll sideways.
 */

const greetingFor = (hour: number) =>
  hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

/** Short reference shown under an assessment's name, e.g. asm-1 -> PA-001. */
const assessmentRef = (id: string) => `PA-${id.replace(/\D/g, "").padStart(3, "0")}`;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// Open first, then drafts, then closed; soonest deadline first within each.
const statusOrder: Record<Assessment["status"], number> = { open: 0, draft: 1, closed: 2 };

type TabValue = "all" | Assessment["status"];

const tabs: Array<{ value: TabValue; label: string; empty: string }> = [
  { value: "all", label: "All", empty: "No assessments yet. Create one to get started." },
  { value: "open", label: "Open", empty: "No assessments are open right now." },
  { value: "draft", label: "Drafts", empty: "No drafts. Every assessment has been opened." },
  { value: "closed", label: "Closed", empty: "No closed assessments yet." },
];

interface Row {
  assessment: Assessment;
  klass: Class;
  groupCount: number;
  progress: SubmissionProgress;
}

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

  if (owned.length === 0) {
    return (
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
    );
  }

  const classById = new Map<string, Class>(owned.map((s) => [s.klass.id, s.klass]));

  const rows: Row[] = (allAssessments.data ?? [])
    .filter((a) => classById.has(a.classId))
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

  const ownedGroups = allGroups.filter((g) => classById.has(g.classId));
  const averageGroupSize = ownedGroups.length
    ? ownedGroups.reduce((sum, g) => sum + g.memberStudentIds.length, 0) / ownedGroups.length
    : 0;
  const openCount = rows.filter((r) => r.assessment.status === "open").length;
  const draftCount = rows.filter((r) => r.assessment.status === "draft").length;
  const attention = attentionItems(rows, owned);

  return (
    <div className="grid gap-3 2xl:min-h-[calc(100dvh-102px)] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <Hero
          name={user!.name}
          period={owned[0]?.klass.academicPeriod}
          attentionCount={attention.length}
          stats={[
            {
              label: "Students",
              value: owned.reduce((sum, s) => sum + s.studentCount, 0),
              detail: `Across ${plural(owned.length, "class", "classes")}`,
            },
            {
              label: "Groups",
              value: ownedGroups.length,
              detail: `${averageGroupSize.toFixed(1)} per group`,
            },
            {
              label: "Open",
              value: openCount,
              detail: `${plural(draftCount, "draft", "drafts")} waiting`,
            },
          ]}
        />
        <AssessmentsPanel rows={rows} className="flex-1" />
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-2 2xl:flex 2xl:flex-col">
        <AttentionPanel items={attention} />
        <ClassesPanel summaries={owned} className="2xl:flex-1" />
      </div>
    </div>
  );
}

/* ------------------------------ banner ------------------------------- */

function Hero({
  name,
  period,
  attentionCount,
  stats,
}: {
  name: string;
  period?: string;
  attentionCount: number;
  stats: Array<{ label: string; value: number; detail: string }>;
}) {
  const now = new Date();

  return (
    <section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-6 text-primary-foreground shadow-raised sm:px-8 sm:py-7">
      {/* Oversized, faint brand mark: texture, not information. */}
      <BrandMark className="pointer-events-none absolute -right-8 -bottom-12 size-64 text-primary-foreground opacity-[0.07]" />

      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] uppercase opacity-80">
            {greetingFor(now.getHours())}, {format(now, "EEEE d MMMM yyyy")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome back, {name}
          </h1>
          <p className="mt-2 text-sm opacity-85 sm:text-base">
            {period ? `${period} · ` : ""}
            {attentionCount === 0
              ? "Nothing needs your attention right now"
              : `${plural(attentionCount, "thing needs", "things need")} your attention`}
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-2 sm:gap-3 xl:w-[30rem] xl:shrink-0">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="min-w-0 rounded-xl border border-primary-foreground/15 bg-primary-foreground/10 px-3 py-3 sm:px-4"
            >
              <dt className="truncate text-[11px] font-semibold tracking-wider uppercase opacity-80">
                {stat.label}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{stat.value}</dd>
              <dd className="mt-0.5 hidden truncate text-xs opacity-75 sm:block">{stat.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ---------------------------- assessments ---------------------------- */

function AssessmentsPanel({ rows, className }: { rows: Row[]; className?: string }) {
  const [tab, setTab] = useState<TabValue>("all");
  const count = (value: TabValue) =>
    value === "all" ? rows.length : rows.filter((r) => r.assessment.status === value).length;

  return (
    <Card
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card",
        className,
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabValue)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div className="flex w-full min-w-0 flex-wrap items-center gap-x-5 gap-y-3 sm:w-auto">
            <h2 className="text-lg font-semibold text-foreground">Assessments</h2>
            {/* Phones: four equal tabs across the full width, so none can be
                clipped (scrollbars are hidden). sm+: a compact pill bar. */}
            <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-xl bg-muted p-1 sm:inline-flex sm:w-auto">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="group gap-1.5 rounded-lg px-2 py-1.5 sm:gap-2 sm:px-3 text-sm font-medium text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-card"
                >
                  {t.label}
                  <span className="rounded-full bg-background px-1.5 text-xs tabular-nums group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">
                    {count(t.value)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <Button asChild className="h-10 rounded-lg px-4">
            <Link to="/lecturer/assessments/new">
              <Plus aria-hidden="true" />
              Create new assessment
            </Link>
          </Button>
        </div>

        {tabs.map((t) => {
          const visible =
            t.value === "all" ? rows : rows.filter((r) => r.assessment.status === t.value);
          return (
            <TabsContent key={t.value} value={t.value} className="mt-0 min-h-0 flex-1">
              {visible.length === 0 ? (
                <p className="px-6 py-14 text-center text-sm text-muted-foreground">{t.empty}</p>
              ) : (
                <AssessmentList rows={visible} />
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </Card>
  );
}

function AssessmentList({ rows }: { rows: Row[] }) {
  return (
    <>
      {/* Below xl: one card per assessment. */}
      <ul className="divide-y xl:hidden">
        {rows.map((row) => (
          <li key={row.assessment.id} className="space-y-3 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{row.assessment.name}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{assessmentRef(row.assessment.id)}</span>
                  <ModuleChip klass={row.klass} />
                  <span>{plural(row.groupCount, "group", "groups")}</span>
                </p>
              </div>
              <StatusBadge status={row.assessment.status} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SubmissionMeter submitted={row.progress.submitted} total={row.progress.total} />
              <span className="text-sm text-muted-foreground">
                Due {formatDate(row.assessment.closesAt)}
              </span>
              <ViewLink assessment={row.assessment} />
            </div>
          </li>
        ))}
      </ul>

      {/* xl and up: a table narrow enough to never scroll sideways - group
          counts ride under the name instead of taking a column. */}
      <div className="relative hidden overflow-x-auto xl:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-6 py-3">
                Assessment
              </th>
              <th scope="col" className="px-4 py-3">
                Class
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
                <td className="px-6 py-3.5">
                  <p className="font-semibold text-foreground">{row.assessment.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{assessmentRef(row.assessment.id)}</span> ·{" "}
                    {plural(row.groupCount, "group", "groups")}
                  </p>
                </td>
                <td className="px-4 py-3.5">
                  <ModuleChip klass={row.klass} />
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-foreground">
                  {formatDate(row.assessment.closesAt)}
                </td>
                <td className="px-4 py-3.5">
                  <SubmissionMeter submitted={row.progress.submitted} total={row.progress.total} />
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={row.assessment.status} />
                </td>
                <td className="px-6 py-3.5 text-right">
                  <ViewLink assessment={row.assessment} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------------------- side panels ---------------------------- */

type AttentionTone = "danger" | "warning" | "neutral";

interface AttentionItem {
  key: string;
  tone: AttentionTone;
  icon: LucideIcon;
  title: string;
  detail: string;
  target:
    | { page: "monitor"; classId: string; assessmentId: string }
    | { page: "assessment"; classId: string; assessmentId: string }
    | { page: "classes"; classId: string };
}

/** Everything on the lecturer's plate, most urgent first. */
function attentionItems(rows: Row[], summaries: ClassSummary[]): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const { assessment, progress } of rows) {
    if (assessment.status === "open" && progress.outstanding > 0) {
      const overdue = isOverdue(assessment.closesAt);
      items.push({
        key: `outstanding-${assessment.id}`,
        tone: overdue ? "danger" : "warning",
        icon: Clock,
        title: `${plural(progress.outstanding, "student", "students")} still to submit`,
        detail: `${assessment.name} · ${overdue ? "deadline passed" : "closes"} ${formatDeadline(assessment.closesAt)}`,
        target: { page: "monitor", classId: assessment.classId, assessmentId: assessment.id },
      });
    }
  }

  for (const summary of summaries) {
    const toMatch = summary.unmatchedCount + summary.conflictCount;
    if (toMatch > 0) {
      items.push({
        key: `matching-${summary.klass.id}`,
        tone: "warning",
        icon: Link2Off,
        title: `${plural(toMatch, "student", "students")} to match in ${summary.klass.moduleCode}`,
        detail: `${summary.unmatchedCount} unmatched, ${summary.conflictCount} conflicting on the class list`,
        target: { page: "classes", classId: summary.klass.id },
      });
    }
  }

  for (const { assessment } of rows) {
    if (assessment.status === "draft") {
      items.push({
        key: `draft-${assessment.id}`,
        tone: "neutral",
        icon: FileEdit,
        title: "Draft waiting to open",
        detail: `${assessment.name} · opens ${formatDate(assessment.opensAt)}`,
        target: { page: "assessment", classId: assessment.classId, assessmentId: assessment.id },
      });
    }
  }

  return items;
}

const toneStyles: Record<AttentionTone, string> = {
  danger: "bg-danger-muted text-danger",
  warning: "bg-warning-muted text-warning",
  neutral: "bg-muted text-muted-foreground",
};

function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const { setActiveClassId, setActiveAssessmentId } = useSession();

  const select = (target: AttentionItem["target"]) => {
    setActiveClassId(target.classId);
    if ("assessmentId" in target) setActiveAssessmentId(target.assessmentId);
  };

  const rowClass =
    "group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50 sm:px-6";

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card">
      <PanelHeader title="Needs attention" count={items.length} />
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">You're all caught up.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((item) => {
            const body = (
              <>
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                    toneStyles[item.tone],
                  )}
                >
                  <item.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span>
                </span>
                <ChevronRight
                  className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </>
            );
            const { target } = item;
            return (
              <li key={item.key}>
                {target.page === "monitor" ? (
                  <Link to="/lecturer/monitor" onClick={() => select(target)} className={rowClass}>
                    {body}
                  </Link>
                ) : target.page === "assessment" ? (
                  <Link
                    to="/lecturer/assessments/$assessmentId"
                    params={{ assessmentId: target.assessmentId }}
                    onClick={() => select(target)}
                    className={rowClass}
                  >
                    {body}
                  </Link>
                ) : (
                  <Link to="/lecturer/classes" onClick={() => select(target)} className={rowClass}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ClassesPanel({ summaries, className }: { summaries: ClassSummary[]; className?: string }) {
  const { setActiveClassId } = useSession();

  return (
    <Card
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card",
        className,
      )}
    >
      <PanelHeader title="Your classes" count={summaries.length} />
      <ul className="flex-1 divide-y">
        {summaries.map((summary) => (
          <li key={summary.klass.id}>
            <Link
              to="/lecturer/classes"
              onClick={() => setActiveClassId(summary.klass.id)}
              className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50 sm:px-6"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <ModuleChip klass={summary.klass} />
                  <span className="truncate text-sm font-semibold text-foreground">
                    {summary.klass.name}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {plural(summary.studentCount, "student", "students")} ·{" "}
                  {plural(summary.groupCount, "group", "groups")} ·{" "}
                  {plural(summary.assessmentCount, "assessment", "assessments")}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t px-5 py-3 sm:px-6">
        <Button asChild variant="outline" className="w-full rounded-lg">
          <Link to="/lecturer/classes/import">
            <UploadCloud aria-hidden="true" />
            Import a class list
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function PanelHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground tabular-nums">
        {count}
      </span>
    </div>
  );
}

/* ------------------------------- bits -------------------------------- */

function ModuleChip({ klass }: { klass: Class }) {
  return (
    <span
      className="inline-flex shrink-0 rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground"
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
    <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  );
}
