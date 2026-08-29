import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { Button } from "@/components/ui/button";
import { activateAccount } from "@/services/peerly";

export const Route = createFileRoute("/activate")({
  // A real activation link carries a signed token. In the prototype the token
  // value simply picks which of the three landing states to show, and is
  // optional so `/activate` on its own still renders the happy path.
  validateSearch: (search: Record<string, unknown>): { token?: string; email?: string } => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
    // Carried from registration so activation knows which account to switch on.
    email: typeof search["email"] === "string" ? search["email"] : undefined,
  }),
  component: ActivatePage,
});

type State = "verifying" | "success" | "expired";

function ActivatePage() {
  const { token, email } = Route.useSearch();
  const [state, setState] = useState<State>("verifying");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setState("verifying");
    let cancelled = false;

    void (async () => {
      if (token === "expired" || token === "invalid") {
        await new Promise((resolve) => setTimeout(resolve, 900));
        if (!cancelled) setState("expired");
        return;
      }
      // Flip the account to active and run the class-list match (FR-04).
      if (email) await activateAccount(email);
      else await new Promise((resolve) => setTimeout(resolve, 900));
      if (!cancelled) setState("success");
    })();

    return () => {
      cancelled = true;
    };
  }, [token, email]);

  const resend = async () => {
    setResending(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setResending(false);
    toast.success("A new activation link is on its way to your inbox.");
  };

  if (state === "verifying") {
    return (
      <AuthShell title="Activating your account" description="This only takes a moment.">
        <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
          <Loader2 className="size-7 animate-spin text-primary" aria-hidden="true" />
          <p role="status" className="text-sm">
            Checking your activation link…
          </p>
        </div>
      </AuthShell>
    );
  }

  if (state === "success") {
    return (
      <AuthShell title="Your account is active" description="You can sign in to Peerly now.">
        <div className="space-y-5">
          <div className="flex gap-3 rounded-md border border-success/30 bg-success-muted p-3.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Your email address is confirmed. Your lecturer will match you to a class list before
              your first assessment opens.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link to="/login">Go to sign in</Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Want to see the expired state?{" "}
            <Link
              to="/activate"
              search={{ token: "expired" }}
              className="font-medium text-primary hover:underline"
            >
              Open an expired link
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="This link has expired"
      description="Activation links are only valid for 24 hours."
    >
      <div className="space-y-5">
        <div className="flex gap-3 rounded-md border border-warning/30 bg-warning-muted p-3.5 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            We couldn't activate your account with this link. It may have already been used, or it
            may be older than 24 hours.
          </p>
        </div>

        <BusyButton
          className="w-full"
          busy={resending}
          busyLabel="Sending a new link…"
          onClick={resend}
        >
          Send me a new link
        </BusyButton>

        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
