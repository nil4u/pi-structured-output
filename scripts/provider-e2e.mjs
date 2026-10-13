import { Agent } from "@earendil-works/pi-agent-core";
import { getModel, streamSimple } from "@earendil-works/pi-ai/compat";
import { attachStructuredOutput } from "../dist/index.js";

const apiKey = process.env.E2E_API_KEY;
const provider = process.env.E2E_PROVIDER ?? "e2e-provider";
const api = process.env.E2E_API ?? "openai-completions";
const baseUrl = process.env.E2E_BASE_URL;
const modelId = process.env.E2E_MODEL;
if (!apiKey || !baseUrl || !modelId) throw new Error("E2E_API_KEY, E2E_BASE_URL and E2E_MODEL are required");

const template = getModel("openai", "gpt-4o-mini");
if (!template) throw new Error("Unable to construct a Pi model template");
const model = { ...template, id: modelId, name: modelId, provider, api, baseUrl };
const agent = new Agent({
  streamFn: streamSimple,
  getApiKey: async requestedProvider => requestedProvider === provider ? apiKey : undefined,
  initialState: { model, thinkingLevel: "off", tools: [] },
});
const session = { agent, subscribe: listener => agent.subscribe(event => listener(event)) };
const output = attachStructuredOutput(session, {
  name: "e2e_answer",
  schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false },
});
const original = agent.onPayload;
agent.onPayload = async (payload, currentModel) => {
  const next = await original(payload, currentModel);
  const native = api === "openai-completions" ? next?.response_format?.type === "json_schema" :
    api === "openai-responses" || api === "openai-codex-responses" ? next?.text?.format?.type === "json_schema" :
    api === "anthropic-messages" ? next?.output_config?.format?.type === "json_schema" : false;
  if (!native) throw new Error(`Request did not contain native structured output for ${api}`);
  console.log(`Native structured output: ${api}`);
  return next;
};

await agent.prompt("Return exactly JSON matching the schema. Set answer to e2e-pass.");
await agent.waitForIdle();
const value = output.result()?.value;
console.log(`Provider E2E result: ${JSON.stringify(value)}`);
if (value?.answer !== "e2e-pass") throw new Error(output.error()?.message ?? agent.state.errorMessage ?? "Provider structured output failed");
