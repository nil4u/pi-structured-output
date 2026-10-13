import { describe, expect, it } from "vitest";
import { anthropicAdapter, openaiCompletionsAdapter, openaiResponsesAdapter } from "../src/index.js";
const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
const base = { model: "x", tools: [{ type: "function", function: { name: "tool" } }], thinking: { type: "enabled" } };
describe("provider adapters", () => {
  it.each([[openaiResponsesAdapter, { api: "openai-responses" }], [openaiCompletionsAdapter, { api: "openai-completions" }], [anthropicAdapter, { api: "anthropic-messages" }]] as const)("preserves payload and is idempotent", (adapter, model) => {
    const one = adapter.apply(base, { schema, name: "result" }); const two = adapter.apply(one, { schema, name: "result" });
    expect(one).toMatchObject({ tools: base.tools, thinking: base.thinking }); expect(adapter.verify(one, { schema, name: "result" })).toBe(true); expect(two).toEqual(one);
  });
  it("rejects OpenAI schemas outside native strict mode", () => {
    expect(() => openaiResponsesAdapter.apply({}, { schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] } })).toThrow(/additionalProperties/);
    expect(() => openaiCompletionsAdapter.apply({}, { schema: { type: "object", properties: { answer: { type: "string" } }, additionalProperties: false } })).toThrow(/must be required/);
    expect(() => openaiResponsesAdapter.apply({}, { schema: { type: "array", items: { type: "string" } } })).toThrow(/root object/);
  });
});
