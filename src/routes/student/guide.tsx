import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, Scale, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getStudentRatingOptions } from "@/services/peerly";

export const Route = createFileRoute("/student/guide")({
  component: RatingGuidePage,
});

const principles = [
  {
    icon: Eye,
    title: "Nobody you rate ever sees it",
    body: "Your ratings go to your lecturer only. Group members never find out what you chose for them.",
  },
  {
    icon: Scale,
    title: "Describe what happened, not how you feel",
    body: "Pick the sentence that matches what the person actually did. A friend who did little should still get the option that says so.",
  },
  {
    icon: ShieldCheck,
    title: "It affects marks, including yours",
    body: "Your group's mark is adjusted per person using these ratings. Rating everyone identically tells your lecturer nothing.",
  },
];

function RatingGuidePage() {
  // Student-facing: these options carry no numeric value at all.
  const options = useQuery({
    queryKey: ["student-rating-options"],
    queryFn: getStudentRatingOptions,
  });

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">How rating works</h1>
        <p className="text-sm text-muted-foreground">
          You choose a phrase for each group member - never a number or a score out of five.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {principles.map((principle) => (
          <Card key={principle.title} className="space-y-2 p-4 shadow-card">
            <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <principle.icon className="size-4" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-foreground">{principle.title}</p>
            <p className="text-sm text-muted-foreground">{principle.body}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden shadow-card">
        <div className="border-b bg-accent px-4 py-3 sm:px-5">
          <h2 className="font-semibold text-accent-foreground">The nine options</h2>
          <p className="text-sm text-accent-foreground/80">
            Listed strongest first. Pick the one that fits, not the one that's kindest.
          </p>
        </div>

        {options.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <ol className="divide-y">
            {(options.data ?? []).map((option) => (
              <li key={option.id} className="flex gap-3 p-4 sm:px-5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                  {option.order}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {option.label}
                  </span>
                  <span className="block text-sm text-muted-foreground">{option.description}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
