import { AdminOperationError } from "./errors.js";

export type ParsedArguments = Readonly<Record<string, string | true>>;

export function parseArguments(
  arguments_: readonly string[],
  allowedValueOptions: readonly string[],
  allowedBooleanOptions: readonly string[] = [],
): ParsedArguments {
  const values = new Set(allowedValueOptions);
  const booleans = new Set(allowedBooleanOptions);
  const parsed: Record<string, string | true> = {};

  for (let index = 0; index < arguments_.length; index += 1) {
    const token = arguments_[index];
    if (token === undefined || !token.startsWith("--") || token.length <= 2) {
      throw usageError(`Unexpected positional argument: ${token ?? ""}`);
    }

    const option = token.slice(2);
    if (option in parsed) {
      throw usageError(`Option --${option} may be supplied only once.`);
    }
    if (booleans.has(option)) {
      parsed[option] = true;
      continue;
    }
    if (!values.has(option)) {
      throw usageError(`Unknown option: --${option}`);
    }

    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw usageError(`Option --${option} requires a value.`);
    }
    parsed[option] = value;
    index += 1;
  }

  return parsed;
}

export function requireArgument(arguments_: ParsedArguments, name: string): string {
  const value = arguments_[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw usageError(`Missing required option --${name}.`);
  }
  return value;
}

export function optionalArgument(arguments_: ParsedArguments, name: string): string | undefined {
  const value = arguments_[name];
  return typeof value === "string" ? value : undefined;
}

export function hasFlag(arguments_: ParsedArguments, name: string): boolean {
  return arguments_[name] === true;
}

function usageError(message: string): AdminOperationError {
  return new AdminOperationError("invalid_arguments", message, "validation");
}
