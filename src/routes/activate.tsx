import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MailCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { PasswordRules } from "@/components/shared/PasswordRules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { passwordChecks } from "@/lib/password";
import { ApiError } from "@/lib/api";
import { homePathForRole, useSession } from "@/lib/session";
import {
  activate,
  getActivation,
  requestActivationLink,
  type ActivationAccount,
} from "@/services/auth";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/activate")({
  head: () => titleHead("Activate your account"),
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

  if (state === "set-password" && account) {
    // `account` is only ever set from a token the server accepted, so there is
    // always one here - but the router types it as optional, so narrow rather
    // than assert.
    if (!token) return null;
    return <SetPassword account={account} token={token} onDone={() => setState("success")} />;
  }

  if (state === "success" && account) {
    // Setting the password signed them in, so the way on is their portal - not
    // a sign-in form asking for the password they typed a moment ago.
    return (
      <AuthShell title="Your account is active" description="You're signed in and ready to go.">
        <div className="space-y-5">
          <div className="flex gap-2.5 rounded-lg border border-success/30 bg-success-muted p-3.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Welcome to Peerly, {account.name}. Your email address is confirmed and your password
              is set. Next time, sign in with {account.email} and that password.
            </p>
          </div>
          <Button asChild className="h-11 w-full rounded-lg text-base font-semibold">
            <Link to={homePathForRole(account.role)}>Go to your portal</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return <LinkNoLongerWorks email={email} />;
}

/**
 * A link the server will not honour: spent, expired or never issued - the
 * server does not say which, so neither does the page.
 *
 * "Send me a new link" really asks for one. The server sends it only to a
 * staff account that has never been activated, and answers the same for every
 * address (SR-06), so the page confirms nothing beyond "if, then".
 */
function LinkNoLongerWorks({ email: fromLink }: { email?: string }) {
  const [email, setEmail] = useState(fromLink ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      setError("Enter the email address your account was set up with.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError("This doesn't look like an email address. Check for a missing @ or full stop.");
      return;
    }
    setError(null);

    setBusy(true);
    try {
      await requestActivationLink(address);
    } catch (failure) {
      // Only an unreachable server is worth reporting: otherwise the person
      // would wait for an email that was never even asked for. Every other
      // answer is deliberately the same as success.
      if (failure instanceof ApiError && (failure.status === 0 || failure.status === 429)) {
        setBusy(false);
        setError(
          failure.status === 429
            ? failure.message
            : "We couldn't reach Peerly. Check your connection and try again.",
        );
        return;
      }
    }
    setBusy(false);
    setSentTo(address);
  };

  return (
    <AuthShell
      title="This link no longer works"
      description="Activation links work once, and only for 24 hours."
    >
      <div className="space-y-5">
        {sentTo ? (
          <div
            role="status"
            className="flex gap-2.5 rounded-lg border border-success/30 bg-success-muted p-3.5 text-sm text-success"
          >
            <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              If <span className="font-medium">{sentTo}</span> belongs to a staff account that
              hasn't been set up yet, we've sent it a new link. It works for 24 hours, and any older
              link stops working. Already set your password? Use "Forgot password" on the sign-in
              page instead.
            </p>
          </div>
        ) : (
          <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-muted p-3.5 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              We couldn't activate your account with this link. It may have already been used, or it
              may be older than 24 hours.
            </p>
          </div>
        )}

        {sentTo ? null : (
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <FormField
              label="Email address"
              error={error}
              hint="The address your administrator set your account up with."
              required
            >
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="email"
                  placeholder="name.surname@nwu.ac.za"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </FormField>

            <BusyButton
              type="submit"
              className="h-11 w-full rounded-lg text-base font-semibold"
              busy={busy}
              busyLabel="Sending a new link…"
            >
              Send me a new link
            </BusyButton>
          </form>
        )}

        <p className="text-sm text-muted-foreground">
          Students don't get activation links - you confirm your address with the 6-digit code we
          email when you register.
        </p>

        {/* The account's role is unknown from a link that no longer works, and
            guessing it from the address sent administrators to the lecturer
            form. Role selection lets them pick. */}
        <Button asChild variant="outline" className="h-11 w-full rounded-lg">
          <Link to="/">Back to sign in</Link>
        </Button>
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
