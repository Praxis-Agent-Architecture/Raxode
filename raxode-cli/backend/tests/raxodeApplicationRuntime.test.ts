import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
} from "@praxis-ai/praxis/application-layer";
import type { AnthropicV1MessagesRequestEnvelope } from "@praxis-ai/praxis/provider/actualInvocationLayer/anthropic/v1_messages";
import type { OpenAIV1ResponsesRequestEnvelope } from "@praxis-ai/praxis/provider/actualInvocationLayer/openai/v1_responses";
import type { AuthEnvelope } from "@praxis-ai/praxis/provider/authProfileLayer/authEnvelope";
import {
  createRaxodeBackend,
  createRaxodeBackendRestServer,
  createRaxodeBackendWebSocketServer,
} from "../raxodeBackend.js";

test("raxode backend runs through applicationLayer", async () => {
  const backend = await createRaxodeBackend({
    now: () => "2026-05-10T00:00:00.000Z",
  });
  const result = await backend.run({
    task: "dry-run readiness",
    mode: "dry-run",
    sessionId: "session.raxode.test",
    permissionProfile: "bapr",
  });
  assert.equal(result.ok, true);
  assert.equal(result.view.applicationId, "application.raxode.coding");
  assert.equal(result.view.sessionId, "session.raxode.test");
  assert.equal(result.view.agentId, "agent.raxode.coding");
  assert.equal(result.view.permissionProfile, "bapr");
  assert.equal(result.view.model.contextWindowTokens, 400_000);
  assert.equal(result.view.model.maxInputTokens, 272_000);
  assert.equal(result.view.model.inputBudgetThreshold, 0.95);
  assert.equal(result.view.model.usableInputTokens, 258_400);
  assert.equal(result.view.tools.mounted, 175);
});

test("raxode application runtime includes prior same-session turns in the next provider prompt", async () => {
  const providerBodies: unknown[] = [];
  const events: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
  const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
    applicationId: "application.raxode.coding",
    mode: "live",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
        providerBodies.push(envelope.body);
        return {
          id: providerBodies.length === 1 ? "resp-history-1" : "resp-history-2",
          output_text: providerBodies.length === 1
            ? "已记住暗号 BLUE-ORBIT。"
            : "刚才的暗号是 BLUE-ORBIT。",
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const transport = createLocalApplicationTransport(created.runtime);
  const unsubscribe = transport.subscribe((event) => events.push(event));
  const sessionId = "session.raxode.history.test";
  let firstPromptCacheKey = "";
  let secondContext: { source?: string; activeTokens?: number; promptTokens?: number } | undefined;
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: process.cwd(),
      mode: "live",
    });
    assert.equal(start.ok, true);
    const first = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "请记住暗号 BLUE-ORBIT。",
        cwd: process.cwd(),
      },
    });
    assert.equal(first.ok, true);
    const firstBody = JSON.stringify(providerBodies[0]);
    assert.match(firstBody, /You are the Raxode coding agent/u);
    assert.match(firstBody, /choose the file tool before the command tool/u);
    assert.match(firstBody, /Do not pack project source into a Shell heredoc/u);
    assert.match(firstBody, /Implementation\/build requests must be executed in the workspace with tools/u);
    assert.match(firstBody, /The current workspace is the default target when the user does not name a path/u);
    assert.match(firstBody, /A missing or empty project structure is a reason to create files/u);
    assert.match(firstBody, /make Code tools the first write path after the workspace scan/u);
    assert.match(firstBody, /shell steps must never create or modify workspace files/u);
    assert.match(firstBody, /file creation and edits must be expressed as code\.\* tool inputs/u);
    assert.match(firstBody, /Do not tell the user.*save this as/u);
    const firstBodyRecord = providerBodies[0] as { prompt_cache_key?: string };
    assert.match(firstBodyRecord.prompt_cache_key ?? "", /^praxis-[a-f0-9]{32}$/u);
    firstPromptCacheKey = firstBodyRecord.prompt_cache_key ?? "";
    const second = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "刚才的暗号是什么？",
        cwd: process.cwd(),
      },
    });
    assert.equal(second.ok, true);
    secondContext = second.view.context;
  } finally {
    unsubscribe();
  }
  assert.equal(providerBodies.length, 2);
  const secondBodyRecord = providerBodies[1] as { prompt_cache_key?: string };
  assert.equal(secondBodyRecord.prompt_cache_key, firstPromptCacheKey);
  assert.equal((providerBodies[0] as { previous_response_id?: string }).previous_response_id, undefined);
  assert.equal((providerBodies[1] as { previous_response_id?: string }).previous_response_id, undefined);
  const secondBody = JSON.stringify(providerBodies[1]);
  assert.match(secondBody, /Previous conversation in this Raxode application session/u);
  assert.match(secondBody, /请记住暗号 BLUE-ORBIT/u);
  assert.match(secondBody, /已记住暗号 BLUE-ORBIT/u);
  assert.match(secondBody, /Current user request/u);
  assert.match(secondBody, /刚才的暗号是什么/u);
  assert.ok(secondContext);
  assert.equal(secondContext.source, "application.history.estimate");
  assert.ok((secondContext.activeTokens ?? 0) > 0);
  assert.ok((secondContext.promptTokens ?? 0) > 0);
  const completedModelEvents = events
    .map((event) => event as {
      kind?: string;
      metadata?: {
        modelPhase?: string;
        providerResponseId?: string;
        previousProviderResponseId?: string;
        cacheDebug?: {
          comparisonToPrevious?: {
            stablePrefixChanged?: boolean;
            dynamicPayloadChanged?: boolean;
            changedFingerprintKeys?: readonly string[];
          };
        };
      };
    })
    .filter((event) => event.kind === "model" && event.metadata?.modelPhase === "completed");
  assert.equal(completedModelEvents.length, 2);
  assert.equal(completedModelEvents[0]?.metadata?.providerResponseId, "resp-history-1");
  assert.equal(completedModelEvents[0]?.metadata?.previousProviderResponseId, undefined);
  assert.equal(completedModelEvents[1]?.metadata?.providerResponseId, "resp-history-2");
  assert.equal(completedModelEvents[1]?.metadata?.previousProviderResponseId, undefined);
  assert.equal(completedModelEvents[0]?.metadata?.cacheDebug?.comparisonToPrevious, undefined);
  assert.equal(completedModelEvents[1]?.metadata?.cacheDebug?.comparisonToPrevious?.stablePrefixChanged, false);
  assert.equal(completedModelEvents[1]?.metadata?.cacheDebug?.comparisonToPrevious?.dynamicPayloadChanged, true);
  assert.ok(completedModelEvents[1]?.metadata?.cacheDebug?.comparisonToPrevious?.changedFingerprintKeys?.includes("inputHash"));
});

