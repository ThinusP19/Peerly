import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/components/layout/AdminShell";

export const Route = createFileRoute("/lecturer")({
  component: LecturerLayout,
});

function LecturerLayout() {
  return (
    <AdminShell allow={["lecturer"]}>
      <Outlet />
    </AdminShell>
  );
}
