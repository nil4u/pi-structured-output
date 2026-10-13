import Ajv, { type ErrorObject, type ValidateFunction } from "ajv/dist/ajv.js";
const AjvConstructor: any = Ajv;

export type JsonSchema = {
  $schema?: string; $id?: string; type?: string | string[]; title?: string;
  description?: string; default?: unknown; enum?: unknown[]; const?: unknown;
  properties?: Record<string, JsonSchema>; required?: string[];
  additionalProperties?: boolean | JsonSchema; items?: JsonSchema | JsonSchema[];
  minItems?: number; maxItems?: number; minLength?: number; maxLength?: number;
  pattern?: string; minimum?: number; maximum?: number; exclusiveMinimum?: number;
  exclusiveMaximum?: number; multipleOf?: number; anyOf?: JsonSchema[];
  allOf?: JsonSchema[]; oneOf?: JsonSchema[]; not?: JsonSchema; definitions?: Record<string, JsonSchema>;
  $defs?: Record<string, JsonSchema>; $ref?: string; [key: string]: unknown;
};

const supported = new Set([
  "$schema", "$id", "type", "title", "description", "default", "enum", "const", "properties", "required",
  "additionalProperties", "items", "minItems", "maxItems", "minLength", "maxLength", "pattern", "minimum",
  "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "anyOf", "allOf", "oneOf", "not", "definitions", "$defs", "$ref",
]);

export class StructuredOutputError extends Error {
  readonly code: string; readonly path?: string; readonly details?: unknown;
  constructor(code: string, message: string, path?: string, details?: unknown) {
    super(message); this.name = "StructuredOutputError"; this.code = code; this.path = path; this.details = details;
  }
}

function unsupported(schema: unknown, path = "#"): Array<{ keyword: string; path: string }> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const value = schema as Record<string, unknown>; const found: Array<{ keyword: string; path: string }> = [];
  for (const key of Object.keys(value)) if (!supported.has(key)) found.push({ keyword: key, path: `${path}/${key}` });
  for (const key of ["properties", "definitions", "$defs"]) {
    const children = value[key]; if (children && typeof children === "object" && !Array.isArray(children)) {
      for (const [name, child] of Object.entries(children)) found.push(...unsupported(child, `${path}/${key}/${name}`));
    }
  }
  for (const key of ["items", "not"]) if (value[key]) found.push(...unsupported(value[key], `${path}/${key}`));
  for (const key of ["anyOf", "allOf", "oneOf"]) if (Array.isArray(value[key])) (value[key] as unknown[]).forEach((child, i) => found.push(...unsupported(child, `${path}/${key}/${i}`)));
  return found;
}

export function validateSchema(schema: JsonSchema): void {
  const bad = unsupported(schema);
  if (bad.length) throw new StructuredOutputError("unsupported_schema", `Unsupported JSON Schema keyword ${bad[0]!.keyword} at ${bad[0]!.path}`, bad[0]!.path, bad);
  try { new AjvConstructor({ strict: true, allowUnionTypes: true, allErrors: true }).compile(schema); }
  catch (error) { throw new StructuredOutputError("invalid_schema", error instanceof Error ? error.message : String(error)); }
}

export function compileValueValidator(schema: JsonSchema): ValidateFunction {
  validateSchema(schema); return new AjvConstructor({ allErrors: true, strict: true, allowUnionTypes: true }).compile(schema);
}

export function validateValue(value: unknown, schema: JsonSchema): { valid: true } | { valid: false; errors: ErrorObject[] } {
  const validate = compileValueValidator(schema); return validate(value) ? { valid: true } : { valid: false, errors: validate.errors ?? [] };
}

export function normalizeName(name = "structured_output"): string {
  const normalized = name.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^[-_]+|[-_]+$/g, "").slice(0, 64);
  return normalized || "structured_output";
}
