import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { PasswordRules } from "@/components/shared/PasswordRules";
import { Button } from "@/components/ui/button";
import { passwordChecks } from "@/lib/password";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { activate, getActivation, type ActivationAccount } from "@/services/auth";

export const Route = createFileRoute("/activate")({
  // A real activation link carries a signed token. In the prototype the token
  // value simply picks which landing state to show, and is optional so
  // `/activate` on its own still renders the happy path.
  validateSearch: (search: Record<string, unknown>): { token?: string; email?: string } => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
    // Which account to switch on: carried from registration, or from the
    // link emailed when an administrator creates a staff account.
    email: typeof search["email"] === "string" ? search["email"] : undefined,
  }),
  component: ActivatePage,
});

type State = "verifying" | "set-password" | "success" | "expired";

/**
 * FR-03 account activation. Students chose a password when they registered,
 * so their link activates straight away. Admin Portal accounts are created by
 * an administrator (FR-01), so the holder sets their own password here first -
 * the administrator never knows it.
 */
function ActivatePage() {
  const { token, email } = Route.useSearch();
  const [state, setState] = useState<State>("verifying");
  const [account, setAccount] = useState<ActivationAccount | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setState("verifying");
    let cancelled = false;

    void (async () => {
      if (!token) {
        if (!cancelled) setState("expired");
        return;
      }

      // A link the server will not honour - spent, expired or never issued -
      // comes back as no account at all. That is the expired state, offered
      // with a resend rather than as an error.
      const found = await getActivation(token).catch(() => null);
      if (cancelled) return;

      setAccount(found);
      setState(found ? "set-password" : "expired");
    })();

    return () => {
      cancelled = true;
    };
  }, [token, email]);

  const resend = async () => {
    // Still a toast: re-issuing a staff activation link is an administrator
    // action (FR-01), and that endpoint arrives with the admin portal.
    setResending(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setResending(false);
    toast.success("Ask your administrator to send a new activation link.");
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

  if (state === "set-password" && account && email) {
    // `account` is only ever set from a token the server accepted, so there is
    // always one here - but the router types it as optional, so narrow rather
    // than assert.
    if (!token) return null;
    return <SetPassword account={account} token={token} onDone={() => setState("success")} />;
  }

  if (state === "success") {
    const staff = account && account.role !== "student";
    return (
      <AuthShell
        title="Your account is active"
        description={
          staff
            ? "Sign in with your email address and the password you just set."
            : "You can sign in to Peerly now."
        }
      >
        <div className="space-y-5">
          <div className="flex gap-2.5 rounded-lg border border-success/30 bg-success-muted p-3.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              {staff
                ? `Welcome to Peerly, ${account.name}. Your email address is confirmed and your password is set.`
                : "Your email address is confirmed. Your lecturer will match you to a class list before your first assessment opens."}
            </p>
          </div>
          <Button asChild className="h-11 w-full rounded-lg text-base font-semibold">
            <Link to="/login" search={{ as: staff ? "lecturer" : "student" }}>
              Go to sign in
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Want to see the expired state?{" "}
            <Link
              to="/activate"
              search={{ token: "expired" }}
              className="font-semibold text-primary hover:underline"
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
        <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-muted p-3.5 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            We couldn't activate your account with this link. It may have already been used, or it
            may be older than 24 hours.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <BusyButton
            className="h-11 w-full rounded-lg text-base font-semibold"
            busy={resending}
            busyLabel="Sending a new link…"
            onClick={resend}
          >
            Send me a new link
          </BusyButton>

          <Button asChild variant="outline" className="h-11 w-full rounded-lg">
            {/* A bare /login bounces to role selection, so say which sign-in to open. */}
            <Link
              to="/login"
              search={{ as: email?.endsWith("@nwu.ac.za") ? "lecturer" : "student" }}
            >
              Back to sign in
            </Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}

function SetPassword({
  account,
  token,
  onDone,
}: {
  account: ActivationAccount;
  token: string;
  onDone: () => void;
}) {
  const { signIn } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);

  const checks = passwordChecks(password, account);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found: { password?: string; confirm?: string } = {};
    const failed = checks.find((check) => !check.ok);
    if (!password) found.password = "Choose a password.";
    else if (failed) found.password = failed.error;
    if (!confirm) found.confirm = "Type your password a second time to confirm it.";
    else if (confirm !== password) found.confirm = "The two passwords don't match.";
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      // Sets the first password, activates the account and signs them in, all
      // against the token - the address is never taken from the URL, so a
      // tampered link cannot activate somebody else.
      signIn(await activate(token, password));
      onDone();
    } catch (error) {
      setErrors({
        password:
          error instanceof ApiError
            ? (error.field("password") ?? error.message)
            : "We couldn't set your password. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Set your password"
      description={
        <>
          Welcome to Peerly, {account.name}. Choose the password you'll sign in with as{" "}
          <span className="font-medium text-foreground">{account.email}</span>.
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormField label="Password" error={errors.password} required>
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </FormField>

        <PasswordRules checks={checks} />

        <FormField label="Confirm password" error={errors.confirm} required>
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          )}
        </FormField>

        <BusyButton type="submit" className="w-full" busy={busy} busyLabel="Activating…">
          Set password and activate
        </BusyButton>
      </form>
    </AuthShell>
  );
}
