import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Grid3x3,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Sigma,
  SlidersHorizontal,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/layout/BrandMark";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/SkipLink";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { initials } from "@/lib/format";
import { useLecturerContext } from "@/hooks/use-lecturer-context";
import { roleLabel, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getAssessments } from "@/services/peerly";

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
  { to: "/lecturer/settings", label: "Settings", icon: Settings },
] as const satisfies readonly NavItem[];

const adminNav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/accounts", label: "Lecturer & Admin Accounts", icon: Users },
  { to: "/admin/rating-values", label: "Rating Values", icon: SlidersHorizontal },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const satisfies readonly NavItem[];

const homeFor = (role: Role) => (role === "admin" ? "/admin" : "/lecturer");

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items: readonly NavItem[] = role === "admin" ? adminNav : lecturerNav;

  return (
    <nav className="space-y-1" aria-label="Portal sections">
      {items.map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
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
  );
}

function SidebarUser() {
  const { user, signOut } = useSession();
  if (!user) return null;

  return (
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
        <p className="truncate text-xs text-sidebar-foreground">{roleLabel(user.role)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void signOut()}
        aria-label="Sign out"
        className="size-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
      >
        <LogOut aria-hidden="true" />
      </Button>
    </div>
  );
}

function SidebarBody({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <Link
        to={homeFor(role)}
        onClick={onNavigate}
        className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5"
      >
        <BrandMark className="size-8 text-sidebar-primary" />
        <span className="leading-tight">
          <span className="block text-lg font-semibold tracking-tight text-sidebar-primary">
            Peerly
          </span>
          <span className="block text-xs text-sidebar-foreground">North-West University</span>
        </span>
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <NavLinks role={role} onNavigate={onNavigate} />
      </div>
      <SidebarUser />
    </div>
  );
}

