import type { StudentRatingOption } from "@/mocks/types";

/**
 * The rating options in words, strongest first, as a student reads them.
 *
 * No numbered badges. A 1 to 9 beside each option reads as a 1 to 9 scale,
 * directly under a promise that ratings are "never a number" (BR-15). The
 * ordered list already carries the order for assistive technology, and the
 * marker only shows where each option starts.
 */
export function RatingOptionList({ options }: { options: StudentRatingOption[] }) {
  return (
    <ol className="divide-y">
      {options.map((option) => (
        <li key={option.id} className="flex items-start gap-3 px-5 py-3.5 sm:px-6">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">{option.label}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{option.description}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
