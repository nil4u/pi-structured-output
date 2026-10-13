import { normalizeName, StructuredOutputError, type JsonSchema, validateSchema } from "./schema.js";

export type StructuredOutputRequest = { schema: JsonSchema; name?: string };
export type PiModel = { api?: string; provider?: string; baseUrl?: string; [key: string]: unknown };
export type NativeOutputAdapter = { id: string; matches(model: PiModel): boolean; apply(payload: unknown, request: StructuredOutputRequest): unknown; verify(payload: unknown, request: StructuredOutputRequest): boolean };

const clone = <T>(value: T): T => structuredClone(value);
const requestShape = (request: StructuredOutputRequest, adapterId: string) => {
  validateSchema(request.schema);
  if (adapterId === "openai-responses" || adapterId === "openai-completions") validateOpenAiSchema(request.schema);
  return { name: normalizeName(request.name), schema: request.schema };
};
const objectPayload = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Provider payload must be an object");
  return payload as Record<string, unknown>;
};

export const openaiResponsesAdapter: NativeOutputAdapter = {
  id: "openai-responses", matches: model => model.api === "openai-responses" || model.api === "openai-codex-responses",
  apply(payload, request) { const p = clone(objectPayload(payload)); const shape = requestShape(request, this.id); p.text = { ...((p.text as object) ?? {}), format: { type: "json_schema", name: shape.name, strict: true, schema: clone(shape.schema) } }; return p; },
  verify(payload, request) { const p = objectPayload(payload); const format = (p.text as Record<string, unknown> | undefined)?.format as Record<string, unknown> | undefined; const shape = requestShape(request, this.id); return format?.type === "json_schema" && format.name === shape.name && format.strict === true && JSON.stringify(format.schema) === JSON.stringify(shape.schema); },
};

export const openaiCompletionsAdapter: NativeOutputAdapter = {
  id: "openai-completions", matches: model => model.api === "openai-completions",
  apply(payload, request) { const p = clone(objectPayload(payload)); const shape = requestShape(request, this.id); p.response_format = { type: "json_schema", json_schema: { name: shape.name, strict: true, schema: clone(shape.schema) } }; return p; },
  verify(payload, request) { const f = objectPayload(payload).response_format as Record<string, unknown> | undefined; const j = f?.json_schema as Record<string, unknown> | undefined; const shape = requestShape(request, this.id); return f?.type === "json_schema" && j?.name === shape.name && j?.strict === true && JSON.stringify(j.schema) === JSON.stringify(shape.schema); },
};

export const anthropicAdapter: NativeOutputAdapter = {
  id: "anthropic-messages", matches: model => model.api === "anthropic-messages",
  apply(payload, request) { const p = clone(objectPayload(payload)); const shape = requestShape(request, this.id); p.output_config = { ...((p.output_config as object) ?? {}), format: { type: "json_schema", schema: clone(shape.schema) } }; return p; },
  verify(payload, request) { const f = (objectPayload(payload).output_config as Record<string, unknown> | undefined)?.format as Record<string, unknown> | undefined; const shape = requestShape(request, this.id); return f?.type === "json_schema" && JSON.stringify(f.schema) === JSON.stringify(shape.schema); },
};

function validateOpenAiSchema(schema: JsonSchema): void {
  if (schema.type !== "object" || Array.isArray(schema.type) || schema.anyOf || schema.oneOf || schema.allOf || schema.not) {
    throw new StructuredOutputError("provider_schema_unsupported", "OpenAI structured outputs require a root object schema without a root union or composition", "#");
  }
  walkOpenAiSchema(schema, "#");
}

function walkOpenAiSchema(schema: JsonSchema, path: string): void {
  if (Array.isArray(schema.type)) throw new StructuredOutputError("provider_schema_unsupported", "OpenAI structured outputs do not accept union type arrays; use anyOf where supported", `${path}/type`);
  if (schema.oneOf || schema.allOf || schema.not) throw new StructuredOutputError("provider_schema_unsupported", "OpenAI structured outputs do not accept oneOf, allOf, or not", path);
  if (schema.type === "object" || schema.properties) {
    if (schema.additionalProperties !== false) throw new StructuredOutputError("provider_schema_unsupported", "Every OpenAI object schema must set additionalProperties to false", `${path}/additionalProperties`);
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const missing = Object.keys(properties).filter(name => !required.has(name));
    if (missing.length) throw new StructuredOutputError("provider_schema_unsupported", `Every OpenAI object property must be required: ${missing.join(", ")}`, `${path}/required`);
    for (const [name, child] of Object.entries(properties)) walkOpenAiSchema(child, `${path}/properties/${name}`);
  }
  if (schema.items && !Array.isArray(schema.items)) walkOpenAiSchema(schema.items, `${path}/items`);
  for (const key of ["anyOf", "definitions", "$defs"] as const) {
    const value = schema[key];
    if (Array.isArray(value)) value.forEach((child, index) => walkOpenAiSchema(child, `${path}/${key}/${index}`));
    else if (value && typeof value === "object") for (const [name, child] of Object.entries(value)) walkOpenAiSchema(child, `${path}/${key}/${name}`);
  }
}

export const builtinAdapters = [openaiResponsesAdapter, openaiCompletionsAdapter, anthropicAdapter];
export function adapterFor(model: PiModel, adapters = builtinAdapters): NativeOutputAdapter {
  const adapter = adapters.find(candidate => candidate.matches(model)); if (!adapter) throw new Error(`No structured output adapter for API ${model.api ?? "unknown"}`); return adapter;
}
