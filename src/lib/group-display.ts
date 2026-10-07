/** Group labels for plain text, including accessible labels and confirmations. */
export function groupLabel(group: { groupNumber: number; groupName?: string }): string {
  return `Group ${group.groupNumber}${group.groupName ? ` - ${group.groupName}` : ""}`;
}
