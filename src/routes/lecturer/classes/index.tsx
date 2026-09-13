import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Link2Off, Search, UploadCloud, Users } from "lucide-react";
import { useMemo, useState } from "react";

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
import { classes } from "@/mocks/data";
import type { MatchStatus } from "@/mocks/types";
import { getEnrolmentRows, type EnrolmentRow } from "@/services/peerly";

export const Route = createFileRoute("/lecturer/classes/")({
  component: ClassListPage,
});

function ClassListPage() {
  const { activeClassId } = useSession();
  const klass = classes.find((c) => c.id === activeClassId);

  const rows = useQuery({
    queryKey: ["enrolment-rows", activeClassId],
    queryFn: () => getEnrolmentRows(activeClassId),
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MatchStatus | "all">("all");

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
      className: "font-medium tabular-nums whitespace-nowrap",
      cell: (row) => row.studentNumber,
    },
    {
      key: "name",
      header: "Name on the class list",
      sortValue: (row) => `${row.importedSurname} ${row.importedName}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-foreground">
            {row.importedName} {row.importedSurname}
          </p>
          {row.account && row.matchStatus === "matched" ? (
            <p className="text-xs text-muted-foreground">{row.account.email}</p>
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
      className: "text-muted-foreground",
      cell: (row) => row.matchNote ?? "Matched to a registered Peerly account.",
    },
  ];

  const filtersApplied = Boolean(search.trim()) || status !== "all";

  return (
    <>
      <PageHeader
        title="Class list"
        description={
          klass
            ? `${klass.moduleCode} - ${klass.name} · ${klass.academicPeriod}`
            : "Select a class in the header to see its class list."
        }
        actions={
          <Button asChild>
            <Link to="/lecturer/classes/import">
              <UploadCloud aria-hidden="true" />
              Import a new list
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <Card className="flex flex-col gap-3 border-warning/30 bg-warning-muted/40 p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm text-foreground">
              {unmatched.length + conflicts.length} students on this list aren't linked to an
              account. They can't be put into a group or rate anyone until that's resolved.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setStatus("unmatched")}>
            Show unmatched
          </Button>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or student number"
            aria-label="Search the class list"
            className="pl-9"
          />
        </div>

        <Select value={status} onValueChange={(value) => setStatus(value as MatchStatus | "all")}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by match status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All match statuses</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
            <SelectItem value="conflict">Conflict</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {rows.isPending
          ? "Loading the class list…"
          : `Showing ${filtered.length} of ${all.length} students`}
      </p>

      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(row) => row.id}
        loading={rows.isPending}
        skeletonRows={8}
        caption="Students on this class list"
        rowClassName={(row) => (row.matchStatus === "conflict" ? "bg-danger-muted/30" : undefined)}
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
                  <Link to="/lecturer/classes/import">Import a class list</Link>
                </Button>
              )
            }
          />
        }
      />
    </>
  );
}
