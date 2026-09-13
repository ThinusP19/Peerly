import { Check } from "lucide-react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { StudentRatingOption } from "@/mocks/types";

/**
 * The nine descriptive rating options.
 *
 * The label and its behavioural description are always shown together, inline.
 * This takes `StudentRatingOption`, which has no `hiddenValue` field at all -
 * the numeric scale is lecturer-only and appears just in the matrix and the
 * results drill-down.
 */
export function RatingScale({
  options,
  value,
  onChange,
  name,
  readOnly = false,
  className,
}: {
  options: StudentRatingOption[];
  value?: string;
  onChange?: (ratingOptionId: string) => void;
  name: string;
  readOnly?: boolean;
  className?: string;
}) {
  if (readOnly) {
    const selected = options.find((option) => option.id === value);
    if (!selected) {
      return <p className="text-sm text-muted-foreground">Not rated</p>;
    }
    return (
      <div className={cn("rounded-md border border-primary/30 bg-accent p-3", className)}>
        <p className="text-sm font-semibold text-accent-foreground">{selected.label}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{selected.description}</p>
      </div>
    );
  }

  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={onChange}
      name={name}
      className={cn("gap-2", className)}
    >
      {options.map((option) => {
        const id = `${name}-${option.id}`;
        const selected = value === option.id;
        return (
          <label
            key={option.id}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
              selected
                ? "border-primary bg-accent ring-1 ring-primary"
                : "border-border bg-card hover:border-primary/40 hover:bg-muted/50",
            )}
          >
            <RadioGroupItem id={id} value={option.id} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-sm font-semibold",
                  selected ? "text-accent-foreground" : "text-foreground",
                )}
              >
                {option.label}
              </span>
              <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                {option.description}
              </span>
            </span>
            {selected ? (
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            ) : null}
          </label>
        );
      })}
    </RadioGroup>
  );
}
