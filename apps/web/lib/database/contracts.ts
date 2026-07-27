/**
 * Centralized names and JSON shapes shared with the Phase 1 migrations.
 * Keeping these strings here makes schema reconciliation and generated-type
 * replacement explicit instead of scattering RPC assumptions through routes.
 */
export const DATABASE_TABLES = {
  collections: "collections",
  platformUserRoles: "platform_user_roles",
  profiles: "profiles",
  userPreferences: "user_preferences",
  workspaceMemberships: "workspace_memberships",
  workspaces: "workspaces",
} as const;

export const DATABASE_FUNCTIONS = {
  currentUserContext: "current_user_context",
  finalizeAdmittedUser: "finalize_admitted_user",
  adminGetInvitedUser: "admin_get_invited_user",
  adminListInvitedUsers: "admin_list_invited_users",
  adminMarkInvitedUserFailed: "admin_mark_invited_user_failed",
  adminMarkInvitedUserSent: "admin_mark_invited_user_sent",
  adminPrepareInvitedUser: "admin_prepare_invited_user",
  adminRecordInvitedUserError: "admin_record_invited_user_error",
  adminRevokeInvitedUser: "admin_revoke_invited_user",
  catalogSearch: "catalog_search",
  catalogCardDetail: "catalog_card_detail",
  catalogPrintingDetail: "catalog_printing_detail",
  catalogSetDetail: "catalog_set_detail",
  catalogStatus: "catalog_status",
  adminCatalogStatus: "admin_catalog_status",
  adminQueueCatalogSync: "admin_queue_catalog_sync",
} as const;

export interface FinalizedAdmission {
  collection_id: string;
  invited_user_id: string;
  profile_user_id: string;
  replayed: boolean;
  user_id: string;
  workspace_id: string;
}

export interface DatabaseProfile {
  avatar_path: string | null;
  default_collection_id: string | null;
  default_workspace_id: string | null;
  display_name: string | null;
  handle: string | null;
  preferred_currency: string;
  status: "active" | "deleted" | "deletion_requested" | "suspended";
  user_id: string;
}

export interface DatabaseWorkspaceContext {
  id: string;
  name: string;
  role: "admin" | "editor" | "owner" | "viewer";
  slug: string;
  status: "active" | "archived" | "deleted";
  type: "personal" | "store" | "team";
}

export interface CurrentUserDatabaseContext {
  is_platform_admin: boolean;
  profile: DatabaseProfile;
  user_id: string;
  workspace: DatabaseWorkspaceContext;
}

export interface InvitedUserRecord {
  accepted_at: string | null;
  auth_user_id: string | null;
  created_at: string;
  email: string;
  effective_status: "accepted" | "draft" | "expired" | "failed" | "revoked" | "sent";
  expires_at: string;
  id: string;
  last_error_code: string | null;
  note: string | null;
  revoked_at: string | null;
  sent_at: string | null;
  status: "accepted" | "draft" | "expired" | "failed" | "revoked" | "sent";
  updated_at: string;
}
