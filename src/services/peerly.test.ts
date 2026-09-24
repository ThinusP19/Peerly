
import { expect, it } from "vitest";
import { assessments } from "@/mocks/data";
import { calculateMarks } from "@/services/peerly";

it("rejects calculations for an open assessment", async () => {
  const assessment = assessments.find(
    (a) => a.id === "asm-1",
  );

  if (!assessment) {
    throw new Error("Test assessment not found");
  }

  const originalStatus = assessment.status;

  try {
    assessment.status = "open";

    await expect(
      calculateMarks(assessment.id),
    ).rejects.toThrow(
      "This assessment must be closed before marks can be calculated.",
    );
  } finally {
    assessment.status = originalStatus;
  }
});


it("allows calculations for a closed assessment", async () => {
  const assessment = assessments.find(
    (a) => a.id === "asm-1",
  );

  if (!assessment) {
    throw new Error("Test assessment not found");
  }

  const originalStatus = assessment.status;

  try {
    assessment.status = "closed";

    await expect(
      calculateMarks(assessment.id),
    ).resolves.toHaveProperty(
      "assessmentId",
      assessment.id,
    );
  } finally {
    assessment.status = originalStatus;
  }
});


it("rejects calculations for a draft assessment", async () => {
  const assessment = assessments.find(
    (a) => a.id === "asm-1",
  );

  if (!assessment) {
    throw new Error("Test assessment not found");
  }

  const originalStatus = assessment.status;

  try {
    assessment.status = "draft";

    await expect(
      calculateMarks(assessment.id),
    ).rejects.toThrow(
      "This assessment must be closed before marks can be calculated.",
    );
  } finally {
    assessment.status = originalStatus;
  }
});