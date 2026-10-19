import { adapterFor, type NativeOutputAdapter, type PiModel, type StructuredOutputRequest } from "./adapters.js";
import { applyPromptOutput } from "./prompt.js";
import { parseResult, type ResultMessage, type StructuredOutputResult } from "./result.js";
import { StructuredOutputError, validateSchema } from "./schema.js";

export type StructuredOutputController<T = unknown> = { setRequest(request: StructuredOutputRequest | undefined): void; request(): StructuredOutputRequest | undefined; result(): StructuredOutputResult<T> | undefined; error(): StructuredOutputError | undefined; detach(): void };
export type SessionLike = { agent: { onPayload?: (payload: unknown, model?: PiModel) => unknown | Promise<unknown> }; subscribe?: (listener: (event: any) => void) => () => void };
export type StructuredOutputMode = "native" | "prompt";

const cloneRequest = (request: StructuredOutputRequest): StructuredOutputRequest => structuredClone(request);

export function attachStructuredOutput<T = unknown>(session: SessionLike, initial: StructuredOutputRequest, options: { adapters?: NativeOutputAdapter[]; mode?: StructuredOutputMode } = {}): StructuredOutputController<T> {
  validateSchema(initial.schema); let request: StructuredOutputRequest | undefined = cloneRequest(initial); let active: StructuredOutputRequest | undefined; let latest: StructuredOutputResult<T> | undefined; let failure: StructuredOutputError | undefined; let detached = false;
  const original = session.agent.onPayload;
  const guard = async (payload: unknown, model?: PiModel) => {
    if (!request) return original?.(payload, model) ?? payload;
    if (active && active !== request) throw new StructuredOutputError("request_locked", "Cannot replace structured output while a turn is running");
    active = request; const transformed = await original?.(payload, model) ?? payload;
    if (options.mode === "prompt") return applyPromptOutput(transformed, model ?? {}, request);
    const adapter = adapterFor(model ?? {}, options.adapters); const next = adapter.apply(transformed, request);
    if (!adapter.verify(next, request)) throw new StructuredOutputError("payload_guard", `Adapter ${adapter.id} did not produce the requested native schema`); return next;
  };
  session.agent.onPayload = guard;
  const unsubscribe = session.subscribe?.((event: any) => {
    if (event.type === "turn_start") { latest = undefined; failure = undefined; if (request) active = request; }
    if (event.type === "turn_end" && event.message?.role === "assistant") { try { if (active) latest = parseResult<T>(event.message, active.schema); failure = undefined; } catch (error) { latest = undefined; failure = error instanceof StructuredOutputError ? error : new StructuredOutputError("result", error instanceof Error ? error.message : String(error)); } }
    if (event.type === "agent_settled") active = undefined;
  });
  return { setRequest(next) { if (active) throw new StructuredOutputError("request_locked", "Cannot replace structured output while a turn is running"); if (next) { validateSchema(next.schema); request = cloneRequest(next); } else request = undefined; latest = undefined; failure = undefined; }, request: () => request ? cloneRequest(request) : undefined, result: () => latest ? { ...latest, schema: structuredClone(latest.schema) } : undefined, error: () => failure, detach() { if (detached) return; detached = true; session.agent.onPayload = original; unsubscribe?.(); } };
}
