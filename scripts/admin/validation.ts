import { AdminOperationError } from "./errors.js";
import type { InvitationSelector } from "./types.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumEmailLength = 254;
const maximumLocalPartLength = 64;
const maximumNoteLength = 2_000;

export function normalizeEmail(input: string): string {
  const email = input.normalize("NFKC").trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > maximumEmailLength ||
    /[\s\u0000-\u001f\u007f]/u.test(email)
  ) {
    throw validationError("invalid_email", "Provide a valid email address.");
  }

  const at = email.lastIndexOf("@");
  if (at <= 0 || at !== email.indexOf("@") || at > maximumLocalPartLength) {
    throw validationError("invalid_email", "Provide a valid email address.");
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    domain.length === 0 ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.includes("..")
  ) {
    throw validationError("invalid_email", "Provide a valid email address.");
  }

  const labels = domain.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-") ||
        !/^[a-z0-9-]+$/u.test(label),
    )
  ) {
    throw validationError("invalid_email", "Provide a valid email address.");
  }

  return email;
}

export function requireUuid(input: string, fieldName: string): string {
  const value = input.trim().toLowerCase();
  if (!uuidPattern.test(value)) {
    throw validationError("invalid_uuid", `${fieldName} must be a UUID.`);
  }
  return value;
}

export function normalizeOptionalNote(input: string | undefined): string | null {
  if (input === undefined) {
    return null;
  }

  const note = input.normalize("NFKC").trim();
  if (note.length === 0) {
    return null;
  }
  if (note.length > maximumNoteLength || /[\u0000]/u.test(note)) {
    throw validationError(
      "invalid_note",
      `Invitation note must be ${maximumNoteLength.toString()} characters or fewer.`,
    );
  }
  return note;
}

export function requireFutureInstant(input: string, now: Date): string {
  const expiresAt = new Date(input);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    throw validationError("invalid_expiration", "Invitation expiration must be a future instant.");
  }
  return expiresAt.toISOString();
}

export function requireInviteRedirect(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw validationError("invalid_redirect", "Invitation redirect must be an absolute URL.");
  }

  const localHost =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw validationError(
      "invalid_redirect",
      "Invitation redirect must use HTTPS, except for a local development host.",
    );
  }
  if (url.username || url.password || url.hash || url.pathname !== "/auth/callback") {
    throw validationError(
      "invalid_redirect",
      "Invitation redirect must target the Talence /auth/callback route without credentials or a fragment.",
    );
  }

  const destination = url.searchParams.get("next");
  if (
    url.searchParams.get("type") !== "invite" ||
    destination !== "/invite/complete" ||
    [...url.searchParams.keys()].some((key) => key !== "type" && key !== "next")
  ) {
    throw validationError(
      "invalid_redirect",
      "Invitation callback must declare type=invite and continue only to /invite/complete.",
    );
  }

  return url.toString();
}

export function normalizeSelector(input: InvitationSelector): InvitationSelector {
  if ("id" in input) {
    return { id: requireUuid(input.id, "Invitation ID") };
  }
  return { email: normalizeEmail(input.email) };
}

function validationError(code: string, message: string): AdminOperationError {
  return new AdminOperationError(code, message, "validation");
}