/** Which class and assessment the lecturer is currently working in. */
function ContextSelector() {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({
    select: (state) => state.location.pathname.replace(/\/$/, ""),
  });
  const [switchingClass, setSwitchingClass] = useState(false);
  const onAssessmentPage =
    /^\/lecturer\/assessments\/[^/]+(?:\/edit)?$/.test(pathname) &&
    pathname !== "/lecturer/assessments/new";
  const editingAssessment = onAssessmentPage && pathname.endsWith("/edit");
  const hideAssessmentSelector =
    pathname === "/lecturer/assessments" || pathname === "/lecturer/assessments/new";
  // The lists come from the API, and the hook corrects a remembered selection
  // that no longer exists rather than passing it on to every screen.
  const {
    classes: owned,
    classId,
    assessments: classAssessments,
    assessmentId,
    setActiveClassId,
    setActiveAssessmentId,
  } = useLecturerContext();

  const canLeaveEdit = () =>
    !editingAssessment ||
    window.confirm("Leave this assessment setup? Any unsaved changes will be lost.");

  const selectClass = async (nextClassId: string) => {
    if (!onAssessmentPage) {
      setActiveClassId(nextClassId);
      setActiveAssessmentId("");
      return;
    }
    if (!canLeaveEdit()) return;

    setSwitchingClass(true);
    try {
      const nextAssessments = await queryClient.fetchQuery({
        queryKey: ["assessments", nextClassId],
        queryFn: () => getAssessments(nextClassId),
      });
      const first = nextAssessments[0];
      setActiveClassId(nextClassId);
      setActiveAssessmentId(first?.id ?? "");
      if (first) {
        await navigate({
          to: "/lecturer/assessments/$assessmentId",
          params: { assessmentId: first.id },
        });
      } else {
        await navigate({ to: "/lecturer/assessments" });
      }
    } catch {
      toast.error("Couldn't load that class's assessments. Please try again.");
    } finally {
      setSwitchingClass(false);
    }
  };

  const selectAssessment = (nextAssessmentId: string) => {
    if (!onAssessmentPage) {
      setActiveAssessmentId(nextAssessmentId);
      return;
    }
    if (!canLeaveEdit()) return;
    setActiveAssessmentId(nextAssessmentId);
    void navigate({
      to: "/lecturer/assessments/$assessmentId",
      params: { assessmentId: nextAssessmentId },
    });
  };

  if (user?.role !== "lecturer") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="context-class">
        Active class
      </label>
      <Select
        disabled={switchingClass}
        // An empty value would make this uncontrolled, so the placeholder is
        // shown by leaving it undefined until the classes have loaded.
        {...(classId ? { value: classId } : {})}
        onValueChange={(value) => void selectClass(value)}
      >
        <SelectTrigger id="context-class" className="h-9 w-auto min-w-44 gap-2 bg-card">
          <SelectValue placeholder="Select a class" />
        </SelectTrigger>
        <SelectContent>
          {owned.map((klass) => (
            <SelectItem key={klass.id} value={klass.id}>
              {klass.moduleCode} - {klass.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!hideAssessmentSelector ? (
        <>
          <label className="sr-only" htmlFor="context-assessment">
            Active assessment
          </label>
          <Select
            disabled={switchingClass}
            {...(assessmentId ? { value: assessmentId } : {})}
            onValueChange={selectAssessment}
          >
            <SelectTrigger id="context-assessment" className="h-9 w-auto min-w-44 gap-2 bg-card">
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
        </>
      ) : null}
    </div>
  );
}

/**
 * No notification feed exists yet, so the bell says so honestly rather than
 * showing an unread dot for messages that aren't there.
 */
function CurrentSection({ role }: { role: Role }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items: readonly NavItem[] = role === "admin" ? adminNav : lecturerNav;
  // Same match the sidebar uses to highlight its active item.
  const current = items.find((item) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to),
  );

  return (
    <span className="hidden text-lg font-semibold tracking-tight whitespace-nowrap text-foreground lg:block">
      {current?.label ?? "Peerly"}
    </span>
  );
}

function NotificationsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <p className="px-2 py-3 text-sm text-muted-foreground">You're all caught up.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user, signOut } = useSession();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2.5 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-muted"
        >
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials(user.name, user.surname)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-semibold whitespace-nowrap text-foreground sm:block">
            {user.name} {user.surname}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Open account menu</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold text-foreground">
            {user.name} {user.surname}
          </p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">{roleLabel(user.role)}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Admin Portal shell - shared by the Lecturer and System Administrator roles.
 * Plum sidebar with the signed-in user at its foot; a white top bar with the
 * product name, notifications and the account menu. The sidebar collapses into
 * a sheet below `lg`, so it stays usable down to tablet width.
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // The dashboard spans every class, so it has no class/assessment context.
  // Every other lecturer page works inside one, so the switchers sit under the
  // top bar there.
  // The class/assessment selector only means something on pages that show class data.
  const showContext =
    role === "lecturer" && pathname !== "/lecturer" && !pathname.startsWith("/lecturer/settings");

  return (
    <div className="min-h-screen bg-background">
      <SkipLink />
      {/* Floats: inset from the window edges with rounded corners. */}
      <aside className="sidebar-surface fixed inset-y-3 left-3 z-30 hidden w-64 overflow-hidden rounded-2xl bg-sidebar shadow-raised lg:block">
        <SidebarBody role={role} />
      </aside>

      {/* 17.5rem = 0.75rem inset + 16rem sidebar + 0.75rem gap. */}
      <div className="lg:pl-70">
        {/* The top bar floats the same way: inset, rounded, and it stays put
            with a small gap above it as the page scrolls. */}
        <header className="sticky top-3 z-20 mx-3 mt-3 overflow-hidden rounded-2xl border bg-card shadow-card lg:ml-0">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden">
                  <Menu aria-hidden="true" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="sidebar-surface w-72 border-sidebar-border bg-sidebar p-0"
              >
                <SheetTitle className="sr-only">Portal navigation</SheetTitle>
                <SidebarBody role={role} onNavigate={() => setMenuOpen(false)} />
              </SheetContent>
            </Sheet>

            {/* The logo only shows here below lg. From lg the sidebar already
                carries it, so the top bar names the current section instead. */}
            <Link to={homeFor(role)} className="flex items-center gap-2.5 lg:hidden">
              <BrandMark className="size-7" />
              <span className="text-lg font-semibold tracking-tight text-foreground">Peerly</span>
            </Link>
            <CurrentSection role={role} />
            <span className="hidden h-5 w-px bg-border lg:block" aria-hidden="true" />
            <span className="hidden text-xs font-semibold tracking-[0.14em] whitespace-nowrap text-muted-foreground uppercase lg:block">
              NWU Peer Assessment System
            </span>

            <div className="ml-auto flex items-center gap-1.5">
              <NotificationsMenu />
              <UserMenu />
            </div>
          </div>

          {showContext ? (
            <div className="border-t bg-muted/40 px-4 py-2.5 sm:px-6 lg:px-8">
              <ContextSelector />
            </div>
          ) : null}
        </header>

        {/* Full width, with the same 12px gutters the sidebar and top bar use,
            so every panel lines up as one set of tiles. */}
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="space-y-3 p-3 outline-none lg:pl-0">
          {children}
        </main>
      </div>
    </div>
  );
}
