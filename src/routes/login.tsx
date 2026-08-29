import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { RoleSelector } from "@/components/shared/RoleSelector";
import { Input } from "@/components/ui/input";
import { homePathForRole, useSession } from "@/lib/session";
import { users } from "@/mocks/data";
import type { Role } from "@/mocks/types";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

interface Errors {
  email?: string;
  password?: string;
}

function LoginPage() {
  const { signInAs } = useSession();
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const next: Errors = {};
    if (!email.trim()) next.email = "Enter the email address you registered with.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 650));

    // Prototype "auth": any password works for a seeded account. The failure
    // message is deliberately generic — it must not reveal which field was wrong.
    const account = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());

    if (!account || account.status === "inactive") {
      setBusy(false);
      setFormError(
        "Those details don't match an active Peerly account. Please check and try again.",
      );
      return;
    }

    signInAs(account.id);
    setBusy(false);
    toast.success(`Signed in as ${account.name} ${account.surname}`);
    // The account's own role decides the portal — not the selector above. If the
    // two disagree the account wins, because the selector is user input and the
    // role is not.
    navigate({ to: homePathForRole(account.role) });
  };

  return (
    <AuthShell
      title="Sign in"
      description="Choose how you're signing in, then use the email address your institution registered for you."
      footer={
        <>
          Don't have an account yet?{" "}
          <Link to="/register" className="font-medium text-auth-canvas-accent hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError ? (
          <div
            role="alert"
            className="flex gap-2.5 rounded-md border border-danger/30 bg-danger-muted p-3 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{formError}</p>
          </div>
        ) : null}

        <RoleSelector value={role} onChange={setRole} label="I'm signing in as" />

        <FormField label="Email address" error={errors.email} required>
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

        <FormField label="Password" error={errors.password} required>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </FormField>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot your password?
          </Link>
        </div>

        <BusyButton type="submit" className="w-full" busy={busy} busyLabel="Signing in…">
          Sign in
        </BusyButton>
      </form>
    </AuthShell>
  );
}
