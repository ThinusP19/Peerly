import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Input } from "@/components/ui/input";
import { usePageTransition } from "@/hooks/use-page-transition";
import { ApiError } from "@/lib/api";
import { homePathForRole, useSession } from "@/lib/session";
import { login } from "@/services/auth";

type Audience = "student" | "lecturer";

export const Route = createFileRoute("/login")({
  // `?as=` picks the form's wording. It never decides the portal - that is
  // always the account's own role.
  validateSearch: (search: Record<string, unknown>): { as?: Audience } => ({
    as: search["as"] === "student" || search["as"] === "lecturer" ? search["as"] : undefined,
  }),
  // Choosing how you sign in happens on the welcome page, so a bare /login
  // (sign-out, the route guard, "back to sign in" links) goes there first.
  beforeLoad: ({ search }) => {
    if (!search.as) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

const audiences: Record<Audience, { title: string; description: string; placeholder: string }> = {
  student: {
    title: "Student sign in",
    description: "Use your NWU student email address to continue.",
    placeholder: "studentno@mynwu.ac.za",
  },
  lecturer: {
    title: "Lecturer sign in",
    // Administrators use this form too - the portal comes from the account's
    // role, not from this choice - and saying so here saves the one or two of
    // them wondering whether they are in the wrong place.
    description: "Use your NWU email address to continue. Administrators sign in here too.",
    placeholder: "name.surname@nwu.ac.za",
  },
};

function LoginPage() {
  const { as } = Route.useSearch();
  // Keyed so arriving with a different audience starts a clean form rather
  // than carrying over half-typed details and errors.
  return as ? <SignInForm key={as} audience={as} /> : null;
}

interface Errors {
  email?: string;
  password?: string;
}

function SignInForm({ audience }: { audience: Audience }) {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const copy = audiences[audience];
  const { transitionOnClick } = usePageTransition();

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
    try {
      const account = await login(email.trim(), password);

      // The API has already set the session cookie; this records who it belongs
      // to so the shell can render without asking again.
      signIn(account);
      toast.success(`Signed in as ${account.name} ${account.surname}`);
      // The account's own role decides the portal - a student who signs in on
      // the lecturer form still lands in the Student Portal.
      navigate({ to: homePathForRole(account.role) });
    } catch (error) {
      // FR-05 and SR-06: one message, whatever went wrong. An unknown address,
      // a wrong password, an unverified account, a deactivated one and a
      // locked-out one are all the same answer - the server does not
      // distinguish them either, so there is nothing more specific to show.
      setFormError(
        error instanceof ApiError && error.status !== 401
          ? error.message
          : "Those details don't match an active Peerly account. Please check and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      back={
        <Link
          to="/"
          onClick={transitionOnClick("Back to role selection")}
          className="group inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-primary"
        >
          <ArrowLeft
            className="size-4 transition-transform group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          Back to role selection
        </Link>
      }
      title={copy.title}
      description={copy.description}
      // Registration is for students only, so its link lives on the student
      // form - the one place a new student is guaranteed to pass. Lecturers
      // can't register, so they get the line that says where accounts come from.
      footer={
        audience === "student" ? (
          <>
            New student?{" "}
            <Link to="/register" className="font-semibold text-primary hover:underline">
              Register here
            </Link>
          </>
        ) : (
          "Lecturer accounts are set up for you, so there's nothing to register."
        )
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError ? (
          <div
            role="alert"
            className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger-muted p-3.5 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p>{formError}</p>
              {/* Shown on every failure, so it reveals nothing about whether a
                  particular account exists (SR-06). */}
              <p className="text-danger/80">
                Just registered? Verify your email with the code we sent you first.
              </p>
            </div>
          </div>
        ) : null}

        <FormField label="Email address" error={errors.email} required>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              placeholder={copy.placeholder}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FormField>

        <div className="space-y-2">
          <FormField label="Password" error={errors.password} required>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </FormField>
          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              search={{ as: audience }}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <BusyButton type="submit" className="w-full" busy={busy} busyLabel="Signing in…">
          Sign in
        </BusyButton>
      </form>
    </AuthShell>
  );
}
