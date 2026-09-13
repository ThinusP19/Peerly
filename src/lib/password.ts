/**
 * The password policy (SR-02), shared by every screen that sets a password and
 * by the service that accepts one, so the rules can't drift apart.
 */

/** A short list of passwords that appear at the top of every breach dump. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "11111111",
  "00000000",
  "qwerty123",
  "qwertyuiop",
  "iloveyou",
  "admin123",
  "administrator",
  "letmein1",
  "welcome1",
  "welcome123",
  "sunshine1",
  "football1",
  "princess1",
  "abc12345",
  "changeme",
  "trustno1",
  "peerly123",
  "student123",
  "nwu12345",
]);

export interface PasswordCheck {
  id: "length" | "common" | "personal";
  /** Shown in the live checklist. */
  label: string;
  ok: boolean;
  /** Shown under the field when this rule fails on submit. */
  error: string;
}

export function passwordChecks(
  password: string,
  identity: { email?: string; studentNumber?: string },
): PasswordCheck[] {
  const lower = password.toLowerCase();
  const email = identity.email?.trim().toLowerCase() ?? "";
  const localPart = email.split("@")[0] ?? "";
  // Anything shorter than three characters would reject far too much by accident.
  const personal = [email, localPart, identity.studentNumber?.trim() ?? ""].filter(
    (value) => value.length >= 3,
  );

  return [
    {
      id: "length",
      label: "At least 8 characters",
      ok: password.length >= 8,
      error: "Use at least 8 characters.",
    },
    {
      id: "common",
      label: "Not a commonly used password",
      ok: password.length > 0 && !COMMON_PASSWORDS.has(lower),
      error: "That password is too common. Choose something harder to guess.",
    },
    {
      id: "personal",
      label: "Doesn't contain your email or student number",
      ok: password.length > 0 && !personal.some((value) => lower.includes(value)),
      error: "Don't use your email address or student number in your password.",
    },
  ];
}

export const passwordIsValid = (
  password: string,
  identity: { email?: string; studentNumber?: string },
) => passwordChecks(password, identity).every((check) => check.ok);
