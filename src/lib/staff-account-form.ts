import type { Role } from "@/mocks/types";

/**
 * The admin portal's create / edit form for a staff account.
 *
 * Kept out of the route so the parts that decide what the form starts with, and
 * what it refuses before asking the server, can be tested on their own.
 */
export interface AccountForm {
  name: string;
  surname: string;
  email: string;
  role: Role;
}

/** The server's limit on a first name or surname (routes/accounts.ts). */
export const NAME_MAX = 100;

/**
 * A blank form. Lecturer unless the caller says otherwise: "Create an
 * administrator", offered when the last administrator can't be deactivated,
 * must open on Administrator, or whoever fills in only a name and address makes
 * a lecturer and is still stuck.
 */
export const blankAccountForm = (role: Role = "lecturer"): AccountForm => ({
  name: "",
  surname: "",
  email: "",
  role,
});

/** What the form says before sending, in the same words the server would use. */
export function accountFormErrors(form: AccountForm): Partial<Record<keyof AccountForm, string>> {
  const errors: Partial<Record<keyof AccountForm, string>> = {};
  const tooLong = `Keep this to ${NAME_MAX} characters or fewer.`;

  if (!form.name.trim()) errors.name = "Enter the person's first name.";
  else if (form.name.trim().length > NAME_MAX) errors.name = tooLong;

  if (!form.surname.trim()) errors.surname = "Enter the person's surname.";
  else if (form.surname.trim().length > NAME_MAX) errors.surname = tooLong;

  if (!form.email.trim()) {
    errors.email = "Enter an institutional email address.";
  } else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = "This doesn't look like an email address - check for a missing @ or full stop.";
  } else if (!form.email.trim().toLowerCase().endsWith("nwu.ac.za")) {
    errors.email = "Staff accounts must use an institutional address ending in nwu.ac.za.";
  }
  return errors;
}
