import "server-only";

import { MEMBERSHIP_ROLES } from "@talence/domain";

import {
  DATABASE_FUNCTIONS,
  DATABASE_TABLES,
  type CurrentUserDatabaseContext,
  type DatabaseProfile,
  type DatabaseWorkspaceContext,
} from "@/lib/database/contracts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { decideAppAccess } from "./access";
import { getVerifiedAuthState } from "./auth-state";

export { isProfileComplete } from "./access";

const PROFILE_STATUSES = new Set(["active", "suspended", "deletion_requested", "deleted"]);
const WORKSPACE_STATUSES = new Set(["active", "archived", "deleted"]);
const WORKSPACE_TYPES = new Set(["personal", "team", "store"]);
const MEMBERSHIP_ROLE_SET = new Set<string>(MEMBERSHIP_ROLES);

type AttemptResult<T> = { ok: true; value: T } | { ok: false };

async function attempt<T>(operation: () => PromiseLike<T>): Promise<AttemptResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch {
    return { ok: false };
  }
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: DatabaseWorkspaceContext["role"];
  slug: string;
  type: DatabaseWorkspaceContext["type"];
}

export interface CollectionSummary {
  id: string;
  name: string;
  slug: string;
}

export interface AppContext {
  collections: CollectionSummary[];
  isPlatformAdmin: boolean;
  profile: DatabaseProfile;
  userId: string;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
}

export type AppContextState =
  | { status: "denied"; reason: "admission" | "profile" | "workspace" }
  | { status: "ready"; context: AppContext }
  | { status: "unauthenticated" }
  | { status: "unconfigured" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseProfile(value: unknown): DatabaseProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = nullableString(value.status);
  const userId = nullableString(value.user_id);
  const preferredCurrency = nullableString(value.preferred_currency);
  if (!status || !PROFILE_STATUSES.has(status) || !userId || !preferredCurrency) {
    return null;
  }

  return {
    avatar_path: nullableString(value.avatar_path),
    default_collection_id: nullableString(value.default_collection_id),
    default_workspace_id: nullableString(value.default_workspace_id),
    display_name: nullableString(value.display_name),
    handle: nullableString(value.handle),
    preferred_currency: preferredCurrency,
    status: status as DatabaseProfile["status"],
    user_id: userId,
  };
}

function parseWorkspace(value: unknown): DatabaseWorkspaceContext | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = nullableString(value.id);
  const name = nullableString(value.name);
  const role = nullableString(value.role);
  const slug = nullableString(value.slug);
  const status = nullableString(value.status);
  const type = nullableString(value.type);

  if (
    !id ||
    !name ||
    !role ||
    !MEMBERSHIP_ROLE_SET.has(role) ||
    !slug ||
    !status ||
    !WORKSPACE_STATUSES.has(status) ||
    !type ||
    !WORKSPACE_TYPES.has(type)
  ) {
    return null;
  }

  return {
    id,
    name,
    role: role as DatabaseWorkspaceContext["role"],
    slug,
    status: status as DatabaseWorkspaceContext["status"],
    type: type as DatabaseWorkspaceContext["type"],
  };
}

export function parseCurrentUserContext(value: unknown): CurrentUserDatabaseContext | null {
  if (!isRecord(value)) {
    return null;
  }

  const userId = nullableString(value.user_id);
  const profile = parseProfile(value.profile);
  const workspace = parseWorkspace(value.workspace);
  if (
    !userId ||
    !profile ||
    !workspace ||
    profile.user_id !== userId ||
    typeof value.is_platform_admin !== "boolean"
  ) {
    return null;
  }

  return {
    is_platform_admin: value.is_platform_admin,
    profile,
    user_id: userId,
    workspace,
  };
}

function workspaceSummary(workspace: DatabaseWorkspaceContext): WorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    role: workspace.role,
    slug: workspace.slug,
    type: workspace.type,
  };
}

