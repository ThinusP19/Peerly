import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useState, type FormEvent } from "react";

import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { classes } from "@/mocks/data";
import type { Assessment } from "@/mocks/types";
import { getGroups, getRatingOptions } from "@/services/peerly";

/** ISO → the "YYYY-MM-DDTHH:mm" that <input type="datetime-local"> expects. */
const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const fromLocalInput = (value: string) => new Date(value).toISOString();

export interface AssessmentDraft {
  name: string;
  description: string;
  groupIds: string[];
  opensAt: string;
  closesAt: string;
  maxMark: number;
}

type Errors = Partial<Record<"name" | "groupIds" | "opensAt" | "closesAt" | "maxMark", string>>;

/**
 * Create / edit form for an assessment. The class is fixed to whichever class
 * the lecturer is working in — moving an assessment between classes would
 * orphan its groups.
 */
export function AssessmentForm({
  classId,
  assessment,
  onSubmit,
  submitLabel,
}: {
  classId: string;
  assessment?: Assessment;
  onSubmit: (draft: AssessmentDraft) => Promise<void>;
  submitLabel: string;
}) {
  const navigate = useNavigate();
  const klass = classes.find((c) => c.id === classId);

  const groups = useQuery({ queryKey: ["groups", classId], queryFn: () => getGroups(classId) });
  const options = useQuery({ queryKey: ["rating-options"], queryFn: getRatingOptions });

  const [name, setName] = useState(assessment?.name ?? "");
  const [description, setDescription] = useState(assessment?.description ?? "");
  const [groupIds, setGroupIds] = useState<string[]>(assessment?.groupIds ?? []);
  const [opensAt, setOpensAt] = useState(assessment ? toLocalInput(assessment.opensAt) : "");
  const [closesAt, setClosesAt] = useState(assessment ? toLocalInput(assessment.closesAt) : "");
  const [maxMark, setMaxMark] = useState(String(assessment?.maxMark ?? 100));

  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const availableGroups = groups.data ?? [];
  const allSelected = availableGroups.length > 0 && groupIds.length === availableGroups.length;

  const toggleGroup = (groupId: string) =>
    setGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const next: Errors = {};
    if (!name.trim()) next.name = "Give this assessment a name your students will recognise.";
    if (groupIds.length === 0) next.groupIds = "Choose at least one group to take part.";
    if (!opensAt) next.opensAt = "Set the date and time the assessment opens.";
    if (!closesAt) next.closesAt = "Set the date and time the assessment closes.";
    if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) {
      next.closesAt = "The closing time has to be after the opening time.";
    }
    const max = Number(maxMark);
    if (!maxMark.trim() || Number.isNaN(max) || max <= 0) {
      next.maxMark = "Enter the mark this assessment is out of, for example 100.";
    }

    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      groupIds,
      opensAt: fromLocalInput(opensAt),
      closesAt: fromLocalInput(closesAt),
      maxMark: max,
    });
    setBusy(false);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <Card className="space-y-5 p-5 shadow-card">
        <h2 className="font-semibold text-foreground">Details</h2>

        <FormField label="Assessment name" error={errors.name} required>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Project Phase 2 — Peer Assessment"
            />
          )}
        </FormField>

        <FormField
          label="Description"
          hint="Shown to students on their dashboard and at the top of the evaluation form."
        >
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Rate each member of your group on their contribution to…"
            />
          )}
        </FormField>

        <div className="space-y-1.5">
          <Label>Class</Label>
          <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            <span>
              {klass ? `${klass.moduleCode} — ${klass.name}` : "No class selected"} · fixed to the
              class you're working in
            </span>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">Groups taking part</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Only confirmed groups can be included. Students in groups you leave out won't see this
              assessment.
            </p>
          </div>
          {availableGroups.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setGroupIds(allSelected ? [] : availableGroups.map((group) => group.id))
              }
            >
              {allSelected ? "Clear all" : "Select all"}
            </Button>
          ) : null}
        </div>

        {groups.isPending ? (
          <p className="text-sm text-muted-foreground">Loading groups…</p>
        ) : availableGroups.length === 0 ? (
          <div className="rounded-md border border-warning/30 bg-warning-muted p-3 text-sm text-warning">
            This class has no confirmed groups yet.{" "}
            <Link to="/lecturer/groups/generate" className="font-medium underline">
              Generate groups first
            </Link>
            .
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableGroups.map((group) => {
              const id = `group-${group.id}`;
              const checked = groupIds.includes(group.id);
              return (
                <label
                  key={group.id}
                  htmlFor={id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md border p-3 text-sm transition-colors ${
                    checked ? "border-primary bg-accent" : "hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={() => toggleGroup(group.id)}
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      Group {group.groupNumber}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {group.memberStudentIds.length} members
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {errors.groupIds ? (
          <p role="alert" className="text-sm text-danger">
            {errors.groupIds}
          </p>
        ) : null}
      </Card>

      <Card className="space-y-5 p-5 shadow-card">
        <h2 className="font-semibold text-foreground">When it runs</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Opens" error={errors.opensAt} required>
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                value={opensAt}
                onChange={(event) => setOpensAt(event.target.value)}
              />
            )}
          </FormField>

          <FormField
            label="Closes"
            error={errors.closesAt}
            hint="Students can change their answers until this moment."
            required
          >
            {(props) => (
              <Input
                {...props}
                type="datetime-local"
                value={closesAt}
                onChange={(event) => setClosesAt(event.target.value)}
              />
            )}
          </FormField>
        </div>

        <div className="max-w-xs">
          <FormField
            label="Group mark is out of"
            error={errors.maxMark}
            hint="Individual marks are calculated from this."
            required
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                value={maxMark}
                onChange={(event) => setMaxMark(event.target.value)}
              />
            )}
          </FormField>
        </div>
      </Card>

      <Card className="space-y-4 p-5 shadow-card">
        <div>
          <h2 className="font-semibold text-foreground">Rating scale</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every assessment uses the same nine descriptive options. Students see the label and its
            description — never a number. This scale can't be edited.
          </p>
        </div>

        <ol className="divide-y rounded-md border">
          {(options.data ?? []).map((option) => (
            <li key={option.id} className="flex gap-3 p-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                {option.order}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                <span className="block text-sm text-muted-foreground">{option.description}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate({ to: "/lecturer/assessments" })}
        >
          Cancel
        </Button>
        <BusyButton type="submit" busy={busy} busyLabel="Saving…">
          {submitLabel}
        </BusyButton>
      </div>
    </form>
  );
}
