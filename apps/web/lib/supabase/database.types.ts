export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      collections: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by_user_id: string;
          deleted_at: string | null;
          description: string | null;
          game_id: string;
          id: string;
          name: string;
          slug: string;
          status: Database["public"]["Enums"]["resource_status"];
          updated_at: string;
          visibility: Database["public"]["Enums"]["visibility"];
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by_user_id: string;
          deleted_at?: string | null;
          description?: string | null;
          game_id: string;
          id?: string;
          name: string;
          slug: string;
          status?: Database["public"]["Enums"]["resource_status"];
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["visibility"];
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by_user_id?: string;
          deleted_at?: string | null;
          description?: string | null;
          game_id?: string;
          id?: string;
          name?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["resource_status"];
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["visibility"];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collections_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collections_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      games: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          id: string;
          metadata: Json;
          name: string;
          publisher: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name: string;
          publisher?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name?: string;
          publisher?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_user_roles: {
        Row: {
          created_at: string;
          granted_by_user_id: string | null;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          granted_by_user_id?: string | null;
          role: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted_by_user_id?: string | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          admission_invite_id: string;
          avatar_path: string | null;
          created_at: string;
          default_collection_id: string | null;
          default_workspace_id: string | null;
          display_name: string | null;
          handle: string | null;
          preferred_currency: string;
          status: Database["public"]["Enums"]["profile_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          admission_invite_id: string;
          avatar_path?: string | null;
          created_at?: string;
          default_collection_id?: string | null;
          default_workspace_id?: string | null;
          display_name?: string | null;
          handle?: string | null;
          preferred_currency?: string;
          status?: Database["public"]["Enums"]["profile_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          admission_invite_id?: string;
          avatar_path?: string | null;
          created_at?: string;
          default_collection_id?: string | null;
          default_workspace_id?: string | null;
          display_name?: string | null;
          handle?: string | null;
          preferred_currency?: string;
          status?: Database["public"]["Enums"]["profile_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_default_collection_fk";
            columns: ["default_collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_default_workspace_fk";
            columns: ["default_workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          catalog_view: string;
          collection_view: string;
          compact_mode: boolean;
          created_at: string;
          deck_view: string;
          preferences: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          catalog_view?: string;
          collection_view?: string;
          compact_mode?: boolean;
          created_at?: string;
          deck_view?: string;
          preferences?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          catalog_view?: string;
          collection_view?: string;
          compact_mode?: boolean;
          created_at?: string;
          deck_view?: string;
          preferences?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      workspace_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by_user_id: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by_user_id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["membership_role"];
          status: Database["public"]["Enums"]["invite_status"];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by_user_id?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by_user_id: string;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["membership_role"];
          status?: Database["public"]["Enums"]["invite_status"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by_user_id?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by_user_id?: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["membership_role"];
          status?: Database["public"]["Enums"]["invite_status"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_memberships: {
        Row: {
          created_at: string;
          created_by_user_id: string;
          joined_at: string;
          role: Database["public"]["Enums"]["membership_role"];
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by_user_id: string;
          joined_at?: string;
          role: Database["public"]["Enums"]["membership_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string;
          joined_at?: string;
          role?: Database["public"]["Enums"]["membership_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by_user_id: string;
          deleted_at: string | null;
          id: string;
          name: string;
          slug: string;
          status: Database["public"]["Enums"]["resource_status"];
          type: Database["public"]["Enums"]["workspace_type"];
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by_user_id: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          slug: string;
          status?: Database["public"]["Enums"]["resource_status"];
          type: Database["public"]["Enums"]["workspace_type"];
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by_user_id?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["resource_status"];
          type?: Database["public"]["Enums"]["workspace_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_bootstrap_platform_admin: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      admin_get_invited_user: {
        Args: {
          p_actor_user_id: string;
          p_email?: string;
          p_invited_user_id?: string;
        };
        Returns: Json;
      };
      admin_list_invited_users: {
        Args: {
          p_actor_user_id: string;
          p_limit?: number;
          p_status?: Database["public"]["Enums"]["invite_status"];
        };
        Returns: Json;
      };
      admin_mark_invited_user_failed: {
        Args: {
          p_actor_user_id: string;
          p_auth_user_id?: string;
          p_error_code: string;
          p_invited_user_id: string;
        };
        Returns: Json;
      };
      admin_mark_invited_user_sent: {
        Args: {
          p_actor_user_id: string;
          p_auth_user_id: string;
          p_invited_user_id: string;
        };
        Returns: Json;
      };
      admin_prepare_invited_user: {
        Args: {
          p_actor_user_id: string;
          p_email: string;
          p_expires_at: string;
          p_note?: string;
        };
        Returns: Json;
      };
      admin_record_invited_user_error: {
        Args: {
          p_actor_user_id: string;
          p_error_code: string;
          p_invited_user_id: string;
        };
        Returns: Json;
      };
      admin_revoke_invited_user: {
        Args: { p_actor_user_id: string; p_invited_user_id: string };
        Returns: Json;
      };
      current_user_context: { Args: never; Returns: Json };
      finalize_admitted_user: { Args: never; Returns: Json };
    };
    Enums: {
      invite_status: "draft" | "sent" | "accepted" | "revoked" | "expired" | "failed";
      membership_role: "owner" | "admin" | "editor" | "viewer";
      membership_status: "active" | "suspended";
      profile_status: "active" | "suspended" | "deletion_requested" | "deleted";
      resource_status: "active" | "archived" | "deleted";
      visibility: "private" | "unlisted" | "public";
      workspace_type: "personal" | "team" | "store";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      invite_status: ["draft", "sent", "accepted", "revoked", "expired", "failed"],
      membership_role: ["owner", "admin", "editor", "viewer"],
      membership_status: ["active", "suspended"],
      profile_status: ["active", "suspended", "deletion_requested", "deleted"],
      resource_status: ["active", "archived", "deleted"],
      visibility: ["private", "unlisted", "public"],
      workspace_type: ["personal", "team", "store"],
    },
  },
} as const;
