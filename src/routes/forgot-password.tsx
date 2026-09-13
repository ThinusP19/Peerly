import { Link, createFileRoute } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
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
      setError("This doesn't look like an email address - check for a missing @ or full stop.");
      return;
    }
    setError(null);

    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 750));
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
          <div className="flex gap-3 rounded-md border border-success/30 bg-success-muted p-3.5 text-sm text-success">
            <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              If an account exists for <span className="font-medium">{email}</span>, we've sent it a
              link to reset the password. The link is valid for one hour.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link to="/reset-password" search={{ token: "demo-token" }}>
                Open the reset link
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Tell us the email address on your Peerly account and we'll send you a reset link."
      footer={
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
