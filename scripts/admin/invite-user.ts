import process from "node:process";

import { hasFlag, optionalArgument, parseArguments, requireArgument } from "./arguments.js";
import { setProcessExitCode } from "./command.js";
import {
  requireInvitationsEnabled,
  resolveInvitationExpiration,
  resolveInviteRedirect,
} from "./environment.js";
import { withAdminService } from "./runtime.js";

const usage =
  "npm run admin:invite -- --email <email> [--expires-at <ISO>] [--ttl-days <days>] " +
  "[--note <text>] [--actor-user-id <uuid>] [--redirect-to <callback-url>]";

await setProcessExitCode(async () => {
  const arguments_ = parseArguments(
    process.argv.slice(2),
    ["email", "expires-at", "ttl-days", "note", "actor-user-id", "redirect-to"],
    ["help"],
  );
  if (hasFlag(arguments_, "help")) {
    return { usage };
  }

  requireInvitationsEnabled(process.env);
  const now = new Date();
  const note = optionalArgument(arguments_, "note");
  const actorUserId = optionalArgument(arguments_, "actor-user-id");
  return withAdminService(
    process.env,
    (service) =>
      service.inviteUser({
        email: requireArgument(arguments_, "email"),
        expiresAt: resolveInvitationExpiration(
          process.env,
          now,
          optionalArgument(arguments_, "expires-at"),
          optionalArgument(arguments_, "ttl-days"),
        ),
        redirectTo: resolveInviteRedirect(process.env, optionalArgument(arguments_, "redirect-to")),
        ...(note ? { note } : {}),
        ...(actorUserId ? { invitedByUserId: actorUserId } : {}),
      }),
    () => now,
  );
});
