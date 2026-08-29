import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/components/layout/AdminShell";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminShell allow={["admin"]}>
      <Outlet />
    </AdminShell>
  );
}
