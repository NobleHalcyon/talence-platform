import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepositoryFile(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), "..", "..", relativePath), "utf8");
}

function renderTemplateLink(template: string, tokenHash: string): URL {
  const rendered = template
    .replaceAll("{{ .SiteURL }}", "https://talence.example")
    .replaceAll("{{ .TokenHash }}", tokenHash);
  const href = rendered.match(/href="([^"]+)"/u)?.[1]?.replaceAll("&amp;", "&");
  if (!href) {
    throw new Error("auth_email_template_link_missing");
  }
  return new URL(href);
}

describe("Supabase Auth email templates", () => {
  it.each([
    {
      expectedNext: "/invite/complete",
      expectedType: "invite",
      path: "supabase/templates/invite.html",
    },
    {
      expectedNext: "/reset-password",
      expectedType: "recovery",
      path: "supabase/templates/recovery.html",
    },
  ])(
    "renders a server-verifiable $expectedType callback",
    ({ expectedNext, expectedType, path }) => {
      const template = readRepositoryFile(path);
      const tokenHash = "provider-token-hash";
      const url = renderTemplateLink(template, tokenHash);

      expect(url.origin).toBe("https://talence.example");
      expect(url.pathname).toBe("/auth/callback");
      expect(url.searchParams.get("token_hash")).toBe(tokenHash);
      expect(url.searchParams.get("type")).toBe(expectedType);
      expect(url.searchParams.get("next")).toBe(expectedNext);
      expect(url.hash).toBe("");
      expect(template).not.toContain("ConfirmationURL");
      expect(template).not.toContain("RedirectTo");
      expect(template).not.toContain("/auth/v1/verify");
      expect(template).not.toMatch(/access_token|refresh_token/iu);
    },
  );

  it("loads both committed templates through supported local CLI configuration", () => {
    const configuration = readRepositoryFile("supabase/config.toml");

    expect(configuration).toContain("[auth.email.template.invite]");
    expect(configuration).toContain('content_path = "./supabase/templates/invite.html"');
    expect(configuration).toContain("[auth.email.template.recovery]");
    expect(configuration).toContain('content_path = "./supabase/templates/recovery.html"');
  });
});
