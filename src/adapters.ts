import { normalizeName, type JsonSchema, validateSchema } from "./schema.js";

export type StructuredOutputRequest = { schema: JsonSchema; name?: string };
export type PiModel = { api?: string; provider?: string; baseUrl?: string; [key: string]: unknown };
export type NativeOutputAdapter = { id: string; matches(model: PiModel): boolean; apply(payload: unknown, request: StructuredOutputRequest): unknown; verify(payload: unknown, request: StructuredOutputRequest): boolean };

const clone = <T>(value: T): T => structuredClone(value);
const requestShape = (request: StructuredOutputRequest) => { validateSchema(request.schema); return { name: normalizeName(request.name), schema: request.schema }; };
const objectPayload = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Provider payload must be an object");
  return payload as Record<string, unknown>;
};

export const openaiResponsesAdapter: NativeOutputAdapter = {
  id: "openai-responses", matches: model => model.api === "openai-responses" || model.api === "openai-codex-responses",
  apply(payload, request) { const p = clone(objectPayload(payload)); const shape = requestShape(request); p.text = { ...((p.text as object) ?? {}), format: { type: "json_schema", name: shape.name, strict: true, schema: clone(shape.schema) } }; return p; },
  verify(payload, request) { const p = objectPayload(payload); const format = (p.text as Record<string, unknown> | undefined)?.format as Record<string, unknown> | undefined; const shape = requestShape(request); return format?.type === "json_schema" && format.name === shape.name && format.strict === true && JSON.stringify(format.schema) === JSON.stringify(shape.schema); },
};

export const openaiCompletionsAdapter: NativeOutputAdapter = {
  id: "openai-completions", matches: model => model.api === "openai-completions",
  apply(payload, request) { const p = clone(objectPayload(payload)); const shape = requestShape(request); p.response_format = { type: "json_schema", json_schema: { name: shape.name, strict: true, schema: clone(shape.schema) } }; return p; },
  verify(payload, request) { const f = objectPayload(payload).response_format as Record<string, unknown> | undefined; const j = f?.json_schema as Record<string, unknown> | undefined; const shape = requestShape(request); return f?.type === "json_schema" && j?.name === shape.name && j?.strict === true && JSON.stringify(j.schema) === JSON.stringify(shape.schema); },
};

export const anthropicAdapter: NativeOutputAdapter = {
  id: "anthropic-messages", matches: model => model.api === "anthropic-messages",
  apply(payload, request) { const p = clone(objectPayload(payload)); const shape = requestShape(request); p.output_config = { ...((p.output_config as object) ?? {}), format: { type: "json_schema", schema: clone(shape.schema) } }; return p; },
  verify(payload, request) { const f = (objectPayload(payload).output_config as Record<string, unknown> | undefined)?.format as Record<string, unknown> | undefined; const shape = requestShape(request); return f?.type === "json_schema" && JSON.stringify(f.schema) === JSON.stringify(shape.schema); },
};

export const builtinAdapters = [openaiResponsesAdapter, openaiCompletionsAdapter, anthropicAdapter];
export function adapterFor(model: PiModel, adapters = builtinAdapters): NativeOutputAdapter {
  const adapter = adapters.find(candidate => candidate.matches(model)); if (!adapter) throw new Error(`No structured output adapter for API ${model.api ?? "unknown"}`); return adapter;
}
