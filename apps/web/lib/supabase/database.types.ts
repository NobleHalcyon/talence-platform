export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_events: {
        Row: {
          actor_user_id: string | null;
          correlation_id: string;
          event_type: string;
          id: string;
          metadata: Json;
          occurred_at: string;
          resource_id: string | null;
          resource_type: string | null;
          result_code: string;
          workspace_id: string | null;
        };
        Insert: {
          actor_user_id?: string | null;
          correlation_id: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          resource_id?: string | null;
          resource_type?: string | null;
          result_code: string;
          workspace_id?: string | null;
        };
        Update: {
          actor_user_id?: string | null;
          correlation_id?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          resource_id?: string | null;
          resource_type?: string | null;
          result_code?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
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
      catalog_snapshots: {
        Row: {
          api_contract_version: string;
          byte_size: number;
          catalog_import_id: string;
          created_at: string;
          game_id: string;
          generated_at: string;
          id: string;
          minimum_client_version: string;
          provider_observed_at: string;
          published_at: string;
          record_counts: Json;
          schema_version: number;
          sha256: string;
          source_sha256: string;
          status: Database["public"]["Enums"]["job_status"];
          storage_bucket: string;
          storage_path: string;
          superseded_at: string | null;
          version: string;
        };
        Insert: {
          api_contract_version?: string;
          byte_size: number;
          catalog_import_id: string;
          created_at?: string;
          game_id: string;
          generated_at: string;
          id?: string;
          minimum_client_version: string;
          provider_observed_at: string;
          published_at?: string;
          record_counts: Json;
          schema_version: number;
          sha256: string;
          source_sha256: string;
          status?: Database["public"]["Enums"]["job_status"];
          storage_bucket?: string;
          storage_path: string;
          superseded_at?: string | null;
          version: string;
        };
        Update: {
          api_contract_version?: string;
          byte_size?: number;
          catalog_import_id?: string;
          created_at?: string;
          game_id?: string;
          generated_at?: string;
          id?: string;
          minimum_client_version?: string;
          provider_observed_at?: string;
          published_at?: string;
          record_counts?: Json;
          schema_version?: number;
          sha256?: string;
          source_sha256?: string;
          status?: Database["public"]["Enums"]["job_status"];
          storage_bucket?: string;
          storage_path?: string;
          superseded_at?: string | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_snapshots_catalog_import_id_fkey";
            columns: ["catalog_import_id"];
            isOneToOne: false;
            referencedRelation: "catalog_import_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "catalog_snapshots_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
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
          {
            foreignKeyName: "catalog_state_current_robot_snapshot_fk";
            columns: ["current_robot_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "catalog_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      collections: {
        Row: {
          archived_at: string | null;
          cover_printing_id: string | null;
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
          cover_printing_id?: string | null;
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
          cover_printing_id?: string | null;
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
            foreignKeyName: "collections_cover_printing_id_fkey";
            columns: ["cover_printing_id"];
            isOneToOne: false;
            referencedRelation: "catalog_printings";
            referencedColumns: ["id"];
          },
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
      deck_entries: {
        Row: {
          card_id: string;
          created_at: string;
          deck_id: string;
          id: string;
          notes: string | null;
          preferred_finish: Database["public"]["Enums"]["card_finish"] | null;
          preferred_printing_id: string | null;
          quantity: number;
          sort_order: number;
          updated_at: string;
          workspace_id: string;
          zone: Database["public"]["Enums"]["deck_zone"];
        };
        Insert: {
          card_id: string;
          created_at?: string;
          deck_id: string;
          id?: string;
          notes?: string | null;
          preferred_finish?: Database["public"]["Enums"]["card_finish"] | null;
          preferred_printing_id?: string | null;
          quantity: number;
          sort_order?: number;
          updated_at?: string;
          workspace_id: string;
          zone: Database["public"]["Enums"]["deck_zone"];
        };
        Update: {
          card_id?: string;
          created_at?: string;
          deck_id?: string;
          id?: string;
          notes?: string | null;
          preferred_finish?: Database["public"]["Enums"]["card_finish"] | null;
          preferred_printing_id?: string | null;
          quantity?: number;
          sort_order?: number;
          updated_at?: string;
          workspace_id?: string;
          zone?: Database["public"]["Enums"]["deck_zone"];
        };
        Relationships: [
          {
            foreignKeyName: "deck_entries_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "catalog_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deck_entries_deck_fk";
            columns: ["workspace_id", "deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "deck_entries_preferred_printing_id_fkey";
            columns: ["preferred_printing_id"];
            isOneToOne: false;
            referencedRelation: "catalog_printings";
            referencedColumns: ["id"];
          },
        ];
      };
      deck_format_versions: {
        Row: {
          companion_consumes_sideboard: boolean;
          companion_max: number;
          created_at: string;
          default_copy_limit: number;
          effective_at: string;
          enforce_color_identity: boolean;
          format_code: string;
          id: string;
          legality_format_code: string;
          maximum_commander: number;
          maximum_deck_size: number | null;
          maximum_mainboard: number | null;
          minimum_commander: number;
          minimum_deck_size: number;
          minimum_mainboard: number;
          restricted_copy_limit: number;
          rules_metadata: Json;
          scope_note: string;
          sideboard_max: number;
          version: number;
          version_key: string;
        };
        Insert: {
          companion_consumes_sideboard?: boolean;
          companion_max?: number;
          created_at?: string;
          default_copy_limit: number;
          effective_at: string;
          enforce_color_identity?: boolean;
          format_code: string;
          id?: string;
          legality_format_code: string;
          maximum_commander?: number;
          maximum_deck_size?: number | null;
          maximum_mainboard?: number | null;
          minimum_commander?: number;
          minimum_deck_size: number;
          minimum_mainboard: number;
          restricted_copy_limit?: number;
          rules_metadata?: Json;
          scope_note: string;
          sideboard_max: number;
          version: number;
          version_key: string;
        };
        Update: {
          companion_consumes_sideboard?: boolean;
          companion_max?: number;
          created_at?: string;
          default_copy_limit?: number;
          effective_at?: string;
          enforce_color_identity?: boolean;
          format_code?: string;
          id?: string;
          legality_format_code?: string;
          maximum_commander?: number;
          maximum_deck_size?: number | null;
          maximum_mainboard?: number | null;
          minimum_commander?: number;
          minimum_deck_size?: number;
          minimum_mainboard?: number;
          restricted_copy_limit?: number;
          rules_metadata?: Json;
          scope_note?: string;
          sideboard_max?: number;
          version?: number;
          version_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deck_format_versions_format_code_fkey";
            columns: ["format_code"];
            isOneToOne: false;
            referencedRelation: "deck_formats";
            referencedColumns: ["code"];
          },
        ];
      };
      deck_formats: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          game_id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          game_id: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          game_id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deck_formats_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      deck_inventory_sources: {
        Row: {
          collection_id: string;
          created_at: string;
          deck_id: string;
          priority: number;
          workspace_id: string;
        };
        Insert: {
          collection_id: string;
          created_at?: string;
          deck_id: string;
          priority: number;
          workspace_id: string;
        };
        Update: {
          collection_id?: string;
          created_at?: string;
          deck_id?: string;
          priority?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deck_inventory_sources_collection_fk";
            columns: ["workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "deck_inventory_sources_deck_fk";
            columns: ["workspace_id", "deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      deck_revisions: {
        Row: {
          actor_user_id: string;
          catalog_version: string | null;
          content_hash: string;
          created_at: string;
          deck_id: string;
          format_code: string;
          id: string;
          reason: string;
          revision: number;
          rules_version_id: string;
          snapshot: Json;
          workspace_id: string;
        };
        Insert: {
          actor_user_id: string;
          catalog_version?: string | null;
          content_hash: string;
          created_at?: string;
          deck_id: string;
          format_code: string;
          id?: string;
          reason: string;
          revision: number;
          rules_version_id: string;
          snapshot: Json;
          workspace_id: string;
        };
        Update: {
          actor_user_id?: string;
          catalog_version?: string | null;
          content_hash?: string;
          created_at?: string;
          deck_id?: string;
          format_code?: string;
          id?: string;
          reason?: string;
          revision?: number;
          rules_version_id?: string;
          snapshot?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deck_revisions_deck_fk";
            columns: ["workspace_id", "deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "deck_revisions_rules_format_fk";
            columns: ["rules_version_id", "format_code"];
            isOneToOne: false;
            referencedRelation: "deck_format_versions";
            referencedColumns: ["id", "format_code"];
          },
          {
            foreignKeyName: "deck_revisions_rules_version_id_fkey";
            columns: ["rules_version_id"];
            isOneToOne: false;
            referencedRelation: "deck_format_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      deck_validation_runs: {
        Row: {
          catalog_version: string;
          content_hash: string;
          deck_id: string;
          deck_revision_id: string;
          evaluated_at: string;
          evaluated_by_user_id: string;
          format_code: string;
          id: string;
          result: Json;
          revision: number;
          rules_version_id: string;
          workspace_id: string;
        };
        Insert: {
          catalog_version: string;
          content_hash: string;
          deck_id: string;
          deck_revision_id: string;
          evaluated_at?: string;
          evaluated_by_user_id: string;
          format_code: string;
          id?: string;
          result: Json;
          revision: number;
          rules_version_id: string;
          workspace_id: string;
        };
        Update: {
          catalog_version?: string;
          content_hash?: string;
          deck_id?: string;
          deck_revision_id?: string;
          evaluated_at?: string;
          evaluated_by_user_id?: string;
          format_code?: string;
          id?: string;
          result?: Json;
          revision?: number;
          rules_version_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deck_validation_runs_deck_fk";
            columns: ["workspace_id", "deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "deck_validation_runs_revision_fk";
            columns: ["deck_revision_id", "deck_id"];
            isOneToOne: false;
            referencedRelation: "deck_revisions";
            referencedColumns: ["id", "deck_id"];
          },
          {
            foreignKeyName: "deck_validation_runs_revision_number_fk";
            columns: ["deck_id", "revision"];
            isOneToOne: false;
            referencedRelation: "deck_revisions";
            referencedColumns: ["deck_id", "revision"];
          },
          {
            foreignKeyName: "deck_validation_runs_rules_format_fk";
            columns: ["rules_version_id", "format_code"];
            isOneToOne: false;
            referencedRelation: "deck_format_versions";
            referencedColumns: ["id", "format_code"];
          },
          {
            foreignKeyName: "deck_validation_runs_rules_version_id_fkey";
            columns: ["rules_version_id"];
            isOneToOne: false;
            referencedRelation: "deck_format_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      decks: {
        Row: {
          archived_at: string | null;
          cover_printing_id: string | null;
          created_at: string;
          created_by_user_id: string;
          current_revision: number;
          deleted_at: string | null;
          description: string | null;
          format_code: string;
          format_version_id: string;
          game_id: string;
          id: string;
          name: string;
          notes: string | null;
          slug: string;
          status: Database["public"]["Enums"]["resource_status"];
          tags: string[];
          updated_at: string;
          visibility: Database["public"]["Enums"]["visibility"];
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          cover_printing_id?: string | null;
          created_at?: string;
          created_by_user_id: string;
          current_revision?: number;
          deleted_at?: string | null;
          description?: string | null;
          format_code: string;
          format_version_id: string;
          game_id: string;
          id?: string;
          name: string;
          notes?: string | null;
          slug: string;
          status?: Database["public"]["Enums"]["resource_status"];
          tags?: string[];
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["visibility"];
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          cover_printing_id?: string | null;
          created_at?: string;
          created_by_user_id?: string;
          current_revision?: number;
          deleted_at?: string | null;
          description?: string | null;
          format_code?: string;
          format_version_id?: string;
          game_id?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          slug?: string;
          status?: Database["public"]["Enums"]["resource_status"];
          tags?: string[];
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["visibility"];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "decks_cover_printing_id_fkey";
            columns: ["cover_printing_id"];
            isOneToOne: false;
            referencedRelation: "catalog_printings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decks_format_code_fkey";
            columns: ["format_code"];
            isOneToOne: false;
            referencedRelation: "deck_formats";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "decks_format_version_fk";
            columns: ["format_version_id", "format_code"];
            isOneToOne: false;
            referencedRelation: "deck_format_versions";
            referencedColumns: ["id", "format_code"];
          },
          {
            foreignKeyName: "decks_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      device_collection_grants: {
        Row: {
          collection_id: string;
          created_at: string;
          device_id: string;
          granted_by_user_id: string;
          permission: Database["public"]["Enums"]["grant_permission"];
          workspace_id: string;
        };
        Insert: {
          collection_id: string;
          created_at?: string;
          device_id: string;
          granted_by_user_id: string;
          permission: Database["public"]["Enums"]["grant_permission"];
          workspace_id: string;
        };
        Update: {
          collection_id?: string;
          created_at?: string;
          device_id?: string;
          granted_by_user_id?: string;
          permission?: Database["public"]["Enums"]["grant_permission"];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "device_collection_grants_collection_fk";
            columns: ["workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "device_collection_grants_device_fk";
            columns: ["workspace_id", "device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      device_run_summaries: {
        Row: {
          catalog_snapshot_id: string;
          catalog_snapshot_version: string;
          collection_id: string;
          completed_at: string;
          correlation_id: string;
          created_at: string;
          device_id: string;
          diagnostic_code: string | null;
          external_run_id: string;
          id: string;
          idempotency_key: string;
          metadata: Json;
          posted_count: number;
          received_at: string;
          recognized_count: number;
          started_at: string;
          status: Database["public"]["Enums"]["device_run_status"];
          total_count: number;
          unrecognized_count: number;
          workspace_id: string;
        };
        Insert: {
          catalog_snapshot_id: string;
          catalog_snapshot_version: string;
          collection_id: string;
          completed_at: string;
          correlation_id: string;
          created_at?: string;
          device_id: string;
          diagnostic_code?: string | null;
          external_run_id: string;
          id?: string;
          idempotency_key: string;
          metadata?: Json;
          posted_count: number;
          received_at?: string;
          recognized_count: number;
          started_at: string;
          status: Database["public"]["Enums"]["device_run_status"];
          total_count: number;
          unrecognized_count: number;
          workspace_id: string;
        };
        Update: {
          catalog_snapshot_id?: string;
          catalog_snapshot_version?: string;
          collection_id?: string;
          completed_at?: string;
          correlation_id?: string;
          created_at?: string;
          device_id?: string;
          diagnostic_code?: string | null;
          external_run_id?: string;
          id?: string;
          idempotency_key?: string;
          metadata?: Json;
          posted_count?: number;
          received_at?: string;
          recognized_count?: number;
          started_at?: string;
          status?: Database["public"]["Enums"]["device_run_status"];
          total_count?: number;
          unrecognized_count?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "device_run_summaries_catalog_snapshot_id_fkey";
            columns: ["catalog_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "catalog_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "device_run_summaries_collection_fk";
            columns: ["workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "device_run_summaries_device_fk";
            columns: ["workspace_id", "device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "device_run_summaries_snapshot_fk";
            columns: ["catalog_snapshot_id", "catalog_snapshot_version"];
            isOneToOne: false;
            referencedRelation: "catalog_snapshots";
            referencedColumns: ["id", "version"];
          },
        ];
      };
      device_sync_batches: {
        Row: {
          catalog_snapshot_id: string;
          catalog_snapshot_version: string;
          collection_id: string;
          correlation_id: string;
          created_at: string;
          device_id: string;
          external_run_id: string | null;
          id: string;
          idempotency_key: string;
          inventory_transaction_id: string;
          occurred_at: string;
          received_at: string;
          request_hash: string;
          response_code: string;
          result_lines: Json;
          status: string;
          workspace_id: string;
        };
        Insert: {
          catalog_snapshot_id: string;
          catalog_snapshot_version: string;
          collection_id: string;
          correlation_id: string;
          created_at?: string;
          device_id: string;
          external_run_id?: string | null;
          id?: string;
          idempotency_key: string;
          inventory_transaction_id: string;
          occurred_at: string;
          received_at?: string;
          request_hash: string;
          response_code?: string;
          result_lines: Json;
          status?: string;
          workspace_id: string;
        };
        Update: {
          catalog_snapshot_id?: string;
          catalog_snapshot_version?: string;
          collection_id?: string;
          correlation_id?: string;
          created_at?: string;
          device_id?: string;
          external_run_id?: string | null;
          id?: string;
          idempotency_key?: string;
          inventory_transaction_id?: string;
          occurred_at?: string;
          received_at?: string;
          request_hash?: string;
          response_code?: string;
          result_lines?: Json;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "device_sync_batches_catalog_snapshot_id_fkey";
            columns: ["catalog_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "catalog_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "device_sync_batches_collection_fk";
            columns: ["workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "device_sync_batches_device_fk";
            columns: ["workspace_id", "device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "device_sync_batches_snapshot_fk";
            columns: ["catalog_snapshot_id", "catalog_snapshot_version"];
            isOneToOne: false;
            referencedRelation: "catalog_snapshots";
            referencedColumns: ["id", "version"];
          },
          {
            foreignKeyName: "device_sync_batches_transaction_fk";
            columns: ["inventory_transaction_id", "workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "inventory_transactions";
            referencedColumns: ["id", "workspace_id", "collection_id"];
          },
        ];
      };
      devices: {
        Row: {
          created_at: string;
          created_by_user_id: string;
          deleted_at: string | null;
          id: string;
          last_catalog_snapshot_id: string | null;
          last_client_version: string | null;
          last_firmware_version: string | null;
          last_seen_at: string | null;
          manufacturer: string | null;
          model: string | null;
          name: string;
          revoked_at: string | null;
          serial_number: string | null;
          status: Database["public"]["Enums"]["device_status"];
          suspended_at: string | null;
          type: Database["public"]["Enums"]["device_type"];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by_user_id: string;
          deleted_at?: string | null;
          id?: string;
          last_catalog_snapshot_id?: string | null;
          last_client_version?: string | null;
          last_firmware_version?: string | null;
          last_seen_at?: string | null;
          manufacturer?: string | null;
          model?: string | null;
          name: string;
          revoked_at?: string | null;
          serial_number?: string | null;
          status?: Database["public"]["Enums"]["device_status"];
          suspended_at?: string | null;
          type: Database["public"]["Enums"]["device_type"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string;
          deleted_at?: string | null;
          id?: string;
          last_catalog_snapshot_id?: string | null;
          last_client_version?: string | null;
          last_firmware_version?: string | null;
          last_seen_at?: string | null;
          manufacturer?: string | null;
          model?: string | null;
          name?: string;
          revoked_at?: string | null;
          serial_number?: string | null;
          status?: Database["public"]["Enums"]["device_status"];
          suspended_at?: string | null;
          type?: Database["public"]["Enums"]["device_type"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "devices_last_catalog_snapshot_id_fkey";
            columns: ["last_catalog_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "catalog_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devices_workspace_id_fkey";
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
      inventory_balances: {
        Row: {
          collection_id: string;
          condition: Database["public"]["Enums"]["card_condition"];
          created_at: string;
          finish: Database["public"]["Enums"]["card_finish"];
          last_transaction_id: string;
          printing_id: string;
          quantity: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          collection_id: string;
          condition: Database["public"]["Enums"]["card_condition"];
          created_at?: string;
          finish: Database["public"]["Enums"]["card_finish"];
          last_transaction_id: string;
          printing_id: string;
          quantity: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          collection_id?: string;
          condition?: Database["public"]["Enums"]["card_condition"];
          created_at?: string;
          finish?: Database["public"]["Enums"]["card_finish"];
          last_transaction_id?: string;
          printing_id?: string;
          quantity?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_balances_collection_fk";
            columns: ["workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "inventory_balances_last_transaction_fk";
            columns: ["last_transaction_id", "workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "inventory_transactions";
            referencedColumns: ["id", "workspace_id", "collection_id"];
          },
          {
            foreignKeyName: "inventory_balances_printing_id_fkey";
            columns: ["printing_id"];
            isOneToOne: false;
            referencedRelation: "catalog_printings";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_import_jobs: {
        Row: {
          ambiguous_rows: number;
          cancelled_at: string | null;
          collection_id: string;
          committed_transaction_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by_user_id: string;
          excluded_rows: number;
          failure_code: string | null;
          failure_detail: Json;
          file_sha256: string;
          file_size: number;
          id: string;
          matched_rows: number;
          original_filename: string;
          parser_version: string;
          purge_after: string;
          purged_at: string | null;
          rejected_rows: number;
          staging_completed_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          storage_bucket: string;
          storage_path: string;
          total_rows: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          ambiguous_rows?: number;
          cancelled_at?: string | null;
          collection_id: string;
          committed_transaction_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by_user_id: string;
          excluded_rows?: number;
          failure_code?: string | null;
          failure_detail?: Json;
          file_sha256: string;
          file_size: number;
          id?: string;
          matched_rows?: number;
          original_filename: string;
          parser_version: string;
          purge_after?: string;
          purged_at?: string | null;
          rejected_rows?: number;
          staging_completed_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          storage_bucket?: string;
          storage_path: string;
          total_rows?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          ambiguous_rows?: number;
          cancelled_at?: string | null;
          collection_id?: string;
          committed_transaction_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by_user_id?: string;
          excluded_rows?: number;
          failure_code?: string | null;
          failure_detail?: Json;
          file_sha256?: string;
          file_size?: number;
          id?: string;
          matched_rows?: number;
          original_filename?: string;
          parser_version?: string;
          purge_after?: string;
          purged_at?: string | null;
          rejected_rows?: number;
          staging_completed_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          storage_bucket?: string;
          storage_path?: string;
          total_rows?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_import_jobs_collection_fk";
            columns: ["workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "inventory_import_jobs_committed_transaction_fk";
            columns: ["committed_transaction_id", "workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "inventory_transactions";
            referencedColumns: ["id", "workspace_id", "collection_id"];
          },
        ];
      };
      inventory_import_rows: {
        Row: {
          collection_id: string;
          condition: Database["public"]["Enums"]["card_condition"] | null;
          created_at: string;
          error_code: string | null;
          error_detail: Json;
          finish: Database["public"]["Enums"]["card_finish"] | null;
          id: string;
          import_job_id: string;
          quantity: number | null;
          raw_collector_number: string | null;
          raw_condition: string | null;
          raw_data: Json;
          raw_finish: string | null;
          raw_language: string | null;
          raw_name: string | null;
          raw_quantity: string | null;
          raw_scryfall_id: string | null;
          raw_set_code: string | null;
          resolution_source: string | null;
          resolved_printing_id: string | null;
          row_hash: string;
          row_number: number;
          status: Database["public"]["Enums"]["inventory_import_row_status"];
          suggested_printing_ids: string[];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          collection_id: string;
          condition?: Database["public"]["Enums"]["card_condition"] | null;
          created_at?: string;
          error_code?: string | null;
          error_detail?: Json;
          finish?: Database["public"]["Enums"]["card_finish"] | null;
          id?: string;
          import_job_id: string;
          quantity?: number | null;
          raw_collector_number?: string | null;
          raw_condition?: string | null;
          raw_data: Json;
          raw_finish?: string | null;
          raw_language?: string | null;
          raw_name?: string | null;
          raw_quantity?: string | null;
          raw_scryfall_id?: string | null;
          raw_set_code?: string | null;
          resolution_source?: string | null;
          resolved_printing_id?: string | null;
          row_hash: string;
          row_number: number;
          status: Database["public"]["Enums"]["inventory_import_row_status"];
          suggested_printing_ids?: string[];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          collection_id?: string;
          condition?: Database["public"]["Enums"]["card_condition"] | null;
          created_at?: string;
          error_code?: string | null;
          error_detail?: Json;
          finish?: Database["public"]["Enums"]["card_finish"] | null;
          id?: string;
          import_job_id?: string;
          quantity?: number | null;
          raw_collector_number?: string | null;
          raw_condition?: string | null;
          raw_data?: Json;
          raw_finish?: string | null;
          raw_language?: string | null;
          raw_name?: string | null;
          raw_quantity?: string | null;
          raw_scryfall_id?: string | null;
          raw_set_code?: string | null;
          resolution_source?: string | null;
          resolved_printing_id?: string | null;
          row_hash?: string;
          row_number?: number;
          status?: Database["public"]["Enums"]["inventory_import_row_status"];
          suggested_printing_ids?: string[];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_import_rows_job_fk";
            columns: ["import_job_id", "workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "inventory_import_jobs";
            referencedColumns: ["id", "workspace_id", "collection_id"];
          },
          {
            foreignKeyName: "inventory_import_rows_resolved_printing_id_fkey";
            columns: ["resolved_printing_id"];
            isOneToOne: false;
            referencedRelation: "catalog_printings";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_transaction_lines: {
        Row: {
          client_line_ids: string[];
          collection_id: string;
          condition: Database["public"]["Enums"]["card_condition"];
          created_at: string;
          finish: Database["public"]["Enums"]["card_finish"];
          id: string;
          line_number: number;
          printing_id: string;
          quantity_after: number;
          quantity_before: number;
          quantity_delta: number;
          transaction_id: string;
          workspace_id: string;
        };
        Insert: {
          client_line_ids: string[];
          collection_id: string;
          condition: Database["public"]["Enums"]["card_condition"];
          created_at?: string;
          finish: Database["public"]["Enums"]["card_finish"];
          id?: string;
          line_number: number;
          printing_id: string;
          quantity_after: number;
          quantity_before: number;
          quantity_delta: number;
          transaction_id: string;
          workspace_id: string;
        };
        Update: {
          client_line_ids?: string[];
          collection_id?: string;
          condition?: Database["public"]["Enums"]["card_condition"];
          created_at?: string;
          finish?: Database["public"]["Enums"]["card_finish"];
          id?: string;
          line_number?: number;
          printing_id?: string;
          quantity_after?: number;
          quantity_before?: number;
          quantity_delta?: number;
          transaction_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_transaction_lines_printing_id_fkey";
            columns: ["printing_id"];
            isOneToOne: false;
            referencedRelation: "catalog_printings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_transaction_lines_transaction_fk";
            columns: ["transaction_id", "workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "inventory_transactions";
            referencedColumns: ["id", "workspace_id", "collection_id"];
          },
        ];
      };
      inventory_transactions: {
        Row: {
          actor_user_id: string | null;
          collection_id: string;
          committed_at: string;
          device_id: string | null;
          external_reference: string | null;
          id: string;
          idempotency_key: string;
          import_job_id: string | null;
          metadata: Json;
          note: string | null;
          occurred_at: string;
          reverses_transaction_id: string | null;
          source: Database["public"]["Enums"]["inventory_source"];
          transfer_direction: Database["public"]["Enums"]["inventory_transfer_direction"] | null;
          transfer_group_id: string | null;
          workspace_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          collection_id: string;
          committed_at?: string;
          device_id?: string | null;
          external_reference?: string | null;
          id?: string;
          idempotency_key: string;
          import_job_id?: string | null;
          metadata?: Json;
          note?: string | null;
          occurred_at: string;
          reverses_transaction_id?: string | null;
          source: Database["public"]["Enums"]["inventory_source"];
          transfer_direction?: Database["public"]["Enums"]["inventory_transfer_direction"] | null;
          transfer_group_id?: string | null;
          workspace_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          collection_id?: string;
          committed_at?: string;
          device_id?: string | null;
          external_reference?: string | null;
          id?: string;
          idempotency_key?: string;
          import_job_id?: string | null;
          metadata?: Json;
          note?: string | null;
          occurred_at?: string;
          reverses_transaction_id?: string | null;
          source?: Database["public"]["Enums"]["inventory_source"];
          transfer_direction?: Database["public"]["Enums"]["inventory_transfer_direction"] | null;
          transfer_group_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_collection_fk";
            columns: ["workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "inventory_transactions_device_fk";
            columns: ["workspace_id", "device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "inventory_transactions_import_job_fk";
            columns: ["import_job_id", "workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "inventory_import_jobs";
            referencedColumns: ["id", "workspace_id", "collection_id"];
          },
          {
            foreignKeyName: "inventory_transactions_reverses_fk";
            columns: ["reverses_transaction_id", "workspace_id", "collection_id"];
            isOneToOne: false;
            referencedRelation: "inventory_transactions";
            referencedColumns: ["id", "workspace_id", "collection_id"];
          },
        ];
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
      admin_application_feature_policy_update: {
        Args: {
          p_correlation_id: string;
          p_enabled: boolean;
          p_expected_updated_at: string;
          p_feature_key: string;
          p_max_units_per_request: number;
          p_per_day_requests: number;
          p_per_day_units: number;
          p_per_minute_requests: number;
        };
        Returns: Json;
      };
      admin_bootstrap_platform_admin: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      admin_catalog_status: { Args: { p_actor_user_id: string }; Returns: Json };
      admin_device_feature_policies: { Args: never; Returns: Json };
      admin_device_feature_policy_update: {
        Args: {
          p_enabled: boolean;
          p_expected_updated_at: string;
          p_feature_key: string;
          p_max_items: number;
          p_max_request_bytes: number;
          p_per_day_requests: number;
          p_per_day_units: number;
          p_per_minute_requests: number;
        };
        Returns: Json;
      };
      admin_external_service_policy_update: {
        Args: {
          p_correlation_id: string;
          p_enabled: boolean;
          p_expected_updated_at: string;
          p_global_daily_units: number;
          p_per_device_daily_units: number;
          p_per_user_daily_units: number;
          p_per_workspace_daily_units: number;
          p_service_key: string;
        };
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
      admin_operational_control_toggle: {
        Args: {
          p_control_key: string;
          p_control_kind: string;
          p_correlation_id: string;
          p_enabled: boolean;
          p_expected_updated_at: string;
        };
        Returns: Json;
      };
      admin_operational_controls: { Args: never; Returns: Json };
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
      apply_device_inventory_batch: {
        Args: {
          p_catalog_snapshot_version: string;
          p_collection_id: string;
          p_credential_id: string;
          p_device_id: string;
          p_external_run_id: string;
          p_idempotency_key: string;
          p_lines: Json;
          p_metadata: Json;
          p_occurred_at: string;
          p_request_bytes: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      apply_inventory_transaction: {
        Args: {
          p_collection_id: string;
          p_external_reference?: string;
          p_idempotency_key: string;
          p_lines: Json;
          p_metadata?: Json;
          p_note?: string;
          p_occurred_at: string;
        };
        Returns: Json;
      };
      calculate_collection_summary: {
        Args: { p_collection_id: string; p_currency?: string };
        Returns: Json;
      };
      calculate_deck_ownership: {
        Args: { p_currency?: string; p_deck_id: string };
        Returns: Json;
      };
      catalog_card_detail: { Args: { p_card_id: string }; Returns: Json };
      catalog_oracle_price_floors: {
        Args: {
          p_card_ids: string[];
          p_currency?: string;
          p_language?: string;
          p_set_code?: string;
        };
        Returns: Json;
      };
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
          p_return_all_variants?: boolean;
          p_set_code?: string;
          p_sort?: string;
          p_type_line?: string;
        };
        Returns: Json;
      };
      catalog_set_detail: { Args: { p_set_code: string }; Returns: Json };
      catalog_status: { Args: never; Returns: Json };
      collection_analytics: {
        Args: {
          p_collection_id: string;
          p_condition?: Database["public"]["Enums"]["card_condition"];
          p_currency?: string;
          p_finish?: Database["public"]["Enums"]["card_finish"];
          p_query?: string;
          p_set_code?: string;
        };
        Returns: Json;
      };
      collection_archive: {
        Args: { p_collection_id: string; p_expected_updated_at: string };
        Returns: Json;
      };
      collection_create: {
        Args: {
          p_cover_printing_id?: string;
          p_description?: string;
          p_name: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      collection_delete: {
        Args: { p_collection_id: string; p_expected_updated_at: string };
        Returns: Json;
      };
      collection_detail: {
        Args: { p_collection_id: string; p_currency?: string };
        Returns: Json;
      };
      collection_inventory_export: {
        Args: { p_after?: string; p_collection_id: string; p_limit?: number };
        Returns: Json;
      };
      collection_inventory_page: {
        Args: {
          p_after?: string;
          p_collection_id: string;
          p_condition?: Database["public"]["Enums"]["card_condition"];
          p_currency?: string;
          p_finish?: Database["public"]["Enums"]["card_finish"];
          p_limit?: number;
          p_query?: string;
          p_set_code?: string;
          p_sort?: string;
        };
        Returns: Json;
      };
      collection_list: {
        Args: {
          p_after?: string;
          p_include_archived?: boolean;
          p_limit?: number;
          p_status?: Database["public"]["Enums"]["resource_status"];
          p_workspace_id: string;
        };
        Returns: Json;
      };
      collection_restore: {
        Args: { p_collection_id: string; p_expected_updated_at: string };
        Returns: Json;
      };
      collection_transaction_history: {
        Args: { p_after?: string; p_collection_id: string; p_limit?: number };
        Returns: Json;
      };
      collection_transaction_lines: {
        Args: {
          p_after_line_number?: number;
          p_limit?: number;
          p_transaction_id: string;
        };
        Returns: Json;
      };
      collection_update: {
        Args: {
          p_collection_id: string;
          p_cover_printing_id: string;
          p_description: string;
          p_expected_updated_at: string;
          p_name: string;
        };
        Returns: Json;
      };
      consume_application_feature_quota: {
        Args: {
          p_correlation_id: string;
          p_feature_key: string;
          p_units: number;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      consume_external_service_quota: {
        Args: {
          p_correlation_id?: string;
          p_device_id?: string;
          p_service_key: string;
          p_units: number;
          p_user_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      current_user_context: { Args: never; Returns: Json };
      deck_archive: {
        Args: { p_deck_id: string; p_expected_revision: number };
        Returns: Json;
      };
      deck_card_printings: {
        Args: {
          p_after?: string;
          p_card_id: string;
          p_currency?: string;
          p_deck_id: string;
          p_limit?: number;
        };
        Returns: Json;
      };
      deck_catalog_search: {
        Args: {
          p_after?: string;
          p_deck_id: string;
          p_limit?: number;
          p_query: string;
        };
        Returns: Json;
      };
      deck_create: {
        Args: {
          p_collection_ids?: string[];
          p_description?: string;
          p_format_code: string;
          p_name: string;
          p_notes?: string;
          p_tags?: string[];
          p_workspace_id: string;
        };
        Returns: Json;
      };
      deck_delete: {
        Args: { p_deck_id: string; p_expected_revision: number };
        Returns: Json;
      };
      deck_detail: {
        Args: { p_currency?: string; p_deck_id: string };
        Returns: Json;
      };
      deck_duplicate: {
        Args: {
          p_deck_id: string;
          p_expected_revision: number;
          p_name?: string;
        };
        Returns: Json;
      };
      deck_entries_replace: {
        Args: {
          p_deck_id: string;
          p_entries: Json;
          p_expected_revision: number;
        };
        Returns: Json;
      };
      deck_entry_add: {
        Args: {
          p_card_id: string;
          p_deck_id: string;
          p_expected_revision: number;
          p_notes?: string;
          p_preferred_finish?: Database["public"]["Enums"]["card_finish"];
          p_preferred_printing_id?: string;
          p_quantity: number;
          p_zone: Database["public"]["Enums"]["deck_zone"];
        };
        Returns: Json;
      };
      deck_entry_remove: {
        Args: { p_entry_id: string; p_expected_revision: number };
        Returns: Json;
      };
      deck_entry_update: {
        Args: {
          p_entry_id: string;
          p_expected_revision: number;
          p_notes: string;
          p_preferred_finish: Database["public"]["Enums"]["card_finish"];
          p_preferred_printing_id: string;
          p_quantity: number;
          p_zone: Database["public"]["Enums"]["deck_zone"];
        };
        Returns: Json;
      };
      deck_export: { Args: { p_deck_id: string }; Returns: Json };
      deck_formats_list: { Args: never; Returns: Json };
      deck_import_resolve: {
        Args: { p_deck_id: string; p_names: Json };
        Returns: Json;
      };
      deck_list: {
        Args: {
          p_after?: string;
          p_include_archived?: boolean;
          p_limit?: number;
          p_status?: Database["public"]["Enums"]["resource_status"];
          p_workspace_id: string;
        };
        Returns: Json;
      };
      deck_restore: {
        Args: { p_deck_id: string; p_expected_revision: number };
        Returns: Json;
      };
      deck_revision_history: {
        Args: { p_deck_id: string; p_limit?: number };
        Returns: Json;
      };
      deck_sources_replace: {
        Args: {
          p_collection_ids: string[];
          p_deck_id: string;
          p_expected_revision: number;
        };
        Returns: Json;
      };
      deck_update: {
        Args: {
          p_cover_printing_id: string;
          p_deck_id: string;
          p_description: string;
          p_expected_revision: number;
          p_format_code: string;
          p_format_version_id: string;
          p_name: string;
          p_notes: string;
          p_tags: string[];
        };
        Returns: Json;
      };
      deck_validation_history: {
        Args: { p_deck_id: string; p_limit?: number };
        Returns: Json;
      };
      device_api_catalog_manifest: {
        Args: {
          p_client_version: string;
          p_credential_id: string;
          p_current_version: string;
          p_device_id: string;
          p_request_bytes: number;
          p_request_id: string;
          p_supported_schema_versions: number[];
        };
        Returns: Json;
      };
      device_api_create_run_summary: {
        Args: {
          p_catalog_snapshot_version: string;
          p_collection_id: string;
          p_completed_at: string;
          p_counts: Json;
          p_credential_id: string;
          p_device_id: string;
          p_diagnostic_code: string;
          p_external_run_id: string;
          p_idempotency_key: string;
          p_metadata: Json;
          p_request_bytes: number;
          p_request_id: string;
          p_started_at: string;
          p_status: Database["public"]["Enums"]["device_run_status"];
        };
        Returns: Json;
      };
      device_api_heartbeat: {
        Args: {
          p_catalog_snapshot_version: string;
          p_client_version: string;
          p_credential_id: string;
          p_device_id: string;
          p_firmware_version: string;
          p_health: Json;
          p_request_bytes: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      device_api_inventory_page: {
        Args: {
          p_after: string;
          p_collection_id: string;
          p_credential_id: string;
          p_device_id: string;
          p_limit: number;
          p_request_bytes: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      device_api_me: {
        Args: {
          p_credential_id: string;
          p_device_id: string;
          p_request_bytes: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      device_auth_touch: {
        Args: {
          p_credential_id: string;
          p_device_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      device_credential_candidate: { Args: { p_prefix: string }; Returns: Json };
      device_credential_revoke: {
        Args: { p_credential_id: string; p_device_id: string };
        Returns: Json;
      };
      device_delete: {
        Args: { p_device_id: string; p_expected_updated_at: string };
        Returns: Json;
      };
      device_detail: { Args: { p_device_id: string }; Returns: Json };
      device_grants_replace: {
        Args: { p_device_id: string; p_grants: Json };
        Returns: Json;
      };
      device_list: {
        Args: {
          p_after?: string;
          p_limit?: number;
          p_status?: Database["public"]["Enums"]["device_status"];
          p_workspace_id: string;
        };
        Returns: Json;
      };
      device_register: {
        Args: {
          p_actor_user_id: string;
          p_credential_digest: string;
          p_credential_expires_at?: string;
          p_credential_prefix: string;
          p_manufacturer: string;
          p_model: string;
          p_name: string;
          p_serial_number: string;
          p_type: Database["public"]["Enums"]["device_type"];
          p_workspace_id: string;
        };
        Returns: Json;
      };
      device_revoke: {
        Args: { p_device_id: string; p_expected_updated_at: string };
        Returns: Json;
      };
      device_rotate_credential: {
        Args: {
          p_actor_user_id: string;
          p_credential_digest: string;
          p_credential_expires_at?: string;
          p_credential_prefix: string;
          p_device_id: string;
        };
        Returns: Json;
      };
      device_set_status: {
        Args: {
          p_device_id: string;
          p_expected_updated_at: string;
          p_status: Database["public"]["Enums"]["device_status"];
        };
        Returns: Json;
      };
      device_update: {
        Args: {
          p_device_id: string;
          p_expected_updated_at: string;
          p_manufacturer: string;
          p_model: string;
          p_name: string;
          p_serial_number: string;
          p_type: Database["public"]["Enums"]["device_type"];
        };
        Returns: Json;
      };
      finalize_admitted_user: { Args: never; Returns: Json };
      inventory_import_cancel: {
        Args: { p_import_job_id: string };
        Returns: Json;
      };
      inventory_import_commit: {
        Args: {
          p_idempotency_key: string;
          p_import_job_id: string;
          p_note?: string;
          p_occurred_at: string;
        };
        Returns: Json;
      };
      inventory_import_create: {
        Args: {
          p_collection_id: string;
          p_file_sha256: string;
          p_file_size: number;
          p_idempotency_key: string;
          p_original_filename: string;
          p_parser_version: string;
        };
        Returns: Json;
      };
      inventory_import_error_report: {
        Args: {
          p_after_row_number?: number;
          p_import_job_id: string;
          p_limit?: number;
        };
        Returns: Json;
      };
      inventory_import_expire_stale: {
        Args: { p_before?: string; p_limit?: number };
        Returns: Json;
      };
      inventory_import_mark_purged: {
        Args: { p_import_job_id: string; p_purged_at?: string };
        Returns: Json;
      };
      inventory_import_preview: {
        Args: {
          p_after_row_number?: number;
          p_import_job_id: string;
          p_limit?: number;
        };
        Returns: Json;
      };
      inventory_import_resolve_row: {
        Args: {
          p_import_job_id: string;
          p_printing_id?: string;
          p_resolution: string;
          p_row_number: number;
        };
        Returns: Json;
      };
      inventory_import_retention_candidates: {
        Args: { p_before?: string; p_limit?: number };
        Returns: Json;
      };
      inventory_import_stage_rows: {
        Args: { p_complete?: boolean; p_import_job_id: string; p_rows: Json };
        Returns: Json;
      };
      record_server_audit_event: {
        Args: {
          p_actor_user_id: string;
          p_correlation_id: string;
          p_event_type: string;
          p_metadata?: Json;
          p_resource_id: string;
          p_resource_type: string;
          p_result_code: string;
          p_workspace_id: string;
        };
        Returns: string;
      };
      reverse_inventory_transaction: {
        Args: {
          p_idempotency_key: string;
          p_note?: string;
          p_occurred_at: string;
          p_transaction_id: string;
        };
        Returns: Json;
      };
      server_resolve_login_email: {
        Args: { p_handle: string };
        Returns: string;
      };
      transfer_inventory: {
        Args: {
          p_destination_collection_id: string;
          p_idempotency_key: string;
          p_lines: Json;
          p_metadata?: Json;
          p_note?: string;
          p_occurred_at: string;
          p_source_collection_id: string;
        };
        Returns: Json;
      };
      validate_deck: { Args: { p_deck_id: string }; Returns: Json };
    };
    Enums: {
      card_condition:
        | "unknown"
        | "near_mint"
        | "lightly_played"
        | "moderately_played"
        | "heavily_played"
        | "damaged";
      card_finish: "unknown" | "nonfoil" | "foil" | "etched";
      deck_zone: "mainboard" | "sideboard" | "commander" | "companion" | "maybeboard";
      device_run_status: "completed" | "failed" | "cancelled" | "partially_posted";
      device_status: "active" | "suspended" | "revoked";
      device_type: "talence_sorter" | "scanner" | "kiosk" | "third_party";
      grant_permission: "inventory_read" | "inventory_write" | "run_summary_write";
      inventory_import_row_status: "matched" | "ambiguous" | "rejected" | "excluded";
      inventory_source:
        "manual" | "csv_import" | "device" | "transfer" | "reversal" | "admin_correction";
      inventory_transfer_direction: "out" | "in";
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
      card_condition: [
        "unknown",
        "near_mint",
        "lightly_played",
        "moderately_played",
        "heavily_played",
        "damaged",
      ],
      card_finish: ["unknown", "nonfoil", "foil", "etched"],
      deck_zone: ["mainboard", "sideboard", "commander", "companion", "maybeboard"],
      device_run_status: ["completed", "failed", "cancelled", "partially_posted"],
      device_status: ["active", "suspended", "revoked"],
      device_type: ["talence_sorter", "scanner", "kiosk", "third_party"],
      grant_permission: ["inventory_read", "inventory_write", "run_summary_write"],
      inventory_import_row_status: ["matched", "ambiguous", "rejected", "excluded"],
      inventory_source: [
        "manual",
        "csv_import",
        "device",
        "transfer",
        "reversal",
        "admin_correction",
      ],
      inventory_transfer_direction: ["out", "in"],
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
