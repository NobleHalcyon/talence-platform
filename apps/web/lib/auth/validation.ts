export interface ValidationFailure {
  ok: false;
  code: string;
}

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export type ValidationResult<T> = ValidationFailure | ValidationSuccess<T>;

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function rawFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function normalizeEmail(value: string): ValidationResult<string> {
  const email = value.trim().toLocaleLowerCase("en-US");
  if (email.length < 3 || email.length > 254 || !SIMPLE_EMAIL_PATTERN.test(email)) {
    return { ok: false, code: "email_invalid" };
  }

  return { ok: true, value: email };
}

export function normalizeHandle(value: string): ValidationResult<string> {
  const handle = value.trim().toLocaleLowerCase("en-US");
  if (!HANDLE_PATTERN.test(handle)) {
    return { ok: false, code: "handle_invalid" };
  }

  return { ok: true, value: handle };
}

export function normalizeDisplayName(value: string): ValidationResult<string> {
  const displayName = value.trim().replace(/\s+/g, " ");
  if (displayName.length < 1 || displayName.length > 80) {
    return { ok: false, code: "display_name_invalid" };
  }

  return { ok: true, value: displayName };
}

export function validatePassword(value: string): ValidationResult<string> {
  if (value.length < 8 || value.length > 1024) {
    return { ok: false, code: "password_invalid" };
  }

  return { ok: true, value };
}

export function validateUuid(value: string): ValidationResult<string> {
  const candidate = value.trim();
  return UUID_PATTERN.test(candidate)
    ? { ok: true, value: candidate }
    : { ok: false, code: "identifier_invalid" };
}

export function readCaptchaToken(formData: FormData): string | undefined {
  const turnstileToken = formString(formData, "cf-turnstile-response");
  const genericToken = formString(formData, "captchaToken");
  return turnstileToken || genericToken || undefined;
}

export interface CredentialsInput {
  email: string;
  password: string;
  captchaToken?: string;
}

export function parseCredentials(formData: FormData): ValidationResult<CredentialsInput> {
  const email = normalizeEmail(formString(formData, "email"));
  const password = validatePassword(rawFormString(formData, "password"));

  if (!email.ok) {
    return email;
  }
  if (!password.ok) {
    return password;
  }

  return {
    ok: true,
    value: {
      email: email.value,
      password: password.value,
      captchaToken: readCaptchaToken(formData),
    },
  };
}

export interface ProfileCompletionInput {
  displayName: string;
  handle: string;
  password: string;
}

export function parseProfileCompletion(
  formData: FormData,
): ValidationResult<ProfileCompletionInput> {
  const displayName = normalizeDisplayName(formString(formData, "displayName"));
  const handle = normalizeHandle(formString(formData, "handle"));
  const passwordValue = rawFormString(formData, "password");
  const passwordConfirmation = rawFormString(formData, "passwordConfirmation");
  const password = validatePassword(passwordValue);

  if (!displayName.ok) {
    return displayName;
  }
  if (!handle.ok) {
    return handle;
  }
  if (!password.ok) {
    return password;
  }
  if (passwordValue !== passwordConfirmation) {
    return { ok: false, code: "password_mismatch" };
  }

  return {
    ok: true,
    value: {
      displayName: displayName.value,
      handle: handle.value,
      password: password.value,
    },
  };
}

export function parseDateExpiration(value: string, now = new Date()): ValidationResult<string> {
  const candidate = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return { ok: false, code: "expiration_invalid" };
  }

  const expiresAt = new Date(`${candidate}T23:59:59.999Z`);
  const maximum = new Date(now);
  maximum.setUTCDate(maximum.getUTCDate() + 31);

  if (
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= now.getTime() ||
    expiresAt.getTime() > maximum.getTime()
  ) {
    return { ok: false, code: "expiration_invalid" };
  }

  return { ok: true, value: expiresAt.toISOString() };
}

export function readBoundedNote(formData: FormData): ValidationResult<string | null> {
  const note = formString(formData, "note");
  if (note.length > 500) {
    return { ok: false, code: "note_invalid" };
  }

  return { ok: true, value: note || null };
}