test("raxode application runtime builds streaming Anthropic messages body with configured output budget", async () => {
  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
  const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
    applicationId: "application.raxode.coding",
    mode: "live",
    provider: "anthropic",
    endpointShape: "messages",
    providerRoute: "anthropic_messages",
    baseURL: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4-pro",
    reasoningEffort: "high",
    maxOutputTokens: 384_000,
    permissionProfile: "bapr",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      provider: "anthropic",
      endpointShape: "messages",
      providerRoute: "anthropic_messages",
      anthropicMessagesCaller: async (envelope: AnthropicV1MessagesRequestEnvelope) => {
        providerBodies.push(envelope.body);
        return [
          "event: message_start",
          "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-anthropic-test\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"deepseek-v4-pro\",\"content\":[],\"usage\":{\"input_tokens\":101,\"cache_creation_input_tokens\":9,\"cache_read_input_tokens\":91,\"output_tokens\":1}}}",
          "",
          "event: content_block_start",
          "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
          "",
          "event: content_block_delta",
          "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"ok\"}}",
          "",
          "event: message_delta",
          "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":7}}",
          "",
          "event: message_stop",
          "data: {\"type\":\"message_stop\"}",
          "",
          "data: [DONE]",
          "",
        ].join("\n");
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const transport = createLocalApplicationTransport(created.runtime);
  const sessionId = "session.raxode.anthropic.body.test";
  const start = await transport.dispatch({
    type: "application.start",
    sessionId,
    cwd: process.cwd(),
    mode: "live",
  });
  assert.equal(start.ok, true);
  const turn = await transport.dispatch({
    type: "application.submitTurn",
    sessionId,
    mode: "live",
    input: {
      type: "application.input",
      text: "say ok",
      cwd: process.cwd(),
    },
  });
  assert.equal(turn.ok, true);
  assert.equal(providerBodies.length, 1);
  const body = providerBodies[0] as {
    model?: string;
    max_tokens?: number;
    stream?: boolean;
    thinking?: { type?: string };
    output_config?: { effort?: string };
    tools?: unknown[];
    messages?: Array<{ role?: string }>;
  };
  assert.equal(body.model, "deepseek-v4-pro");
  assert.equal(body.max_tokens, 384_000);
  assert.equal(body.stream, true);
  assert.deepEqual(body.thinking, { type: "enabled" });
  assert.deepEqual(body.output_config, { effort: "max" });
  assert.ok((body.tools?.length ?? 0) > 0);
  assert.equal(body.messages?.[0]?.role, "user");
  assert.equal(turn.view.usage?.inputTokens, 201);
  assert.equal(turn.view.usage?.cachedInputTokens, 91);
  assert.equal(turn.view.usage?.outputTokens, 7);
  assert.equal(turn.view.usage?.estimated, false);
});

test("raxode application runtime separates provider cache miss from stable PromptPack drift", async () => {
  const events: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
  let calls = 0;
  const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
    applicationId: "application.raxode.coding",
    mode: "live",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      providerCaller: async () => {
        calls += 1;
        const cachedTokens = calls === 1 ? 40 : 0;
        return {
          status: 200,
          headers: {
            "x-codex-turn-state": `turn-state-${calls}`,
            "x-oai-request-id": `req-cache-${calls}`,
          },
          body: [
            `data: {"type":"response.output_text.delta","delta":"cache check ${calls}"}`,
            "",
            `data: {"type":"response.completed","response":{"id":"resp-cache-${calls}","usage":{"input_tokens":44,"output_tokens":7,"total_tokens":51,"input_tokens_details":{"cached_tokens":${cachedTokens}}}}}`,
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
          providerRawShapePromoted: false,
          publicSafe: true,
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const transport = createLocalApplicationTransport(created.runtime);
  const unsubscribe = transport.subscribe((event) => events.push(event));
  const sessionId = "session.raxode.cache-diagnosis.test";
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: process.cwd(),
      mode: "live",
    });
    assert.equal(start.ok, true);
    assert.equal((await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "cache first",
        cwd: process.cwd(),
      },
    })).ok, true);
    assert.equal((await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "cache second",
        cwd: process.cwd(),
      },
    })).ok, true);
  } finally {
    unsubscribe();
  }

  const completedModelEvents = events
    .map((event) => event as {
      kind?: string;
      metadata?: {
        modelPhase?: string;
        providerRouting?: {
          responseCodexTurnState?: string;
          responseHeaderNames?: readonly string[];
          responseRequestId?: string;
        };
        cacheDebug?: {
          comparisonToPrevious?: {
            stablePrefixChanged?: boolean;
            toolsChanged?: boolean;
          };
          observedUsage?: {
            diagnosis?: string;
            cachedInputTokens?: number;
            reasons?: readonly string[];
          };
        };
      };
    })
    .filter((event) => event.kind === "model" && event.metadata?.modelPhase === "completed");

  assert.equal(completedModelEvents.length, 2);
  assert.equal(completedModelEvents[0]?.metadata?.providerRouting?.responseCodexTurnState, "present");
  assert.equal(completedModelEvents[0]?.metadata?.providerRouting?.responseRequestId, "req-cache-1");
  assert.ok(completedModelEvents[0]?.metadata?.providerRouting?.responseHeaderNames?.includes("x-codex-turn-state"));
  assert.equal(completedModelEvents[1]?.metadata?.cacheDebug?.comparisonToPrevious?.stablePrefixChanged, false);
  assert.equal(completedModelEvents[1]?.metadata?.cacheDebug?.comparisonToPrevious?.toolsChanged, false);
  assert.equal(completedModelEvents[1]?.metadata?.cacheDebug?.observedUsage?.cachedInputTokens, 0);
  assert.equal(
    completedModelEvents[1]?.metadata?.cacheDebug?.observedUsage?.diagnosis,
    "provider-cache-miss-with-stable-prefix",
  );
  assert.ok(
    completedModelEvents[1]?.metadata?.cacheDebug?.observedUsage?.reasons?.some((reason) =>
      reason.includes("provider cache routing/reuse miss")),
  );
});

