import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";

import { AuditLogView } from "@/components/shared/AuditLogView";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { useLecturerClasses } from "@/hooks/use-lecturer-context";
import { useSession } from "@/lib/session";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/lecturer/audit")({
  head: () => titleHead("Audit log"),
  component: LecturerAuditPage,
});

function LecturerAuditPage() {
  const { activeClassId } = useSession();
  const lecturerClasses = useLecturerClasses().data ?? [];
  const klass = lecturerClasses.find((c) => c.id === activeClassId);

  return (
    <>
      <PageHeader
        title="Audit log"
        description={
          klass
            ? `Everything that has happened in ${klass.moduleCode} - ${klass.name}. Entries are append-only and can't be edited or deleted.`
            : "Select a class in the header to see its audit log."
        }
      />
      {/* Scoped to the active class - a lecturer never sees another class's history,
          so with no class selected there is nothing to show. */}
      {klass ? (
        <AuditLogView classId={klass.id} />
      ) : (
        <EmptyState
          icon={ScrollText}
          title="No class selected"
          description="Choose a class in the header to see everything that has happened in it."
        />
      )}
    </>
  );
}
