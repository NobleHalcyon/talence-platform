import process from "node:process";

import { hasFlag, optionalArgument, parseArguments } from "./arguments.js";
import { setProcessExitCode } from "./command.js";
import { AdminOperationError } from "./errors.js";
import { withAdminService } from "./runtime.js";
import type { InvitationSelector } from "./types.js";

const usage =
  "npm run admin:revoke-invite -- (--id <invitation-uuid> | --email <email>) " +
  "[--actor-user-id <uuid>]";

await setProcessExitCode(async () => {
  const arguments_ = parseArguments(
    process.argv.slice(2),
    ["id", "email", "actor-user-id"],
    ["help"],
  );
  if (hasFlag(arguments_, "help")) {
    return { usage };
  }

  const actorUserId = optionalArgument(arguments_, "actor-user-id");
  return withAdminService(process.env, (service) =>
    service.revokeInvite({
      selector: invitationSelector(arguments_),
      ...(actorUserId ? { actorUserId } : {}),
    }),
  );
});

function invitationSelector(
  arguments_: Readonly<Record<string, string | true>>,
): InvitationSelector {
  const id = optionalArgument(arguments_, "id");
  const email = optionalArgument(arguments_, "email");
  if ((id === undefined) === (email === undefined)) {
    throw new AdminOperationError(
      "invalid_arguments",
      "Provide exactly one of --id or --email.",
      "validation",
    );
  }
  return id === undefined ? { email: email ?? "" } : { id };
}
