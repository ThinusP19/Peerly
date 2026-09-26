import { ApiError } from "@/lib/api";
import type { Assessment } from "@/mocks/types";

/**
 * The assessment form's rules, kept free of React so they can be tested.
 *
 * The server checks all of these again - the API can be called without this
 * form - so these exist to catch a mistake beside the field, before a request.
 */

/** The same limit the API enforces, so a long name is caught before saving. */
export const ASSESSMENT_NAME_MAX = 120;

/** The API's ceiling for "Group mark is out of". */
export const MAX_MARK_LIMIT = 1000;

export type AssessmentField = "name" | "groupIds" | "opensAt" | "closesAt" | "maxMark";
export type AssessmentErrors = Partial<Record<AssessmentField, string>>;

/** What a lecturer can fix about the maximum mark, or undefined when it is fine. */
export function maxMarkProblem(raw: string): string | undefined {
  const value = Number(raw);
  if (!raw.trim() || Number.isNaN(value) || value <= 0) {
    return "Enter the mark this assessment is out of, for example 100.";
  }
  if (value > MAX_MARK_LIMIT) return `The maximum mark can be at most ${MAX_MARK_LIMIT}.`;
  // Stored with two decimals; a third would be refused rather than rounded.
  if (Number(value.toFixed(2)) !== value) return "Use at most two decimal places.";
  return undefined;
}

/**
 * The per-field messages from a refused save, keyed the way the form keys them.
 *
 * Empty when the refusal was not about a field - a 409, say - in which case the
 * caller shows the server's own message, which says what to do instead.
 */
export function serverFieldErrors(error: unknown): AssessmentErrors {
  if (!(error instanceof ApiError)) return {};
  const known: AssessmentField[] = ["name", "groupIds", "opensAt", "closesAt", "maxMark"];
  const found: AssessmentErrors = {};
  for (const field of known) {
    const message = error.field(field);
    if (message) found[field] = message;
  }
  return found;
}

export interface AssessmentDraftValues {
  name: string;
  description: string;
  groupIds: string[];
  opensAt: string;
  closesAt: string;
  maxMark: number;
}

const sameMoment = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

const sameGroups = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Only what the lecturer actually changed.
 *
 * The edit form used to send the whole setup back. Once an assessment has
 * opened the server refuses any change to its groups, and an unchanged list
 * counted as a change - so no open or closed assessment could be saved at all,
 * not even to extend its closing time.
 */
export function assessmentChanges(
  before: Assessment,
  draft: AssessmentDraftValues,
): Partial<AssessmentDraftValues> {
  return {
    ...(draft.name !== before.name && { name: draft.name }),
    ...(draft.description !== before.description && { description: draft.description }),
    ...(!sameGroups(draft.groupIds, before.groupIds) && { groupIds: draft.groupIds }),
    ...(!sameMoment(draft.opensAt, before.opensAt) && { opensAt: draft.opensAt }),
    ...(!sameMoment(draft.closesAt, before.closesAt) && { closesAt: draft.closesAt }),
    ...(draft.maxMark !== before.maxMark && { maxMark: draft.maxMark }),
  };
}

/** ISO to the "YYYY-MM-DDTHH:mm" that <input type="datetime-local"> expects. */
export const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

/**
 * The input's value back to ISO - keeping the original when the lecturer left
 * it alone. The input holds minutes only, so converting an untouched value
 * would quietly drop the stored seconds and move the time.
 */
export const fromLocalInput = (value: string, original?: string) =>
  original && value === toLocalInput(original) ? original : new Date(value).toISOString();

/**
 * When a closed assessment actually closed.
 *
 * A lecturer can close before the scheduled time, so closesAt is not it. An
 * assessment closed before that was recorded falls back to the scheduled time.
 */
export const closedAtOf = (assessment: { closesAt: string; closedAt?: string }) =>
  assessment.closedAt ?? assessment.closesAt;
