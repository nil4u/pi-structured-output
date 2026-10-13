import { describe, expect, it } from "vitest";
import { attachStructuredOutput } from "../src/index.js";
const schema = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false };
describe("strict controller", () => {
  it("guards the final payload and collects validated result", async () => {
    let listener: ((event: any) => void) | undefined; const session: any = { agent: {}, subscribe(fn: any) { listener = fn; return () => { listener = undefined; }; } };
    const controller = attachStructuredOutput(session, { schema, name: "answer" }); const payload = await session.agent.onPayload({ tools: ["x"] }, { api: "openai-responses" });
    expect(payload.text.format).toMatchObject({ type: "json_schema", name: "answer", strict: true }); listener?.({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: '{"answer":"ok"}' }], stopReason: "stop" } });
    expect(controller.result()?.value).toEqual({ answer: "ok" }); controller.detach(); expect(session.agent.onPayload).toBeUndefined();
  });
  it("rejects unknown providers before a request can be sent", async () => { const session: any = { agent: {} }; attachStructuredOutput(session, { schema }); await expect(session.agent.onPayload({}, { api: "unknown" })).rejects.toThrow(/No structured output adapter/); });
  it("clears the previous result when a later turn fails", () => {
    let listener: ((event: any) => void) | undefined;
    const session: any = { agent: {}, subscribe(fn: any) { listener = fn; return () => { listener = undefined; }; } };
    const controller = attachStructuredOutput(session, { schema });
    listener?.({ type: "turn_start" });
    listener?.({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: '{"answer":"previous"}' }], stopReason: "stop" } });
    expect(controller.result()?.value).toEqual({ answer: "previous" });
    listener?.({ type: "turn_start" });
    listener?.({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: "invalid JSON" }], stopReason: "stop" } });
    expect(controller.result()).toBeUndefined();
    expect(controller.error()?.message).toMatch(/valid JSON/);
  });
  it("keeps the request schema isolated from caller mutations", async () => {
    const input = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false };
    const session: any = { agent: {} };
    const controller = attachStructuredOutput(session, { schema: input, name: "answer" });
    input.properties.answer.type = "number";
    const exposed = controller.request()!;
    exposed.schema.properties!.answer!.type = "number";
    const payload = await session.agent.onPayload({}, { api: "openai-completions" });
    expect(payload.response_format.json_schema.schema.properties.answer.type).toBe("string");
  });
});
