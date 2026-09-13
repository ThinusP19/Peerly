import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;

const prettySize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Drag-and-drop or browse. Validation errors are shown inline, in plain
 * language, directly under the drop zone.
 */
export function FileUpload({
  file,
  onFileChange,
  accept = ".csv,.xlsx",
  acceptLabel = "Accepted formats: .csv and .xlsx · maximum 5 MB",
  className,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  acceptLabel?: string;
  className?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accepted = accept.split(",").map((ext) => ext.trim().toLowerCase());

  const validate = (candidate: File) => {
    const extension = `.${candidate.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!accepted.includes(extension)) {
      return `"${candidate.name}" is a ${extension} file. Please upload a ${accepted.join(" or ")} file instead.`;
    }
    if (candidate.size > MAX_BYTES) {
      return `"${candidate.name}" is ${prettySize(candidate.size)}. The largest file we can accept is 5 MB.`;
    }
    return null;
  };

  const accept_ = (candidate: File | undefined) => {
    if (!candidate) return;
    const message = validate(candidate);
    setError(message);
    onFileChange(message ? null : candidate);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    accept_(event.dataTransfer.files?.[0]);
  };

  if (file) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileSpreadsheet className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {prettySize(file.size)} · ready to parse
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onFileChange(null);
              setError(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            aria-label={`Remove ${file.name}`}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "border-border bg-card",
          error && "border-danger/50",
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <UploadCloud className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Drag your class list here, or browse for it
          </p>
          <p className="text-xs text-muted-foreground">{acceptLabel}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          Browse files
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => accept_(event.target.files?.[0])}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
