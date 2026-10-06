/** Keep the number prominent and the optional imported name understated. */
export function GroupLabel({ group }: { group: { groupNumber: number; groupName?: string } }) {
  return (
    <span>
      Group {group.groupNumber}
      {group.groupName ? (
        <span className="font-normal whitespace-normal text-muted-foreground">
          {" "}
          - {group.groupName}
        </span>
      ) : null}
    </span>
  );
}
