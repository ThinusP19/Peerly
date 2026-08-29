import type { ReactNode } from "react";

import { BrandMark } from "@/components/layout/BrandMark";
import { Card } from "@/components/ui/card";

/**
 * Centered card layout for the screens that sit outside both portals:
 * login, registration, activation and password reset.
 *
 * These screens sit on a flat charcoal canvas rather than the light background
 * used inside the portals — the white card lifts off it on shadow alone. No
 * gradient, no glow. The palette inside the card is unchanged, so buttons,
 * links and the brand mark stay indigo.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-auth-canvas px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <BrandMark className="size-10 rounded-lg shadow-raised" />
          <div>
            <p className="text-lg font-semibold tracking-tight text-auth-canvas-foreground">
              Peerly
            </p>
            <p className="text-sm text-auth-canvas-muted">Assessment Hub</p>
          </div>
        </div>

        <Card className="p-6 shadow-raised">
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <div className="mt-5">{children}</div>
        </Card>

        {footer ? <div className="text-center text-sm text-auth-canvas-muted">{footer}</div> : null}
      </div>
    </div>
  );
}
