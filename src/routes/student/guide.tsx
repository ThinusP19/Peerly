import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, Scale, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { RatingOptionList } from "@/components/shared/RatingOptionList";
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
    // Long reading copy: capped like the evaluation flow.
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <PageHeader
        title="How rating works"
        description="You choose a phrase for each group member - never a number or a score out of five."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {principles.map((principle) => (
          <Card
            key={principle.title}
            className="min-w-0 space-y-2 rounded-2xl border-0 p-5 shadow-card sm:px-6"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <principle.icon className="size-4" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-foreground">{principle.title}</p>
            <p className="text-sm text-muted-foreground">{principle.body}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
        <PanelHeader
          title="The nine options"
          size="lg"
          description="Listed strongest first. Pick the one that fits, not the one that's kindest."
          count={options.data?.length}
        />

        {options.isPending ? (
          <div className="space-y-3 px-5 py-5 sm:px-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <RatingOptionList options={options.data ?? []} />
        )}
      </Card>
    </div>
  );
}
