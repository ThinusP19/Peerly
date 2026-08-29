import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { homePathForRole, useSession } from "@/lib/session";
import type { Role } from "@/mocks/types";

export function FullPageLoading({ label = "Loading Peerly…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

/**
 * Keeps each portal to its own roles.
 *
 * The session is restored from localStorage after the first paint, so this must
 * wait for `hydrated` before redirecting — otherwise a signed-in user gets
 * bounced to the login screen on every refresh.
 */
export function RoleGuard({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user, hydrated } = useSession();
  const navigate = useNavigate();

  const permitted = Boolean(user && allow.includes(user.role));

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
    } else if (!allow.includes(user.role)) {
      navigate({ to: homePathForRole(user.role), replace: true });
    }
  }, [hydrated, user, allow, navigate]);

  if (!hydrated) return <FullPageLoading />;
  if (!permitted) return <FullPageLoading label="Taking you to the right place…" />;

  return <>{children}</>;
}