test("raxode application runtime injects expanded BaseTool manuals for one model turn", async () => {
  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
  let calls = 0;
  const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
    applicationId: "application.raxode.coding",
    mode: "live",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
        calls += 1;
        providerBodies.push(envelope.body);
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "praxis_expand_tool_context",
              call_id: "expand-code-read",
              arguments: JSON.stringify({
                targetKind: "tool",
                toolId: "code.read",
                reason: "need code read manual",
              }),
            }],
          };
        }
        return { output_text: calls === 2 ? "code.read context expanded" : "same-session tool summary retained" };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const transport = createLocalApplicationTransport(created.runtime);
  const sessionId = "session.raxode.tool-context-retention.test";
  const start = await transport.dispatch({
    type: "application.start",
    sessionId,
    cwd: process.cwd(),
    mode: "live",
  });
  assert.equal(start.ok, true);

  const first = await transport.dispatch({
    type: "application.submitTurn",
    sessionId,
    mode: "live",
    input: {
      type: "application.input",
      text: "展开 code.read 工具上下文",
      cwd: process.cwd(),
    },
  });
  assert.equal(first.ok, true);
  const second = await transport.dispatch({
    type: "application.submitTurn",
    sessionId,
    mode: "live",
    input: {
      type: "application.input",
      text: "下一轮应该保留 code.read",
      cwd: process.cwd(),
    },
  });
  assert.equal(second.ok, true);

  const firstProviderTools = (providerBodies[0] as { tools?: readonly { name?: string }[] }).tools ?? [];
  const secondProviderTools = (providerBodies[1] as { tools?: readonly { name?: string }[] }).tools ?? [];
  const retainedProviderTools = (providerBodies[2] as { tools?: readonly { name?: string }[] }).tools ?? [];
  assert.equal(firstProviderTools.some((item) => item.name === "praxis_tool_code_read"), true);
  assert.equal(firstProviderTools.some((item) => item.name === "praxis_expand_tool_context"), true);
  assert.equal(secondProviderTools.some((item) => item.name === "praxis_tool_code_read"), true);
  assert.equal(retainedProviderTools.some((item) => item.name === "praxis_tool_code_read"), true);
  assert.match(JSON.stringify(providerBodies[1]), /baseTool:manual:tool:code\.read/u);
  assert.doesNotMatch(JSON.stringify(providerBodies[2]), /baseTool:manual:tool:code\.read/u);
  assert.match(JSON.stringify(providerBodies[2]), /baseTool:summary:tool:code\.read/u);
});

test("raxode application runtime pre-compacts session history when previous provider context is near the limit", async () => {
  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
  const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
    applicationId: "application.raxode.coding",
    mode: "live",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
        providerBodies.push(envelope.body);
        const index = providerBodies.length;
        return {
          status: 200,
          headers: {},
          body: [
            `data: {"type":"response.output_text.delta","delta":"reply ${index}"}`,
            "",
            'data: {"type":"response.completed","response":{"usage":{"input_tokens":260000,"output_tokens":3}}}',
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
          providerRawShapePromoted: false,
          publicSafe: true,
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const transport = createLocalApplicationTransport(created.runtime);
  const sessionId = "session.raxode.precompact.test";
  await transport.dispatch({
    type: "application.start",
    sessionId,
    cwd: process.cwd(),
    mode: "live",
  });

  let latest = await transport.dispatch({
    type: "application.submitTurn",
    sessionId,
    mode: "live",
    input: {
      type: "application.input",
      text: "message 1",
      cwd: process.cwd(),
    },
  });
  assert.equal(latest.ok, true);
  for (let index = 2; index <= 5; index += 1) {
    latest = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: `message ${index}`,
        cwd: process.cwd(),
      },
    });
    assert.equal(latest.ok, true);
  }

  assert.equal(providerBodies.length, 5);
  const compactionEvent = latest.view.events.find((event) => event.eventId === "turn.5.context.compacted");
  assert.ok(compactionEvent);
  assert.equal(compactionEvent.metadata?.phase, "pre-turn");
  assert.equal(compactionEvent.metadata?.reason, "previous-provider-context-limit");
  assert.equal(latest.view.context?.compacted, true);
  const fifthBody = JSON.stringify(providerBodies[4]);
  assert.match(fifthBody, /Compacted prior context/u);
  assert.match(fifthBody, /message 5/u);
});

