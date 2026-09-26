import { createFileRoute } from "@tanstack/react-router";

import { AuditLogView } from "@/components/shared/AuditLogView";
import { PageHeader } from "@/components/shared/PageHeader";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/admin/audit")({
  head: () => titleHead("Audit log"),
  component: AdminAuditPage,
});

function AdminAuditPage() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="An append-only record of every action taken in Peerly. Entries cannot be edited or deleted."
      />
      <AuditLogView />
    </>
  );
}
