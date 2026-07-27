export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      catalog_cards: {
        Row: {
          active: boolean;
          color_identity: string[];
          colors: string[];
          created_at: string;
          game_id: string;
          id: string;
          keywords: string[];
          mana_cost: string | null;
          mana_value: number | null;
          name: string;
          normalized_name: string;
          oracle_text: string | null;
          reserved: boolean;
          search_document: unknown;
          source_id: string;
          source_provider: string;
          source_updated_at: string | null;
          type_line: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          color_identity?: string[];
          colors?: string[];
          created_at?: string;
          game_id: string;
          id: string;
          keywords?: string[];
          mana_cost?: string | null;
          mana_value?: number | null;
          name: string;
          normalized_name: string;
          oracle_text?: string | null;
          reserved?: boolean;
          search_document?: unknown;
          source_id: string;
          source_provider: string;
          source_updated_at?: string | null;
          type_line?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          color_identity?: string[];
          colors?: string[];
          created_at?: string;
          game_id?: string;
          id?: string;
          keywords?: string[];
          mana_cost?: string | null;
          mana_value?: number | null;
          name?: string;
          normalized_name?: string;
          oracle_text?: string | null;
          reserved?: boolean;
          search_document?: unknown;
          source_id?: string;
          source_provider?: string;
          source_updated_at?: string | null;
          type_line?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_cards_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_external_ids: {
        Row: {
          entity_id: string;
          entity_type: string;
          identifier_type: string;
          identifier_value: string;
          provider: string;
        };
        Insert: {
          entity_id: string;
          entity_type: string;
          identifier_type: string;
          identifier_value: string;
          provider: string;
        };
        Update: {
          entity_id?: string;
          entity_type?: string;
          identifier_type?: string;
          identifier_value?: string;
          provider?: string;
        };
        Relationships: [];
      };
      catalog_faces: {
        Row: {
          art_crop_uri: string | null;
          artist: string | null;
          border_crop_uri: string | null;
          colors: string[];
          created_at: string;
          defense: string | null;
          face_index: number;
          id: string;
          image_large_uri: string | null;
          image_normal_uri: string | null;
          image_png_uri: string | null;
          image_small_uri: string | null;
          loyalty: string | null;
          mana_cost: string | null;
          name: string;
          normalized_name: string | null;
          oracle_text: string | null;
          power: string | null;
          printing_id: string;
          search_document: unknown;
          toughness: string | null;
          type_line: string | null;
          updated_at: string;
        };
        Insert: {
          art_crop_uri?: string | null;
          artist?: string | null;
          border_crop_uri?: string | null;
          colors?: string[];
          created_at?: string;
          defense?: string | null;
          face_index: number;
          id: string;
          image_large_uri?: string | null;
          image_normal_uri?: string | null;
          image_png_uri?: string | null;
          image_small_uri?: string | null;
          loyalty?: string | null;
          mana_cost?: string | null;
          name: string;
          normalized_name?: string | null;
          oracle_text?: string | null;
          power?: string | null;
          printing_id: string;
          search_document?: unknown;
          toughness?: string | null;
          type_line?: string | null;
          updated_at?: string;
        };
        Update: {
          art_crop_uri?: string | null;
          artist?: string | null;
          border_crop_uri?: string | null;
          colors?: string[];
          created_at?: string;
          defense?: string | null;
          face_index?: number;
          id?: string;
          image_large_uri?: string | null;
          image_normal_uri?: string | null;
          image_png_uri?: string | null;
          image_small_uri?: string | null;
          loyalty?: string | null;
          mana_cost?: string | null;
          name?: string;
          normalized_name?: string | null;
          oracle_text?: string | null;
          power?: string | null;
          printing_id?: string;
          search_document?: unknown;
          toughness?: string | null;
          type_line?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_faces_printing_id_fkey";
            columns: ["printing_id"];
            isOneToOne: false;
            referencedRelation: "catalog_printings";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_import_runs: {
        Row: {
          cards_written: number;
          catalog_version: string | null;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          error_summary: string | null;
          faces_written: number;
          id: string;
          prices_written: number;
          printings_written: number;
          records_rejected: number;
          records_seen: number;
          records_written: number;
          requested_by_user_id: string | null;
          requested_force: boolean;
          sets_written: number;
          source_file_id: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          trigger_type: string;
          updated_at: string;
          validation_summary: Json;
          worker_version: string | null;
        };
        Insert: {
          cards_written?: number;
          catalog_version?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          error_summary?: string | null;
          faces_written?: number;
          id?: string;
          prices_written?: number;
          printings_written?: number;
          records_rejected?: number;
          records_seen?: number;
          records_written?: number;
          requested_by_user_id?: string | null;
          requested_force?: boolean;
          sets_written?: number;
          source_file_id?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          trigger_type: string;
          updated_at?: string;
          validation_summary?: Json;
          worker_version?: string | null;
        };
        Update: {
          cards_written?: number;
          catalog_version?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          error_summary?: string | null;
          faces_written?: number;
          id?: string;
          prices_written?: number;
          printings_written?: number;
          records_rejected?: number;
          records_seen?: number;
          records_written?: number;
          requested_by_user_id?: string | null;
          requested_force?: boolean;
          sets_written?: number;
          source_file_id?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          trigger_type?: string;
          updated_at?: string;
          validation_summary?: Json;
          worker_version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_import_runs_source_file_id_fkey";
            columns: ["source_file_id"];
            isOneToOne: false;
            referencedRelation: "catalog_source_files";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_legalities: {
        Row: {
          card_id: string;
          format_code: string;
          legality: string;
          source_updated_at: string | null;
        };
        Insert: {
          card_id: string;
          format_code: string;
          legality: string;
          source_updated_at?: string | null;
        };
        Update: {
          card_id?: string;
          format_code?: string;
          legality?: string;
          source_updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_legalities_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "catalog_cards";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_printings: {
        Row: {
          active: boolean;
          artist: string | null;
          border_color: string | null;
          card_id: string | null;
          collector_number: string;
          color_identity: string[];
          created_at: string;
          digital: boolean;
          finishes: Database["public"]["Enums"]["card_finish"][];
          frame_effects: string[];
          game_id: string;
          id: string;
          image_status: string | null;
          is_default_browse: boolean;
          language: string;
          layout: string | null;
          normalized_name: string | null;
          oversized: boolean;
          printed_name: string | null;
          promo: boolean;
          rarity: string | null;
          released_at: string | null;
          scryfall_uri: string | null;
          search_document: unknown;
          set_id: string;
          source_id: string;
          source_provider: string;
          source_updated_at: string | null;
          updated_at: string;
          variation: boolean;
        };
        Insert: {
          active?: boolean;
          artist?: string | null;
          border_color?: string | null;
          card_id?: string | null;
          collector_number: string;
          color_identity?: string[];
          created_at?: string;
          digital: boolean;
          finishes: Database["public"]["Enums"]["card_finish"][];
          frame_effects?: string[];
          game_id: string;
          id: string;
          image_status?: string | null;
          is_default_browse: boolean;
          language: string;
          layout?: string | null;
          normalized_name?: string | null;
          oversized?: boolean;
          printed_name?: string | null;
          promo?: boolean;
          rarity?: string | null;
          released_at?: string | null;
          scryfall_uri?: string | null;
          search_document?: unknown;
          set_id: string;
          source_id: string;
          source_provider: string;
          source_updated_at?: string | null;
          updated_at?: string;
          variation?: boolean;
        };
        Update: {
          active?: boolean;
          artist?: string | null;
          border_color?: string | null;
          card_id?: string | null;
          collector_number?: string;
          color_identity?: string[];
          created_at?: string;
          digital?: boolean;
          finishes?: Database["public"]["Enums"]["card_finish"][];
          frame_effects?: string[];
          game_id?: string;
          id?: string;
          image_status?: string | null;
          is_default_browse?: boolean;
          language?: string;
          layout?: string | null;
          normalized_name?: string | null;
          oversized?: boolean;
          printed_name?: string | null;
          promo?: boolean;
          rarity?: string | null;
          released_at?: string | null;
          scryfall_uri?: string | null;
          search_document?: unknown;
          set_id?: string;
          source_id?: string;
          source_provider?: string;
          source_updated_at?: string | null;
          updated_at?: string;
          variation?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_printings_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "catalog_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "catalog_printings_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "catalog_printings_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "catalog_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_sets: {
        Row: {
          active: boolean;
          card_count: number | null;
          code: string;
          created_at: string;
          digital: boolean;
          foil_only: boolean;
          game_id: string;
          icon_svg_uri: string | null;
          id: string;
          name: string;
          nonfoil_only: boolean;
          parent_set_id: string | null;
          released_at: string | null;
          set_type: string | null;
          source_id: string;
          source_provider: string;
          source_updated_at: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          card_count?: number | null;
          code: string;
          created_at?: string;
          digital: boolean;
          foil_only?: boolean;
          game_id: string;
          icon_svg_uri?: string | null;
          id: string;
          name: string;
          nonfoil_only?: boolean;
          parent_set_id?: string | null;
          released_at?: string | null;
          set_type?: string | null;
          source_id: string;
          source_provider: string;
          source_updated_at?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          card_count?: number | null;
          code?: string;
          created_at?: string;
          digital?: boolean;
          foil_only?: boolean;
          game_id?: string;
          icon_svg_uri?: string | null;
          id?: string;
          name?: string;
          nonfoil_only?: boolean;
          parent_set_id?: string | null;
          released_at?: string | null;
          set_type?: string | null;
          source_id?: string;
          source_provider?: string;
          source_updated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_sets_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "catalog_sets_parent_fk";
            columns: ["parent_set_id"];
            isOneToOne: false;
            referencedRelation: "catalog_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_source_files: {
        Row: {
          catalog_identity_sha256: string | null;
          compressed_size: number | null;
          content_encoding: string | null;
          content_type: string | null;
          created_at: string;
          dependency_sha256: string | null;
          download_uri: string;
          downloaded_at: string | null;
          downloaded_size: number | null;
          id: string;
          provider: string;
          provider_object_id: string;
          provider_updated_at: string;
          sha256: string | null;
          source_type: string;
          status: Database["public"]["Enums"]["job_status"];
          updated_at: string;
        };
        Insert: {
          catalog_identity_sha256?: string | null;
          compressed_size?: number | null;
          content_encoding?: string | null;
          content_type?: string | null;
          created_at?: string;
          dependency_sha256?: string | null;
          download_uri: string;
          downloaded_at?: string | null;
          downloaded_size?: number | null;
          id?: string;
          provider: string;
          provider_object_id: string;
          provider_updated_at: string;
          sha256?: string | null;
          source_type: string;
          status?: Database["public"]["Enums"]["job_status"];
          updated_at?: string;
        };
        Update: {
          catalog_identity_sha256?: string | null;
          compressed_size?: number | null;
          content_encoding?: string | null;
          content_type?: string | null;
          created_at?: string;
          dependency_sha256?: string | null;
          download_uri?: string;
          downloaded_at?: string | null;
          downloaded_size?: number | null;
          id?: string;
          provider?: string;
          provider_object_id?: string;
          provider_updated_at?: string;
          sha256?: string | null;
          source_type?: string;
          status?: Database["public"]["Enums"]["job_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_state: {
        Row: {
          active_catalog_version: string | null;
          active_import_id: string | null;
          created_at: string;
          current_robot_snapshot_id: string | null;
          current_search_index_version: string | null;
          last_successful_source_observed_at: string | null;
          singleton_id: number;
          sync_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          active_catalog_version?: string | null;
          active_import_id?: string | null;
          created_at?: string;
          current_robot_snapshot_id?: string | null;
          current_search_index_version?: string | null;
          last_successful_source_observed_at?: string | null;
          singleton_id?: number;
          sync_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          active_catalog_version?: string | null;
          active_import_id?: string | null;
          created_at?: string;
          current_robot_snapshot_id?: string | null;
          current_search_index_version?: string | null;
          last_successful_source_observed_at?: string | null;
          singleton_id?: number;
          sync_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_state_active_import_id_fkey";
            columns: ["active_import_id"];
            isOneToOne: false;
            referencedRelation: "catalog_import_runs";
            referencedColumns: ["id"];
          },
        ];
      };
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
      current_prices: {
        Row: {
          amount: number;
          currency: string;
          finish: Database["public"]["Enums"]["card_finish"];
          ingested_at: string;
          observed_at: string;
          printing_id: string;
          provider: string;
          source_file_id: string | null;
          stale_after: string | null;
        };
        Insert: {
          amount: number;
          currency: string;
          finish: Database["public"]["Enums"]["card_finish"];
          ingested_at: string;
          observed_at: string;
          printing_id: string;
          provider: string;
          source_file_id?: string | null;
          stale_after?: string | null;
        };
        Update: {
          amount?: number;
          currency?: string;
          finish?: Database["public"]["Enums"]["card_finish"];
          ingested_at?: string;
          observed_at?: string;
          printing_id?: string;
          provider?: string;
          source_file_id?: string | null;
          stale_after?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "current_prices_printing_id_fkey";
            columns: ["printing_id"];
            isOneToOne: false;
            referencedRelation: "catalog_printings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "current_prices_source_file_id_fkey";
            columns: ["source_file_id"];
            isOneToOne: false;
            referencedRelation: "catalog_source_files";
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
      admin_catalog_status: { Args: { p_actor_user_id: string }; Returns: Json };
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
      admin_queue_catalog_sync: {
        Args: {
          p_actor_user_id: string;
          p_force?: boolean;
          p_trigger_type?: string;
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
      catalog_card_detail: { Args: { p_card_id: string }; Returns: Json };
      catalog_printing_detail: {
        Args: { p_printing_id: string };
        Returns: Json;
      };
      catalog_search: {
        Args: {
          p_after?: string;
          p_color_identity?: string[];
          p_colors?: string[];
          p_currency?: string;
          p_finish?: Database["public"]["Enums"]["card_finish"];
          p_game_code?: string;
          p_has_price?: boolean;
          p_include_digital?: boolean;
          p_include_nondefault?: boolean;
          p_language?: string;
          p_limit?: number;
          p_max_mana_value?: number;
          p_min_mana_value?: number;
          p_query?: string;
          p_rarity?: string;
          p_released_from?: string;
          p_released_to?: string;
          p_set_code?: string;
          p_sort?: string;
          p_type_line?: string;
        };
        Returns: Json;
      };
      catalog_set_detail: { Args: { p_set_code: string }; Returns: Json };
      catalog_status: { Args: never; Returns: Json };
      current_user_context: { Args: never; Returns: Json };
      finalize_admitted_user: { Args: never; Returns: Json };
    };
    Enums: {
      card_finish: "unknown" | "nonfoil" | "foil" | "etched";
      invite_status: "draft" | "sent" | "accepted" | "revoked" | "expired" | "failed";
      job_status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
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
      card_finish: ["unknown", "nonfoil", "foil", "etched"],
      invite_status: ["draft", "sent", "accepted", "revoked", "expired", "failed"],
      job_status: ["queued", "running", "succeeded", "failed", "cancelled"],
      membership_role: ["owner", "admin", "editor", "viewer"],
      membership_status: ["active", "suspended"],
      profile_status: ["active", "suspended", "deletion_requested", "deleted"],
      resource_status: ["active", "archived", "deleted"],
      visibility: ["private", "unlisted", "public"],
      workspace_type: ["personal", "team", "store"],
    },
  },
} as const;
