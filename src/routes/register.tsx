import { Link, createFileRoute } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { RoleSelector } from "@/components/shared/RoleSelector";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role } from "@/mocks/types";
import { RegistrationError, registerAccount } from "@/services/peerly";

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

/**
 * Students register with a student number on the student domain; staff register
 * on the staff domain and have no student number. The domain split is what stops
 * a student registering themselves as a lecturer — their address cannot pass the
 * staff check.
 */
const STUDENT_DOMAIN = "mynwu.ac.za";
const STAFF_DOMAIN = "nwu.ac.za";

function validate(form: Form, role: Role, noticeAccepted: boolean): Errors {
  const errors: Errors = {};
  const isStudent = role === "student";
  const email = form.email.trim().toLowerCase();

  if (isStudent) {
    if (!form.studentNumber.trim()) {
      errors.studentNumber = "Enter the student number printed on your student card.";
    } else if (!/^\d{8}$/.test(form.studentNumber.trim())) {
      errors.studentNumber = "A student number is 8 digits, for example 41200345.";
    }
  }

  if (!form.name.trim()) errors.name = "Enter your first name.";
  if (!form.surname.trim()) errors.surname = "Enter your surname.";

  if (!email) {
    errors.email = "Enter your institutional email address.";
  } else if (!/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = "This doesn't look like an email address — check for a missing @ or full stop.";
  } else if (isStudent && !email.endsWith(`@${STUDENT_DOMAIN}`)) {
    errors.email = `Use your student address ending in @${STUDENT_DOMAIN}, not a personal one.`;
  } else if (!isStudent && email.endsWith(`@${STUDENT_DOMAIN}`)) {
    errors.email = `That's a student address. Staff accounts need a @${STAFF_DOMAIN} address.`;
  } else if (!isStudent && !email.endsWith(`@${STAFF_DOMAIN}`)) {
    errors.email = `Use your staff address ending in @${STAFF_DOMAIN}.`;
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
  const [role, setRole] = useState<Role>("student");
  const [form, setForm] = useState<Form>(empty);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (key: keyof Form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next = validate(form, role, noticeAccepted);
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await registerAccount({
        role,
        name: form.name,
        surname: form.surname,
        email: form.email,
        studentNumber: role === "student" ? form.studentNumber.trim() : undefined,
      });
      setSubmitted(true);
    } catch (error) {
      // Duplicate email or student number — report it on the field it belongs to.
      if (error instanceof RegistrationError) {
        setErrors({ [error.field]: error.message });
      } else {
        setErrors({ email: "We couldn't create that account. Please try again." });
      }
    } finally {
      setBusy(false);
    }
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
              {/* Stands in for clicking the link in the email. */}
              <Link to="/activate" search={{ email: form.email.trim() }}>
                Open the activation link
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
      title="Create your account"
      description={
        role === "student"
          ? "Register with the details your institution has on file so we can match you to your class list."
          : "Register with your staff details. Your account is checked before it is activated."
      }
      footer={
        <>
          <p>
            Already registered?{" "}
            <Link to="/login" className="font-medium text-auth-canvas-accent hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-1.5">Staff accounts must use a university staff address.</p>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <RoleSelector
          value={role}
          onChange={(next) => {
            setRole(next);
            setErrors({});
          }}
          label="I'm registering as"
        />

        {role === "student" ? (
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
        ) : null}

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
          hint={
            role === "student"
              ? `Your student address, ending in @${STUDENT_DOMAIN}.`
              : `Your staff address, ending in @${STAFF_DOMAIN}.`
          }
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