function parseMembershipRows(memberships: unknown, workspaces: unknown): WorkspaceSummary[] {
  if (!Array.isArray(memberships) || !Array.isArray(workspaces)) {
    return [];
  }

  const workspaceById = new Map<string, Record<string, unknown>>();
  for (const workspace of workspaces) {
    if (isRecord(workspace) && typeof workspace.id === "string") {
      workspaceById.set(workspace.id, workspace);
    }
  }

  const result: WorkspaceSummary[] = [];
  for (const membership of memberships) {
    if (
      !isRecord(membership) ||
      membership.status !== "active" ||
      typeof membership.workspace_id !== "string" ||
      typeof membership.role !== "string" ||
      !MEMBERSHIP_ROLE_SET.has(membership.role)
    ) {
      continue;
    }

    const workspace = workspaceById.get(membership.workspace_id);
    if (
      !workspace ||
      workspace.status !== "active" ||
      typeof workspace.name !== "string" ||
      typeof workspace.slug !== "string" ||
      typeof workspace.type !== "string" ||
      !WORKSPACE_TYPES.has(workspace.type)
    ) {
      continue;
    }

    result.push({
      id: membership.workspace_id,
      name: workspace.name,
      role: membership.role as WorkspaceSummary["role"],
      slug: workspace.slug,
      type: workspace.type as WorkspaceSummary["type"],
    });
  }

  return result.sort(
    (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  );
}

function parseCollectionRows(value: unknown): CollectionSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (row): row is { id: string; name: string; slug: string } =>
        isRecord(row) &&
        typeof row.id === "string" &&
        typeof row.name === "string" &&
        typeof row.slug === "string",
    )
    .map(({ id, name, slug }) => ({ id, name, slug }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export async function getAppContextState(): Promise<AppContextState> {
  const authAttempt = await attempt(() => getVerifiedAuthState());
  if (!authAttempt.ok) {
    return { status: "unauthenticated" };
  }

  const authState = authAttempt.value;
  if (authState.status !== "authenticated") {
    return authState;
  }

  const clientAttempt = await attempt(() => createServerSupabaseClient());
  if (!clientAttempt.ok) {
    return { status: "denied", reason: "admission" };
  }

  const supabase = clientAttempt.value;
  if (!supabase) {
    return { status: "unconfigured" };
  }

  const contextAttempt = await attempt(() => supabase.rpc(DATABASE_FUNCTIONS.currentUserContext));
  if (!contextAttempt.ok) {
    return { status: "denied", reason: "admission" };
  }

  const contextResult = contextAttempt.value;
  const databaseContext = parseCurrentUserContext(contextResult.data);
  if (contextResult.error || !databaseContext) {
    return { status: "denied", reason: "admission" };
  }

  const access = decideAppAccess(databaseContext);
  if (!access.allowed) {
    return { status: "denied", reason: access.reason };
  }

  const membershipAttempt = await attempt(() =>
    supabase
      .from(DATABASE_TABLES.workspaceMemberships)
      .select("workspace_id, role, status")
      .eq("user_id", databaseContext.user_id)
      .eq("status", "active"),
  );
  if (!membershipAttempt.ok || membershipAttempt.value.error) {
    return { status: "denied", reason: "workspace" };
  }

  const membershipResult = membershipAttempt.value;
  const membershipIds = Array.isArray(membershipResult.data)
    ? membershipResult.data
        .map((row) => (isRecord(row) ? nullableString(row.workspace_id) : null))
        .filter((id): id is string => Boolean(id))
    : [];

  let workspacesResult: { data: unknown; error: unknown } = { data: [], error: null };
  if (membershipIds.length > 0) {
    const workspacesAttempt = await attempt(() =>
      supabase
        .from(DATABASE_TABLES.workspaces)
        .select("id, name, slug, type, status")
        .in("id", membershipIds)
        .eq("status", "active"),
    );
    if (!workspacesAttempt.ok || workspacesAttempt.value.error) {
      return { status: "denied", reason: "workspace" };
    }
    workspacesResult = workspacesAttempt.value;
  }

  const activeWorkspace = workspaceSummary(databaseContext.workspace);
  const parsedWorkspaces = parseMembershipRows(membershipResult.data, workspacesResult.data);
  const workspaces = parsedWorkspaces.some(({ id }) => id === activeWorkspace.id)
    ? parsedWorkspaces
    : [activeWorkspace, ...parsedWorkspaces];

  const collectionsAttempt = await attempt(() =>
    supabase
      .from(DATABASE_TABLES.collections)
      .select("id, name, slug")
      .eq("workspace_id", activeWorkspace.id)
      .eq("status", "active"),
  );
  if (!collectionsAttempt.ok || collectionsAttempt.value.error) {
    return { status: "denied", reason: "workspace" };
  }
  const collectionsResult = collectionsAttempt.value;

  return {
    status: "ready",
    context: {
      collections: parseCollectionRows(collectionsResult.data),
      isPlatformAdmin: databaseContext.is_platform_admin,
      profile: databaseContext.profile,
      userId: databaseContext.user_id,
      workspace: activeWorkspace,
      workspaces,
    },
  };
}
