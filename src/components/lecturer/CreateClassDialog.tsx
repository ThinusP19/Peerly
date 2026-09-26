import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api";
import { createClass } from "@/services/peerly";

/** The periods a new class can belong to: this year and next, by semester. */
const academicPeriods = (now = new Date()) =>
  [now.getFullYear(), now.getFullYear() + 1].flatMap((year) => [
    `${year} Semester 1`,
    `${year} Semester 2`,
  ]);

const currentPeriod = (now = new Date()) =>
  `${now.getFullYear()} Semester ${now.getMonth() < 6 ? 1 : 2}`;

interface Form {
  moduleCode: string;
  name: string;
  academicPeriod: string;
}

type Errors = Partial<Record<keyof Form, string>>;

const blank = (): Form => ({ moduleCode: "", name: "", academicPeriod: currentPeriod() });

/**
 * FR-08: create a class with the signed-in lecturer responsible for it, then
 * go straight on to importing its class list, since a class has no students
 * until then.
 */
export function CreateClassDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, setActiveClassId } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof Form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setForm(blank());
    setErrors({});
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const moduleCode = form.moduleCode.trim().toUpperCase();

    const found: Errors = {};
    if (!moduleCode) {
      found.moduleCode = "Enter the module code, for example CMPG323.";
    } else if (!/^[A-Z]{4}\d{3}$/.test(moduleCode)) {
      found.moduleCode = "A module code is 4 letters and 3 digits, for example CMPG323.";
    }
    if (!form.name.trim()) found.name = "Enter the class name, for example Software Engineering.";
    setErrors(found);
    if (Object.keys(found).length || !user) return;

    setBusy(true);
    try {
      const klass = await createClass({ ...form, moduleCode }, user);
      setActiveClassId(klass.id);
      await queryClient.invalidateQueries();
      toast.success(`${klass.moduleCode} created. Import its class list to add students.`);
      reset();
      onOpenChange(false);
      navigate({ to: "/lecturer/classes/import" });
    } catch (error) {
      // A duplicate module code for the same period comes back as a 409 with
      // the explanation. It belongs beside the module code field, since that is
      // what has to change.
      if (error instanceof ApiError && error.status === 409) {
        setErrors({ moduleCode: error.message });
      } else if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setErrors(error.fields);
      } else {
        toast.error("We couldn't create that class. Please try again.");
      }
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
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Create a class</DialogTitle>
            <DialogDescription>
              You'll be the responsible lecturer. Next, you'll import its class list.
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <FormField
                label="Module code"
                error={errors.moduleCode}
                hint="4 letters, 3 digits"
                required
              >
                {(props) => (
                  <Input
                    {...props}
                    autoCapitalize="characters"
                    maxLength={7}
                    placeholder="CMPG323"
                    className="uppercase"
                    value={form.moduleCode}
                    onChange={(event) => set("moduleCode")(event.target.value)}
                  />
                )}
              </FormField>

              <FormField label="Class name" error={errors.name} hint="As students know it" required>
                {(props) => (
                  <Input
                    {...props}
                    value={form.name}
                    // The server's limit (MAX_CLASS_NAME): long enough for any
                    // real module name, short enough to fit a table row.
                    maxLength={120}
                    onChange={(event) => set("name")(event.target.value)}
                  />
                )}
              </FormField>
            </div>

            <FormField label="Academic period" error={errors.academicPeriod} required>
              {(props) => (
                <Select value={form.academicPeriod} onValueChange={set("academicPeriod")}>
                  <SelectTrigger id={props.id} aria-describedby={props["aria-describedby"]}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {academicPeriods().map((period) => (
                      <SelectItem key={period} value={period}>
                        {period}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <BusyButton type="submit" busy={busy} busyLabel="Creating…">
              Create class
            </BusyButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
