import { describe, expect, it } from "vitest";
import { normalizeName, validateSchema, validateValue } from "../src/index.js";

describe("schema", () => {
  const schema = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } as const;
  it("validates draft 7 subset and values", () => { expect(validateValue({ answer: "ok" }, schema).valid).toBe(true); expect(validateValue({}, schema).valid).toBe(false); });
  it("reports unsupported keywords with paths", () => { expect(() => validateSchema({ type: "string", unevaluatedProperties: false })).toThrow(/unevaluatedProperties.*#\/unevaluatedProperties/); });
  it("normalizes provider names", () => { expect(normalizeName(" hello world! ")).toBe("hello_world"); });
});