test("raxode application runtime does not pre-compact only because prior turn aggregate usage exceeds the limit", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-no-aggregate-precompact-"));
  const imagePath = path.join(workspace, "screenshot.png");
  await writeFile(
    imagePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "bapr",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyText = JSON.stringify(envelope.body);
          if (bodyText.includes("input_image")) {
            return {
              output_text: "The image contains a tiny test pixel.",
              usage: { input_tokens: 100_000, output_tokens: 4 },
            };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.viewImage",
                call_id: "omni-view-image-call",
                arguments: JSON.stringify({
                  target: { imagePath, mediaType: "image/png", detail: "low" },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
              usage: { input_tokens: 260_000, output_tokens: 2 },
            };
          }
          return {
            output_text: `reply ${providerBodies.length}`,
            usage: { input_tokens: 100_000, output_tokens: 3 },
          };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.no-aggregate-precompact.test";
    await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });

    const first = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "message 1",
        cwd: workspace,
      },
    });
    assert.equal(first.ok, true);
    assert.equal(first.view.usage?.inputTokens, 360_000);
    assert.equal(first.view.usage?.lastInputTokens, 100_000);
    const providerCallsAfterFirstTurn = providerBodies.length;

    const latest = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "message 2",
        cwd: workspace,
      },
    });
    assert.equal(latest.ok, true);
    assert.equal(latest.view.usage?.inputTokens, 100_000);
    assert.equal(latest.view.usage?.lastInputTokens, 100_000);
    assert.equal(latest.view.events.some((event) => event.eventId === "turn.2.context.compacted"), false);
    const secondTurnBodies = providerBodies.slice(providerCallsAfterFirstTurn);
    assert.ok(secondTurnBodies.length > 0);
    for (const body of secondTurnBodies) {
      assert.doesNotMatch(JSON.stringify(body), /Compacted prior context/u);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode application runtime routes omni.viewImage through Responses image input", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-vision-"));
  const imagePath = path.join(workspace, "screenshot.png");
  await writeFile(
    imagePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  );

  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "bapr",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyText = JSON.stringify(envelope.body);
          if (bodyText.includes("input_image")) {
            return {
              output_text: "The image contains a tiny test pixel.",
              usage: { input_tokens: 100_000, output_tokens: 4 },
            };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.viewImage",
                call_id: "omni-view-image-call",
                arguments: JSON.stringify({
                  target: { imagePath, mediaType: "image/png", detail: "low" },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
              usage: { input_tokens: 10, output_tokens: 2 },
            };
          }
          return {
            output_text: "视觉链路已完成。",
            usage: { input_tokens: 11, output_tokens: 3 },
          };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.vision.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "请查看这张截图。",
        cwd: workspace,
      },
    });

    assert.equal(result.ok, true);
    const providerBodyText = JSON.stringify(providerBodies);
    assert.match(providerBodyText, /input_image/u);
    assert.match(providerBodyText, /data:image\/png;base64/u);
    assert.match(providerBodyText, /The image contains a tiny test pixel/u);
    assert.equal(result.view.usage?.inputTokens, 21);
    assert.equal(result.view.usage?.lastInputTokens, 11);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode application runtime emits tool argument previews for failed tool calls", async () => {
  const events: unknown[] = [];
  let providerCallCount = 0;
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
  const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
    applicationId: "application.raxode.coding",
    mode: "live",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      providerCaller: async (_envelope: OpenAIV1ResponsesRequestEnvelope) => {
        providerCallCount += 1;
        if (providerCallCount > 1) {
          return { output_text: "键盘调用失败已记录。" };
        }
        return {
          output: [{
            type: "function_call",
            name: "computeruse.keyboardEmulation",
            call_id: "keyboard-bad-action-call",
            arguments: JSON.stringify({
              purpose: "focus the browser address bar",
              target: {
                targetHint: "desktop",
                actions: ["Control+L"],
              },
              context: { grantedPermissions: ["tool.execute"] },
            }),
          }],
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const transport = createLocalApplicationTransport(created.runtime);
  const unsubscribe = transport.subscribe((event) => events.push(event));
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId: "session.raxode.tool-argument-preview.test",
      cwd: process.cwd(),
      mode: "live",
    });
    assert.equal(start.ok, true);
    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId: "session.raxode.tool-argument-preview.test",
      mode: "live",
      input: {
        type: "application.input",
        text: "请打开浏览器。",
        cwd: process.cwd(),
      },
    });
    assert.equal(result.ok, true);
  } finally {
    unsubscribe();
  }

  const failedToolEvent = events
    .map((event) => event as { kind?: string; metadata?: Record<string, unknown> })
    .find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "computeruse.keyboardEmulation"
      && event.metadata?.toolStatus === "failed"
    );
  assert.ok(failedToolEvent);
  assert.match(String(failedToolEvent.metadata?.argumentsPreview), /Control\+L/u);
  assert.match(String(failedToolEvent.metadata?.argumentsPreview), /desktop/u);
});

