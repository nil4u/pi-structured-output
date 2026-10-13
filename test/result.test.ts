import { describe, expect, it } from "vitest";
import { parseResult } from "../src/index.js";
const schema = { type: "object", properties: { value: { type: ["string", "number", "boolean", "null"] } }, required: ["value"], additionalProperties: false };
const message = (text: string, stopReason = "stop") => ({ role: "assistant", content: [{ type: "text", text }], stopReason });
describe("results", () => {
  it.each(["null", "false", "0", '""'])("accepts JSON scalar %s", text => expect(parseResult(message(`{"value":${text}}`), schema).value).toEqual({ value: JSON.parse(text) }));
  it("rejects malformed and incomplete output", () => { expect(() => parseResult(message("oops"), schema)).toThrow(/valid JSON/); expect(() => parseResult(message("{}", "length"), schema)).toThrow(/did not finish/); });
});
