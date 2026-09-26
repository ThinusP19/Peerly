import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AssessmentForm } from "@/components/lecturer/AssessmentForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { useSession } from "@/lib/session";
import { createAssessment } from "@/services/peerly";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/lecturer/assessments/new")({
  head: () => titleHead("New assessment"),
  component: NewAssessmentPage,
});

function NewAssessmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeClassId, setActiveAssessmentId } = useSession();

  return (
    <>
      <PageHeader
        title="New assessment"
        backTo="/lecturer/assessments"
        backLabel="Assessments"
        description="Assessments are created as a draft. Nothing is visible to students until you open it."
      />

      <AssessmentForm
        classId={activeClassId}
        submitLabel="Save as draft"
        onSubmit={async (draft) => {
          const created = await createAssessment({
            classId: activeClassId,
            status: "draft",
            ...draft,
          });
          await queryClient.invalidateQueries();
          setActiveAssessmentId(created.id);
          toast.success(`“${created.name}” saved as a draft.`);
          navigate({
            to: "/lecturer/assessments/$assessmentId",
            params: { assessmentId: created.id },
          });
        }}
      />
    </>
  );
}
