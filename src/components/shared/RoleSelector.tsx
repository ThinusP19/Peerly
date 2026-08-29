import { GraduationCap, ShieldCheck, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Role } from "@/mocks/types";

const options: Array<{ role: Role; label: string; icon: LucideIcon }> = [
  { role: "student", label: "Student", icon: GraduationCap },
  { role: "lecturer", label: "Lecturer", icon: Users },
  { role: "admin", label: "Administrator", icon: ShieldCheck },
];

/**
 * Segmented role picker used on the sign-in and registration screens.
 *
 * On sign-in this is a signpost, not a credential: which portal you land in is
 * decided by the role stored on the account, never by what is chosen here.
 * On registration it does change what is asked for and which e-mail domain is
 * accepted.
 */
export function RoleSelector({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: Role;
  onChange: (role: Role) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-3 gap-1.5 rounded-md bg-muted p-1"
      >
        {options.map((option) => {
          const selected = value === option.role;
          return (
            <button
              key={option.role}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.role)}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1 rounded-sm px-2 py-2 text-xs font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                selected
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <option.icon className="size-4" aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
