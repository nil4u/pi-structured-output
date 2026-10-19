import { normalizeName, type JsonSchema, StructuredOutputError } from "./schema.js";

export type PromptOutputRequest = { schema: JsonSchema; name?: string };
export type PromptModel = { api?: string; [key: string]: unknown };

export function applyPromptOutput(payload: unknown, model: PromptModel, request: PromptOutputRequest): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new StructuredOutputError("prompt_payload_unsupported", "Provider payload must be an object");
  }
  const next = structuredClone(payload) as Record<string, unknown>;
  const instruction = promptInstruction(request);
  if (model.api === "anthropic-messages") {
    next.system = appendAnthropicSystem(next.system, instruction);
    return next;
  }
  if (model.api === "openai-responses" || model.api === "openai-codex-responses") {
    if (Array.isArray(next.input)) {
      next.input = insertAfterLastSystem(next.input, { role: "system", content: [{ type: "input_text", text: instruction }] });
      return next;
    }
    next.instructions = appendText(next.instructions, instruction);
    return next;
  }
  if (Array.isArray(next.messages)) {
    next.messages = insertAfterLastSystem(next.messages, { role: "system", content: instruction });
    return next;
  }
  throw new StructuredOutputError("prompt_payload_unsupported", `Cannot inject structured output instructions into API ${model.api ?? "unknown"}`);
}

function insertAfterLastSystem(items: unknown[], instruction: unknown): unknown[] {
  let lastSystem = -1;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item && typeof item === "object" && ((item as { role?: unknown }).role === "system" || (item as { role?: unknown }).role === "developer")) lastSystem = index;
  }
  const insertAt = lastSystem === -1 ? 0 : lastSystem + 1;
  return [...items.slice(0, insertAt), instruction, ...items.slice(insertAt)];
}

function appendText(existing: unknown, instruction: string): string {
  return typeof existing === "string" && existing.length > 0 ? `${existing}\n\n${instruction}` : instruction;
}

function appendAnthropicSystem(existing: unknown, instruction: string): unknown {
  if (Array.isArray(existing)) return [...existing, { type: "text", text: instruction }];
  return appendText(existing, instruction);
}

function promptInstruction(request: PromptOutputRequest): string {
  const name = normalizeName(request.name);
  return [
    "Structured output instructions:",
    "Use available tools normally when they are needed to complete the task.",
    `When responding, return one valid JSON value for ${name}. Do not add a report, progress update, Markdown fence, commentary, or explanation around the JSON. Put human-readable text inside the JSON fields required by the schema.`,
    `The final JSON must validate against this JSON Schema: ${JSON.stringify(request.schema)}`,
  ].join("\n");
}
