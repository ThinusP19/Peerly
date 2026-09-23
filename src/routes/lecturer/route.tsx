import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AdminShell } from "@/components/layout/AdminShell";
import { CreateClassDialog } from "@/components/lecturer/CreateClassDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLecturerContext } from "@/hooks/use-lecturer-context";

export const Route = createFileRoute("/lecturer")({
  component: LecturerLayout,
});

/**
 * The lecturer portal.
 *
 * Every screen inside works within one class, reading `activeClassId` from the
 * session. That id is remembered locally, so it can be stale - a deleted class,
 * a rebuilt database, or nothing chosen yet. Letting a screen render before it
 * has been checked meant each one sent an empty or invented id to the API and
 * got a 400 back, all at once.
 *
 * So the shell resolves it first and holds the children until it has. By the
 * time a screen renders, `activeClassId` is a class the server has confirmed
 * the lecturer owns - which is why none of them need a guard of their own.
 */
function LecturerLayout() {
  const { klass, classId, hasNoClasses } = useLecturerContext();
  // The empty state replaces every screen, the class list included, so the
  // first class has to be creatable from here - linking to /lecturer/classes
  // would only show this same message again.
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <AdminShell allow={["lecturer"]}>
      {hasNoClasses ? (
        <EmptyState
          title="You don't have any classes yet"
          description="Create a class, then import its class list to add students."
          action={<Button onClick={() => setCreateOpen(true)}>Create a class</Button>}
        />
      ) : !klass || !classId ? (
        // Still resolving. A skeleton rather than nothing, so the portal does
        // not flash empty on every navigation.
        <div className="space-y-4" data-testid="lecturer-loading">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Outlet />
      )}
      <CreateClassDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AdminShell>
  );
}
