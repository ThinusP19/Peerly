import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, CheckCircle2, Info, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FileUpload } from "@/components/shared/FileUpload";
import { FormField } from "@/components/shared/FormField";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { classes } from "@/mocks/data";
import { getImportPreview } from "@/services/peerly";

export const Route = createFileRoute("/lecturer/classes/import")({
  component: ImportPage,
});

const steps = [
  { key: "upload", label: "Upload the file" },
  { key: "mapping", label: "Confirm the columns" },
  { key: "preview", label: "Check the rows" },
  { key: "confirm", label: "Import" },
] as const;

type StepKey = (typeof steps)[number]["key"];

/** Headers as they appear in a typical exported class list - deliberately messy. */
const fileHeaders = ["Stud No.", "Given Name", "Family Name", "Email Address", "Programme"];

type FieldKey = "studentNumber" | "name" | "surname" | "email";

// The submit strip at the foot of each step panel.
const panelFooterClass =
  "flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6";

const fields: Array<{ key: FieldKey; label: string; hint: string; guess: string }> = [
  {
    key: "studentNumber",
    label: "Student number",
    hint: "Used to match students to their Peerly account.",
    guess: "Stud No.",
  },
  { key: "name", label: "First name", hint: "Shown to group members.", guess: "Given Name" },
  { key: "surname", label: "Surname", hint: "Shown to group members.", guess: "Family Name" },
  {
    key: "email",
    label: "Institutional email",
    hint: "Used to invite students who haven't registered.",
    guess: "Email Address",
  },
];

