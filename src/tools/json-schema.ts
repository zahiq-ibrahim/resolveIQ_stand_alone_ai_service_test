import { Ajv } from "ajv";
import type { JSONSchemaType } from "ajv";

const ajv = new Ajv({ allErrors: true, coerceTypes: false });

export class SchemaValidationError extends Error {
  constructor(
    public readonly errors: string[],
    message: string,
  ) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

/**
 * Validates `args` against the tool's JSON Schema `schema`.
 * Returns the validated args on success.
 * Throws SchemaValidationError on failure.
 */
export function validateJsonSchema(
  schema: Record<string, unknown>,
  args: Record<string, unknown>,
): Record<string, unknown> {
  // ajv.compile expects an AnySchema; cast via unknown to satisfy strict types
  const validate = ajv.compile(schema as unknown as JSONSchemaType<Record<string, unknown>>);
  const valid = validate(args);

  if (!valid) {
    const messages = (validate.errors ?? []).map(
      (e) => `${e.instancePath || "/"} ${e.message ?? "validation failed"}`,
    );
    throw new SchemaValidationError(
      messages,
      `Tool argument validation failed: ${messages.join("; ")}`,
    );
  }

  return args;
}
