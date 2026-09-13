import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Link2Off, Plus, Search, UploadCloud, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CreateClassDialog } from "@/components/lecturer/CreateClassDialog";
import { ResolveConflictDialog } from "@/components/lecturer/ResolveConflictDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DangerZone, UnexportedAcknowledgement } from "@/components/shared/DangerZone";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/session";
import { allGroups, assessments, classes } from "@/mocks/data";
import type { MatchStatus } from "@/mocks/types";
import {
  deleteClass,
  getEnrolmentRows,
  hasUnexportedClassData,
  type EnrolmentRow,
} from "@/services/peerly";

export const Route = createFileRoute("/lecturer/classes/")({
  component: ClassListPage,
});

function ClassListPage() {
  const { user, activeClassId, setActiveClassId, setActiveAssessmentId } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const klass = classes.find((c) => c.id === activeClassId);

  const rows = useQuery({
    queryKey: ["enrolment-rows", activeClassId],
    queryFn: () => getEnrolmentRows(activeClassId),
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MatchStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [resolving, setResolving] = useState<EnrolmentRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const all = useMemo(() => rows.data ?? [], [rows.data]);
  const matched = all.filter((row) => row.matchStatus === "matched");
  const unmatched = all.filter((row) => row.matchStatus === "unmatched");
  const conflicts = all.filter((row) => row.matchStatus === "conflict");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((row) => {
      if (status !== "all" && row.matchStatus !== status) return false;
      if (!term) return true;
      return (
        `${row.importedName} ${row.importedSurname}`.toLowerCase().includes(term) ||
        row.studentNumber.includes(term)
      );
    });
  }, [all, search, status]);

  const columns: Array<Column<EnrolmentRow>> = [
    {
      key: "studentNumber",
      header: "Student number",
      sortValue: (row) => row.studentNumber,
      className: "tabular-nums whitespace-nowrap text-foreground",
      cell: (row) => row.studentNumber,
    },
    {
      key: "name",
      header: "Name on the class list",
      sortValue: (row) => `${row.importedSurname} ${row.importedName}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {row.importedName} {row.importedSurname}
          </p>
          {row.account && row.matchStatus === "matched" ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{row.account.email}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "group",
      header: "Group",
      sortValue: (row) => row.groupNumber ?? 999,
      className: "whitespace-nowrap",
      cell: (row) =>
        row.groupNumber ? (
          `Group ${row.groupNumber}`
        ) : (
          <span className="text-muted-foreground">Not allocated</span>
        ),
    },
    {
      key: "status",
      header: "Match status",
      sortValue: (row) => row.matchStatus,
      cell: (row) => <StatusBadge status={row.matchStatus} />,
    },
    {
      key: "note",
      header: "Why",
      className: "min-w-56 text-muted-foreground",
      cell: (row) => row.matchNote ?? "Matched to a registered Peerly account.",
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (row) =>
        row.matchStatus === "conflict" ? (
          <Button size="sm" variant="outline" onClick={() => setResolving(row)}>
            Resolve
            <span className="sr-only">
              {" "}
              conflict for {row.importedName} {row.importedSurname}
            </span>
          </Button>
        ) : null,
    },
  ];

  const filtersApplied = Boolean(search.trim()) || status !== "all";

  const classGroups = klass ? allGroups.filter((g) => g.classId === klass.id).length : 0;
  const classAssessments = klass ? assessments.filter((a) => a.classId === klass.id).length : 0;
  const unexported = klass ? hasUnexportedClassData(klass.id) : false;

  return (
    <>
      <PageHeader
        title="Class list"
        description={
          klass
            ? `${klass.moduleCode} - ${klass.name} · ${klass.academicPeriod}`
            : "Select a class in the header to see its class list, or create a new one."
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(true)} className="h-10 px-4">
              <Plus aria-hidden="true" />
              New class
            </Button>
            {klass ? (
              <Button asChild className="h-10 px-4">
                <Link to="/lecturer/classes/import">
                  <UploadCloud aria-hidden="true" />
                  Import a new list
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="On the class list"
          value={all.length}
          icon={Users}
          loading={rows.isPending}
        />
        <StatCard
          label="Matched"
          value={matched.length}
          hint="Linked to a Peerly account"
          tone="success"
          loading={rows.isPending}
        />
        <StatCard
          label="Unmatched"
          value={unmatched.length}
          hint="No account uses this number yet"
          icon={Link2Off}
          tone="warning"
          loading={rows.isPending}
        />
        <StatCard
          label="Conflicts"
          value={conflicts.length}
          hint="Needs a decision from you"
          icon={AlertTriangle}
          tone="danger"
          loading={rows.isPending}
        />
      </div>

      {!rows.isPending && unmatched.length + conflicts.length > 0 ? (
        <Card className="flex flex-col gap-4 rounded-2xl border border-warning/25 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-muted text-warning">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
            <p className="min-w-0 text-sm text-foreground">
              {unmatched.length + conflicts.length} students on this list aren't linked to an
              account. They can't be put into a group or rate anyone until that's resolved.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {conflicts.length > 0 ? (
              <Button variant="outline" onClick={() => setStatus("conflict")} className="h-10 px-4">
                Show conflicts
              </Button>
            ) : null}
            {unmatched.length > 0 ? (
              <Button
                variant="outline"
                onClick={() => setStatus("unmatched")}
                className="h-10 px-4"
              >
                Show unmatched
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* The filters, the result count and the table share one panel. */}
      <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
        <div className="flex flex-col gap-3 border-b px-5 py-3 sm:flex-row sm:items-center sm:px-6">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or student number"
              aria-label="Search the class list"
              className="h-10 rounded-lg pl-9"
            />
          </div>

          <Select value={status} onValueChange={(value) => setStatus(value as MatchStatus | "all")}>
            <SelectTrigger
              className="h-10 w-full rounded-lg sm:w-52"
              aria-label="Filter by match status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All match statuses</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
              <SelectItem value="unmatched">Unmatched</SelectItem>
              <SelectItem value="conflict">Conflict</SelectItem>
            </SelectContent>
          </Select>

          <p
            className="text-sm whitespace-nowrap text-muted-foreground sm:ml-auto"
            aria-live="polite"
          >
            {rows.isPending
              ? "Loading the class list…"
              : `Showing ${filtered.length} of ${all.length} students`}
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.id}
          loading={rows.isPending}
          skeletonRows={8}
          caption="Students on this class list"
          className="rounded-none shadow-none"
          rowClassName={(row) =>
            row.matchStatus === "conflict" ? "bg-danger-muted/30" : undefined
          }
          empty={
            <EmptyState
              icon={Users}
              title={
                filtersApplied ? "No students match those filters" : "No class list imported yet"
              }
              description={
                filtersApplied
                  ? "Try a different search term or clear the match status filter."
                  : "Import a .csv or .xlsx class list to populate this class."
              }
              action={
                filtersApplied ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setStatus("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/lecturer/classes/import">
                      <UploadCloud aria-hidden="true" />
                      Import a class list
                    </Link>
                  </Button>
                )
              }
              className="rounded-none bg-transparent shadow-none"
            />
          }
        />
      </Card>

      {klass ? (
        <DangerZone
          title="Delete this class"
          description={`Permanently removes ${klass.moduleCode}, its class list, groups and every assessment in it, with all ratings and marks.`}
          actionLabel="Delete class"
          onAction={() => {
            setAcknowledged(false);
            setDeleteOpen(true);
          }}
        />
      ) : null}

      <CreateClassDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ResolveConflictDialog row={resolving} onOpenChange={(open) => !open && setResolving(null)} />

      {klass ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete this class permanently?"
          objectName={`${klass.moduleCode} - ${klass.name} · ${klass.academicPeriod}`}
          description={
            <p>
              This removes the class list ({all.length} students), {classGroups}{" "}
              {classGroups === 1 ? "group" : "groups"} and {classAssessments}{" "}
              {classAssessments === 1 ? "assessment" : "assessments"}, with every submission,
              rating, comment, base mark and calculated result.
            </p>
          }
          consequence={
            <p>
              This can't be undone. The audit log records that the class was deleted and by whom,
              but none of its data.
            </p>
          }
          destructive
          confirmLabel="Delete class"
          confirmDisabled={unexported && !acknowledged}
          onConfirm={async () => {
            if (!user) return;
            const deleted = klass;
            await deleteClass(deleted.id, user);
            const next = classes.find((c) => c.lecturerId === user.id);
            if (next) {
              setActiveClassId(next.id);
              const firstAssessment = assessments.find((a) => a.classId === next.id);
              if (firstAssessment) setActiveAssessmentId(firstAssessment.id);
            }
            navigate({ to: "/lecturer" });
            void queryClient.invalidateQueries();
            toast.success(`${deleted.moduleCode} has been deleted.`);
          }}
        >
          {unexported ? (
            <UnexportedAcknowledgement
              subject="This class's"
              checked={acknowledged}
              onCheckedChange={setAcknowledged}
            />
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
