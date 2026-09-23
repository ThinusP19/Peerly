import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, FlaskConical } from "lucide-react";

import { BrandLockup } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { homePathForRole, personas, roleLabel, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dev")({
  component: DevPage,
});

const screens = [
  { to: "/login", label: "Sign in" },
  { to: "/register", label: "Student registration" },
  { to: "/activate", label: "Account activation - success" },
  { to: "/forgot-password", label: "Forgot password" },
  { to: "/reset-password", label: "Reset password" },
] as const;

/**
 * Prototype-only jump-off page. Every screen in the spec is reachable from a
 * persona below plus the portal navigation; the auth screens sit outside both
 * portals so they're linked directly.
 */
function DevPage() {
  const { user, signInAs } = useSession();
  const navigate = useNavigate();

  // Same reasoning as the corner switcher: this page hands out any identity in
  // the system, so it must not exist in a production build.
  if (!import.meta.env.DEV) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-7xl font-bold text-foreground">404</h1>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BrandLockup subtitle="Assessment Hub" />
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
            <FlaskConical className="size-3.5" aria-hidden="true" />
            Prototype tools
          </span>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Jump into any role
          </h1>
          <p className="text-sm text-muted-foreground">
            This page exists only in the prototype. Pick a persona to sign in as - every screen in
            the two portals is reachable from there. The same switcher is pinned to the corner of
            every screen.
          </p>
        </div>

        <Card className="divide-y shadow-card">
          {personas.map((persona) => {
            const active = user?.email === persona.email;
            return (
              <button
                key={persona.email}
                type="button"
                onClick={() => {
                  // A real sign-in now, so the navigation waits for it.
                  void signInAs(persona.email).then(() =>
                    navigate({ to: homePathForRole(persona.role) }),
                  );
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 p-4 text-left transition-colors first:rounded-t-lg last:rounded-b-lg",
                  active ? "bg-accent" : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{persona.label}</span>
                  <span className="block text-sm text-muted-foreground">{persona.hint}</span>
                </span>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {roleLabel(persona.role)}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            );
          })}
        </Card>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            Screens that sit outside both portals
          </h2>
          <div className="flex flex-wrap gap-2">
            {screens.map((screen) => (
              <Button key={screen.to} asChild variant="outline" size="sm">
                <Link to={screen.to}>{screen.label}</Link>
              </Button>
            ))}
            <Button asChild variant="outline" size="sm">
              <Link to="/activate" search={{ token: "expired" }}>
                Account activation - expired
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/reset-password" search={{ token: "expired" }}>
                Reset password - expired link
              </Link>
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          All data is mock data held in memory - nothing is sent anywhere, and a page refresh resets
          any changes you make.
        </p>
      </div>
    </div>
  );
}
