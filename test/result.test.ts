import { describe, expect, it } from "vitest";
import { parseResult } from "../src/index.js";
const schema = { type: "object", properties: { value: { type: ["string", "number", "boolean", "null"] } }, required: ["value"], additionalProperties: false };
const message = (text: string, stopReason = "stop") => ({ role: "assistant", content: [{ type: "text", text }], stopReason });
describe("results", () => {
  it.each(["null", "false", "0", '""'])("accepts JSON scalar %s", text => expect(parseResult(message(`{"value":${text}}`), schema).value).toEqual({ value: JSON.parse(text) }));
  it("rejects unrecoverable output and incomplete output", () => { expect(() => parseResult(message("oops"), schema)).toThrow(/schema validation/); expect(() => parseResult(message("{}", "length"), schema)).toThrow(/did not finish/); });
  it("rejects tool call turns even when they contain text", () => {
    const toolTurn = { role: "assistant", content: [{ type: "text", text: '{"value":"intermediate"}' }, { type: "toolCall", id: "call-1", name: "lookup", arguments: {} }], stopReason: "toolUse" };
    expect(() => parseResult(toolTurn, schema)).toThrow(/requested a tool/);
    expect(() => parseResult({ ...toolTurn, stopReason: "stop" }, schema)).toThrow(/requested a tool/);
  });
  it("repairs recoverable malformed JSON by default", () => {
    const malformed = message("{'value': 'fixed',}");
    expect(parseResult(malformed, schema).value).toEqual({ value: "fixed" });
  });
  it("extracts and repairs JSON surrounded by prose", () => {
    const mixed = message('报告已经生成。\n\n```json\n{"value":"from-json",}\n```');
    expect(parseResult(mixed, schema).value).toEqual({ value: "from-json" });
  });
  it("reports the extracted JSON's validation error when prose follows a code fence", () => {
    const limited = { type: "object", properties: { summary: { type: "string", maxLength: 5 } }, required: ["summary"], additionalProperties: false };
    const fencedThenProse = message('```json\n{"summary":"too long"}\n```\n\nWhy:\n- **summary**: kept short');
    expect(() => parseResult(fencedThenProse, limited)).toThrow(/\/summary must NOT have more than 5 characters/);
  });
});
