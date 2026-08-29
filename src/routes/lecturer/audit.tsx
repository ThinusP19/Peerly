import { createFileRoute } from "@tanstack/react-router";

import { AuditLogView } from "@/components/shared/AuditLogView";
import { PageHeader } from "@/components/shared/PageHeader";
import { useSession } from "@/lib/session";
import { classes } from "@/mocks/data";

export const Route = createFileRoute("/lecturer/audit")({
  component: LecturerAuditPage,
});

function LecturerAuditPage() {
  const { activeClassId } = useSession();
  const klass = classes.find((c) => c.id === activeClassId);

  return (
    <>
      <PageHeader
        title="Audit log"
        description={
          klass
            ? `Everything that has happened in ${klass.moduleCode} — ${klass.name}. Entries are append-only and can't be edited or deleted.`
            : "Select a class in the header to see its audit log."
        }
      />
      {/* Scoped to the active class — a lecturer never sees another class's history. */}
      <AuditLogView classId={activeClassId} />
    </>
  );
}
