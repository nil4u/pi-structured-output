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
