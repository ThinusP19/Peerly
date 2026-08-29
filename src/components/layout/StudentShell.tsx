import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/layout/BrandMark";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";

/**
 * Student Portal shell — mobile-first. A simple top bar and a single column
 * that stays readable from 360px up with no horizontal scroll.
 */
export function StudentShell({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allow={["student"]}>
      <StudentShellInner>{children}</StudentShellInner>
    </RoleGuard>
  );
}

function StudentShellInner({ children }: { children: ReactNode }) {
  const { user, signOut } = useSession();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-card">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/student" className="flex min-w-0 items-center gap-2">
            <BrandMark />
            <span className="font-semibold tracking-tight text-foreground">Peerly</span>
          </Link>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="min-w-0 text-right leading-tight">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.name} {user?.surname}
              </p>
              <p className="text-xs text-muted-foreground">Student</p>
            </div>
            <Button variant="outline" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-5 pb-16">{children}</main>
    </div>
  );
}
