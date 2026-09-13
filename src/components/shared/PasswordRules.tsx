import { CheckCircle2, Circle } from "lucide-react";

import type { PasswordCheck } from "@/lib/password";
import { cn } from "@/lib/utils";

/** Live checklist for the password policy (SR-02), shown beside a new-password field. */
export function PasswordRules({
  checks,
  className,
}: {
  checks: PasswordCheck[];
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-muted/60 p-4", className)}>
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Your new password
      </p>
      <ul className="mt-3 space-y-2" aria-live="polite">
        {checks.map((check) => (
          <li
            key={check.id}
            className={cn(
              "flex items-start gap-2 text-sm",
              check.ok ? "text-success" : "text-muted-foreground",
            )}
          >
            {check.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span>
              {check.label}
              <span className="sr-only">{check.ok ? " (met)" : " (not met yet)"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