test("raxode application runtime emits semantic summaries for capability families", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-tool-summary-"));
  const events: unknown[] = [];
  let providerCallCount = 0;
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    await writeFile(path.join(workspace, "src.ts"), "const a = 1;\nconst b = 2;\n");
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "bapr",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (_envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerCallCount += 1;
          if (providerCallCount > 1) {
            return { output_text: "工具摘要完成。" };
          }
          return {
            output: [
              {
                type: "function_call",
                name: "code.scan",
                call_id: "code-scan-summary-call",
                arguments: JSON.stringify({
                  directoryPath: ".",
                  depth: 2,
                  maxEntries: 50,
                  context: { workspaceRoot: workspace },
                }),
              },
              {
                type: "function_call",
                name: "code.overwrite",
                call_id: "code-overwrite-summary-call",
                arguments: JSON.stringify({
                  workspaceRoot: workspace,
                  targetPath: "../outside.html",
                  maxBytes: 50_000,
                  content: "<!doctype html><title>ok</title>",
                  context: {
                    workspaceRoot: workspace,
                    dryRun: true,
                    guard: { accepted: true, allowed: true, reason: "test" },
                  },
                }),
              },
              {
                type: "function_call",
                name: "code.modify",
                call_id: "code-modify-summary-call",
                arguments: JSON.stringify({
                  workspaceRoot: workspace,
                  targetPath: "src.ts",
                  searchText: "const a = 1;\nconst b = 2;",
                  replacementText: "const a = 1;\nconst b = 3;\nconst c = 4;",
                  context: {
                    workspaceRoot: workspace,
                    guard: { accepted: true, allowed: true, reason: "test" },
                  },
                }),
              },
              {
                type: "function_call",
                name: "shell.commandExecution",
                call_id: "shell-summary-call",
                arguments: JSON.stringify({
                  target: {
                    command: "pwd",
                    workingDirectory: workspace,
                    shell: "sh",
                  },
                  context: { workspaceRoot: workspace },
                }),
              },
              {
                type: "function_call",
                name: "shell.executionMonitoring",
                call_id: "shell-monitor-summary-call",
                arguments: JSON.stringify({
                  target: {
                    sessionId: "dev-server-1",
                  },
                  observation: {
                    state: "running",
                    observedAtMs: 2000,
                    lastActivityAtMs: 1500,
                  },
                  context: {
                    dryRun: true,
                    allowedSessionIds: ["dev-server-1"],
                  },
                }),
              },
              {
                type: "function_call",
                name: "git.getRepositoryStatus",
                call_id: "git-summary-call",
                arguments: JSON.stringify({
                  target: {
                    repositoryPath: workspace,
                    porcelainVersion: "v1",
                    includeUntracked: true,
                  },
                  context: {
                    dryRun: true,
                    workspaceRoot: workspace,
                    allowedRepositoryRoots: [workspace],
                  },
                }),
              },
              {
                type: "function_call",
                name: "mcp.listTools",
                call_id: "mcp-summary-call",
                arguments: JSON.stringify({
                  target: {
                    serverId: "summary-test-server",
                    limit: 10,
                  },
                  context: {
                    dryRun: true,
                    allowedServerIds: ["summary-test-server"],
                    grantedPermissions: ["mcp:tool:read"],
                  },
                }),
              },
            ],
          };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const unsubscribe = transport.subscribe((event) => events.push(event));
    try {
      const start = await transport.dispatch({
        type: "application.start",
        sessionId: "session.raxode.tool-summary.test",
        cwd: workspace,
        mode: "live",
      });
      assert.equal(start.ok, true);
      const result = await transport.dispatch({
        type: "application.submitTurn",
        sessionId: "session.raxode.tool-summary.test",
        mode: "live",
        input: {
          type: "application.input",
          text: "请写一个文件并运行 pwd。",
          cwd: workspace,
        },
      });
      assert.equal(result.ok, true);
    } finally {
      unsubscribe();
    }

    const toolEvents = events.map((event) => event as { kind?: string; metadata?: Record<string, unknown> });
    const scanStarted = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "code.scan"
      && event.metadata?.toolStatus === "running"
    );
    const overwriteStarted = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "code.overwrite"
      && event.metadata?.toolStatus === "running"
    );
    const overwriteFailed = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "code.overwrite"
      && event.metadata?.toolStatus === "failed"
    );
    const modifyFinished = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "code.modify"
      && event.metadata?.toolStatus !== "running"
    );
    const shellStarted = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "shell.commandExecution"
      && event.metadata?.toolStatus === "running"
    );
    const shellMonitorCompleted = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "shell.executionMonitoring"
      && event.metadata?.toolStatus === "completed"
    );
    const shellMonitorFailed = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "shell.executionMonitoring"
      && event.metadata?.toolStatus === "failed"
    );
    const gitStarted = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "git.getRepositoryStatus"
      && event.metadata?.toolStatus === "running"
    );
    const gitCompleted = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "git.getRepositoryStatus"
      && event.metadata?.toolStatus === "completed"
    );
    const mcpStarted = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "mcp.listTools"
      && event.metadata?.toolStatus === "running"
    );
    const mcpCompleted = toolEvents.find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "mcp.listTools"
      && event.metadata?.toolStatus === "completed"
    );
    assert.equal(scanStarted?.metadata?.inputSummary, "Scanning . (depth 2, up to 50 entries)");
    assert.match(String(overwriteStarted?.metadata?.inputSummary), /^Writing \.\.\/outside\.html/u);
    assert.match(JSON.stringify(overwriteFailed?.metadata?.humanResultSummary), /code\.overwrite/u);
    assert.equal((modifyFinished?.metadata?.resultMetadata as Record<string, unknown> | undefined)?.codeAdditions, 3);
    assert.equal((modifyFinished?.metadata?.resultMetadata as Record<string, unknown> | undefined)?.codeDeletions, 2);
    assert.equal(shellStarted?.metadata?.inputSummary, `Running pwd in ${workspace}`);
    assert.equal(shellMonitorFailed, undefined);
    assert.equal(shellMonitorCompleted?.metadata?.familyKey, "shell");
    assert.doesNotMatch(JSON.stringify(shellMonitorCompleted?.metadata ?? {}), /PERMISSION_DENIED/u);
    assert.equal(gitStarted?.metadata?.inputSummary, `Checking repository status in ${workspace}`);
    assert.equal(gitCompleted?.metadata?.familyKey, "git");
    assert.match(JSON.stringify(gitCompleted?.metadata?.humanResultSummary), /Repository status read/u);
    assert.equal(mcpStarted?.metadata?.inputSummary, "Listing MCP tools from summary-test-server");
    assert.equal(mcpCompleted?.metadata?.familyKey, "mcp");
    assert.match(JSON.stringify(mcpCompleted?.metadata?.humanResultSummary), /mcp\.listTools completed/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode application runtime streams internal procedure tool progress", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-procedure-progress-"));
  const events: unknown[] = [];
  let providerCallCount = 0;
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    await writeFile(path.join(workspace, "README.md"), "# demo\n");
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "bapr",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (_envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerCallCount += 1;
          if (providerCallCount > 1) {
            return { output_text: "procedure progress finished." };
          }
          return {
            output: [{
              type: "function_call",
              name: "praxis_ephemeral_procedure",
              call_id: "procedure-progress-call",
              arguments: JSON.stringify({
                procedureId: "visible-procedure-progress",
                purpose: "Inspect workspace with visible internal steps",
                executionMode: "serial",
                steps: [
                  {
                    stepId: "scan",
                    baseToolId: "code.scan",
                    input: {
                      directoryPath: ".",
                      depth: 1,
                      maxEntries: 10,
                      context: { workspaceRoot: workspace },
                    },
                  },
                  {
                    stepId: "pwd",
                    baseToolId: "shell.commandExecution",
                    input: {
                      command: "pwd",
                      args: [],
                      cwd: workspace,
                      shellType: "sh",
                      context: { workspaceRoot: workspace },
                    },
                  },
                ],
              }),
            }],
          };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const unsubscribe = transport.subscribe((event) => events.push(event));
    try {
      const start = await transport.dispatch({
        type: "application.start",
        sessionId: "session.raxode.procedure-progress.test",
        cwd: workspace,
        mode: "live",
      });
      assert.equal(start.ok, true);
      const result = await transport.dispatch({
        type: "application.submitTurn",
        sessionId: "session.raxode.procedure-progress.test",
        mode: "live",
        input: {
          type: "application.input",
          text: "用 procedure 检查当前目录。",
          cwd: workspace,
        },
      });
      assert.equal(result.ok, true);
    } finally {
      unsubscribe();
    }

    const indexedEvents = events.map((event, index) => ({
      index,
      event: event as { kind?: string; metadata?: Record<string, unknown> },
    }));
    const scanStarted = indexedEvents.find(({ event }) =>
      event.kind === "tool"
      && event.metadata?.toolId === "code.scan"
      && event.metadata?.toolStatus === "running"
    );
    const scanCompleted = indexedEvents.find(({ event }) =>
      event.kind === "tool"
      && event.metadata?.toolId === "code.scan"
      && event.metadata?.toolStatus === "completed"
    );
    const shellStarted = indexedEvents.find(({ event }) =>
      event.kind === "tool"
      && event.metadata?.toolId === "shell.commandExecution"
      && event.metadata?.toolStatus === "running"
    );
    const finalEvent = indexedEvents.find(({ event }) => event.kind === "final");

    assert.ok(scanStarted);
    assert.ok(scanCompleted);
    assert.ok(shellStarted);
    assert.ok(finalEvent);
    assert.equal(scanStarted.event.metadata?.toolCallId, "visible-procedure-progress:scan");
    assert.equal(shellStarted.event.metadata?.toolCallId, "visible-procedure-progress:pwd");
    assert.ok(scanStarted.index < scanCompleted.index);
    assert.ok(shellStarted.index < finalEvent.index);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode application runtime rejects procedure shell steps that write workspace files before execution", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-procedure-shell-write-"));
  const events: unknown[] = [];
  const providerBodies: unknown[] = [];
  let providerCallCount = 0;
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "bapr",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          providerCallCount += 1;
          if (providerCallCount > 1) {
            return { output_text: "我会改用 Code 工具写文件。" };
          }
          return {
            output: [{
              type: "function_call",
              name: "praxis_ephemeral_procedure",
              call_id: "procedure-shell-write-call",
              arguments: JSON.stringify({
                procedureId: "bad-shell-write-procedure",
                purpose: "Create a project with a shell heredoc",
                executionMode: "serial",
                steps: [{
                  stepId: "write-package",
                  baseToolId: "shell.commandExecution",
                  input: {
                    command: "cat > package.json <<'EOF'\n{}\nEOF",
                    args: [],
                    cwd: workspace,
                    shellType: "sh",
                    context: { workspaceRoot: workspace },
                  },
                }],
              }),
            }],
          };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const unsubscribe = transport.subscribe((event) => events.push(event));
    try {
      const start = await transport.dispatch({
        type: "application.start",
        sessionId: "session.raxode.procedure-shell-write.test",
        cwd: workspace,
        mode: "live",
      });
      assert.equal(start.ok, true);
      const result = await transport.dispatch({
        type: "application.submitTurn",
        sessionId: "session.raxode.procedure-shell-write.test",
        mode: "live",
        input: {
          type: "application.input",
          text: "用 procedure 创建 package.json。",
          cwd: workspace,
        },
      });
      assert.equal(result.ok, true);
    } finally {
      unsubscribe();
    }

    const shellStarted = events.find((event) => {
      const typed = event as { kind?: string; metadata?: Record<string, unknown> };
      return typed.kind === "tool"
        && typed.metadata?.toolId === "shell.commandExecution"
        && typed.metadata?.toolStatus === "running";
    });
    assert.equal(shellStarted, undefined);
    assert.equal(providerCallCount, 2);
    assert.match(JSON.stringify(providerBodies[1]), /EphemeralProcedure step write-package uses shell\.commandExecution/u);
    assert.match(JSON.stringify(providerBodies[1]), /code\.overwrite/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode bapr carries application approval into detached shell TAP approval fields", async () => {
  const events: unknown[] = [];
  let providerCallCount = 0;
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
  const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
    applicationId: "application.raxode.coding",
    mode: "live",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    now: () => "2026-05-10T00:00:00.000Z",
    approvalResolver: async (envelope) => {
      throw new Error(`unexpected approval request: ${envelope.approvalId}`);
    },
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      providerCaller: async (_envelope: OpenAIV1ResponsesRequestEnvelope) => {
        providerCallCount += 1;
        if (providerCallCount > 1) {
          return { output_text: "detached launch completed without manual approval." };
        }
        return {
          output: [{
            type: "function_call",
            name: "shell.detachedExecution",
            call_id: "detached-chrome-call",
            arguments: JSON.stringify({
              target: {
                command: "sleep 2",
                workingDirectory: "/tmp",
                shell: "sh",
              },
              context: {
                guard: {
                  accepted: true,
                  allowed: true,
                  reason: "User requested opening a browser.",
                },
              },
            }),
          }],
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const transport = createLocalApplicationTransport(created.runtime);
  const unsubscribe = transport.subscribe((event) => events.push(event));
  let result: Awaited<ReturnType<typeof transport.dispatch>> | undefined;
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId: "session.raxode.detached-approval.test",
      cwd: process.cwd(),
      mode: "live",
    });
    assert.equal(start.ok, true);
    result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId: "session.raxode.detached-approval.test",
      mode: "live",
      input: {
        type: "application.input",
        text: "打开 Chrome。",
        cwd: process.cwd(),
      },
    });
  } finally {
    unsubscribe();
  }

  assert.ok(result);
  assert.equal(result.ok, true);
  assert.equal(providerCallCount, 2);
  if (result.ok) {
    assert.match(result.view.finalOutput ?? "", /detached launch completed/u);
  }
  const completedToolEvent = events
    .map((event) => event as { kind?: string; metadata?: Record<string, unknown> })
    .find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "shell.detachedExecution"
      && event.metadata?.toolStatus === "completed"
  );
  assert.ok(completedToolEvent);
  assert.equal(completedToolEvent.metadata?.errorPreview, undefined);
  assert.match(String(completedToolEvent.metadata?.outputPreview), /shell\.detachedExecution/u);
});

