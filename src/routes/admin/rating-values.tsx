import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { CalculationExplainer, ScaleEditor } from "@/components/shared/ScaleEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { titleHead } from "@/lib/page-title";
import { getDefaultScale, updateDefaultScale } from "@/services/peerly";

export const Route = createFileRoute("/admin/rating-values")({
  head: () => titleHead("Rating values"),
  component: RatingValuesPage,
});

/**
 * The system-wide rating values and factor limits (OR-19).
 *
 * What every assessment is calculated with unless its lecturer chose values
 * of its own. Marks already calculated are not touched: each calculation kept
 * the values it used, and changes reach a student's mark only when a lecturer
 * calculates again.
 */
function RatingValuesPage() {
  const queryClient = useQueryClient();
  const scale = useQuery({ queryKey: ["default-scale"], queryFn: getDefaultScale });

  return (
    <>
      <PageHeader
        title="Rating values"
        description="The value behind each rating option, and how far peer ratings can move a mark. Lecturers can adjust these for a single assessment of theirs."
      />

      {scale.data ? (
        <>
          <ScaleEditor
            scale={scale.data}
            title="System defaults"
            description="Used by every assessment that doesn't have values of its own. Marks already calculated keep the values they were calculated with."
            onSave={async (changes) => {
              const saved = await updateDefaultScale(changes);
              queryClient.setQueryData(["default-scale"], saved);
              toast.success("Rating values saved. They apply to every calculation from now on.");
            }}
          />
          <CalculationExplainer scale={scale.data} />
        </>
      ) : scale.isError ? (
        <p role="alert" className="text-sm text-danger">
          The rating values couldn't be loaded. Refresh the page to try again.
        </p>
      ) : (
        <Skeleton className="h-96 rounded-2xl" />
      )}
    </>
  );
}
