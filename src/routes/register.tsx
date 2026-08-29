import { Link, createFileRoute } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

interface Form {
  studentNumber: string;
  name: string;
  surname: string;
  email: string;
  password: string;
  confirm: string;
}

type Errors = Partial<Record<keyof Form | "notice", string>>;

const empty: Form = {
  studentNumber: "",
  name: "",
  surname: "",
  email: "",
  password: "",
  confirm: "",
};

function validate(form: Form, noticeAccepted: boolean): Errors {
  const errors: Errors = {};

  if (!form.studentNumber.trim()) {
    errors.studentNumber = "Enter the student number printed on your student card.";
  } else if (!/^\d{8}$/.test(form.studentNumber.trim())) {
    errors.studentNumber = "A student number is 8 digits, for example 41200345.";
  }

  if (!form.name.trim()) errors.name = "Enter your first name.";
  if (!form.surname.trim()) errors.surname = "Enter your surname.";

  if (!form.email.trim()) {
    errors.email = "Enter your institutional email address.";
  } else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = "This doesn't look like an email address — check for a missing @ or full stop.";
  } else if (!form.email.trim().toLowerCase().endsWith("mynwu.ac.za")) {
    errors.email = "Use your institutional address ending in mynwu.ac.za, not a personal one.";
  }

  if (!form.password) {
    errors.password = "Choose a password.";
  } else if (form.password.length < 8) {
    errors.password = "Use at least 8 characters so your marks stay protected.";
  }

  if (!form.confirm) {
    errors.confirm = "Type your password a second time to confirm it.";
  } else if (form.confirm !== form.password) {
    errors.confirm = "The two passwords don't match.";
  }

  if (!noticeAccepted) {
    errors.notice = "Please confirm you've read what data Peerly collects before continuing.";
  }

  return errors;
}

function RegisterPage() {
  const [form, setForm] = useState<Form>(empty);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (key: keyof Form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next = validate(form, noticeAccepted);
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setBusy(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <AuthShell
        title="Check your email"
        description="Your Peerly account has been created but isn't active yet."
      >
        <div className="space-y-5">
          <div className="flex gap-3 rounded-md border border-success/30 bg-success-muted p-3.5 text-sm text-success">
            <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              We've sent an activation link to <span className="font-medium">{form.email}</span>.
              Open it to finish setting up your account. The link expires after 24 hours.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            Nothing arrived? Check your junk folder first — institutional mail filters are strict.
          </p>

          <div className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link to="/activate">Open the activation link</Link>
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
      title="Create your student account"
      description="Register with the details your institution has on file so we can match you to your class list."
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="font-medium text-auth-canvas-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField
          label="Student number"
          error={errors.studentNumber}
          hint="We use this to match you to your class list."
          required
        >
          {(props) => (
            <Input
              {...props}
              inputMode="numeric"
              autoComplete="username"
              value={form.studentNumber}
              onChange={(event) => set("studentNumber")(event.target.value)}
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="First name" error={errors.name} required>
            {(props) => (
              <Input
                {...props}
                autoComplete="given-name"
                value={form.name}
                onChange={(event) => set("name")(event.target.value)}
              />
            )}
          </FormField>

          <FormField label="Surname" error={errors.surname} required>
            {(props) => (
              <Input
                {...props}
                autoComplete="family-name"
                value={form.surname}
                onChange={(event) => set("surname")(event.target.value)}
              />
            )}
          </FormField>
        </div>

        <FormField
          label="Institutional email"
          error={errors.email}
          hint="Your university address, ending in mynwu.ac.za."
          required
        >
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => set("email")(event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Password" error={errors.password} hint="At least 8 characters." required>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => set("password")(event.target.value)}
            />
          )}
        </FormField>

        <FormField label="Confirm password" error={errors.confirm} required>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(event) => set("confirm")(event.target.value)}
            />
          )}
        </FormField>

        <div className="space-y-2 rounded-md border bg-muted/40 p-3.5">
          <div className="flex gap-2.5">
            <Checkbox
              id="data-notice"
              checked={noticeAccepted}
              onCheckedChange={(checked) => setNoticeAccepted(checked === true)}
              aria-describedby={errors.notice ? "data-notice-error" : "data-notice-detail"}
              aria-invalid={Boolean(errors.notice)}
              className="mt-0.5"
            />
            <div className="space-y-1.5">
              <Label htmlFor="data-notice" className="font-medium leading-snug">
                I understand what data is collected and why
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
              </Label>
              <p id="data-notice-detail" className="text-xs leading-relaxed text-muted-foreground">
                Peerly stores your name, student number and institutional email so your lecturer can
                match you to a class list and a group. The ratings you give are visible to your
                lecturer, never to the students you rate. Your data is kept for the duration of the
                module and deleted after results are finalised.
              </p>
            </div>
          </div>
          {errors.notice ? (
            <p id="data-notice-error" role="alert" className="text-sm text-danger">
              {errors.notice}
            </p>
          ) : null}
        </div>

        <BusyButton type="submit" className="w-full" busy={busy} busyLabel="Creating account…">
          Create account
        </BusyButton>
      </form>
    </AuthShell>
  );
}
