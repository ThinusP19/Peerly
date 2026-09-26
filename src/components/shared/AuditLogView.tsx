import { useQuery } from "@tanstack/react-query";
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
import { formatDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/session";
import type { AuditEntry, AuditEventType } from "@/mocks/types";
import { getAuditEntries } from "@/services/peerly";

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
  const audit = useQuery({ queryKey: ["audit"], queryFn: getAuditEntries });

  const [eventType, setEventType] = useState<AuditEventType | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const scoped = useMemo(
    () =>
      (audit.data ?? []).filter((entry) => {
        if (classId && entry.classId !== classId) return false;
        if (eventPrefix && !entry.eventType.startsWith(eventPrefix)) return false;
        return true;
      }),
    [audit.data, classId, eventPrefix],
  );

  const rows = useMemo(
    () =>
      scoped.filter((entry) => {
        if (eventType !== "all" && entry.eventType !== eventType) return false;
        const day = entry.timestamp.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      }),
    [scoped, eventType, from, to],
  );

  const availableEventTypes = useMemo(
    () => Array.from(new Set(scoped.map((entry) => entry.eventType))).sort(),
    [scoped],
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
      cell: (row) => formatDateTime(row.timestamp),
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
            : `Showing ${rows.length} of ${scoped.length} entries`}
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
    </Card>
  );
}
