import { describe, expect, it } from "vitest";
import { Agent } from "@earendil-works/pi-agent-core";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import { attachStructuredOutput } from "../src/index.js";

describe("Pi agent loop E2E", () => {
  it("injects native format through the real Agent and collects turn_end output", async () => {
    const faux = createFauxCore({ api: "openai-responses", provider: "openai" });
    faux.setResponses([fauxAssistantMessage('{"answer":"e2e-pass"}')]);
    const agent = new Agent({ streamFn: faux.streamSimple, initialState: { model: faux.models[0], thinkingLevel: "off", tools: [] } });
    const session = { agent, subscribe: (listener: (event: any) => void) => agent.subscribe(event => listener(event)) };
    const output = attachStructuredOutput(session, { name: "e2e_answer", schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } });

    await agent.prompt("return structured output");
    await agent.waitForIdle();

    expect(faux.state.callCount).toBe(1);
    expect(output.result()?.value).toEqual({ answer: "e2e-pass" });
    expect(output.error()).toBeUndefined();
  });
});
