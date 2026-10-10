import type { StudentPeer } from "@/services/peerly";

/** Someone the student rates, which since 2026-10-10 includes themselves. */
export interface Ratee extends StudentPeer {
  isSelf: boolean;
}

/**
 * Everyone a student rates: themselves first, then their group in the order
 * the server sent it.
 *
 * The server's member list leaves the student out - it is also the list of
 * the people in their group - so the student is added here from the session.
 * The server expects their rating all the same and refuses a submission
 * without it, so leaving this out would leave the form impossible to finish.
 */
export function rateesFor(
  members: StudentPeer[],
  self: Pick<StudentPeer, "id" | "name" | "surname"> | null | undefined,
): Ratee[] {
  const peers = members
    .filter((member) => member.id !== self?.id)
    .map((member) => ({ ...member, isSelf: false }));
  if (!self || members.length === 0) return peers;
  return [{ id: self.id, name: self.name, surname: self.surname, isSelf: true }, ...peers];
}
