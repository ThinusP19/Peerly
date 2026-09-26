import { createFileRoute } from "@tanstack/react-router";

import { AccountSettings } from "@/components/shared/AccountSettings";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/lecturer/settings")({
  head: () => titleHead("Settings"),
  component: AccountSettings,
});
