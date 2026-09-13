import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (token === "expired") {
    return (
      <AuthShell
        title="This reset link has expired"
        description="Reset links are valid for one hour."
      >
        <div className="space-y-5">
          <div className="flex gap-3 rounded-md border border-warning/30 bg-warning-muted p-3.5 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Request a new link and use it within the hour.</p>
          </div>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password changed" description="You can sign in with your new password now.">
        <div className="space-y-5">
          <div className="flex gap-3 rounded-md border border-success/30 bg-success-muted p-3.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Your password has been updated. The reset link you used is no longer valid.</p>
          </div>
          <Button asChild className="w-full">
            <Link to="/login">Go to sign in</Link>
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
    await new Promise((resolve) => setTimeout(resolve, 750));
    setBusy(false);
    setDone(true);
  };

  return (
    <AuthShell title="Choose a new password" description="Pick something you haven't used before.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
