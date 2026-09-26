import { Link, createFileRoute } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { type SignInAudience, parseSignInAudience } from "@/lib/sign-in-audience";
import { forgotPassword } from "@/services/auth";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/forgot-password")({
  head: () => titleHead("Forgot password"),
  // Carries which sign-in form the user came from, so "Back to sign in" goes
  // one step back to that form instead of starting over at role selection.
  validateSearch: (search: Record<string, unknown>): { as?: SignInAudience } => ({
    as: parseSignInAudience(search["as"]),
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { as } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email.trim()) {
      setError("Enter the email address you registered with.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("This doesn't look like an email address. Check for a missing @ or full stop.");
      return;
    }
    setError(null);

    setBusy(true);
    // SR-06: the same acknowledgement whether or not that address has an
    // account, so the screen does not become a way to discover who is
    // registered. A failure to reach the server is the one thing worth
    // reporting, since the person would otherwise wait for an email that was
    // never even requested.
    try {
      await forgotPassword(email.trim());
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        setBusy(false);
        setError("We couldn't reach Peerly. Check your connection and try again.");
        return;
      }
      // Anything else is deliberately indistinguishable from success.
    }
    setBusy(false);
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        description="If we found an account, a link is on its way."
      >
        <div className="space-y-5">
          {/* Deliberately generic: confirming whether an address exists would
              let anyone probe for registered students. */}
          <div className="flex gap-2.5 rounded-lg border border-success/30 bg-success-muted p-3.5 text-sm text-success">
            <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              If an account exists for <span className="font-medium">{email}</span>, we've sent it a
              link to reset the password. The link is valid for one hour.
            </p>
          </div>

          <Button asChild variant="outline" className="h-11 w-full rounded-lg">
            <Link to="/login" search={{ as }}>
              Back to sign in
            </Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Tell us the email address on your Peerly account and we'll send you a reset link."
      footer={
        <Link to="/login" search={{ as }} className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormField label="Email address" error={error} required>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FormField>

        <BusyButton type="submit" className="w-full" busy={busy} busyLabel="Sending…">
          Send reset link
        </BusyButton>
      </form>
    </AuthShell>
  );
}