test("raxode application runtime resolves pasted image references to local attachment paths", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-attachment-vision-"));
  const imagePath = path.join(workspace, "clipboard-image-1.png");
  await writeFile(
    imagePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  );

  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "bapr",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyText = JSON.stringify(envelope.body);
          if (bodyText.includes("input_image")) {
            return { output_text: "The pasted image contains a tiny test pixel." };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.viewImage",
                call_id: "omni-view-image-ref-call",
                arguments: JSON.stringify({
                  target: { imageRef: "Image #1", detail: "low" },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "附件视觉链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.attachment-vision.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "你好！[Image #1]看一下这个图片里面是啥。",
        cwd: workspace,
        attachments: [{
          id: "clipboard-image:1",
          kind: "image",
          tokenText: "[Image #1]",
          displayName: "clipboard image 1",
          localPath: imagePath,
          mimeType: "image/png",
        }],
      },
    });

    assert.equal(result.ok, true);
    const providerBodyText = JSON.stringify(providerBodies);
    assert.match(providerBodyText, /Application input attachments for this user request/u);
    assert.match(providerBodyText, /localPath=/u);
    assert.match(providerBodyText, /input_image/u);
    assert.match(providerBodyText, /data:image\/png;base64/u);
    assert.match(providerBodyText, /The pasted image contains a tiny test pixel/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode application runtime routes omni.generateImage through Responses image_generation", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-image-generation-"));
  const outputPath = path.join(workspace, "generated.png");

  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "bapr",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyRecord = envelope.body as { tools?: readonly { type?: string }[] };
          if (bodyRecord.tools?.some((tool) => tool.type === "image_generation")) {
            return {
              output: [{
                id: "ig_test",
                type: "image_generation_call",
                status: "completed",
                revised_prompt: "A tiny generated test image.",
                result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              }],
            };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.generateImage",
                call_id: "omni-generate-image-call",
                arguments: JSON.stringify({
                  target: {
                    prompt: "Draw a tiny test image.",
                    outputPath,
                    mimeType: "image/png",
                    size: "512x512",
                    quality: "low",
                  },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "图片生成链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.generate-image.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "生成一张测试图片。",
        cwd: workspace,
      },
    });

    assert.equal(result.ok, true);
    const imageGenerationBody = providerBodies.find((body) => {
      const record = body as { tools?: readonly { type?: string }[] };
      return record.tools?.some((tool) => tool.type === "image_generation");
    }) as { stream?: boolean; tool_choice?: unknown; tools?: readonly Record<string, unknown>[] } | undefined;
    assert.ok(imageGenerationBody);
    assert.equal(imageGenerationBody.stream, true);
    assert.deepEqual(imageGenerationBody.tool_choice, { type: "image_generation" });
    assert.equal(imageGenerationBody.tools?.[0]?.type, "image_generation");
    assert.equal(imageGenerationBody.tools?.[0]?.action, undefined);
    assert.equal(imageGenerationBody.tools?.[0]?.size, undefined);
    assert.equal(imageGenerationBody.tools?.[0]?.quality, "low");
    assert.equal(imageGenerationBody.tools?.[0]?.output_format, "png");
    const generated = await readFile(outputPath);
    assert.equal(generated.byteLength > 0, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode bapr auto-approves omni.generateImage and assigns a workspace artifact output path", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-image-generation-auto-"));

  const providerBodies: unknown[] = [];
  let approvalRequestCount = 0;
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "standard",
      now: () => "2026-05-10T00:00:00.000Z",
      approvalResolver: async (envelope) => {
        approvalRequestCount += 1;
        throw new Error(`unexpected bapr approval request: ${envelope.approvalId}`);
      },
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyRecord = envelope.body as { tools?: readonly { type?: string }[] };
          if (bodyRecord.tools?.some((tool) => tool.type === "image_generation")) {
            return {
              output: [{
                id: "ig_auto_test",
                type: "image_generation_call",
                status: "completed",
                revised_prompt: "A tiny generated test image.",
                result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              }],
            };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.generateImage",
                call_id: "omni-generate-image-auto-call",
                arguments: JSON.stringify({
                  target: {
                    prompt: "Draw a tiny test image without specifying where to save it.",
                    outputFormat: "image/png",
                    size: "1024x1024",
                    quality: "low",
                  },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "图片生成链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.generate-image.auto.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    const permission = await transport.dispatch({
      type: "application.changePermissionProfile",
      sessionId,
      profile: "bapr",
    });
    assert.equal(permission.ok, true);
    assert.equal(permission.view.permissionProfile, "bapr");

    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "生成一张测试图片，不指定保存路径。",
        cwd: workspace,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(approvalRequestCount, 0);
    const providerBodyText = JSON.stringify(providerBodies);
    assert.match(providerBodyText, /"type":"image_generation"/u);
    assert.match(providerBodyText, /"stream":true/u);
    const artifactDir = path.join(workspace, ".rax_workspace", "artifacts", sessionId);
    const generatedFiles = await readdir(artifactDir);
    assert.equal(generatedFiles.length, 1);
    assert.match(generatedFiles[0] ?? "", /^generated-image-.*\.png$/u);
    const generated = await readFile(path.join(artifactDir, generatedFiles[0] ?? ""));
    assert.equal(generated.byteLength > 0, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode standard approval grants omni.generateImage provider permissions before storage core execution", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-image-generation-approval-"));

  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "standard",
      now: () => "2026-05-10T00:00:00.000Z",
      approvalResolver: async (envelope) => ({
        status: "approved",
        resolvedBy: "test.approval",
        reason: `approved ${envelope.approvalId}`,
      }),
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyRecord = envelope.body as { tools?: readonly { type?: string }[] };
          if (bodyRecord.tools?.some((tool) => tool.type === "image_generation")) {
            return {
              output: [{
                id: "ig_approval_test",
                type: "image_generation_call",
                status: "completed",
                result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              }],
            };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.generateImage",
                call_id: "omni-generate-image-approved-call",
                arguments: JSON.stringify({
                  target: {
                    prompt: "Draw a tiny test image after approval.",
                    outputFormat: "image/png",
                    size: "1024x1024",
                  },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "图片生成链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.generate-image.approval.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    assert.equal(start.view.permissionProfile, "standard");

    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "生成一张测试图片，允许审批。",
        cwd: workspace,
      },
    });

    assert.equal(result.ok, true);
    const providerBodyText = JSON.stringify(providerBodies);
    assert.match(providerBodyText, /"type":"image_generation"/u);
    assert.match(providerBodyText, /"stream":true/u);
    const artifactDir = path.join(workspace, ".rax_workspace", "artifacts", sessionId);
    const generatedFiles = await readdir(artifactDir);
    assert.equal(generatedFiles.length, 1);
    const generated = await readFile(path.join(artifactDir, generatedFiles[0] ?? ""));
    assert.equal(generated.byteLength > 0, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode application approval decision resolves a pending runtime approval", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-image-generation-application-approval-"));

  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "standard",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyRecord = envelope.body as { tools?: readonly { type?: string }[] };
          if (bodyRecord.tools?.some((tool) => tool.type === "image_generation")) {
            return {
              output: [{
                id: "ig_application_approval_test",
                type: "image_generation_call",
                status: "completed",
                result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              }],
            };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.generateImage",
                call_id: "omni-generate-image-application-approval-call",
                arguments: JSON.stringify({
                  target: {
                    prompt: "Draw a tiny test image after application approval.",
                    outputFormat: "image/png",
                    size: "1024x1024",
                  },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "图片生成链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.generate-image.application-approval.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    assert.equal(start.view.permissionProfile, "standard");

    const submitted = transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "生成一张测试图片，等待 application approval。",
        cwd: workspace,
      },
    });

    let approvalId = "";
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const currentView = await transport.getView();
      const pending = currentView.approvals.find((approval) => approval.status === "pending");
      if (pending) {
        approvalId = pending.approvalId;
        assert.equal(pending.feature, "omni");
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.notEqual(approvalId, "");

    const decided = await transport.dispatch({
      type: "application.approvalDecision",
      sessionId,
      approvalId,
      decision: "approve",
      note: "test approval",
    });
    assert.equal(decided.ok, true);

    const result = await submitted;
    assert.equal(result.ok, true);
    const artifactDir = path.join(workspace, ".rax_workspace", "artifacts", sessionId);
    const generatedFiles = await readdir(artifactDir);
    assert.equal(generatedFiles.length, 1);
    const generated = await readFile(path.join(artifactDir, generatedFiles[0] ?? ""));
    assert.equal(generated.byteLength > 0, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode backend exposes application REST and WebSocket servers", async () => {
  const rest = await createRaxodeBackendRestServer({
    now: () => "2026-05-10T00:00:00.000Z",
  });
  try {
    const response = await fetch(`${rest.url}/application/view`);
    assert.equal(response.status, 200);
    const view = await response.json() as { applicationId?: string };
    assert.equal(view.applicationId, "application.raxode.coding");
  } finally {
    await rest.close();
  }

  const ws = await createRaxodeBackendWebSocketServer({
    now: () => "2026-05-10T00:00:00.000Z",
  });
  const socket = new WebSocket(ws.url);
  try {
    const ready = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout waiting for raxode ws ready")), 4000);
      socket.addEventListener("message", (event) => {
        clearTimeout(timeout);
        resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
      }, { once: true });
    });
    assert.equal(ready.type, "application.ready");
  } finally {
    socket.close();
    await ws.close();
  }
});
