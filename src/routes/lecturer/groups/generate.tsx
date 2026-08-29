import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Shuffle, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";
import { PageHeader } from "@/components/shared/PageHeader";
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
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { classes, enrolments, users } from "@/mocks/data";
import type { Group } from "@/mocks/types";
import { confirmGroups, proposeGroups } from "@/services/peerly";

export const Route = createFileRoute("/lecturer/groups/generate")({
  component: GenerateGroupsPage,
});

type Mode = "count" | "size";

function GenerateGroupsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeClassId } = useSession();
  const klass = classes.find((c) => c.id === activeClassId);

  const eligible = enrolments.filter(
    (e) => e.classId === activeClassId && e.matchStatus === "matched",
  ).length;

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
            ? `${klass.moduleCode} — ${eligible} matched students are available to allocate. Unmatched and conflicting students are left out until their class list entry is resolved.`
            : "Select a class in the header first."
        }
      />

      <Card className="space-y-5 p-5 shadow-card">
        <div>
          <h2 className="font-semibold text-foreground">How should the groups be built?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose one of the two — the other is worked out for you.
          </p>
        </div>

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
              "flex cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-colors",
              mode === "count"
                ? "border-primary bg-accent ring-1 ring-primary"
                : "hover:bg-muted/50",
            )}
          >
            <RadioGroupItem id="mode-count" value="count" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-foreground">Number of groups</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                Split the class into a fixed number of groups of roughly equal size.
              </span>
            </span>
          </label>

          <label
            htmlFor="mode-size"
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-colors",
              mode === "size"
                ? "border-primary bg-accent ring-1 ring-primary"
                : "hover:bg-muted/50",
            )}
          >
            <RadioGroupItem id="mode-size" value="size" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-foreground">Target group size</span>
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

        <BusyButton busy={generating} busyLabel="Allocating students…" onClick={generate}>
          <Shuffle aria-hidden="true" />
          {proposed ? "Generate again" : "Generate groups"}
        </BusyButton>
      </Card>

      {proposed ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-foreground">Proposed allocation</h2>
              <p className="text-sm text-muted-foreground">
                {proposed.length} groups · move anyone who shouldn't be where they landed. Nothing
                is saved until you confirm.
              </p>
            </div>
            <Button onClick={() => setConfirmOpen(true)} disabled={smallGroups.length > 0}>
              Confirm these groups
            </Button>
          </div>

          {smallGroups.length ? (
            <div
              role="alert"
              className="flex gap-2.5 rounded-md border border-warning/30 bg-warning-muted p-3.5 text-sm text-warning"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">
                  {smallGroups.length} {smallGroups.length === 1 ? "group has" : "groups have"}{" "}
                  fewer than 2 members
                </p>
                <p>
                  Peer assessment needs at least two people in a group — nobody can rate anyone in a
                  group of one. Move someone in, or generate again with fewer groups.
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {proposed.map((group) => {
              const tooSmall = group.memberStudentIds.length < 2;
              return (
                <Card
                  key={group.id}
                  className={cn("flex flex-col shadow-card", tooSmall && "border-warning/50")}
                >
                  <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <h3 className="font-semibold text-foreground">Group {group.groupNumber}</h3>
                    <span
                      className={cn(
                        "text-sm",
                        tooSmall ? "font-medium text-warning" : "text-muted-foreground",
                      )}
                    >
                      {group.memberStudentIds.length} members
                    </span>
                  </div>

                  {tooSmall ? (
                    <p className="flex items-start gap-2 border-b bg-warning-muted/40 px-4 py-2.5 text-xs text-warning">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      Too small to run a peer assessment.
                    </p>
                  ) : null}

                  <ul className="flex-1 divide-y">
                    {group.memberStudentIds.map((studentId) => {
                      const member = users.find((u) => u.id === studentId);
                      return (
                        <li key={studentId} className="space-y-1.5 px-4 py-2.5">
                          <p className="text-sm text-foreground">
                            {member?.name} {member?.surname}
                          </p>
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`move-${studentId}`}
                              className="text-xs font-normal text-muted-foreground"
                            >
                              Move to
                            </Label>
                            <Select
                              value={group.id}
                              onValueChange={(value) => moveMember(studentId, value)}
                            >
                              <SelectTrigger
                                id={`move-${studentId}`}
                                className="h-8 flex-1 text-xs"
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
                      <li className="px-4 py-6 text-center text-sm text-muted-foreground">
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
                . Once an assessment opens and students start rating, group membership can no longer
                be changed.
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
