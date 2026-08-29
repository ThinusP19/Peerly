import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Grid3x3,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Sigma,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { BrandLockup } from "@/components/layout/BrandMark";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { roleLabel, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { assessments, classes } from "@/mocks/data";
import type { Role } from "@/mocks/types";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const lecturerNav = [
  { to: "/lecturer", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/lecturer/classes", label: "Classes", icon: BookOpen },
  { to: "/lecturer/groups", label: "Groups", icon: UsersRound },
  { to: "/lecturer/assessments", label: "Assessments", icon: ClipboardList },
  { to: "/lecturer/monitor", label: "Submission Monitor", icon: BarChart3 },
  { to: "/lecturer/matrix", label: "Evaluation Matrix", icon: Grid3x3 },
  { to: "/lecturer/marks", label: "Marks & Calculation", icon: Sigma },
  { to: "/lecturer/results", label: "Results & Export", icon: ScrollText },
  { to: "/lecturer/audit", label: "Audit Log", icon: ScrollText },
] as const satisfies readonly NavItem[];

const adminNav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/accounts", label: "Lecturer & Admin Accounts", icon: Users },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText },
] as const satisfies readonly NavItem[];

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items: readonly NavItem[] = role === "admin" ? adminNav : lecturerNav;

  return (
    <nav className="space-y-0.5" aria-label="Portal sections">
      {items.map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-card"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent/45 hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Link to={role === "admin" ? "/admin" : "/lecturer"} onClick={onNavigate}>
        <BrandLockup subtitle="Assessment Hub" tone="onDark" />
      </Link>
      <Separator className="bg-sidebar-border" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavLinks role={role} onNavigate={onNavigate} />
      </div>
      <p className="text-xs text-muted-foreground">Prototype build · mock data only</p>
    </div>
  );
}

/** Which class and assessment the lecturer is currently working in. */
function ContextSelector() {
  const { user, activeClassId, activeAssessmentId, setActiveClassId, setActiveAssessmentId } =
    useSession();

  if (user?.role !== "lecturer") return null;

  const owned = classes.filter((c) => c.lecturerId === user.id);
  const classAssessments = assessments.filter((a) => a.classId === activeClassId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="context-class">
        Active class
      </label>
      <Select
        value={activeClassId}
        onValueChange={(value) => {
          setActiveClassId(value);
          const first = assessments.find((a) => a.classId === value);
          if (first) setActiveAssessmentId(first.id);
        }}
      >
        <SelectTrigger id="context-class" className="h-9 w-auto min-w-44 gap-2">
          <SelectValue placeholder="Select a class" />
        </SelectTrigger>
        <SelectContent>
          {owned.map((klass) => (
            <SelectItem key={klass.id} value={klass.id}>
              {klass.moduleCode} — {klass.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="sr-only" htmlFor="context-assessment">
        Active assessment
      </label>
      <Select value={activeAssessmentId} onValueChange={setActiveAssessmentId}>
        <SelectTrigger id="context-assessment" className="h-9 w-auto min-w-44 gap-2">
          <SelectValue placeholder="Select an assessment" />
        </SelectTrigger>
        <SelectContent>
          {classAssessments.map((assessment) => (
            <SelectItem key={assessment.id} value={assessment.id}>
              {assessment.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function UserBlock() {
  const { user, signOut } = useSession();
  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right leading-tight sm:block">
        <p className="text-sm font-medium text-foreground">
          {user.name} {user.surname}
        </p>
        <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
      </div>
      <Button variant="outline" size="sm" onClick={signOut}>
        <LogOut aria-hidden="true" />
        <span className="hidden sm:inline">Sign out</span>
        <span className="sr-only sm:hidden">Sign out</span>
      </Button>
    </div>
  );
}

/**
 * Admin Portal shell — shared by the System Administrator and Lecturer roles.
 * Desktop-first with a persistent sidebar; the sidebar collapses into a sheet
 * below `lg`, so it stays usable down to tablet width.
 */
export function AdminShell({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <RoleGuard allow={allow}>
      <AdminShellInner menuOpen={menuOpen} setMenuOpen={setMenuOpen}>
        {children}
      </AdminShellInner>
    </RoleGuard>
  );
}

function AdminShellInner({
  menuOpen,
  setMenuOpen,
  children,
}: {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  children: ReactNode;
}) {
  const { user } = useSession();
  const role = user!.role;

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarBody role={role} />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden">
                  <Menu aria-hidden="true" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
                <SheetTitle className="sr-only">Portal navigation</SheetTitle>
                <SidebarBody role={role} onNavigate={() => setMenuOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="lg:hidden">
              <BrandLockup />
            </div>

            <div className="order-last w-full lg:order-none lg:w-auto">
              <ContextSelector />
            </div>

            <div className="ml-auto">
              <UserBlock />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
