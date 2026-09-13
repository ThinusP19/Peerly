import { KeyRound, UserRound } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { FormField } from "@/components/shared/FormField";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { PasswordRules } from "@/components/shared/PasswordRules";
import { StatusBadge, accountStatusKind } from "@/components/shared/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, initials } from "@/lib/format";
import { passwordChecks } from "@/lib/password";
import { roleLabel, useSession } from "@/lib/session";
import type { User } from "@/mocks/types";
import { PasswordChangeError, changePassword } from "@/services/peerly";

/** Who to ask when a detail on the profile is wrong. */
const changeContact: Record<User["role"], string> = {
  student: "your lecturer",
  lecturer: "a System Administrator",
  admin: "another System Administrator",
};

/**
 * Settings for any signed-in user, shared by all three portals: the profile,
 * read-only because no user may amend their own account (FR-07), and a
 * password change (FR-06).
 */
export function AccountSettings() {
  const { user } = useSession();
  const [tab, setTab] = useState("profile");
  if (!user) return null;

  return (
    <>
      <PageHeader title="Settings" description="Your account details and password." />

      <Tabs value={tab} onValueChange={setTab} className="space-y-3">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-card p-1 shadow-card sm:inline-flex sm:w-auto">
          <TabsTrigger
            value="profile"
            className="gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="password"
            className="gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
          >
            <KeyRound className="size-4" aria-hidden="true" />
            Password
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-0">
          <ProfilePanel user={user} />
        </TabsContent>
        <TabsContent value="password" className="mt-0">
          <PasswordPanel user={user} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProfilePanel({ user }: { user: User }) {
  const rows = [
    { label: "Email address", value: user.email },
    { label: "Role", value: roleLabel(user.role) },
    ...(user.studentNumber ? [{ label: "Student number", value: user.studentNumber }] : []),
    { label: "Member since", value: formatDate(user.createdAt) },
  ];

  return (
    <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
      <div className="flex flex-wrap items-center gap-4 border-b px-5 py-5 sm:px-6">
        <Avatar className="size-14">
          <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
            {initials(user.name, user.surname)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-foreground">
            {user.name} {user.surname}
          </p>
          <p className="truncate text-sm text-muted-foreground">{roleLabel(user.role)}</p>
        </div>
        <StatusBadge status={accountStatusKind(user.status)} />
      </div>

      <dl className="divide-y">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6"
          >
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {row.label}
            </dt>
            <dd className="text-sm break-words text-foreground sm:text-right">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="border-t bg-muted/40 px-5 py-3 text-xs text-muted-foreground sm:px-6">
        These details come from your university records. To change them, contact{" "}
        {changeContact[user.role]}.
      </p>
    </Card>
  );
}

interface PasswordErrors {
  current?: string;
  next?: string;
  confirm?: string;
}

function PasswordPanel({ user }: { user: User }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [busy, setBusy] = useState(false);

  const checks = passwordChecks(next, user);

  /** Updates a field and drops its stale error, so a fixed field stops showing red. */
  const change =
    (field: keyof PasswordErrors, setter: (value: string) => void) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setter(event.target.value);
      setErrors((current) => ({ ...current, [field]: undefined }));
    };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const found: PasswordErrors = {};
    if (!current) found.current = "Enter your current password.";
    const failed = checks.find((check) => !check.ok);
    if (!next) found.next = "Choose a new password.";
    else if (failed) found.next = failed.error;
    if (!confirm) found.confirm = "Type your new password a second time to confirm it.";
    else if (confirm !== next) found.confirm = "The two passwords don't match.";
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await changePassword(user, current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setErrors({});
      toast.success(
        "Password changed. Any other device signed in to your account has been signed out.",
      );
    } catch (error) {
      if (error instanceof PasswordChangeError) setErrors({ [error.field]: error.message });
      else toast.error("We couldn't change your password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
      <PanelHeader
        title="Change password"
        size="lg"
        description="You'll need your current password. Changing it signs you out on every other device."
      />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_17rem]"
      >
        <div className="space-y-4">
          <FormField label="Current password" error={errors.current} required>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="current-password"
                value={current}
                onChange={change("current", setCurrent)}
              />
            )}
          </FormField>

          <FormField label="New password" error={errors.next} required>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="new-password"
                value={next}
                onChange={change("next", setNext)}
              />
            )}
          </FormField>

          <FormField label="Confirm new password" error={errors.confirm} required>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="new-password"
                value={confirm}
                onChange={change("confirm", setConfirm)}
              />
            )}
          </FormField>

          <BusyButton
            type="submit"
            busy={busy}
            busyLabel="Changing password…"
            className="h-10 w-full px-4 sm:w-auto"
          >
            Change password
          </BusyButton>
        </div>

        <PasswordRules checks={checks} className="self-start lg:mt-6" />
      </form>
    </Card>
  );
}
