export interface NavigationItem {
  href: string;
  label: string;
  shortLabel?: string;
}

export const PRIMARY_NAVIGATION = [
  { href: "/app/catalog", label: "Catalog" },
  { href: "/app/collections", label: "Collections" },
  { href: "/app/decks", label: "Decks" },
] as const satisfies readonly NavigationItem[];

export const ADMIN_NAVIGATION = [
  { href: "/app/admin/invites", label: "Invites" },
  { href: "/app/admin/catalog", label: "Catalog operations" },
  { href: "/app/admin/operations", label: "Security and usage" },
] as const satisfies readonly NavigationItem[];
