"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { AppContext } from "@/lib/auth/app-context";

export type BrowserWorkspaceContext = Pick<
  AppContext,
  "collections" | "isPlatformAdmin" | "workspace" | "workspaces"
>;

const WorkspaceContext = createContext<BrowserWorkspaceContext | null>(null);

export function WorkspaceContextProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: BrowserWorkspaceContext;
}) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): BrowserWorkspaceContext {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceContext must be used inside WorkspaceContextProvider");
  }
  return context;
}

export function useOptionalWorkspaceContext(): BrowserWorkspaceContext | null {
  return useContext(WorkspaceContext);
}
