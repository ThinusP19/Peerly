import { Link, createFileRoute } from "@tanstack/react-router";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, CheckCircle2, Info } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/layout/AuthShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { register, resendCode, verifyCode } from "@/services/auth";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/register")({
  head: () => titleHead("Student registration"),
  component: RegisterPage,
});

/**
 * Student self-registration, in three steps: who you are, how you'll sign in,
 * then a one-time code sent to the student email to prove it's theirs.
 *
 * Students only. The role is chosen on the welcome page, and staff accounts are
 * created by a System Administrator, so nobody can register themselves as staff.
 *
 * Every step can go back to the one before. Once "Create account" has run the
 * account exists, unverified, so going back and submitting again updates that
 * same account and sends a fresh code instead of trying to create a second one.
 */

const STUDENT_DOMAIN = "mynwu.ac.za";
const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;
/** The same cap the API applies to a name and a surname. */
const NAME_MAX_LENGTH = 100;

type Step = "details" | "account" | "verify" | "done";

const steps: Array<{ id: Exclude<Step, "done">; label: string }> = [
  { id: "details", label: "Your details" },
  { id: "account", label: "Account" },
  { id: "verify", label: "Verify email" },
];

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

function validateDetails(form: Form): Errors {
  const errors: Errors = {};
  if (!form.studentNumber.trim()) {
    errors.studentNumber = "Enter the student number printed on your student card.";
  } else if (!/^\d{8}$/.test(form.studentNumber.trim())) {
    errors.studentNumber = "A student number is 8 digits, for example 41200345.";
  }
  if (!form.name.trim()) errors.name = "Enter your first name.";
  else if (form.name.trim().length > NAME_MAX_LENGTH)
    errors.name = `Keep your first name to ${NAME_MAX_LENGTH} characters or fewer.`;
  if (!form.surname.trim()) errors.surname = "Enter your surname.";
  else if (form.surname.trim().length > NAME_MAX_LENGTH)
    errors.surname = `Keep your surname to ${NAME_MAX_LENGTH} characters or fewer.`;
  return errors;
}

