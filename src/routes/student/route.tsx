import { Outlet, createFileRoute } from "@tanstack/react-router";

import { StudentShell } from "@/components/layout/StudentShell";

export const Route = createFileRoute("/student")({
  component: StudentLayout,
});

function StudentLayout() {
  return (
    <StudentShell>
      <Outlet />
    </StudentShell>
  );
}
