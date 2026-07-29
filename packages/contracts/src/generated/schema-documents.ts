/* This file is generated from canonical contracts. Do not edit directly. */

export const catalogSnapshotManifestSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://talence.example/contracts/catalog-snapshot-manifest.schema.json",
  "title": "Talence Catalog Snapshot Manifest",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "up_to_date",
    "server_time",
    "latest"
  ],
  "properties": {
    "schema_version": {
      "const": 1
    },
    "up_to_date": {
      "type": "boolean"
    },
    "server_time": {
      "type": "string",
      "format": "date-time"
    },
    "latest": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "snapshot_id",
        "version",
        "snapshot_schema_version",
        "game_code",
        "generated_at",
        "provider_observed_at",
        "sha256",
        "byte_size",
        "record_counts",
        "minimum_client_version"
      ],
      "properties": {
        "snapshot_id": {
          "type": "string",
          "format": "uuid"
        },
        "version": {
          "type": "string",
          "minLength": 1,
          "maxLength": 160
        },
        "snapshot_schema_version": {
          "type": "integer",
          "minimum": 1
        },
        "game_code": {
          "const": "mtg"
        },
        "generated_at": {
          "type": "string",
          "format": "date-time"
        },
        "provider_observed_at": {
          "type": "string",
          "format": "date-time"
        },
        "sha256": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$"
        },
        "byte_size": {
          "type": "integer",
          "minimum": 1
        },
        "record_counts": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "sets",
            "oracle_cards",
            "printings",
            "faces",
            "prices"
          ],
          "properties": {
            "sets": {
              "type": "integer",
              "minimum": 0
            },
            "oracle_cards": {
              "type": "integer",
              "minimum": 0
            },
            "printings": {
              "type": "integer",
              "minimum": 0
            },
            "faces": {
              "type": "integer",
              "minimum": 0
            },
            "prices": {
              "type": "integer",
              "minimum": 0
            }
          }
        },
        "minimum_client_version": {
          "type": "string",
          "minLength": 1
        },
        "download": {
          "type": [
            "object",
            "null"
          ],
          "additionalProperties": false,
          "required": [
            "url",
            "expires_at"
          ],
          "properties": {
            "url": {
              "type": "string",
              "format": "uri"
            },
            "expires_at": {
              "type": "string",
              "format": "date-time"
            }
          }
        }
      }
    }
  }
} as const;

export const deviceInventoryBatchSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://talence.example/contracts/device-inventory-batch.schema.json",
  "title": "Talence Device Inventory Batch",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "catalog_snapshot_version",
    "occurred_at",
    "lines"
  ],
  "properties": {
    "schema_version": {
      "const": 1
    },
    "catalog_snapshot_version": {
      "type": "string",
      "minLength": 1,
      "maxLength": 160
    },
    "occurred_at": {
      "type": "string",
      "format": "date-time"
    },
    "external_run_id": {
      "type": [
        "string",
        "null"
      ],
      "minLength": 1,
      "maxLength": 128
    },
    "lines": {
      "type": "array",
      "minItems": 1,
      "maxItems": 500,
      "items": {
        "$ref": "#/$defs/line"
      }
    },
    "metadata": {
      "type": "object",
      "maxProperties": 20,
      "additionalProperties": {
        "type": [
          "string",
          "number",
          "integer",
          "boolean",
          "null"
        ]
      }
    }
  },
  "$defs": {
    "line": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "line_id",
        "printing_id",
        "finish",
        "condition",
        "quantity_delta"
      ],
      "properties": {
        "line_id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "printing_id": {
          "type": "string",
          "format": "uuid"
        },
        "finish": {
          "enum": [
            "unknown",
            "nonfoil",
            "foil",
            "etched"
          ]
        },
        "condition": {
          "enum": [
            "unknown",
            "near_mint",
            "lightly_played",
            "moderately_played",
            "heavily_played",
            "damaged"
          ]
        },
        "quantity_delta": {
          "type": "integer",
          "minimum": -10000,
          "maximum": 10000,
          "not": {
            "const": 0
          }
        }
      }
    }
  }
} as const;

export const deviceRunSummarySchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://talence.example/contracts/device-run-summary.schema.json",
  "title": "Talence Device Run Summary",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "external_run_id",
    "collection_id",
    "status",
    "catalog_snapshot_version",
    "started_at",
    "completed_at",
    "counts"
  ],
  "properties": {
    "schema_version": {
      "const": 1
    },
    "external_run_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "collection_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "enum": [
        "completed",
        "failed",
        "cancelled",
        "partially_posted"
      ]
    },
    "catalog_snapshot_version": {
      "type": "string",
      "minLength": 1,
      "maxLength": 160
    },
    "started_at": {
      "type": "string",
      "format": "date-time"
    },
    "completed_at": {
      "type": "string",
      "format": "date-time"
    },
    "counts": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "total",
        "recognized",
        "unrecognized",
        "posted"
      ],
      "properties": {
        "total": {
          "type": "integer",
          "minimum": 0
        },
        "recognized": {
          "type": "integer",
          "minimum": 0
        },
        "unrecognized": {
          "type": "integer",
          "minimum": 0
        },
        "posted": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "diagnostic_code": {
      "type": [
        "string",
        "null"
      ],
      "maxLength": 128
    },
    "metadata": {
      "type": "object",
      "maxProperties": 20,
      "additionalProperties": {
        "type": [
          "string",
          "number",
          "integer",
          "boolean",
          "null"
        ]
      }
    }
  }
} as const;
