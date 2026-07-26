import process from "node:process";

import { hasFlag, optionalArgument, parseArguments } from "./arguments.js";
import { setProcessExitCode } from "./command.js";
import { AdminOperationError } from "./errors.js";
import { withAdminService } from "./runtime.js";

const usage = "npm run admin:bootstrap -- (--user-id <auth-user-uuid> | --email <accepted-email>)";

await setProcessExitCode(async () => {
  const arguments_ = parseArguments(process.argv.slice(2), ["user-id", "email"], ["help"]);
  if (hasFlag(arguments_, "help")) {
    return { usage };
  }

  const userId = optionalArgument(arguments_, "user-id");
  const email = optionalArgument(arguments_, "email");
  if ((userId === undefined) === (email === undefined)) {
    throw new AdminOperationError(
      "invalid_arguments",
      "Provide exactly one of --user-id or --email.",
      "validation",
    );
  }

  return withAdminService(process.env, (service) =>
    service.bootstrapPlatformAdmin(userId === undefined ? { email: email ?? "" } : { userId }),
  );
});
