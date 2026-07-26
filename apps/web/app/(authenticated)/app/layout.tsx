import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { WorkspaceContextProvider } from "@/components/workspace/workspace-context";
import { getAppContextState, isProfileComplete } from "@/lib/auth/app-context";

export const dynamic = "force-dynamic";

export default async function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  const contextState = await getAppContextState();
  const staticPreviewEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env.TALENCE_ENABLE_STATIC_APP_PREVIEW === "true";

  if (
    contextState.status === "unauthenticated" ||
    (contextState.status === "unconfigured" && !staticPreviewEnabled)
  ) {
    redirect("/login?status=authentication_required");
  }

  if (contextState.status === "denied") {
    redirect("/login?status=account_unavailable");
  }

  if (contextState.status === "unconfigured") {
    return <AppShell previewMode>{children}</AppShell>;
  }

  if (!isProfileComplete(contextState.context.profile)) {
    redirect("/invite/complete");
  }

  return (
    <WorkspaceContextProvider
      value={{
        collections: contextState.context.collections,
        isPlatformAdmin: contextState.context.isPlatformAdmin,
        workspace: contextState.context.workspace,
        workspaces: contextState.context.workspaces,
      }}
    >
      <AppShell context={contextState.context}>{children}</AppShell>
    </WorkspaceContextProvider>
  );
}
