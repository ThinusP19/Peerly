import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { resetPassword } from "@/services/auth";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { token?: string; as?: "student" | "lecturer" } => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
    // Which sign-in form to return to afterwards.
    as: search["as"] === "student" || search["as"] === "lecturer" ? search["as"] : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, as } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  /** Set when the server refuses the link, not only when the URL says so. */
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);

  if (expired || token === "expired") {
    return (
      <AuthShell
        title="This reset link has expired"
        description="Reset links are valid for one hour."
      >
        <div className="space-y-5">
          <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-muted p-3.5 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Request a new link and use it within the hour.</p>
          </div>
          <Button asChild className="h-11 w-full rounded-lg text-base font-semibold">
            <Link to="/forgot-password" search={{ as }}>
              Request a new link
            </Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password changed" description="You can sign in with your new password now.">
        <div className="space-y-5">
          <div className="flex gap-2.5 rounded-lg border border-success/30 bg-success-muted p-3.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Your password has been updated. The reset link you used is no longer valid.</p>
          </div>
          <Button asChild className="h-11 w-full rounded-lg text-base font-semibold">
            <Link to="/login" search={{ as }}>
              Go to sign in
            </Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const next: { password?: string; confirm?: string } = {};
    if (!password) {
      next.password = "Choose a new password.";
    } else if (password.length < 8) {
      next.password = "Use at least 8 characters so your marks stay protected.";
    }
    if (!confirm) {
      next.confirm = "Type your new password a second time to confirm it.";
    } else if (confirm !== password) {
      next.confirm = "The two passwords don't match.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await resetPassword(token ?? "", password);
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) {
        // A spent or expired link comes back against `token`. It is not
        // something the person can fix in this form, so the page turns into
        // the expired state rather than showing an error beside a field.
        if (error.field("token")) {
          setExpired(true);
          return;
        }
        // SR-02 failures name the field they belong to.
        setErrors({ password: error.field("password") ?? error.message });
        return;
      }
      setErrors({ password: "We couldn't change your password. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" description="Pick something you haven't used before.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormField
          label="New password"
          error={errors.password}
          hint="At least 8 characters."
          required
        >
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Confirm new password" error={errors.confirm} required>
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          )}
        </FormField>

        <BusyButton type="submit" className="w-full" busy={busy} busyLabel="Saving…">
          Save new password
        </BusyButton>
      </form>
    </AuthShell>
  );
}
