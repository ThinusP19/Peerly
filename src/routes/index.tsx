import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { FullPageLoading } from "@/components/layout/RoleGuard";
import { homePathForRole, useSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  component: Index,
});

/**
 * Entry point. Sends signed-in users to their portal and everyone else to the
 * login screen. The session is restored from localStorage after first paint, so
 * this waits for `hydrated` before deciding.
 */
function Index() {
  const { user, hydrated } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    navigate({ to: user ? homePathForRole(user.role) : "/login", replace: true });
  }, [hydrated, user, navigate]);

  return <FullPageLoading />;
}
