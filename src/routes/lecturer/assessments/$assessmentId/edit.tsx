import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
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
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const assessment = assessmentQuery.data;

  if (!assessment) {
    return (
      <EmptyState
        title="We couldn't find that assessment"
        description="It may have been deleted, or it may belong to another lecturer's class."
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
        <Card className="flex gap-3 rounded-2xl border border-warning/25 p-5 shadow-card sm:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-muted text-warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">
              This assessment is already {assessment.status}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
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
