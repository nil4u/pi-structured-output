# pi-structured-output

给使用 Pi SDK 编写 agent 的开发者提供原生 structured output。它把 JSON Schema 注入 provider 请求，并在 `turn_end` 对最终 assistant 文本做本地校验；Pi 的工具调用、thinking 和流式执行仍由 Pi 管理。

## 怎么用

需要 Node.js `>=22.19.0` 和 Pi `>=0.83.0 <2.0.0`。安装库及 Pi SDK peer dependencies：

```sh
npm install pi-structured-output \
  @earendil-works/pi-agent-core \
  @earendil-works/pi-ai \
  @earendil-works/pi-coding-agent
```

在创建好的 `AgentSession` 上挂载 controller：

```ts
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai/compat";
import { attachStructuredOutput } from "pi-structured-output";

const model = getModel("openai", "gpt-4o-mini");
if (!model) throw new Error("Model is not available");

const { session } = await createAgentSession({ model });
const output = attachStructuredOutput(session, {
  name: "summary",
  schema: {
    type: "object",
    properties: { summary: { type: "string" } },
    required: ["summary"],
    additionalProperties: false,
  },
});

try {
  await session.prompt("Summarize the repository.");
  await session.waitForIdle();
  const result = output.result();
  if (!result) throw output.error() ?? new Error("No structured result");
  console.log(result.value);
} finally {
  output.detach();
  session.dispose();
}
```

`attachStructuredOutput()` 是严格入口：它包住 `session.agent.onPayload`，在 provider 请求发出前验证原生格式。支持的 `model.api` 和请求字段是：

| `model.api` | 原生字段 |
| --- | --- |
| `openai-responses`、`openai-codex-responses` | `text.format` |
| `openai-completions` | `response_format.json_schema` |
| `anthropic-messages` | `output_config.format` |

`result()` 只有在自然结束、文本是合法 JSON 且通过原始 schema 校验后才有值；失败原因从 `error()` 读取。`setRequest()` 修改下一轮 schema，turn 开始后不能替换当前 schema；`setRequest(undefined)` 清除 schema；`detach()` 恢复原 hook。

schema 会在 controller 内部复制，调用方后续修改传入对象不会改变 provider 请求或本地校验。通用 JSON Schema 校验通过后，adapter 还会按 provider 能力做发送前检查；例如 OpenAI strict structured outputs 要求根 schema 是 object、对象使用 `additionalProperties: false`，并把所有属性列入 `required`。

provider 不支持原生 structured output 时，可以显式使用 prompt fallback：

```ts
const output = attachStructuredOutput(session, { schema }, { mode: "prompt" });
```

这个模式不发送 `response_format` 或 `text.format`，而是把 schema 和最终 JSON 规则加入 system prompt；工具调用仍由 Pi loop 处理，最终文本仍由本地 schema 校验。它是兼容性 fallback，不提供 provider 原生约束保证。

如果模型偶尔返回缺逗号、单引号或截断 JSON，可以显式启用 `jsonrepair`：

```ts
const output = attachStructuredOutput(session, { schema }, {
  mode: "prompt",
  parsing: "repair",
});
```

`parsing` 默认为 `"strict"`。`"repair"` 只修复可恢复的 JSON 文本，修复后仍会执行 `JSON.parse` 和原始 JSON Schema 校验；语义错误、缺失字段和错误类型不会被修复成成功。

## 怎么开发和迭代

代码按职责分在 `src/schema.ts`、`src/adapters.ts`、`src/controller.ts` 和 `src/result.ts`。新增 provider 时实现 `NativeOutputAdapter`，同时补请求字段保留、幂等性、payload guard 和结果解析测试。原始 schema 始终用于本地校验，不能用 prompt 约束替代它。

本地开发：

```sh
npm ci
npm run check
```

`npm run build` 生成 `dist/`；`npm run test:watch` 用于迭代；`npm pack --dry-run` 检查发布内容。peer 兼容范围和 CI 矩阵覆盖 Pi `0.83`、`1.0`、`1.2`。

## 怎么测试

`test/agent.e2e.test.ts` 使用 Pi 官方 faux provider 跑真实 `Agent` loop，不需要凭证；`npm run check` 会运行全部 14 个测试。

真实 provider smoke 使用 [scripts/provider-e2e.mjs](scripts/provider-e2e.mjs)，需要提供：

- `E2E_API_KEY`：provider API key
- `E2E_PROVIDER`：模型的 `provider`
- `E2E_API`：模型的 `api`，支持上述四种 adapter
- `E2E_BASE_URL`：provider endpoint base URL
- `E2E_MODEL`：provider model id

运行：

```sh
E2E_API_KEY="<key>" \
E2E_PROVIDER="my-provider" \
E2E_API="openai-completions" \
E2E_BASE_URL="https://api.example.com/v1" \
E2E_MODEL="my-model" \
npm run test:e2e:provider
```

GitHub Actions 的 `CI` workflow 跑 Node/Pi 矩阵、构建、测试和打包检查；`Provider smoke` workflow 手动触发，从 Secret `E2E_API_KEY` 读取凭证，并接收其余四项配置。发布 `v*` tag 时执行 npm provenance publish。
