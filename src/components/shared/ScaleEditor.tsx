import { Loader2, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FormField } from "@/components/shared/FormField";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import type { Scale, ScaleChanges } from "@/services/peerly";

/**
 * The hidden value behind each rating option, and the factor limits (OR-19).
 *
 * One editor for both layers: an administrator editing the system defaults,
 * and a lecturer editing one assessment's own values. The server checks every
 * rule shown here again; the checks in this file exist so the form can say
 * what is wrong before anything is sent.
 *
 * Staff only. Students never see a value - the screen that uses this is behind
 * a staff route, and the API strips the values from a student's copy.
 */

type Draft = { values: Record<string, string>; minFactor: string; maxFactor: string };

const toDraft = (scale: Scale): Draft => ({
  values: Object.fromEntries(
    scale.options.map((option) => [option.id, String(option.hiddenValue)]),
  ),
  minFactor: String(scale.minFactor),
  maxFactor: String(scale.maxFactor),
});

const NUMBER = /^\d+(\.\d{1,3})?$/;

/** Mirrors the server's rules, so most mistakes are named before saving. */
function check(scale: Scale, draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const option of scale.options) {
    const raw = draft.values[option.id]?.trim() ?? "";
    if (!NUMBER.test(raw)) errors[`value.${option.id}`] = "Use a number with up to three decimals.";
    else if (Number(raw) > 1000) errors[`value.${option.id}`] = "Use a value between 0 and 1000.";
  }
  if (Object.keys(errors).length === 0) {
    scale.options.forEach((option, index) => {
      const better = scale.options[index - 1];
      if (better && Number(draft.values[option.id]) > Number(draft.values[better.id])) {
        errors[`value.${option.id}`] =
          `${option.label} can't be worth more than ${better.label}, which students see above it.`;
      }
    });
  }
  const min = Number(draft.minFactor);
  const max = Number(draft.maxFactor);
  if (!NUMBER.test(draft.minFactor.trim()) || !(min > 0 && min <= 1)) {
    errors["minFactor"] = "The lowest factor has to be more than 0 and at most 1.";
  }
  if (!NUMBER.test(draft.maxFactor.trim()) || !(max >= 1 && max <= 2)) {
    errors["maxFactor"] = "The highest factor has to be at least 1 and at most 2.";
  }
  return errors;
}

