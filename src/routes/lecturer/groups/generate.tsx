import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Lock, Shuffle, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLecturerClasses } from "@/hooks/use-lecturer-context";
import { studentNamesById } from "@/lib/class-import";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import type { Group } from "@/mocks/types";
import {
  confirmGroups,
  getEnrolmentRows,
  getGroupsEditable,
  proposeGroups,
} from "@/services/peerly";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/lecturer/groups/generate")({
  head: () => titleHead("Generate groups"),
  component: GenerateGroupsPage,
});

type Mode = "count" | "size";

function GenerateGroupsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeClassId } = useSession();
  const klass = (useLecturerClasses().data ?? []).find((c) => c.id === activeClassId);

  // Only matched enrolments can be allocated: an unmatched or conflicting row
  // has no account behind it, so there is nobody to put in a group. The server
  // applies the same rule when it proposes an allocation.
  const enrolmentRows = useQuery({
    queryKey: ["enrolment-rows", activeClassId],
    queryFn: () => getEnrolmentRows(activeClassId),
  });
  const eligible = (enrolmentRows.data ?? []).filter((row) => row.matchStatus === "matched").length;
  // Names come from the class list, not the group roster: the roster lists only
  // students already in a group, which on a first allocation is nobody.
  const names = useMemo(() => studentNamesById(enrolmentRows.data ?? []), [enrolmentRows.data]);

  const editability = useQuery({
    queryKey: ["groups-editable", activeClassId],
    queryFn: () => getGroupsEditable(activeClassId),
  });
  const locked = editability.data?.editable !== true;
  const lockReason = editability.isError
    ? "Couldn't check whether groups can be edited. Refresh and try again."
    : editability.data?.reason;

  const [mode, setMode] = useState<Mode>("count");
  const [groupCount, setGroupCount] = useState("6");
  const [groupSize, setGroupSize] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [proposed, setProposed] = useState<Group[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const smallGroups = useMemo(
    () => (proposed ?? []).filter((group) => group.memberStudentIds.length < 2),
    [proposed],
  );

  const generate = async () => {
    const raw = mode === "count" ? groupCount : groupSize;
    const value = Number(raw);

    if (!raw.trim() || Number.isNaN(value) || !Number.isInteger(value) || value < 1) {
      setError(
        mode === "count"
          ? "Enter how many groups you want as a whole number, for example 6."
          : "Enter the target group size as a whole number, for example 5.",
      );
      return;
    }
    if (mode === "count" && value > eligible) {
      setError(
        `There are only ${eligible} matched students in this class, so you can't make ${value} groups.`,
      );
      return;
    }
    if (mode === "size" && value > eligible) {
      setError(
        `There are only ${eligible} matched students in this class to spread across groups.`,
      );
      return;
    }

    setError(null);
    setGenerating(true);
    const result = await proposeGroups(activeClassId, mode, value);
    setProposed(result);
    setGenerating(false);
  };

  const moveMember = (studentId: string, targetGroupId: string) => {
    setProposed((current) => {
      if (!current) return current;
      return current.map((group) => {
        const without = group.memberStudentIds.filter((id) => id !== studentId);
        return {
          ...group,
          memberStudentIds: group.id === targetGroupId ? [...without, studentId] : without,
        };
      });
    });
  };

  return (
    <>
      <PageHeader
        title="Generate groups"
        backTo="/lecturer/groups"
        backLabel="Groups"
        description={
          klass
            ? `${klass.moduleCode} - ${eligible} matched students are available to allocate. Unmatched and conflicting students are left out until their class list entry is resolved.`
            : "Select a class in the header first."
        }
      />

      {lockReason ? (
        <Card
          role="alert"
          className="flex gap-3 rounded-2xl border border-warning/25 p-5 shadow-card sm:px-6"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-muted text-warning">
            <Lock className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Groups cannot be changed</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{lockReason}</p>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
        <PanelHeader
          title="How should the groups be built?"
          size="lg"
          description="Choose one of the two - the other is worked out for you."
        />

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <RadioGroup
            value={mode}
            onValueChange={(value) => {
              setMode(value as Mode);
              setError(null);
            }}
            className="gap-3 sm:grid-cols-2"
          >
            <label
              htmlFor="mode-count"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                mode === "count"
                  ? "border-primary bg-accent ring-1 ring-primary"
                  : "hover:bg-muted/50",
              )}
            >
              <RadioGroupItem id="mode-count" value="count" className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  Number of groups
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Split the class into a fixed number of groups of roughly equal size.
                </span>
              </span>
            </label>

            <label
              htmlFor="mode-size"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                mode === "size"
                  ? "border-primary bg-accent ring-1 ring-primary"
                  : "hover:bg-muted/50",
              )}
            >
              <RadioGroupItem id="mode-size" value="size" className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  Target group size
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Aim for a number of students per group; we work out how many groups that needs.
                </span>
              </span>
            </label>
          </RadioGroup>

          <div className="max-w-xs">
            {mode === "count" ? (
              <FormField
                label="How many groups?"
                error={error}
                hint={`About ${Math.max(1, Math.round(eligible / Math.max(1, Number(groupCount) || 1)))} students per group.`}
                required
              >
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    max={eligible}
                    value={groupCount}
                    onChange={(event) => setGroupCount(event.target.value)}
                  />
                )}
              </FormField>
            ) : (
              <FormField
                label="Students per group"
                error={error}
                hint={`That works out to about ${Math.max(1, Math.ceil(eligible / Math.max(1, Number(groupSize) || 1)))} groups.`}
                required
              >
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    max={eligible}
                    value={groupSize}
                    onChange={(event) => setGroupSize(event.target.value)}
                  />
                )}
              </FormField>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <BusyButton
            busy={generating}
            busyLabel="Allocating students…"
            onClick={generate}
            disabled={locked}
            className="h-10 px-4"
          >
            <Shuffle aria-hidden="true" />
            {proposed ? "Generate again" : "Generate groups"}
          </BusyButton>
        </div>
      </Card>

      {proposed ? (
        <>
          <Card className="flex flex-col gap-4 rounded-2xl border-0 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground">Proposed allocation</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {proposed.length} groups · move anyone who shouldn't be where they landed. Nothing
                is saved until you confirm.
              </p>
            </div>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={locked || smallGroups.length > 0}
              className="h-10 shrink-0 px-4"
            >
              Confirm these groups
            </Button>
          </Card>

          {smallGroups.length ? (
            <Card
              role="alert"
              className="flex gap-3 rounded-2xl border border-warning/25 p-5 shadow-card sm:px-6"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-muted text-warning">
                <AlertTriangle className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold text-foreground">
                  {smallGroups.length} {smallGroups.length === 1 ? "group has" : "groups have"}{" "}
                  fewer than 2 members
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Peer assessment needs at least two people in a group - nobody can rate anyone in a
                  group of one. Move someone in, or generate again with fewer groups.
                </p>
              </div>
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {proposed.map((group) => {
              const tooSmall = group.memberStudentIds.length < 2;
              return (
                <Card
                  key={group.id}
                  className={cn(
                    "flex min-w-0 flex-col overflow-hidden rounded-2xl shadow-card",
                    tooSmall ? "border border-warning/25" : "border-0",
                  )}
                >
                  <PanelHeader
                    as="h3"
                    title={`Group ${group.groupNumber}`}
                    actions={
                      <span
                        className={cn(
                          "text-sm tabular-nums",
                          tooSmall ? "font-semibold text-warning" : "text-muted-foreground",
                        )}
                      >
                        {group.memberStudentIds.length} members
                      </span>
                    }
                  />

                  {tooSmall ? (
                    <p className="flex items-start gap-2 border-b bg-warning-muted/40 px-5 py-2.5 text-xs text-warning sm:px-6">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      Too small to run a peer assessment.
                    </p>
                  ) : null}

                  <ul className="flex-1 divide-y">
                    {group.memberStudentIds.map((studentId) => {
                      const member = names.get(studentId);
                      const fullName = member
                        ? `${member.name} ${member.surname}`
                        : "A student no longer on the class list";
                      return (
                        <li key={studentId} className="space-y-1.5 px-5 py-2.5 sm:px-6">
                          <p className="text-sm break-words text-foreground">{fullName}</p>
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`move-${studentId}`}
                              className="text-xs font-normal text-muted-foreground"
                            >
                              Move to
                              <span className="sr-only"> - {fullName}</span>
                            </Label>
                            <Select
                              value={group.id}
                              onValueChange={(value) => moveMember(studentId, value)}
                            >
                              <SelectTrigger
                                id={`move-${studentId}`}
                                className="h-8 min-w-0 flex-1 rounded-lg text-xs"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {proposed.map((target) => (
                                  <SelectItem key={target.id} value={target.id}>
                                    Group {target.groupNumber}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </li>
                      );
                    })}
                    {group.memberStudentIds.length === 0 ? (
                      <li className="px-6 py-10 text-center text-sm text-muted-foreground">
                        Nobody in this group yet.
                      </li>
                    ) : null}
                  </ul>
                </Card>
              );
            })}
          </div>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Confirm these groups?"
            objectName={`${klass?.moduleCode ?? "Class"} · ${proposed.length} groups · ${proposed.reduce(
              (sum, g) => sum + g.memberStudentIds.length,
              0,
            )} students`}
            description={
              <p>
                These groups become the confirmed allocation for this class and will be used by any
                assessment that includes them.
              </p>
            }
            consequence={
              <p>
                This replaces the groups currently confirmed for {klass?.moduleCode ?? "this class"}
                . Imported group names and leader designations are cleared. Once an assessment opens
                and students start rating, group membership can no longer be changed.
              </p>
            }
            confirmLabel="Confirm groups"
            onConfirm={async () => {
              await confirmGroups(activeClassId, proposed);
              await queryClient.invalidateQueries();
              toast.success(
                `${proposed.length} groups confirmed for ${klass?.moduleCode ?? "the class"}.`,
              );
              navigate({ to: "/lecturer/groups" });
            }}
          />
        </>
      ) : null}
    </>
  );
}
