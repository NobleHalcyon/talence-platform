export const CARD_FINISHES = ["unknown", "nonfoil", "foil", "etched"] as const;

export type CardFinish = (typeof CARD_FINISHES)[number];

export const CARD_CONDITIONS = [
  "unknown",
  "near_mint",
  "lightly_played",
  "moderately_played",
  "heavily_played",
  "damaged",
] as const;

export type CardCondition = (typeof CARD_CONDITIONS)[number];

export const MEMBERSHIP_ROLES = ["owner", "admin", "editor", "viewer"] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const RESOURCE_STATUSES = ["active", "archived", "deleted"] as const;

export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const DECK_ZONES = [
  "mainboard",
  "sideboard",
  "commander",
  "companion",
  "maybeboard",
] as const;

export type DeckZone = (typeof DECK_ZONES)[number];

export const DEVICE_TYPES = ["talence_sorter", "scanner", "kiosk", "third_party"] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];

export interface RequestMeta {
  requestId: string;
}

export interface DomainError {
  code: string;
  message: string;
  requestId?: string;
}
