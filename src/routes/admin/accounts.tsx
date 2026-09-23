import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontal, Search, ShieldAlert, UserPlus, Users } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge, accountStatusKind } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { roleLabel } from "@/lib/session";
import type { Role, User } from "@/mocks/types";
import { ApiError } from "@/lib/api";
import {
  activeAdminCount,
  createStaffAccount,
  getStaffAccounts,
  resendActivationLink,
  setStaffAccountStatus,
  updateStaffAccount,
} from "@/services/peerly";

export const Route = createFileRoute("/admin/accounts")({
  component: AccountsPage,
});

type RoleFilter = Role | "all";
type StatusFilter = User["status"] | "all";

function AccountsPage() {
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ["staff-accounts"], queryFn: getStaffAccounts });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [blockedAccount, setBlockedAccount] = useState<User | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["staff-accounts"] });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (accounts.data ?? []).filter((account) => {
      if (roleFilter !== "all" && account.role !== roleFilter) return false;
      if (statusFilter !== "all" && account.status !== statusFilter) return false;
      if (!term) return true;
      return (
        `${account.name} ${account.surname}`.toLowerCase().includes(term) ||
        account.email.toLowerCase().includes(term)
      );
    });
  }, [accounts.data, search, roleFilter, statusFilter]);

  const [resending, setResending] = useState<string | null>(null);

  /**
   * Sends the activation link again.
   *
   * A link lasts a day, and an administrator with no way to reissue one had to
   * delete the account and create it afresh - which loses the trail that it
   * ever existed - or ask somebody to run SQL.
   */
  const resend = async (account: User) => {
    setResending(account.id);
    try {
      await resendActivationLink(account.id);
      toast.success(`A new activation link has been sent to ${account.email}.`);
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "The activation link couldn't be sent. Please try again.",
      );
    } finally {
      setResending(null);
    }
  };

  const requestStatusChange = (account: User) => {
    // An institution must never be left without an administrator who can sign in.
    if (
      account.role === "admin" &&
      account.status === "active" &&
      activeAdminCount(accounts.data ?? []) <= 1
    ) {
      setBlockedAccount(account);
      return;
    }
    setStatusTarget(account);
  };

  const columns: Array<Column<User>> = [
    {
      key: "name",
      header: "Name",
      sortValue: (row) => `${row.surname} ${row.name}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {row.name} {row.surname}
          </p>
          <p className="mt-0.5 text-xs break-all text-muted-foreground sm:hidden">{row.email}</p>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      sortValue: (row) => row.email,
      className: "hidden sm:table-cell text-muted-foreground",
      headerClassName: "hidden sm:table-cell",
      cell: (row) => row.email,
    },
    {
      key: "role",
      header: "Role",
      sortValue: (row) => row.role,
      className: "whitespace-nowrap",
      cell: (row) => roleLabel(row.role),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge status={accountStatusKind(row.status)} />,
    },
    {
      key: "created",
      header: "Date created",
      sortValue: (row) => row.createdAt,
      className: "hidden md:table-cell whitespace-nowrap text-muted-foreground tabular-nums",
      headerClassName: "hidden md:table-cell",
      cell: (row) => formatDate(row.createdAt),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal aria-hidden="true" />
              <span className="sr-only">
                Actions for {row.name} {row.surname}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(row)}>View / edit details</DropdownMenuItem>
            {/*
              An unverified account has never been activated, and only its
              holder can do that - by using the link they were emailed (FR-03).
              Offering "Activate account" here promised something the server
              will always refuse, so it is not offered.
            */}
            {row.status === "unverified" ? (
              <DropdownMenuItem disabled={resending === row.id} onClick={() => void resend(row)}>
                {resending === row.id ? "Sending…" : "Resend activation link"}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => requestStatusChange(row)}>
                {row.status === "active" ? "Deactivate account" : "Activate account"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const filtersApplied = Boolean(search.trim()) || roleFilter !== "all" || statusFilter !== "all";

  return (
    <>
      <PageHeader
        title="Lecturer & administrator accounts"
        description="Create staff accounts and control who can sign in. Student accounts are self-registered and are not managed here."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-10 px-4">
            <UserPlus aria-hidden="true" />
            Create account
          </Button>
        }
      />

      <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
        {/* Wraps before the search box gets cramped; the count rides at the end. */}
        <div className="flex flex-col gap-3 border-b px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
          <div className="relative min-w-0 flex-1 sm:min-w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              aria-label="Search accounts by name or email"
              className="h-10 rounded-lg pl-9"
            />
          </div>

          <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-48" aria-label="Filter by role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="lecturer">Lecturer</SelectItem>
              <SelectItem value="admin">System Administrator</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-44" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Deactivated</SelectItem>
              <SelectItem value="unverified">Unverified</SelectItem>
            </SelectContent>
          </Select>

          <p
            className="text-sm whitespace-nowrap text-muted-foreground sm:ml-auto"
            aria-live="polite"
          >
            {accounts.isPending
              ? "Loading accounts…"
              : `Showing ${rows.length} of ${accounts.data?.length ?? 0} accounts`}
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          loading={accounts.isPending}
          caption="Lecturer and administrator accounts"
          className="rounded-none shadow-none"
          empty={
            <EmptyState
              icon={Users}
              title={filtersApplied ? "No accounts match those filters" : "No staff accounts yet"}
              description={
                filtersApplied
                  ? "Try a different search term, or clear the role and status filters."
                  : "Create the first lecturer or administrator account to get started."
              }
              action={
                filtersApplied ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setRoleFilter("all");
                      setStatusFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => setCreateOpen(true)}>
                    <UserPlus aria-hidden="true" />
                    Create account
                  </Button>
                )
              }
              className="rounded-none bg-transparent shadow-none"
            />
          }
        />
      </Card>

      <AccountFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={refresh}
      />

      <AccountFormDialog
        mode="edit"
        account={editing}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={refresh}
      />

      {statusTarget ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setStatusTarget(null)}
          title={
            statusTarget.status === "active" ? "Deactivate this account?" : "Activate this account?"
          }
          objectName={`${statusTarget.name} ${statusTarget.surname} · ${statusTarget.email}`}
          description={
            statusTarget.status === "active"
              ? "They will be signed out and will not be able to sign in again until the account is reactivated. Their classes, assessments and audit history are kept."
              : "They will be able to sign in again immediately with their existing password."
          }
          destructive={statusTarget.status === "active"}
          confirmLabel={
            statusTarget.status === "active" ? "Deactivate account" : "Activate account"
          }
          onConfirm={async () => {
            const next = statusTarget.status === "active" ? "inactive" : "active";
            try {
              await setStaffAccountStatus(statusTarget.id, next);
            } catch (error) {
              // A refusal has to reach the administrator as words. Without this
              // the server's explanation - that only the holder can activate an
              // account, using the link they were emailed - was thrown away and
              // the dialog simply sat there having apparently done nothing.
              toast.error(
                error instanceof ApiError
                  ? error.message
                  : "We couldn't change that account. Please try again.",
              );
              setStatusTarget(null);
              return;
            }
            await refresh();
            toast.success(
              `${statusTarget.name} ${statusTarget.surname} ${
                next === "active" ? "can sign in again" : "has been deactivated"
              }.`,
            );
            setStatusTarget(null);
          }}
        />
      ) : null}

      <Dialog
        open={Boolean(blockedAccount)}
        onOpenChange={(open) => !open && setBlockedAccount(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>This account can't be deactivated</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">
                  {blockedAccount?.name} {blockedAccount?.surname}
                </p>
                <p>
                  This is the only System Administrator who can still sign in. Deactivating it would
                  lock everyone out of account administration.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger-muted p-3 text-sm text-danger">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Create or activate another System Administrator first, then deactivate this one.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockedAccount(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setBlockedAccount(null);
                setCreateOpen(true);
              }}
            >
              Create an administrator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Create / edit form
 * ------------------------------------------------------------------ */

interface AccountForm {
  name: string;
  surname: string;
  email: string;
  role: Role;
}

function AccountFormDialog({
  mode,
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  account?: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<unknown>;
}) {
  const blank: AccountForm = { name: "", surname: "", email: "", role: "lecturer" };
  const [form, setForm] = useState<AccountForm>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof AccountForm, string>>>({});
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Seed the form when a different account is opened for editing.
  const seedKey = mode === "edit" ? (account?.id ?? null) : open ? "create" : null;
  if (open && seedKey !== loadedFor) {
    setLoadedFor(seedKey);
    setForm(
      mode === "edit" && account
        ? {
            name: account.name,
            surname: account.surname,
            email: account.email,
            role: account.role,
          }
        : blank,
    );
    setErrors({});
  }

  const set = (key: keyof AccountForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const next: Partial<Record<keyof AccountForm, string>> = {};
    if (!form.name.trim()) next.name = "Enter the person's first name.";
    if (!form.surname.trim()) next.surname = "Enter the person's surname.";
    if (!form.email.trim()) {
      next.email = "Enter an institutional email address.";
    } else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      next.email = "This doesn't look like an email address - check for a missing @ or full stop.";
    } else if (!form.email.trim().toLowerCase().endsWith("nwu.ac.za")) {
      next.email = "Staff accounts must use an institutional address ending in nwu.ac.za.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const payload = {
      name: form.name.trim(),
      surname: form.surname.trim(),
      email: form.email.trim(),
      role: form.role,
    };

    try {
      if (mode === "edit" && account) {
        await updateStaffAccount(account.id, payload);
        toast.success(`${payload.name} ${payload.surname}'s details have been updated.`);
      } else {
        await createStaffAccount(payload);
        toast.success(`Account created. An activation link has been sent to ${payload.email}.`);
      }
      await onSaved();
    } catch (error) {
      // Refused - a duplicate address, or demoting the last administrator.
      // Put the reason beside the field it names, or in a toast if none, and
      // leave the form open so it can be corrected.
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setErrors(error.fields as Partial<Record<keyof AccountForm, string>>);
      } else {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : "The account couldn't be saved. Please try again.",
        );
      }
      return;
    } finally {
      setBusy(false);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Create a staff account" : "Account details"}
            </DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "The account starts as unverified. We'll email an activation link so they can set their own password."
                : "Changing an email address also changes the address they sign in with."}
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="First name" error={errors.name} required>
                {(props) => (
                  <Input
                    {...props}
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                  />
                )}
              </FormField>

              <FormField label="Surname" error={errors.surname} required>
                {(props) => (
                  <Input
                    {...props}
                    value={form.surname}
                    onChange={(event) => set("surname", event.target.value)}
                  />
                )}
              </FormField>
            </div>

            <FormField
              label="Institutional email"
              error={errors.email}
              hint="Must end in nwu.ac.za."
              required
            >
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  value={form.email}
                  onChange={(event) => set("email", event.target.value)}
                />
              )}
            </FormField>

            <FormField
              label="Role"
              hint={
                form.role === "admin"
                  ? "Administrators manage staff accounts only - they cannot see marks."
                  : "Lecturers manage their own classes, groups, assessments and marks."
              }
              required
            >
              {(props) => (
                <Select value={form.role} onValueChange={(value) => set("role", value)}>
                  <SelectTrigger id={props.id} aria-describedby={props["aria-describedby"]}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lecturer">Lecturer</SelectItem>
                    <SelectItem value="admin">System Administrator</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>

            {mode === "edit" && account ? (
              <div className="rounded-lg bg-muted p-3.5 text-sm text-muted-foreground">
                Created {formatDate(account.createdAt)} · current status{" "}
                <span className="font-semibold text-foreground">
                  {account.status === "inactive"
                    ? "Deactivated"
                    : account.status === "active"
                      ? "Active"
                      : "Unverified"}
                </span>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <BusyButton type="submit" busy={busy} busyLabel="Saving…">
              {mode === "create" ? "Create account" : "Save changes"}
            </BusyButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
