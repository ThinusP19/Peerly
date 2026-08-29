import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { toast } from "sonner";

import { AssessmentForm } from "@/components/lecturer/AssessmentForm";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAssessment, updateAssessment } from "@/services/peerly";

export const Route = createFileRoute("/lecturer/assessments/$assessmentId/edit")({
  component: EditAssessmentPage,
});

function EditAssessmentPage() {
  const { assessmentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const assessmentQuery = useQuery({
    queryKey: ["assessment", assessmentId],
    queryFn: () => getAssessment(assessmentId),
  });

  if (assessmentQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const assessment = assessmentQuery.data;

  if (!assessment) {
    return (
      <EmptyState
        title="We couldn't find that assessment"
        action={
          <Button asChild variant="outline">
            <Link to="/lecturer/assessments">Back to assessments</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title={`Edit “${assessment.name}”`}
        backTo="/lecturer/assessments/$assessmentId"
        backLabel="Back to the assessment"
        description="Changes take effect immediately."
      />

      {assessment.status !== "draft" ? (
        <Card className="flex gap-2.5 border-warning/30 bg-warning-muted/40 p-4 shadow-card">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              This assessment is already {assessment.status}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Removing a group now would hide the assessment from those students and discard the
              ratings they've already given. Change the groups only if you're certain.
            </p>
          </div>
        </Card>
      ) : null}

      <AssessmentForm
        classId={assessment.classId}
        assessment={assessment}
        submitLabel="Save changes"
        onSubmit={async (draft) => {
          await updateAssessment(assessment.id, draft);
          await queryClient.invalidateQueries();
          toast.success(`“${draft.name}” has been updated.`);
          navigate({
            to: "/lecturer/assessments/$assessmentId",
            params: { assessmentId: assessment.id },
          });
        }}
      />
    </>
  );
}
