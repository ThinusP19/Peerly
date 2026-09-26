import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
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
import { auditEventMeta } from "@/lib/domain";
import { formatDateTimeSast } from "@/lib/sast";
import { roleLabel } from "@/lib/session";
import type { AuditEntry, AuditEventType } from "@/mocks/types";
import { getAuditPage, type AuditQuery } from "@/services/peerly";

/** Entries fetched at a time; "Show more" asks for the next page. */
const PAGE_SIZE = 100;

/**
 * The audit log is append-only: entries are never edited or deleted, so this
 * view is read-only by design. Both portals share it - the lecturer sees only
 * events for their own classes.
 */
export function AuditLogView({
  /** Restrict to a single class, as the lecturer portal does. */
  classId,
  /** Only show these event types, e.g. the admin's account events. */
  eventPrefix,
}: {
  classId?: string;
  eventPrefix?: string;
}) {
  const [eventType, setEventType] = useState<AuditEventType | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Every filter is sent to the server, which applies it to the whole trail and
  // reads the dates as South African days. Filtering here, over one page, used
  // to hide everything older than the newest 500 entries and file anything
  // between midnight and 02:00 under the day before.
  const filters: AuditQuery = {
    ...(classId ? { classId } : {}),
    ...(eventPrefix ? { eventPrefix } : {}),
    ...(eventType !== "all" ? { eventType } : {}),
    ...(from ? { fromDate: from } : {}),
    ...(to ? { toDate: to } : {}),
  };
  const audit = useInfiniteQuery({
    queryKey: ["audit", filters],
    queryFn: ({ pageParam }) =>
      getAuditPage({ ...filters, limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => audit.data?.pages.flatMap((page) => page.entries) ?? [], [audit.data]);
  const total = audit.data?.pages[0]?.total ?? 0;

  // Offered whether or not any entry of that type exists yet. A class-scoped
  // view never holds account or password events, so it is not offered them.
  const availableEventTypes = useMemo(
    () =>
      (Object.keys(auditEventMeta) as AuditEventType[])
        .filter((type) => !eventPrefix || type.startsWith(eventPrefix))
        .filter((type) => !classId || !/^(account|password)\./.test(type))
        .sort((a, b) => auditEventMeta[a].localeCompare(auditEventMeta[b])),
    [classId, eventPrefix],
  );

  const filtersApplied = eventType !== "all" || Boolean(from) || Boolean(to);
  const clearFilters = () => {
    setEventType("all");
    setFrom("");
    setTo("");
  };

  const columns: Array<Column<AuditEntry>> = [
    {
      key: "timestamp",
      header: "When",
      sortValue: (row) => row.timestamp,
      className: "whitespace-nowrap tabular-nums text-muted-foreground",
      cell: (row) => formatDateTimeSast(row.timestamp),
    },
    {
      key: "actor",
      header: "Who",
      sortValue: (row) => row.actorName,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold wrap-anywhere text-foreground">{row.actorName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{roleLabel(row.actorRole)}</p>
        </div>
      ),
    },
    {
      key: "event",
      header: "Event",
      sortValue: (row) => auditEventMeta[row.eventType],
      className: "whitespace-nowrap",
      cell: (row) => auditEventMeta[row.eventType],
    },
    {
      key: "object",
      header: "What it affected",
      cell: (row) => (
        <div className="min-w-0">
          <p className="wrap-anywhere text-foreground">{row.objectDescription}</p>
          <p className="mt-0.5 text-xs wrap-anywhere text-muted-foreground">{row.detail}</p>
        </div>
      ),
    },
  ];

  return (
    <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
      <div className="grid gap-3 border-b px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
        <FormField label="Event type">
          {(props) => (
            <Select
              value={eventType}
              onValueChange={(value) => setEventType(value as AuditEventType | "all")}
            >
              <SelectTrigger id={props.id} className="h-10 w-full rounded-lg lg:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All event types</SelectItem>
                {availableEventTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {auditEventMeta[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField label="From date">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-10 w-full rounded-lg lg:w-44"
            />
          )}
        </FormField>

        <FormField label="To date">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-10 w-full rounded-lg lg:w-44"
            />
          )}
        </FormField>

        <Button
          variant="outline"
          onClick={clearFilters}
          disabled={!filtersApplied}
          className="h-10"
        >
          Clear filters
        </Button>

        <p className="col-span-full text-sm text-muted-foreground" aria-live="polite">
          {audit.isPending
            ? "Loading the audit log…"
            : audit.isError
              ? "We couldn't load the audit log. Please refresh the page to try again."
              : `Showing ${rows.length.toLocaleString("en-ZA")} of ${total.toLocaleString("en-ZA")} ${
                  total === 1 ? "entry" : "entries"
                }${filtersApplied ? " that match" : ""}. Times are South African (SAST).`}
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        loading={audit.isPending}
        caption="Audit log entries"
        className="rounded-none shadow-none"
        empty={
          <EmptyState
            icon={ScrollText}
            title={filtersApplied ? "No entries in that range" : "Nothing recorded yet"}
            description={
              filtersApplied
                ? "Try widening the date range or choosing a different event type."
                : "Actions like importing a class list, opening an assessment or overriding a mark will appear here."
            }
            action={
              filtersApplied ? (
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
            className="rounded-none bg-transparent shadow-none"
          />
        }
      />

      {audit.hasNextPage ? (
        <div className="flex flex-col items-center gap-2 border-t px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
          <p className="text-sm text-muted-foreground">
            {(total - rows.length).toLocaleString("en-ZA")} older{" "}
            {total - rows.length === 1 ? "entry isn't" : "entries aren't"} shown yet.
          </p>
          <Button
            variant="outline"
            className="h-10"
            disabled={audit.isFetchingNextPage}
            onClick={() => void audit.fetchNextPage()}
          >
            {audit.isFetchingNextPage
              ? "Loading…"
              : `Show ${Math.min(PAGE_SIZE, total - rows.length)} more`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