function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeClassId } = useSession();
  const klass = classes.find((c) => c.id === activeClassId);

  const [step, setStep] = useState<StepKey>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>(
    Object.fromEntries(fields.map((field) => [field.key, field.guess])) as Record<FieldKey, string>,
  );
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const preview = useQuery({
    queryKey: ["import-preview"],
    queryFn: getImportPreview,
    enabled: step === "preview" || step === "confirm",
  });

  const rows = preview.data ?? [];
  const errorRows = rows.filter((row) => row.errors.length > 0);
  const validRows = rows.filter((row) => row.errors.length === 0);

  const stepIndex = steps.findIndex((s) => s.key === step);

  const goToPreview = () => {
    const used = Object.values(mapping);
    const duplicated = used.find((header, index) => used.indexOf(header) !== index);
    if (duplicated) {
      setMappingError(
        `"${duplicated}" is mapped to more than one field. Each column can only be used once.`,
      );
      return;
    }
    setMappingError(null);
    setStep("preview");
  };

  return (
    <>
      <PageHeader
        title="Import a class list"
        backTo="/lecturer/classes"
        backLabel="Class list"
        description={
          klass
            ? `Importing into ${klass.moduleCode} - ${klass.name}. Existing students stay on the list; new rows are added.`
            : "Select a class in the header first."
        }
      />

      {/* Step indicator */}
      <Card className="rounded-2xl border-0 px-5 py-4 shadow-card sm:px-6">
        <ol className="flex flex-wrap gap-x-2 gap-y-3">
          {steps.map((s, index) => {
            const state = index < stepIndex ? "done" : index === stepIndex ? "current" : "todo";
            return (
              <li
                key={s.key}
                className="flex items-center gap-2"
                aria-current={state === "current" ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    state === "done" && "border-success bg-success text-success-foreground",
                    state === "current" && "border-primary bg-primary text-primary-foreground",
                    state === "todo" && "border-border bg-card text-muted-foreground",
                  )}
                >
                  {state === "done" ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    state === "current" ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
                {index < steps.length - 1 ? (
                  <span className="mx-1 hidden h-px w-8 bg-border sm:block" aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </Card>

      {step === "upload" ? (
        <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
          <PanelHeader
            title="Upload the class list"
            size="lg"
            description="Export the list from the student system and upload it here. We'll show you exactly what will be imported before anything changes."
          />

          <div className="px-5 py-5 sm:px-6">
            <FileUpload file={file} onFileChange={setFile} />
          </div>

          <div className={panelFooterClass}>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/lecturer/classes" })}
              className="h-10 px-4"
            >
              Cancel
            </Button>
            <Button disabled={!file} onClick={() => setStep("mapping")} className="h-10 px-4">
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === "mapping" ? (
        <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
          <PanelHeader
            title="Confirm the columns"
            size="lg"
            description={
              <>
                We matched the headers in{" "}
                <span className="font-medium text-foreground">{file?.name}</span> to Peerly's
                fields. Change anything we got wrong.
              </>
            }
          />

          <div className="space-y-5 px-5 py-5 sm:px-6">
            {mappingError ? (
              <p
                role="alert"
                className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger-muted p-3 text-sm text-danger"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{mappingError}</span>
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <FormField key={field.key} label={field.label} hint={field.hint} required>
                  {(props) => (
                    <Select
                      value={mapping[field.key]}
                      onValueChange={(value) =>
                        setMapping((current) => ({ ...current, [field.key]: value }))
                      }
                    >
                      <SelectTrigger id={props.id} aria-describedby={props["aria-describedby"]}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fileHeaders.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              ))}
            </div>

            <div className="flex gap-2.5 rounded-lg bg-muted p-3.5 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                The <span className="font-medium text-foreground">Programme</span> column isn't used
                by Peerly and will be ignored.
              </p>
            </div>
          </div>

          <div className={panelFooterClass}>
            <Button variant="outline" onClick={() => setStep("upload")} className="h-10 px-4">
              Back
            </Button>
            <Button onClick={goToPreview} className="h-10 px-4">
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === "preview" || step === "confirm" ? (
        <>
          {preview.isPending ? (
            <Card className="flex items-center justify-center gap-3 rounded-2xl border-0 px-6 py-14 text-muted-foreground shadow-card">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              <p className="min-w-0 text-sm break-words">Reading {file?.name}…</p>
            </Card>
          ) : (
            <>
              <Card
                className={cn(
                  "flex flex-col gap-4 rounded-2xl border p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-6",
                  errorRows.length ? "border-warning/25" : "border-success/25",
                )}
              >
                <div className="flex gap-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      errorRows.length
                        ? "bg-warning-muted text-warning"
                        : "bg-success-muted text-success",
                    )}
                  >
                    {errorRows.length ? (
                      <AlertTriangle className="size-4" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-foreground">
                      {validRows.length} rows ready to import
                      {errorRows.length ? `, ${errorRows.length} with errors` : ""}
                    </h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {errorRows.length
                        ? "Rows with errors are highlighted below and will be skipped. Fix them in the file and re-upload if you need them."
                        : "Every row passed validation."}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setStep("upload")}
                  className="h-10 shrink-0 px-4"
                >
                  Upload a different file
                </Button>
              </Card>

              {/* Rows, then the step's actions, in one panel. The table scrolls
                  sideways inside its own wrapper on narrow screens. */}
              <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
                <PanelHeader title="Check the rows" size="lg" count={rows.length} />

                <Table>
                  <caption className="sr-only">Rows parsed from the uploaded class list</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-14">Row</TableHead>
                      <TableHead>Student number</TableHead>
                      <TableHead>First name</TableHead>
                      <TableHead>Surname</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const invalid = row.errors.length > 0;
                      const fieldsWithErrors = new Set(row.errors.map((e) => e.field));
                      return (
                        <TableRow
                          key={row.rowNumber}
                          className={cn(invalid && "bg-danger-muted/40 hover:bg-danger-muted/60")}
                        >
                          <TableCell className="tabular-nums text-muted-foreground">
                            {row.rowNumber}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "tabular-nums whitespace-nowrap",
                              fieldsWithErrors.has("Student number") && "font-semibold text-danger",
                            )}
                          >
                            {row.studentNumber}
                          </TableCell>
                          <TableCell>{row.name}</TableCell>
                          <TableCell
                            className={cn(
                              fieldsWithErrors.has("Surname") && "font-semibold text-danger",
                            )}
                          >
                            {row.surname}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "whitespace-nowrap",
                              fieldsWithErrors.has("Email") && "font-semibold text-danger",
                            )}
                          >
                            {row.email || <span className="text-danger">Missing</span>}
                          </TableCell>
                          <TableCell className="min-w-56">
                            {invalid ? (
                              <ul className="space-y-1">
                                {row.errors.map((error) => (
                                  <li key={error.field} className="text-sm text-danger">
                                    <span className="font-semibold">{error.field}:</span>{" "}
                                    {error.reason}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                Ready
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className={panelFooterClass}>
                  <Button
                    variant="outline"
                    onClick={() => setStep("mapping")}
                    className="h-10 px-4"
                  >
                    Back
                  </Button>
                  <BusyButton
                    disabled={validRows.length === 0}
                    onClick={() => setConfirmOpen(true)}
                    className="h-10 px-4"
                  >
                    Import {validRows.length} students
                  </BusyButton>
                </div>
              </Card>
            </>
          )}
        </>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Import this class list?"
        objectName={`${file?.name ?? "class list"} → ${klass?.moduleCode ?? "class"} (${validRows.length} students)`}
        description={
          <p>
            {validRows.length} students will be added to the class list and matched to their Peerly
            accounts where possible.{" "}
            {errorRows.length
              ? `${errorRows.length} rows with errors will be skipped.`
              : "No rows will be skipped."}
          </p>
        }
        consequence={
          <p>
            Students already in a confirmed group keep their group. This import is recorded in the
            audit log and can't be undone from Peerly.
          </p>
        }
        confirmLabel="Import class list"
        onConfirm={async () => {
          await new Promise((resolve) => setTimeout(resolve, 900));
          await queryClient.invalidateQueries();
          toast.success(
            `${validRows.length} students imported into ${klass?.moduleCode ?? "the class"}.`,
          );
          navigate({ to: "/lecturer/classes" });
        }}
      />
    </>
  );
}
