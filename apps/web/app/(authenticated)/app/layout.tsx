import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { getVerifiedAuthState } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  const authState = await getVerifiedAuthState();
  const staticPreviewEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env.TALENCE_ENABLE_STATIC_APP_PREVIEW === "true";

  if (
    authState.status === "unauthenticated" ||
    (authState.status === "unconfigured" && !staticPreviewEnabled)
  ) {
    redirect("/login?status=authentication_required");
  }

  return <AppShell previewMode={authState.status === "unconfigured"}>{children}</AppShell>;
}
