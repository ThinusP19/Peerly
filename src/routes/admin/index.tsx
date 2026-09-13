import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";

import { Hero } from "@/components/shared/Hero";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { auditEventMeta } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { getAuditEntries, getStaffAccounts } from "@/services/peerly";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const accounts = useQuery({ queryKey: ["staff-accounts"], queryFn: getStaffAccounts });
  const audit = useQuery({ queryKey: ["audit"], queryFn: getAuditEntries });

  const staff = accounts.data ?? [];
  const lecturers = staff.filter((u) => u.role === "lecturer");
  const admins = staff.filter((u) => u.role === "admin");
  const active = staff.filter((u) => u.status === "active");
  const deactivated = staff.filter((u) => u.status === "inactive");
  const unverified = staff.filter((u) => u.status === "unverified");

  const accountEvents = (audit.data ?? []).filter((entry) =>
    entry.eventType.startsWith("account."),
  );

  return (
    <>
      <Hero
        eyebrow={format(new Date(), "EEEE d MMMM yyyy")}
        title="Administrator dashboard"
        subtitle="Peerly account administration. Lecturer and administrator accounts are managed here; classes, groups and assessments belong to lecturers."
        loading={accounts.isPending}
        stats={[
          {
            label: "Lecturer accounts",
            value: lecturers.length,
            detail: `${admins.length} administrator ${admins.length === 1 ? "account" : "accounts"} as well`,
          },
          { label: "Active", value: active.length, detail: "Can sign in right now" },
          {
            label: "Deactivated",
            value: deactivated.length,
            detail: "Sign-in blocked, history kept",
          },
          {
            label: "Awaiting activation",
            value: unverified.length,
            detail: "Invitation sent, not yet accepted",
          },
        ]}
      />

      <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
        <PanelHeader
          title="Recent account activity"
          size="lg"
          description="Every account change is recorded and cannot be edited."
          actions={
            <>
              <Button asChild variant="outline" className="h-10 px-4">
                <Link to="/admin/audit">Full audit log</Link>
              </Button>
              <Button asChild className="h-10 px-4">
                <Link to="/admin/accounts">Manage accounts</Link>
              </Button>
            </>
          }
        />

        {!audit.isPending && accountEvents.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-muted-foreground">
            No account activity has been recorded yet.
          </p>
        ) : (
          <ul className="divide-y">
            {audit.isPending
              ? Array.from({ length: 4 }).map((_, index) => (
                  <li key={index} className="px-5 py-3.5 sm:px-6">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-1/3" />
                  </li>
                ))
              : accountEvents.slice(0, 6).map((entry) => (
                  <li key={entry.id} className="px-5 py-3.5 sm:px-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-sm font-semibold text-foreground">
                        {auditEventMeta[entry.eventType]}
                      </p>
                      <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatDateTime(entry.timestamp)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-sm break-words text-foreground">
                      {entry.objectDescription}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.detail} · by {entry.actorName}
                    </p>
                  </li>
                ))}
          </ul>
        )}
      </Card>
    </>
  );
}
