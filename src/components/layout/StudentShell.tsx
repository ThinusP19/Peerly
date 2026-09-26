import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardList,
  LogOut,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { BrandLockup, BrandMark } from "@/components/layout/BrandMark";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/SkipLink";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface NavItem {
  to: "/student" | "/student/group" | "/student/guide" | "/student/settings";
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const nav: NavItem[] = [
  { to: "/student", label: "Assessments", icon: ClipboardList, exact: true },
  { to: "/student/group", label: "My group", icon: UsersRound },
  { to: "/student/guide", label: "How rating works", icon: BookOpen },
  { to: "/student/settings", label: "Settings", icon: Settings },
];

function useActive() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (to: string, exact?: boolean) => (exact ? pathname === to : pathname.startsWith(to));
}

/**
 * Student Portal shell.
 *
 * Floats the same way AdminShell does: an inset, rounded sidebar from `lg` up.
 * Below that the destinations become a floating bottom tab bar rather than a
 * hamburger - there are only four, and on a phone they belong within thumb
 * reach.
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
  const isActive = useActive();
  // Set when signing out would remove evaluation work the server does not have.
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const handleSignOut = async () => {
    if ((await signOut()) === "unsaved") setConfirmSignOut(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <SkipLink />
      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out without your unsent changes?"
        objectName="Your peer evaluation"
        description="Some of your answers haven't reached Peerly yet - changes to an evaluation you haven't resubmitted, or answers saved while the connection was down. They are only on this computer."
        consequence="Signing out removes them from this computer, so the next person can't see them. Cancel to go back, then submit or reconnect first."
        confirmLabel="Sign out anyway"
        cancelLabel="Go back"
        destructive
        onConfirm={async () => {
          await signOut({ discardUnsaved: true });
        }}
      />
      {/* Floats: inset from the window edges with rounded corners. */}
      <aside className="sidebar-surface fixed inset-y-3 left-3 z-30 hidden w-64 flex-col overflow-hidden rounded-2xl bg-sidebar shadow-raised lg:flex">
        <Link to="/student" className="flex items-center border-b border-sidebar-border px-5 py-5">
          <BrandLockup subtitle="Assessment Hub" tone="onDark" />
        </Link>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <nav className="space-y-1" aria-label="Student sections">
            {nav.map((item) => {
              const active = isActive(item.to, item.exact);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-card"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {user ? (
          <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-4">
            <Avatar className="size-9">
              <AvatarFallback className="bg-sidebar-accent text-xs font-semibold text-sidebar-primary">
                {initials(user.name, user.surname)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-sidebar-primary">
                {user.name} {user.surname}
              </p>
              <p className="truncate text-xs text-sidebar-foreground">{user.studentNumber}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void handleSignOut()}
              aria-label="Sign out"
              className="size-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
            >
              <LogOut aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </aside>

      {/* 17.5rem = 0.75rem inset + 16rem sidebar + 0.75rem gap. */}
      <div className="lg:pl-70">
        {/* Mobile top bar: identity and sign-out only - navigation lives at the
            bottom of the screen where a thumb can reach it. */}
        <header className="sticky top-3 z-20 mx-3 mt-3 overflow-hidden rounded-2xl border bg-card shadow-card lg:hidden">
          <div className="flex h-16 items-center gap-3 px-4">
            <Link to="/student" className="flex min-w-0 items-center gap-2.5">
              <BrandMark className="size-7" />
              <span className="text-lg font-semibold tracking-tight text-foreground">Peerly</span>
            </Link>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <div className="min-w-0 text-right leading-tight">
                <p className="truncate text-sm font-semibold text-foreground">
                  {user?.name} {user?.surname}
                </p>
                <p className="text-xs text-muted-foreground">Student</p>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void handleSignOut()}
                aria-label="Sign out"
              >
                <LogOut aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>

        {/* Full width with the same 12px gutters as the sidebar; the extra
            bottom padding below lg clears the floating tab bar. */}
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="space-y-3 p-3 pb-28 outline-none lg:pb-3 lg:pl-0"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Student sections"
        className="fixed inset-x-3 bottom-3 z-30 overflow-hidden rounded-2xl border bg-card pb-[env(safe-area-inset-bottom)] shadow-raised lg:hidden"
      >
        <div className="flex">
          {nav.map((item) => {
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium transition-colors",
                  active
                    ? "font-semibold text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-5" aria-hidden="true" />
                <span className="text-center leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
