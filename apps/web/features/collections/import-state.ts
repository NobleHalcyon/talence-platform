import type { InventoryImportPreview } from "./types";

export interface ImportActionState {
  status: "idle" | "error" | "preview";
  message: string | null;
  requestId: string | null;
  preview: InventoryImportPreview | null;
  uploadAttemptId: string | null;
}

export const INITIAL_IMPORT_ACTION_STATE: ImportActionState = {
  status: "idle",
  message: null,
  requestId: null,
  preview: null,
  uploadAttemptId: null,
};
