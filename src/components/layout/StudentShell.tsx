import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardList,
  LogOut,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { BrandLockup, BrandMark } from "@/components/layout/BrandMark";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
 * Sidebar from `lg` up; below that the same destinations become a bottom tab
 * bar rather than a hamburger - there are only three, and on a phone they
 * belong within thumb reach.
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

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <Link to="/student">
          <BrandLockup subtitle="Assessment Hub" tone="onDark" />
        </Link>
        <Separator className="my-4 bg-sidebar-border" />

        <nav className="flex-1 space-y-0.5" aria-label="Student sections">
          {nav.map((item) => {
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-card"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent/45 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="rounded-md bg-sidebar-accent/35 p-3">
          <p className="truncate text-sm font-medium text-sidebar-primary">
            {user?.name} {user?.surname}
          </p>
          <p className="text-xs text-sidebar-foreground/70">{user?.studentNumber}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={signOut}
            className="mt-2.5 w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Mobile top bar: identity and sign-out only - navigation lives at the
            bottom of the screen where a thumb can reach it. */}
        <header className="sticky top-0 z-20 border-b bg-card lg:hidden">
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

        <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 pb-24 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      <nav
        aria-label="Student sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto flex max-w-3xl">
          {nav.map((item) => {
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
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
