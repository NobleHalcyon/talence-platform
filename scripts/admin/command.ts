import process from "node:process";

import { AdminOperationError, isAdminOperationError } from "./errors.js";

export interface CommandIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

const processIo: CommandIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

export async function runAdminCommand(
  operation: () => Promise<unknown>,
  io: CommandIo = processIo,
): Promise<number> {
  try {
    const result = await operation();
    io.stdout(JSON.stringify({ ok: true, data: result }, null, 2));
    return 0;
  } catch (error) {
    const safeError = normalizeCommandError(error);
    io.stderr(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: safeError.code,
            message: safeError.message,
          },
        },
        null,
        2,
      ),
    );
    return safeError.kind === "configuration" || safeError.kind === "validation" ? 2 : 1;
  }
}

export async function setProcessExitCode(operation: () => Promise<unknown>): Promise<void> {
  process.exitCode = await runAdminCommand(operation);
}

function normalizeCommandError(error: unknown): AdminOperationError {
  if (isAdminOperationError(error)) {
    return error;
  }
  return new AdminOperationError(
    "admin_command_failed",
    "The trusted administration command failed. No credential or raw provider error was printed.",
    "external",
  );
}
