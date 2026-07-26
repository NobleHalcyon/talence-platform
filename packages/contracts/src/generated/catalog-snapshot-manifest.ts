/* This file is generated from canonical contracts. Do not edit directly. */

export interface TalenceCatalogSnapshotManifest {
  schema_version: 1;
  up_to_date: boolean;
  server_time: string;
  latest: {
    snapshot_id: string;
    version: string;
    snapshot_schema_version: number;
    game_code: "mtg";
    generated_at: string;
    provider_observed_at: string;
    sha256: string;
    byte_size: number;
    record_counts: {
      sets: number;
      oracle_cards: number;
      printings: number;
      faces: number;
      prices: number;
    };
    minimum_client_version: string;
    download?: {
      url: string;
      expires_at: string;
    } | null;
  };
}
