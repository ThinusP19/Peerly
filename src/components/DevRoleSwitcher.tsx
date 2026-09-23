import { useNavigate } from "@tanstack/react-router";
import { Check, FlaskConical, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { homePathForRole, personas, roleLabel, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Prototype-only helper: jump straight into any persona without a real login,
 * so every screen is reachable for review. This widget would not ship.
 */
export function DevRoleSwitcher() {
  const { user, hydrated, signInAs, signOut } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Prototype tooling: stripped from production builds entirely, so a deployed
  // Peerly has no way to assume an identity without signing in.
  if (!import.meta.env.DEV) return null;
  if (!hydrated) return null;

  // A real sign-in against the API, so the navigation waits for the session to
  // exist. Signing in optimistically would land on a portal that then bounces
  // straight back out when its first request is refused.
  const switchTo = async (email: string, role: (typeof personas)[number]["role"]) => {
    await signInAs(email);
    setOpen(false);
    navigate({ to: homePathForRole(role) });
  };

  return (
    // Lifted clear of the student portal's bottom tab bar on small screens,
    // where it otherwise covered - and swallowed clicks on - the last tab.
    // Marked so browser tests can hide it: it is development-only furniture,
    // and a fixed widget in the corner sits on top of whatever the panel
    // footers put there - which is usually the primary action.
    <div data-dev-role-switcher className="fixed right-4 bottom-20 z-50 lg:bottom-4 print:hidden">
      {open ? (
        <div className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-popover shadow-raised">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Prototype role switcher</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setOpen(false)}
              aria-label="Close role switcher"
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {personas.map((persona) => {
              const active = user?.email === persona.email;
              return (
                <button
                  key={persona.email}
                  type="button"
                  onClick={() => void switchTo(persona.email, persona.role)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                    active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{persona.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {persona.hint}
                    </span>
                  </span>
                  {active ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>

          <Separator />
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              {user ? `Signed in as ${roleLabel(user.role)}` : "Signed out"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                signOut();
                setOpen(false);
                navigate({ to: "/login" });
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="shadow-raised"
          onClick={() => setOpen(true)}
        >
          <FlaskConical aria-hidden="true" />
          {user ? `${user.name} ${user.surname}` : "Sign in as…"}
        </Button>
      )}
    </div>
  );
}
