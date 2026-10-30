import { validateValue, type JsonSchema } from "./schema.js";
import { jsonrepair } from "jsonrepair";

export type StructuredOutputResult<T = unknown> = { value: T; text: string; schema: JsonSchema; model?: unknown };
export type ResultMessage = { role?: string; content?: unknown; stopReason?: string; errorMessage?: string; model?: unknown; [key: string]: unknown };
export function textFromMessage(message: ResultMessage): string | undefined {
  if (message.role !== "assistant" || !Array.isArray(message.content)) return undefined;
  const text = message.content.filter((part): part is { type: "text"; text: string } => !!part && typeof part === "object" && (part as any).type === "text" && typeof (part as any).text === "string").map(part => part.text).join("");
  return text || undefined;
}
export function parseResult<T>(message: ResultMessage, schema: JsonSchema): StructuredOutputResult<T> {
  if (message.errorMessage || message.stopReason === "error") throw new Error(message.errorMessage ?? "Provider returned an error");
  if (message.stopReason === "toolUse" || hasToolCall(message)) throw new Error("Assistant turn requested a tool and is not a final structured output");
  if (message.stopReason === "aborted" || message.stopReason === "length" || message.stopReason === "incomplete") throw new Error(`Structured output did not finish: ${message.stopReason}`);
  const text = textFromMessage(message); if (text === undefined) throw new Error("Assistant turn did not contain final text");
  // Strict parses run first so an error from cleanly extracted JSON is not masked by jsonrepair coercing surrounding prose.
  const whole = text.trim(); const extracted = extractedCandidates(text);
  let firstValidationError: string | undefined;
  for (const [candidates, parse] of [[[whole, ...extracted], parseStrict], [[...extracted, whole], parseRepaired]] as const) {
    for (const candidate of new Set(candidates.filter(Boolean))) {
      const parsed = parse(candidate);
      if (!parsed) continue;
      const validation = validateValue(parsed.value, schema);
      if (validation.valid) return { value: parsed.value as T, text: parsed.text, schema, model: message.model };
      firstValidationError ??= formatValidationError(validation.errors);
    }
  }
  if (firstValidationError) throw new Error(`Structured output failed schema validation: ${firstValidationError}`);
  throw new Error("Assistant text is not valid JSON after repair");
}

function extractedCandidates(text: string): string[] {
  const candidates: string[] = [];
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) candidates.push(match[1]!);
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{" && text[start] !== "[") continue;
    const end = balancedJsonEnd(text, start);
    if (end !== -1) candidates.push(text.slice(start, end + 1));
  }
  return candidates;
}

function balancedJsonEnd(text: string, start: number): number {
  const stack: string[] = []; let quoted = false; let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; continue; }
    if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
    else if (char === "}" || char === "]") { if (stack.pop() !== char) return -1; if (stack.length === 0) return index; }
  }
  return -1;
}

function parseStrict(candidate: string): { value: unknown; text: string } | undefined {
  try { return { value: JSON.parse(candidate), text: candidate }; } catch { return undefined; }
}

function parseRepaired(candidate: string): { value: unknown; text: string } | undefined {
  try {
    const repaired = jsonrepair(candidate);
    return { value: JSON.parse(repaired), text: repaired };
  } catch { return undefined; }
}

function formatValidationError(errors: { instancePath: string; message?: string }[]): string {
  return errors.map(error => `${error.instancePath || "#"} ${error.message}`).join(", ");
}

function hasToolCall(message: ResultMessage): boolean {
  return Array.isArray(message.content) && message.content.some(part => part && typeof part === "object" && (part as { type?: unknown }).type === "toolCall");
}
