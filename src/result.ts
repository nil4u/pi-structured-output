import { validateValue, type JsonSchema } from "./schema.js";

export type StructuredOutputResult<T = unknown> = { value: T; text: string; schema: JsonSchema; model?: unknown };
export type ResultMessage = { role?: string; content?: unknown; stopReason?: string; errorMessage?: string; model?: unknown; [key: string]: unknown };
export function textFromMessage(message: ResultMessage): string | undefined {
  if (message.role !== "assistant" || !Array.isArray(message.content)) return undefined;
  const text = message.content.filter((part): part is { type: "text"; text: string } => !!part && typeof part === "object" && (part as any).type === "text" && typeof (part as any).text === "string").map(part => part.text).join("");
  return text || undefined;
}
export function parseResult<T>(message: ResultMessage, schema: JsonSchema): StructuredOutputResult<T> {
  if (message.errorMessage || message.stopReason === "error") throw new Error(message.errorMessage ?? "Provider returned an error");
  if (message.stopReason === "aborted" || message.stopReason === "length" || message.stopReason === "incomplete") throw new Error(`Structured output did not finish: ${message.stopReason}`);
  const text = textFromMessage(message); if (text === undefined) throw new Error("Assistant turn did not contain final text");
  let value: unknown; try { value = JSON.parse(text); } catch { throw new Error("Assistant text is not valid JSON"); }
  const validation = validateValue(value, schema); if (!validation.valid) throw new Error(`Structured output failed schema validation: ${validation.errors.map(error => `${error.instancePath || "#"} ${error.message}`).join(", ")}`);
  return { value: value as T, text, schema, model: message.model };
}
