import type { CardFinish, DeckZone, PriceObservation, ResourceStatus } from "@talence/domain";

export const DECK_STATUS_FILTERS = ["active", "archived", "all"] as const;
export type DeckStatusFilter = (typeof DECK_STATUS_FILTERS)[number];

export const DECK_EDITOR_SURFACES = ["catalog", "deck", "analysis"] as const;
export type DeckEditorSurface = (typeof DECK_EDITOR_SURFACES)[number];

export interface DeckFormat {
  code: string;
  name: string;
  formatVersionId: string;
  version: number;
  versionKey: string;
  rulesVersion: string;
  effectiveAt: string;
  minimumDeckSize: number;
  maximumDeckSize: number | null;
  minimumMainDeck: number;
  maximumMainDeck: number | null;
  maximumSideboard: number | null;
  defaultCopyLimit: number | null;
  minimumCommanderCount: number;
  maximumCommanderCount: number;
  maximumCompanionCount: number;
  companionConsumesSideboard: boolean;
  enforceCommanderColorIdentity: boolean;
  legalityFormatCode: string;
  restrictedCopyLimit: number;
  scopeNote: string;
  active: boolean;
}

export interface DeckPermissions {
  canEdit: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
}

export interface DeckRecord {
  id: string;
  workspaceId: string;
  gameId: string;
  formatCode: string;
  formatVersionId: string;
  rulesVersion: string;
  name: string;
  slug: string;
  description: string | null;
  notes: string | null;
  tags: string[];
  coverPrintingId: string | null;
  status: ResourceStatus;
  currentRevision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface DeckListItem extends DeckRecord {
  formatName: string;
  permissions: DeckPermissions;
  entryCount: number;
  requiredQuantity: number;
  maybeboardQuantity: number;
  sourceCount: number;
  missingQuantity: number;
}

export interface DeckListPage {
  workspaceId: string;
  permissions: {
    canCreate: boolean;
  };
  items: DeckListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface DeckCollectionSource {
  collectionId: string;
  name: string;
  priority: number;
  selected: boolean;
  status: ResourceStatus;
}

export interface DeckPrintingChoice {
  printingId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  language: string;
  imageSmallUri: string | null;
  imageNormalUri: string | null;
  availableFinishes: Array<Exclude<CardFinish, "unknown">>;
  finishOptions: Array<{
    finish: Exclude<CardFinish, "unknown">;
    ownedQuantity: number;
    price: PriceObservation | null;
  }>;
  active: boolean;
  price: PriceObservation | null;
}

export interface DeckCardIdentity {
  cardId: string;
  name: string;
  manaCost: string | null;
  manaValue: number | null;
  typeLine: string | null;
  oracleText: string | null;
  colorIdentity: string[];
  representativePrinting: DeckPrintingChoice | null;
  printingChoices: DeckPrintingChoice[];
}

export interface DeckOwnershipLine {
  countsTowardRequirement: boolean;
  requiredQuantity: number;
  ownedQuantity: number;
  allocatedQuantity: number;
  missingQuantity: number;
  preferredPrintingOwnedQuantity: number | null;
  preferredPrintingAllocatedQuantity: number | null;
  preferredPrintingMissingQuantity: number | null;
}

export interface DeckEntry {
  id: string;
  deckId: string;
  card: DeckCardIdentity;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
  preferredFinish: Exclude<CardFinish, "unknown"> | null;
  sortOrder: number;
  notes: string | null;
  updatedAt: string;
  currentRevision: number;
  ownership: DeckOwnershipLine;
  preferredPrice: PriceObservation | null;
}

export interface DeckOwnershipSummary {
  requiredQuantity: number;
  allocatedQuantity: number;
  missingQuantity: number;
  maybeboardQuantity: number;
  sourceCollectionCount: number;
  allocationOrder: DeckZone[];
}

export interface DeckValuation {
  currency: string;
  preferredPrintingValue: string | null;
  missingAcquisitionValue: string | null;
  unpricedEntryCount: number;
  unpricedMissingQuantity: number;
  providers: string[];
  oldestObservedAt: string | null;
  latestObservedAt: string | null;
  oldestIngestedAt: string | null;
  latestIngestedAt: string | null;
  stalePriceCount: number;
}

export type DeckValidationSeverity = "error" | "warning" | "information";

export interface DeckValidationIssue {
  code: string;
  severity: DeckValidationSeverity;
  message: string;
  cardId: string | null;
  zone: DeckZone | null;
  details: Record<string, string | number | boolean | null | string[]>;
}

export interface DeckValidationSummary {
  errorCount: number;
  warningCount: number;
  informationCount: number;
  unknownLegalityCount: number;
  issueDetailLimit: number;
  issueDetailReturned: number;
  issueDetailTotal: number;
  issuesTruncated: boolean;
}

export interface DeckValidation {
  valid: boolean;
  formatCode: string;
  formatName: string;
  rulesVersion: string;
  catalogVersion: string;
  contentHash: string;
  validationRunId: string;
  evaluatedAt: string;
  issues: DeckValidationIssue[];
  summary: DeckValidationSummary;
  advisory: true;
  zoneQuantities: Record<DeckZone, number>;
}

export interface DeckDetail {
  deck: DeckRecord;
  format: DeckFormat;
  permissions: DeckPermissions;
  availableFormats: DeckFormat[];
  sources: DeckCollectionSource[];
  entries: DeckEntry[];
  ownership: DeckOwnershipSummary;
  valuation: DeckValuation;
  validation: DeckValidation;
}

export interface DeckCatalogSearchItem {
  card: DeckCardIdentity;
  legality: string | null;
  ownedQuantity: number;
}

export interface DeckCatalogSearchPage {
  deckId: string;
  formatVersionId: string;
  revision: number;
  items: DeckCatalogSearchItem[];
  query: string;
  formatCode: string;
  nextCursor: string | null;
  hasMore: boolean;
  catalogVersion: string;
}

export interface DeckCardPrintingsPage {
  deckId: string;
  cardId: string;
  revision: number;
  currency: string;
  items: DeckPrintingChoice[];
  nextCursor: string | null;
  hasMore: boolean;
  catalogVersion: string;
}

export interface DeckImportCandidate {
  cardId: string;
  name: string;
  manaCost: string | null;
  typeLine: string | null;
  colorIdentity: string[];
}

export type DeckImportResolutionStatus = "exact" | "ambiguous" | "unresolved";

export interface DeckImportResolutionItem {
  lineId: string;
  inputName: string;
  normalizedName: string;
  status: DeckImportResolutionStatus;
  candidateCount: number;
  candidates: DeckImportCandidate[];
  candidatesTruncated: boolean;
  suggestionsOmitted: boolean;
}

export interface DeckImportResolution {
  deckId: string;
  catalogVersion: string;
  items: DeckImportResolutionItem[];
  counts: Record<DeckImportResolutionStatus, number>;
  limits: {
    maxLines: number;
    maxInputBytes: number;
    maxAmbiguousLinesWithCandidates: number;
    maxCandidatesPerAmbiguousLine: number;
    maxSuggestionLines: number;
    maxSuggestionsPerLine: number;
  };
}

export type DeckLoadFailureReason =
  | "configuration_required"
  | "invalid_response"
  | "not_found"
  | "permission_denied"
  | "request_failed";

export type DeckLoadResult<T> =
  | { ok: true; data: T; preview: boolean }
  | {
      ok: false;
      reason: DeckLoadFailureReason;
      requestId: string;
    };

export interface DeckRpcError {
  code?: string;
  message?: string;
  details?: unknown;
}

export interface DeckRpcClient {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: DeckRpcError | null }>;
}

export type DeckMutationResult<T> =
  { ok: true; data: T } | { ok: false; code: string; requestId?: string };
