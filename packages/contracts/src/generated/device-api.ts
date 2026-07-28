/* This file is generated from canonical contracts. Do not edit directly. */
export interface paths {
    "/device/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getDeviceIdentity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/device/heartbeat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postDeviceHeartbeat"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/device/catalog/manifest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCatalogManifest"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/device/collections/{collection_id}/inventory-batches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postDeviceInventoryBatch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/device/collections/{collection_id}/inventory": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getGrantedCollectionInventory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/device/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postDeviceRunSummary"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Meta: {
            /** Format: uuid */
            request_id: string;
        };
        ErrorResponse: {
            error: {
                code: string;
                message: string;
                details?: {
                    [key: string]: unknown;
                };
            };
            meta: components["schemas"]["Meta"];
        };
        AcknowledgementResponse: {
            data: {
                accepted: boolean;
                /** Format: date-time */
                server_time: string;
            };
            meta: components["schemas"]["Meta"];
        };
        DeviceGrant: {
            /** Format: uuid */
            collection_id: string;
            permissions: ("inventory_read" | "inventory_write" | "run_summary_write")[];
        };
        DeviceMeResponse: {
            data: {
                /** Format: uuid */
                device_id: string;
                /** Format: uuid */
                workspace_id: string;
                name: string;
                /** @enum {unknown} */
                type: "talence_sorter" | "scanner" | "kiosk" | "third_party";
                /** @enum {unknown} */
                status: "active" | "suspended" | "revoked";
                grants: components["schemas"]["DeviceGrant"][];
                /** @constant */
                api_version: "v1";
                /** Format: date-time */
                server_time: string;
            };
            meta: components["schemas"]["Meta"];
        };
        HeartbeatRequest: {
            /** @constant */
            schema_version: 1;
            client_version: string;
            firmware_version?: string | null;
            catalog_snapshot_version: string | null;
            health?: {
                [key: string]: string | number | boolean | null;
            };
        };
        CatalogManifestResponse: {
            /** @description Must validate against catalog-snapshot-manifest.schema.json */
            data: {
                [key: string]: unknown;
            };
            meta: components["schemas"]["Meta"];
        };
        InventoryLine: {
            line_id: string;
            /** Format: uuid */
            printing_id: string;
            /** @enum {unknown} */
            finish: "unknown" | "nonfoil" | "foil" | "etched";
            /** @enum {unknown} */
            condition: "unknown" | "near_mint" | "lightly_played" | "moderately_played" | "heavily_played" | "damaged";
            quantity_delta: number;
        };
        InventoryBatchRequest: {
            /** @constant */
            schema_version: 1;
            catalog_snapshot_version: string;
            /** Format: date-time */
            occurred_at: string;
            external_run_id?: string | null;
            lines: components["schemas"]["InventoryLine"][];
            metadata?: {
                [key: string]: string | number | boolean | null;
            };
        };
        InventoryResultLine: {
            line_id: string;
            /** Format: uuid */
            printing_id: string;
            quantity_before: number;
            quantity_after: number;
        };
        InventoryBatchResponse: {
            data: {
                /** Format: uuid */
                batch_id: string;
                /** Format: uuid */
                transaction_id: string;
                /** Format: uuid */
                collection_id: string;
                /** Format: date-time */
                committed_at: string;
                replayed: boolean;
                lines: components["schemas"]["InventoryResultLine"][];
            };
            meta: components["schemas"]["Meta"];
        };
        InventoryBalance: {
            /** Format: uuid */
            printing_id: string;
            /** @enum {unknown} */
            finish: "unknown" | "nonfoil" | "foil" | "etched";
            /** @enum {unknown} */
            condition: "unknown" | "near_mint" | "lightly_played" | "moderately_played" | "heavily_played" | "damaged";
            quantity: number;
            /** Format: date-time */
            updated_at: string;
        };
        InventoryPageResponse: {
            data: components["schemas"]["InventoryBalance"][];
            meta: {
                /** Format: uuid */
                request_id: string;
                next_cursor: string | null;
            };
        };
        RunCounts: {
            total: number;
            recognized: number;
            unrecognized: number;
            posted: number;
        };
        RunSummaryRequest: {
            /** @constant */
            schema_version: 1;
            external_run_id: string;
            /** Format: uuid */
            collection_id: string;
            /** @enum {unknown} */
            status: "completed" | "failed" | "cancelled" | "partially_posted";
            catalog_snapshot_version: string;
            /** Format: date-time */
            started_at: string;
            /** Format: date-time */
            completed_at: string;
            counts: components["schemas"]["RunCounts"];
            diagnostic_code?: string | null;
            metadata?: {
                [key: string]: string | number | boolean | null;
            };
        };
        RunSummaryResponse: {
            data: {
                /** Format: uuid */
                run_summary_id: string;
                external_run_id: string;
                /** Format: date-time */
                accepted_at: string;
                replayed: boolean;
            };
            meta: components["schemas"]["Meta"];
        };
    };
    responses: {
        /** @description Request validation failed */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Credential missing or invalid */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Device lacks the required grant */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Idempotency, catalog compatibility, or state conflict */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Request body or line count exceeds configured limit */
        PayloadTooLarge: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
        /** @description Request rate or quota exceeded */
        RateLimited: {
            headers: {
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
    };
    parameters: {
        CollectionId: string;
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getDeviceIdentity: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authenticated device identity and grants */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceMeResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    postDeviceHeartbeat: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HeartbeatRequest"];
            };
        };
        responses: {
            /** @description Heartbeat accepted */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcknowledgementResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["RateLimited"];
        };
    };
    getCatalogManifest: {
        parameters: {
            query: {
                current_version?: string;
                client_version: string;
                /** @description Comma-separated positive integers */
                supported_schema_versions: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Latest compatible manifest */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogManifestResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
        };
    };
    postDeviceInventoryBatch: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                collection_id: components["parameters"]["CollectionId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InventoryBatchRequest"];
            };
        };
        responses: {
            /** @description Existing stored result returned for an identical replay */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InventoryBatchResponse"];
                };
            };
            /** @description Batch accepted and committed */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InventoryBatchResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["PayloadTooLarge"];
            429: components["responses"]["RateLimited"];
        };
    };
    getGrantedCollectionInventory: {
        parameters: {
            query?: {
                cursor?: string;
                limit?: number;
            };
            header?: never;
            path: {
                collection_id: components["parameters"]["CollectionId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Paginated inventory balances for a granted collection */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InventoryPageResponse"];
                };
            };
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    postDeviceRunSummary: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RunSummaryRequest"];
            };
        };
        responses: {
            /** @description Existing idempotent result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunSummaryResponse"];
                };
            };
            /** @description Run summary accepted */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunSummaryResponse"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
        };
    };
}
