import { Loader2, Upload } from "lucide-react";
import { useState } from "react";

import { FileUpload } from "@/components/shared/FileUpload";
import { StatusBadge, type StatusKind } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMark } from "@/lib/format";
import {
  commitMarkImport,
  previewMarkImport,
  type MarkImportPreview,
  type MarkImportRow,
} from "@/services/peerly";

const statusOf: Record<MarkImportRow["status"], { kind: StatusKind; label: string }> = {
  new: { kind: "submitted", label: "New" },
  changed: { kind: "in-progress", label: "Changes" },
  unchanged: { kind: "not-started", label: "No change" },
  skipped: { kind: "not-started", label: "Left as is" },
  error: { kind: "conflict", label: "Fix this row" },
};

/**
 * Every group's base mark from one .csv or .xlsx file (FR-21), on client
 * feedback 2026-10-10.
 *
 * Choose a file, see what every row would do, then save - all or nothing. The
 * server reads the file both times (SR-10: nothing is kept between them) and
 * refuses the save if any row is wrong, so the preview is a courtesy, not the
 * only check.
 */
export function MarkImportDialog({
  open,
  onOpenChange,
  assessmentId,
  maxMark,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessmentId: string;
  maxMark: number;
  onSaved: (result: { changed: number; invalidatedCalculation: boolean }) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MarkImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setFailure(null);
  };

  const choose = async (next: File | null) => {
    setFile(next);
    setPreview(null);
    setFailure(null);
    if (!next) return;
    setBusy(true);
    try {
      setPreview(await previewMarkImport(assessmentId, next));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "We couldn't read that file.");
    } finally {
      setBusy(false);
    }
  };

  const errors = preview?.rows.filter((row) => row.status === "error").length ?? 0;
  const writes =
    preview?.rows.filter((row) => row.status === "new" || row.status === "changed").length ?? 0;

  const save = async () => {
    if (!file) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await commitMarkImport(assessmentId, file);
      await onSaved(result);
      reset();
      onOpenChange(false);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Those marks weren't saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload group marks</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Use a .csv or .xlsx file with a heading row and two columns: <strong>Group</strong>{" "}
                (the group number, or its name) and <strong>Mark</strong> (out of {maxMark}, whole
                numbers or one decimal place).
              </p>
              <pre className="rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">
                {"Group,Mark\n1,74\n2,68.5\n3,81"}
              </pre>
              <p>
                You'll see what each row does before anything is saved. A group missing from the
                file, or with a blank mark, keeps the mark it has.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <FileUpload
            file={file}
            onFileChange={choose}
            prompt="Drag your marks file here, or browse for it"
          />

          {busy && !preview ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Reading the file…
            </p>
          ) : null}

          {preview ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Read groups from <strong>{preview.columns.group}</strong> and marks from{" "}
                <strong>{preview.columns.mark}</strong>.{" "}
                {errors > 0
                  ? `${errors} ${errors === 1 ? "row needs" : "rows need"} fixing before anything can be saved.`
                  : writes === 0
                    ? "Every mark in the file matches what is already entered."
                    : `${writes} ${writes === 1 ? "mark" : "marks"} will be saved.`}
              </p>
              <div className="max-h-80 overflow-auto rounded-xl border">
                <Table>
                  <caption className="sr-only">What each row of the file will do</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-14">Row</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Mark</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.row}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {row.row}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {row.groupNumber !== undefined
                            ? `Group ${row.groupNumber}${row.groupName ? ` · ${row.groupName}` : ""}`
                            : row.group || "-"}
                        </TableCell>
                        <TableCell className="tabular-nums whitespace-nowrap">
                          {row.status === "changed" ? (
                            <>
                              <span className="text-muted-foreground line-through">
                                {formatMark(row.current ?? null)}
                              </span>{" "}
                              {formatMark(row.mark ?? null)}
                            </>
                          ) : row.mark !== undefined ? (
                            formatMark(row.mark)
                          ) : (
                            row.raw || "-"
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <StatusBadge
                            status={statusOf[row.status].kind}
                            label={statusOf[row.status].label}
                          />
                          {row.error ? (
                            <p className="mt-1 text-xs text-danger">{row.error}</p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preview.notInFile.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not in the file, so left as they are:{" "}
                  {preview.notInFile
                    .map((g) => `Group ${g.groupNumber}${g.groupName ? ` (${g.groupName})` : ""}`)
                    .join(", ")}
                  .
                </p>
              ) : null}
            </div>
          ) : null}

          {failure ? (
            <p role="alert" className="text-sm text-danger">
              {failure}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button disabled={!preview || errors > 0 || writes === 0 || busy} onClick={save}>
            {busy && preview ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {writes > 0 ? `Save ${writes} ${writes === 1 ? "mark" : "marks"}` : "Save marks"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