export function ScaleEditor({
  scale,
  title,
  description,
  onSave,
  onReset,
  showDefaults = false,
}: {
  scale: Scale;
  title: string;
  description: React.ReactNode;
  onSave: (changes: ScaleChanges) => Promise<void>;
  /** Offered when the values are an assessment's own. */
  onReset?: () => Promise<void>;
  /** Show each option's system value beside the one in force. */
  showDefaults?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(scale));
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<"save" | "reset" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // A save or a reset brings a new scale back; show what was actually stored.
  useEffect(() => setDraft(toDraft(scale)), [scale]);

  const errors = { ...check(scale, draft), ...serverErrors };
  const dirty = useMemo(() => {
    const original = toDraft(scale);
    return (
      original.minFactor !== draft.minFactor.trim() ||
      original.maxFactor !== draft.maxFactor.trim() ||
      scale.options.some((o) => Number(original.values[o.id]) !== Number(draft.values[o.id]))
    );
  }, [scale, draft]);

  const run = async (kind: "save" | "reset", action: () => Promise<void>) => {
    setSaving(kind);
    setFailure(null);
    setServerErrors({});
    try {
      await action();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setServerErrors(error.fields);
      } else {
        setFailure(error instanceof Error ? error.message : "That wasn't saved. Please try again.");
      }
    } finally {
      setSaving(null);
    }
  };

  const save = () =>
    run("save", () =>
      onSave({
        values: Object.fromEntries(
          scale.options.map((option) => [option.id, Number(draft.values[option.id])]),
        ),
        minFactor: Number(draft.minFactor),
        maxFactor: Number(draft.maxFactor),
      }),
    );

  const edit = (patch: Partial<Draft>) => {
    setServerErrors({});
    setDraft((current) => ({ ...current, ...patch }));
  };

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card">
      <PanelHeader
        title={title}
        description={description}
        actions={
          showDefaults ? (
            scale.customised ? (
              <StatusBadge status="in-progress" label="Own values" />
            ) : (
              <StatusBadge status="active" label="System defaults" />
            )
          ) : undefined
        }
      />

      <div className="relative w-full overflow-hidden">
        <Table>
          <caption className="sr-only">The value behind each rating option</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Rating option</TableHead>
              <TableHead className="hidden md:table-cell">What students see</TableHead>
              <TableHead className="w-36">Value</TableHead>
              {showDefaults ? (
                <TableHead className="hidden w-28 sm:table-cell">System value</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {scale.options.map((option) => {
              const id = `scale-value-${option.id}`;
              const error = errors[`value.${option.id}`];
              const raw = draft.values[option.id] ?? "";
              const differs = showDefaults && Number(raw) !== option.defaultValue;
              return (
                <TableRow key={option.id}>
                  <TableCell className="font-semibold whitespace-nowrap text-foreground">
                    <label htmlFor={id}>{option.label}</label>
                  </TableCell>
                  <TableCell className="hidden max-w-md text-sm whitespace-normal text-muted-foreground md:table-cell">
                    {option.description}
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      id={id}
                      inputMode="decimal"
                      value={raw}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${id}-error` : undefined}
                      onChange={(event) =>
                        edit({ values: { ...draft.values, [option.id]: event.target.value } })
                      }
                      className="w-24 rounded-lg tabular-nums"
                    />
                    {error ? (
                      <p
                        id={`${id}-error`}
                        role="alert"
                        className="mt-1.5 max-w-56 text-sm whitespace-normal text-danger"
                      >
                        {error}
                      </p>
                    ) : null}
                  </TableCell>
                  {showDefaults ? (
                    <TableCell
                      className={
                        differs
                          ? "hidden font-medium text-foreground tabular-nums sm:table-cell"
                          : "hidden text-muted-foreground tabular-nums sm:table-cell"
                      }
                    >
                      {option.defaultValue}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 border-t px-5 py-5 sm:grid-cols-2 sm:px-6">
        <FormField
          label="Lowest adjustment factor"
          hint={
            showDefaults
              ? `System value ${scale.defaults.minFactor}. A student's mark never drops below the group mark times this.`
              : "A student's mark never drops below the group mark times this."
          }
          error={errors["minFactor"]}
        >
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={draft.minFactor}
              onChange={(event) => edit({ minFactor: event.target.value })}
              className="w-28 rounded-lg tabular-nums"
            />
          )}
        </FormField>
        <FormField
          label="Highest adjustment factor"
          hint={
            showDefaults
              ? `System value ${scale.defaults.maxFactor}. A student's mark never rises above the group mark times this, or above the assessment's maximum.`
              : "A student's mark never rises above the group mark times this, or above the assessment's maximum."
          }
          error={errors["maxFactor"]}
        >
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={draft.maxFactor}
              onChange={(event) => edit({ maxFactor: event.target.value })}
              className="w-28 rounded-lg tabular-nums"
            />
          )}
        </FormField>
      </div>

      <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-muted-foreground" role={failure ? "alert" : undefined}>
          {failure ? (
            <span className="text-danger">{failure}</span>
          ) : (
            "Each option must be worth at least as much as the one below it."
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {onReset && scale.customised ? (
            <Button
              variant="outline"
              className="h-10 px-4"
              disabled={saving !== null}
              onClick={() => run("reset", onReset)}
            >
              {saving === "reset" ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw aria-hidden="true" />
              )}
              Use system defaults
            </Button>
          ) : null}
          <Button
            className="h-10 px-4"
            disabled={!dirty || saving !== null || Object.keys(check(scale, draft)).length > 0}
            onClick={save}
          >
            {saving === "save" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Save values
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * How a mark is worked out, in words and with the numbers in force.
 *
 * The client asked to verify the calculation, so it is stated where the values
 * are, with nothing left implicit.
 */
export function CalculationExplainer({ scale }: { scale: Pick<Scale, "minFactor" | "maxFactor"> }) {
  return (
    <Card className="space-y-3 rounded-2xl border-0 p-5 text-sm shadow-card sm:px-6">
      <h2 className="text-base font-semibold text-foreground">
        How a student's mark is calculated
      </h2>
      <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
        <li>
          Every member rates every member of their group, <strong>themselves included</strong>. Each
          rating counts as the value of the option chosen.
        </li>
        <li>
          A student's <strong>average</strong> is the mean of every rating they received, their own
          included.
        </li>
        <li>
          The <strong>group average</strong> is the mean of the members' averages.
        </li>
        <li>
          The student's <strong>adjustment factor</strong> is their average divided by the group
          average, kept between {scale.minFactor} and {scale.maxFactor}.
        </li>
        <li>
          Their <strong>mark</strong> is the group's base mark times the factor, rounded to one
          decimal place and never above the assessment's maximum.
        </li>
      </ol>
      <p className="text-muted-foreground">
        A student rated evenly with the rest of the group gets a factor of exactly 1, so the group's
        own mark. Every calculation keeps a copy of the values it used, so a mark can always be
        explained later, even after the values change.
      </p>
    </Card>
  );
}
