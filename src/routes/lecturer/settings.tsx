import { createFileRoute } from "@tanstack/react-router";

import { AccountSettings } from "@/components/shared/AccountSettings";

export const Route = createFileRoute("/lecturer/settings")({
  component: AccountSettings,
});