function validateAccount(form: Form, noticeAccepted: boolean): Errors {
  const errors: Errors = {};
  const email = form.email.trim().toLowerCase();

  if (!email) {
    errors.email = "Enter your student email address.";
  } else if (!/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = "This doesn't look like an email address. Check for a missing @ or full stop.";
  } else if (!email.endsWith(`@${STUDENT_DOMAIN}`)) {
    errors.email = `Use your student address ending in @${STUDENT_DOMAIN}, not a personal one.`;
  } else if (email.split("@")[0] !== form.studentNumber.trim()) {
    // The server refuses this too (SR-01): the address proves the number.
    errors.email = `This isn't the address for student number ${form.studentNumber.trim()}. Yours is ${form.studentNumber.trim()}@${STUDENT_DOMAIN}.`;
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
  // Verifying the code signs the student in, so the session has to learn about
  // it here rather than on the next page load.
  const { signIn } = useSession();
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState<Form>(empty);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  /** Set once the unverified account exists, so later submits update it. */
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const set = (key: keyof Form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const goTo = (next: Step) => {
    setErrors({});
    setCodeError(null);
    setStep(next);
  };

  const submitDetails = (event: FormEvent) => {
    event.preventDefault();
    const next = validateDetails(form);
    setErrors(next);
    if (!Object.keys(next).length) goTo("account");
  };

  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    const next = validateAccount(form, noticeAccepted);
    setErrors(next);
    if (Object.keys(next).length) return;

    const details = {
      name: form.name,
      surname: form.surname,
      email: form.email,
      studentNumber: form.studentNumber.trim(),
    };

    setBusy(true);
    try {
      // The same call either way. Submitting again after going back updates the
      // unverified registration rather than creating a second one, and sends a
      // fresh code to the (possibly corrected) address. Nothing can sign in
      // until that code is entered.
      await register({ ...details, password: form.password, noticeAccepted });
      if (pendingUserId) toast.success(`We've sent a new code to ${form.email.trim()}.`);
      setPendingUserId(form.email.trim());
      setCode("");
      setCooldown(RESEND_SECONDS);
      goTo("verify");
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        // A taken student number belongs to step 1, so take them back to it.
        if (error.field("studentNumber")) setStep("details");
        setErrors(error.fields as Errors);
      } else {
        setErrors({ email: "We couldn't save your account. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (value.length !== CODE_LENGTH) {
      setCodeError(`Enter all ${CODE_LENGTH} digits of the code.`);
      return;
    }
    setBusy(true);
    setCodeError(null);
    try {
      // Verifying proves the address belongs to them, so the API activates the
      // account and signs them in in the same step.
      const account = await verifyCode(form.email.trim(), value);
      signIn(account);
      setStep("done");
    } catch (error) {
      setCode("");
      setCodeError(
        error instanceof ApiError
          ? (error.field("code") ?? error.message)
          : "That code isn't right. Check the latest email we sent and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setCode("");
    setCodeError(null);
    setCooldown(RESEND_SECONDS);
    // Acknowledged the same way whatever happened, as the server answers it
    // (SR-06). The cooldown starts regardless, so a failure cannot be detected
    // by the button staying enabled.
    await resendCode(form.email.trim()).catch(() => undefined);
    toast.success(`A new code is on its way to ${form.email.trim()}.`);
  };

  if (step === "done") {
    return (
      <AuthShell
        title="You're all set"
        description="Your student account is verified, and you're signed in."
      >
        <div className="space-y-5">
          <div className="flex gap-2.5 rounded-lg border border-success/30 bg-success-muted p-3.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Welcome to Peerly, {form.name.trim()}. Next time, sign in with{" "}
              <span className="font-medium">{form.email.trim()}</span> and the password you just
              chose.
            </p>
          </div>
          {/* Verifying the code signed them in, so the way on is the dashboard -
              not a sign-in form asking for the password they just chose. */}
          <Button asChild className="h-11 w-full rounded-lg text-base font-semibold">
            <Link to="/student">Go to your dashboard</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const stepIndex = steps.findIndex((s) => s.id === step);

  const copy = {
    details: {
      title: "Create your student account",
      description:
        "Start with the details on your student card so we can match you to your class list.",
    },
    account: {
      title: "Set up your sign in",
      description: "Use your NWU student email. We'll send a verification code to it.",
    },
    verify: {
      title: "Verify your email",
      description: (
        <>
          Enter the {CODE_LENGTH}-digit code we sent to{" "}
          <span className="font-medium text-foreground">{form.email.trim()}</span>.
        </>
      ),
    },
  }[step];

  const backButton = (to: Step) => (
    <Button
      type="button"
      variant="outline"
      className="h-11 rounded-lg px-5"
      onClick={() => goTo(to)}
      disabled={busy}
    >
      <ArrowLeft aria-hidden="true" />
      Back
    </Button>
  );

  return (
    <AuthShell
      back={
        step === "details" ? (
          <Link
            to="/login"
            search={{ as: "student" }}
            className="group inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-primary"
          >
            <ArrowLeft
              className="size-4 transition-transform group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
            Back to sign in
          </Link>
        ) : null
      }
      title={copy.title}
      description={copy.description}
      footer={
        step === "verify" ? (
          "Can't find it? Check your junk folder, as university mail filters are strict."
        ) : (
          <>
            Already registered?{" "}
            <Link
              to="/login"
              search={{ as: "student" }}
              className="font-semibold text-primary hover:underline"
            >
              Sign in
            </Link>
          </>
        )
      }
    >
      <StepProgress current={stepIndex} />

      {/* Keyed by step so each one animates in and its first field takes focus. */}
      <div
        key={step}
        className="animate-in duration-300 fade-in slide-in-from-right-4 motion-reduce:animate-none"
      >
        {pendingUserId && step !== "verify" ? (
          <div className="mb-5 flex gap-2.5 rounded-lg border border-primary/25 bg-accent p-3.5 text-sm text-accent-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Your account is saved but not verified yet. Change anything you need, and we'll send a
              new code when you continue.
            </p>
          </div>
        ) : null}

        {step === "details" ? (
          <form onSubmit={submitDetails} noValidate className="space-y-5">
            <FormField
              label="Student number"
              error={errors.studentNumber}
              hint="The 8 digits on your student card."
              required
            >
              {(props) => (
                <Input
                  {...props}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="username"
                  value={form.studentNumber}
                  onChange={(event) => set("studentNumber")(event.target.value)}
                />
              )}
            </FormField>

            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <FormField label="First name" error={errors.name} required>
                {(props) => (
                  <Input
                    {...props}
                    autoComplete="given-name"
                    maxLength={NAME_MAX_LENGTH}
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
                    maxLength={NAME_MAX_LENGTH}
                    value={form.surname}
                    onChange={(event) => set("surname")(event.target.value)}
                  />
                )}
              </FormField>
            </div>

            <BusyButton type="submit" className="w-full">
              Continue
            </BusyButton>
          </form>
        ) : null}

        {step === "account" ? (
          <form onSubmit={submitAccount} noValidate className="space-y-5">
            <FormField
              label="Student email"
              error={errors.email}
              hint={`Your student address: your student number followed by @${STUDENT_DOMAIN}.`}
              required
            >
              {(props) => (
                <Input
                  {...props}
                  autoFocus
                  type="email"
                  autoComplete="email"
                  placeholder={`studentno@${STUDENT_DOMAIN}`}
                  value={form.email}
                  onChange={(event) => set("email")(event.target.value)}
                />
              )}
            </FormField>

            <FormField
              label="Password"
              error={errors.password}
              hint="At least 8 characters."
              required
            >
              {(props) => (
                <PasswordInput
                  {...props}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => set("password")(event.target.value)}
                />
              )}
            </FormField>

            <FormField label="Confirm password" error={errors.confirm} required>
              {(props) => (
                <PasswordInput
                  {...props}
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(event) => set("confirm")(event.target.value)}
                />
              )}
            </FormField>

            <div className="space-y-2 rounded-xl bg-muted/60 p-4">
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
                  <Label htmlFor="data-notice" className="leading-snug font-medium">
                    I understand what data is collected and why
                    <span className="text-danger" aria-hidden="true">
                      *
                    </span>
                  </Label>
                  <p
                    id="data-notice-detail"
                    className="text-xs leading-relaxed text-muted-foreground"
                  >
                    Peerly stores your name, student number and institutional email so your lecturer
                    can match you to a class list and a group. The ratings you give are visible to
                    your lecturer, never to the students you rate. Your data is kept for the
                    duration of the module and deleted after results are finalised.
                  </p>
                </div>
              </div>
              {errors.notice ? (
                <p id="data-notice-error" role="alert" className="text-sm text-danger">
                  {errors.notice}
                </p>
              ) : null}
            </div>

            {/* Stacks on phones: the longer labels don't fit beside Back at 390px. */}
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              {backButton("details")}
              <BusyButton
                type="submit"
                className="sm:flex-1"
                busy={busy}
                busyLabel={pendingUserId ? "Saving…" : "Creating account…"}
              >
                {pendingUserId ? "Save and resend code" : "Create account"}
              </BusyButton>
            </div>
          </form>
        ) : null}

        {step === "verify" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void verify(code);
            }}
            noValidate
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="verification-code" className="sr-only">
                Verification code
              </Label>
              <InputOTP
                id="verification-code"
                autoFocus
                maxLength={CODE_LENGTH}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(value) => {
                  setCode(value);
                  if (codeError) setCodeError(null);
                }}
                // Check as soon as the last digit lands, no extra tap needed.
                onComplete={(value: string) => void verify(value)}
                disabled={busy}
                aria-invalid={Boolean(codeError)}
                aria-describedby={codeError ? "verification-code-error" : undefined}
                containerClassName="justify-center"
              >
                <InputOTPGroup>
                  {[0, 1, 2].map((index) => (
                    <InputOTPSlot key={index} index={index} className={slotClass(codeError)} />
                  ))}
                </InputOTPGroup>
                <InputOTPSeparator className="text-muted-foreground" />
                <InputOTPGroup>
                  {[3, 4, 5].map((index) => (
                    <InputOTPSlot key={index} index={index} className={slotClass(codeError)} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {codeError ? (
                <p
                  id="verification-code-error"
                  role="alert"
                  className="text-center text-sm text-danger"
                >
                  {codeError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              {backButton("account")}
              <BusyButton type="submit" className="sm:flex-1" busy={busy} busyLabel="Verifying…">
                Verify email
              </BusyButton>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              Didn't get a code?{" "}
              {cooldown > 0 ? (
                <span className="tabular-nums">Resend in {cooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={resend}
                  className="cursor-pointer font-semibold text-primary hover:underline"
                >
                  Resend code
                </button>
              )}
            </p>
          </form>
        ) : null}
      </div>
    </AuthShell>
  );
}

const slotClass = (error: string | null) =>
  cn(
    "size-11 bg-muted text-lg font-semibold sm:size-12",
    error && "border-danger bg-danger-muted text-danger",
  );

function StepProgress({ current }: { current: number }) {
  return (
    <div className="mb-6">
      <p className="flex items-center justify-between text-xs font-medium">
        <span className="text-primary">
          Step {current + 1} of {steps.length}
        </span>
        <span className="text-muted-foreground">{steps[current].label}</span>
      </p>
      <ol className="mt-2 grid grid-cols-3 gap-1.5">
        {steps.map((s, index) => (
          <li
            key={s.id}
            className={cn(
              "h-1.5 rounded-full transition-colors duration-300",
              index <= current ? "bg-primary" : "bg-muted",
            )}
          >
            <span className="sr-only">
              {s.label}
              {index < current ? " (done)" : index === current ? " (current step)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
