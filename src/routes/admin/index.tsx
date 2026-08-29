import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CircleSlash, Clock, UserCheck, Users } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
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
      <PageHeader
        title="Administrator dashboard"
        description="Peerly account administration. Lecturer and administrator accounts are managed here; classes, groups and assessments belong to lecturers."
        actions={
          <Button asChild>
            <Link to="/admin/accounts">Manage accounts</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Lecturer accounts"
          value={lecturers.length}
          hint={`${admins.length} administrator ${admins.length === 1 ? "account" : "accounts"} as well`}
          icon={Users}
          loading={accounts.isPending}
        />
        <StatCard
          label="Active"
          value={active.length}
          hint="Can sign in right now"
          icon={UserCheck}
          tone="success"
          loading={accounts.isPending}
        />
        <StatCard
          label="Deactivated"
          value={deactivated.length}
          hint="Sign-in blocked, history kept"
          icon={CircleSlash}
          loading={accounts.isPending}
        />
        <StatCard
          label="Awaiting activation"
          value={unverified.length}
          hint="Invitation sent, not yet accepted"
          icon={Clock}
          tone="warning"
          loading={accounts.isPending}
        />
      </div>

      <Card className="shadow-card">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold text-foreground">Recent account activity</h2>
            <p className="text-sm text-muted-foreground">
              Every account change is recorded and cannot be edited.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/audit">Full audit log</Link>
          </Button>
        </div>

        <ul className="divide-y">
          {audit.isPending
            ? Array.from({ length: 4 }).map((_, index) => (
                <li key={index} className="px-5 py-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                </li>
              ))
            : accountEvents.slice(0, 6).map((entry) => (
                <li key={entry.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-medium text-foreground">{auditEventMeta[entry.eventType]}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(entry.timestamp)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-sm text-foreground">{entry.objectDescription}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {entry.detail} · by {entry.actorName}
                  </p>
                </li>
              ))}
        </ul>
      </Card>
    </>
  );
}
