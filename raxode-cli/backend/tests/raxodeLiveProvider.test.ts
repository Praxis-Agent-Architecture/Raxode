import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { AgentManifest } from "@praxis-ai/praxis/agent-core";
import { resolveRaxodeProviderRequestUrl } from "@praxis-ai/praxis/provider/authProfileLayer/providerConfiguration";
import { RAXODE_ROLE_IDS } from "../../frontend/tui/config/raxode-config.js";
import {
  createCodexRoutingTransport,
  createRaxodeLiveProvider,
  extractAndPublishSseDeltas,
  readSseTextDelta,
  resolveRaxodeConfiguredModelOptions,
} from "../authentication/liveProvider.js";

function manifestFor(input: {
  provider?: string;
  model?: string;
  endpointShape?: string;
  baseURL?: string;
  providerRoute?: string;
}): AgentManifest {
  return {
    identity: { id: "agent.raxode.coding" },
    model: {
      provider: input.provider ?? "openai",
      model: input.model ?? "gpt-5.5",
      endpointShape: input.endpointShape ?? "responses",
      carrierId: "carrier.raxode.coding.primary",
      baseURL: input.baseURL,
      reasoning: { effort: "low" },
      metadata: input.providerRoute ? { providerRoute: input.providerRoute } : undefined,
    },
  } as AgentManifest;
}

async function withRaxodeHome<T>(
  input: {
    provider: "openai" | "anthropic";
    authMode?: "api_key" | "chatgpt_oauth";
    apiStyle: string;
    baseURL: string;
    model: string;
    apiKey?: string;
    accessToken?: string;
    maxOutputTokens?: number;
  },
  run: (home: string) => Promise<T>,
): Promise<T> {
  const home = await mkdtemp(path.join(os.tmpdir(), "raxode-raxode-route-"));
  const previousHome = process.env.RAXODE_HOME;
  process.env.RAXODE_HOME = home;
  try {
    const authProfileId = `auth.${input.provider}.test`;
    const profileId = `profile.${input.provider}.test`;
    const endpointShape = input.apiStyle === "messages"
      ? "messages"
      : input.apiStyle === "chat_completions"
        ? "chat_completions"
        : "responses";
    const routePlan = resolveRaxodeProviderRequestUrl({
      inputBaseURL: input.baseURL,
      endpointShape,
    });
    if (!routePlan.ok) {
      throw new Error(routePlan.error.message);
    }
    await writeFile(path.join(home, "auth.json"), `${JSON.stringify({
      schemaVersion: 3,
      activeAuthProfileIdBySlot: {
        openai: authProfileId,
        anthropic: authProfileId,
      },
      authProfiles: [{
        id: authProfileId,
        provider: input.provider,
        label: "Test Auth",
        authMode: input.authMode ?? "api_key",
        credentials: {
          apiKey: input.apiKey,
          accessToken: input.accessToken,
        },
        meta: {
          source: "manual",
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z",
        },
      }],
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(home, "config.json"), `${JSON.stringify({
      schemaVersion: 3,
      providerSlots: {
        openai: profileId,
        anthropic: profileId,
      },
      profiles: [{
        id: profileId,
        provider: input.provider,
        label: "Test Profile",
        authProfileId,
        route: {
          baseURL: input.baseURL,
          apiStyle: input.apiStyle,
          urlMode: routePlan.plan.urlMode,
          finalRequestURL: routePlan.plan.finalRequestURL,
        },
        model: input.model,
        reasoningEffort: "low",
        maxOutputTokens: input.maxOutputTokens,
        enabled: true,
      }],
      roleBindings: Object.fromEntries(RAXODE_ROLE_IDS.map((roleId) => [roleId, {
        profileId,
        enabled: true,
      }])),
      embedding: {
        lanceDbModel: "text-embedding-3-large",
        provider: "openai",
      },
      workspace: {
        defaultPath: home,
      },
      ui: {
        language: "zh-CN",
        animationMode: "off",
        startupView: "chat",
        defaultAgentsView: "list",
        slashMenuStyle: "ordered",
        toolSummaryStyle: "animated",
      },
      permissions: {
        requestedMode: "bapr",
        automationDepth: "prefer_auto",
        explanationStyle: "plain_language",
        requireHumanOnRiskLevels: [],
        capabilityOverrides: [],
        shared15ViewMatrix: [],
        persistedAllowRules: [],
      },
    }, null, 2)}\n`, "utf8");
    return await run(home);
  } finally {
    if (previousHome === undefined) {
      delete process.env.RAXODE_HOME;
    } else {
      process.env.RAXODE_HOME = previousHome;
    }
    await rm(home, { recursive: true, force: true });
  }
}

test("raxode live provider extracts output text deltas from SSE payloads", () => {
  assert.equal(readSseTextDelta(JSON.stringify({
    type: "response.output_text.delta",
    delta: "OK",
  })), "OK");
});

test("raxode live provider extracts reasoning summary deltas from SSE payloads", () => {
  assert.equal(readSseTextDelta(JSON.stringify({
    type: "response.reasoning_summary_text.delta",
    delta: "Thinking briefly",
  })), "Thinking briefly");
});

test("raxode live provider extracts OpenAI chat completions deltas from SSE payloads", () => {
  assert.equal(readSseTextDelta(JSON.stringify({
    id: "chatcmpl-test",
    choices: [{ delta: { content: "chat delta" } }],
  })), "chat delta");
});

test("raxode live provider extracts Anthropic message deltas from SSE payloads", () => {
  assert.equal(readSseTextDelta(JSON.stringify({
    type: "content_block_delta",
    delta: { type: "text_delta", text: "anthropic delta" },
  })), "anthropic delta");
});

test("raxode live provider parses SSE frames even when callers detect stream by body shape", () => {
  const deltas: string[] = [];
  const remainder = extractAndPublishSseDeltas([
    "event: response.created",
    "data: {\"type\":\"response.created\"}",
    "",
    "event: response.output_text.delta",
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\"O\"}",
    "",
    "event: response.output_text.delta",
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\"K\"}",
    "",
    "",
  ].join("\n"), (delta) => deltas.push(delta));
  assert.equal(remainder, "");
  assert.deepEqual(deltas, ["O", "K"]);
});

test("raxode live provider extracts tool call preview events from SSE frames", () => {
  const events: Array<Record<string, unknown>> = [];
  const remainder = extractAndPublishSseDeltas([
    "event: response.output_item.added",
    "data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"id\":\"fc_1\",\"type\":\"function_call\",\"name\":\"praxis_tool_shell_commandExecution\",\"call_id\":\"call_shell_1\",\"arguments\":\"\"}}",
    "",
    "event: response.function_call_arguments.delta",
    "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_1\",\"output_index\":0,\"delta\":\"{\\\"target\\\":{\\\"command\\\":\\\"npm run check\"}",
    "",
    "event: response.function_call_arguments.delta",
    "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_1\",\"output_index\":0,\"delta\":\" && curl http://localhost:3000\\\"}}\"}",
    "",
    "event: response.function_call_arguments.done",
    "data: {\"type\":\"response.function_call_arguments.done\",\"item_id\":\"fc_1\",\"output_index\":0,\"arguments\":\"{\\\"target\\\":{\\\"command\\\":\\\"npm run check && curl http://localhost:3000\\\"}}\"}",
    "",
    "",
  ].join("\n"), undefined, (event) => events.push(event as unknown as Record<string, unknown>));

  assert.equal(remainder, "");
  assert.deepEqual(events.map((event) => event.phase), ["started", "delta", "delta", "done"]);
  assert.equal(events[0]?.providerToolName, "praxis_tool_shell_commandExecution");
  assert.equal(events[0]?.callId, "call_shell_1");
  assert.match(String(events[1]?.argumentsDelta), /npm run check/u);
  assert.match(String(events[2]?.argumentsDelta), /curl http:\/\/localhost:3000/u);
  assert.match(String(events[3]?.arguments), /npm run check && curl/u);
});

test("raxode live provider extracts OpenAI chat completions tool previews from SSE frames", () => {
  const events: Array<Record<string, unknown>> = [];
  const remainder = extractAndPublishSseDeltas([
    `data: ${JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "chat-tool-call-1",
            type: "function",
            function: { name: "praxis_tool_code_read", arguments: "{\"targetPath\":" },
          }],
        },
      }],
    })}`,
    "",
    `data: ${JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: { arguments: "\"README.md\"}" },
          }],
        },
      }],
    })}`,
    "",
    "data: [DONE]",
    "",
    "",
  ].join("\n"), undefined, (event) => events.push(event as unknown as Record<string, unknown>));

  assert.equal(remainder, "");
  assert.deepEqual(events.map((event) => event.phase), ["delta", "delta"]);
  assert.equal(events[0]?.providerToolName, "praxis_tool_code_read");
  assert.equal(events[0]?.callId, "chat-tool-call-1");
  assert.match(String(events[0]?.argumentsDelta), /targetPath/u);
  assert.match(String(events[1]?.argumentsDelta), /README\.md/u);
});

test("raxode live provider extracts Anthropic messages tool previews from SSE frames", () => {
  const events: Array<Record<string, unknown>> = [];
  const remainder = extractAndPublishSseDeltas([
    "event: content_block_start",
    "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call_1\",\"name\":\"praxis_tool_code_read\",\"input\":{}}}",
    "",
    "event: content_block_delta",
    "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"path\\\":\"}}",
    "",
    "event: content_block_delta",
    "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\"src/index.ts\\\"}\"}}",
    "",
    "event: content_block_stop",
    "data: {\"type\":\"content_block_stop\",\"index\":0}",
    "",
    "",
  ].join("\n"), undefined, (event) => events.push(event as unknown as Record<string, unknown>));

  assert.equal(remainder, "");
  assert.deepEqual(events.map((event) => event.phase), ["started", "delta", "delta", "done"]);
  assert.equal(events[0]?.callId, "call_1");
  assert.equal(events[0]?.providerToolName, "praxis_tool_code_read");
  assert.equal(events[3]?.callId, "call_1");
  assert.equal(events[3]?.providerToolName, "praxis_tool_code_read");
  assert.equal(events[3]?.arguments, "{\"path\":\"src/index.ts\"}");
});

test("raxode live provider does not report text block stops as Anthropic tool previews", () => {
  const events: Array<Record<string, unknown>> = [];
  const remainder = extractAndPublishSseDeltas([
    "event: content_block_start",
    "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"I will inspect first.\"}}",
    "",
    "event: content_block_stop",
    "data: {\"type\":\"content_block_stop\",\"index\":0}",
    "",
    "event: content_block_start",
    "data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call_1\",\"name\":\"praxis_tool_code_read\",\"input\":{}}}",
    "",
    "event: content_block_stop",
    "data: {\"type\":\"content_block_stop\",\"index\":1}",
    "",
    "",
  ].join("\n"), undefined, (event) => events.push(event as unknown as Record<string, unknown>));

  assert.equal(remainder, "");
  assert.deepEqual(events.map((event) => event.phase), ["started", "done"]);
  assert.equal(events[0]?.callId, "call_1");
  assert.equal(events[1]?.callId, "call_1");
});

test("raxode live provider keeps tool preview identity across split SSE reads", () => {
  const events: Array<Record<string, unknown>> = [];
  const previewState = new Map();

  assert.equal(extractAndPublishSseDeltas([
    "event: response.output_item.added",
    "data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"id\":\"fc_1\",\"type\":\"function_call\",\"name\":\"praxis_tool_code_scan\",\"call_id\":\"call_code_1\",\"arguments\":\"\"}}",
    "",
    "",
  ].join("\n"), undefined, (event) => events.push(event as unknown as Record<string, unknown>), previewState), "");

  assert.equal(extractAndPublishSseDeltas([
    "event: response.function_call_arguments.delta",
    "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_1\",\"output_index\":0,\"delta\":\"{\\\"directoryPath\\\":\\\".\\\"}\"}",
    "",
    "",
  ].join("\n"), undefined, (event) => events.push(event as unknown as Record<string, unknown>), previewState), "");

  assert.deepEqual(events.map((event) => event.phase), ["started", "delta"]);
  assert.equal(events[1]?.callId, "call_code_1");
  assert.equal(events[1]?.providerToolName, "praxis_tool_code_scan");
});

test("raxode live provider replays Codex turn-state within one transport", async () => {
  const requests: Array<{
    headers?: Readonly<Record<string, string>>;
    body?: unknown;
  }> = [];
  const transport = createCodexRoutingTransport(async (request) => {
    requests.push({ headers: request.headers, body: request.body });
    const headers: Record<string, string> = requests.length === 1 ? { "x-codex-turn-state": "turn-state-1" } : {};
    return {
      status: 200,
      headers,
      body: "",
    };
  }, {
    sessionId: "session-test",
    runtimeId: "runtime-test",
    turnId: "turn.1",
    installationId: "install-test",
  });

  await transport({
    method: "POST",
    url: "https://example.invalid/responses",
    headers: { "content-type": "application/json" },
    body: { client_metadata: { client_name: "praxis-raxode" } },
  });
  await transport({
    method: "POST",
    url: "https://example.invalid/responses",
    headers: { "content-type": "application/json" },
    body: { client_metadata: { client_name: "praxis-raxode" } },
  });

  assert.equal(requests[0]?.headers?.["x-codex-turn-state"], undefined);
  assert.equal(requests[1]?.headers?.["x-codex-turn-state"], "turn-state-1");
  assert.equal(requests[1]?.headers?.session_id, "session-test");
  assert.equal(requests[1]?.headers?.["x-client-request-id"], "session-test");
  assert.match(String(requests[1]?.headers?.["x-codex-turn-metadata"]), /"turn_id":"turn\.1"/u);
  assert.equal(
    (requests[1]?.body as { client_metadata?: Record<string, string> }).client_metadata?.["x-codex-installation-id"],
    "install-test",
  );
  assert.equal(
    (requests[1]?.body as { client_metadata?: Record<string, string> }).client_metadata?.["x-codex-window-id"],
    "runtime-test",
  );
});

test("raxode live provider turn-state is reset by a new transport instance", async () => {
  const headers: Array<Readonly<Record<string, string>> | undefined> = [];
  const first = createCodexRoutingTransport(async (request) => {
    headers.push(request.headers);
    return { status: 200, headers: { "x-codex-turn-state": "turn-state-1" }, body: "" };
  });
  const second = createCodexRoutingTransport(async (request) => {
    headers.push(request.headers);
    return { status: 200, headers: {}, body: "" };
  });

  await first({ method: "POST", url: "https://example.invalid/responses" });
  await second({ method: "POST", url: "https://example.invalid/responses" });

  assert.equal(headers[0]?.["x-codex-turn-state"], undefined);
  assert.equal(headers[1]?.["x-codex-turn-state"], undefined);
});

test("raxode live provider does not override ChatGPT Codex request path", async () => {
  await withRaxodeHome({
    provider: "openai",
    authMode: "chatgpt_oauth",
    apiStyle: "responses",
    baseURL: "https://chatgpt.com/backend-api/codex",
    model: "gpt-5.5",
    accessToken: "access-token-test",
  }, async (home) => {
    const urls: string[] = [];
    const provider = createRaxodeLiveProvider(manifestFor({
      provider: "openai",
      endpointShape: "responses",
      baseURL: "https://chatgpt.com/backend-api/codex",
      providerRoute: "chatgpt_codex_responses",
    }), {
      startDir: home,
      sessionId: "session.codex-url.test",
      runtimeId: "runtime.codex-url.test",
      turnId: "turn.1",
      transport: async (request) => {
        urls.push(request.url);
        return {
          status: 200,
          headers: {},
          body: { id: "resp.codex-url.test", output: [] },
        };
      },
    });

    await provider.openaiResponsesCaller?.({
      provider: "openai",
      apiVersion: "v1",
      operation: "create",
      method: "POST",
      url: "https://chatgpt.com/backend-api/codex/responses",
      pathSuffix: "",
      headers: { "content-type": "application/json" },
      query: {},
      body: { model: "gpt-5.5", input: "hello", stream: true },
      endpoint: "/responses",
      runtime: {
        runtimeId: "runtime.codex-url.test",
        invocationId: "invocation.codex-url.test",
        callerId: "caller.codex-url.test",
        traceId: "trace.codex-url.test",
      },
      requestedScopes: ["model.invoke"],
      grantedScopes: ["model.invoke"],
      dryRun: false,
      providerCallPlanned: true,
      unsafeSideEffects: false,
      providerFieldsOpaque: true,
    });

    assert.deepEqual(urls, ["https://chatgpt.com/backend-api/codex/responses"]);
  });
});

test("raxode configured model options only use Codex env compatibility when explicitly forced", async () => {
  const previousModel = process.env.AGENTCORE_CODEX_MODEL;
  const previousReasoning = process.env.AGENTCORE_CODEX_REASONING_EFFORT;
  process.env.AGENTCORE_CODEX_MODEL = "gpt-5.5";
  process.env.AGENTCORE_CODEX_REASONING_EFFORT = "low";
  await withRaxodeHome({
    provider: "openai",
    apiStyle: "chat_completions",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o",
    apiKey: "sk-config-test",
  }, async (home) => {
    const configResolved = resolveRaxodeConfiguredModelOptions({ roleId: "core.main", startDir: home });

    assert.equal(configResolved.provider, "openai");
    assert.equal(configResolved.model, "gpt-4o");
    assert.equal(configResolved.reasoningEffort, "low");
    assert.equal(configResolved.endpointShape, "chat_completions");
    assert.equal(configResolved.providerRoute, "openai_chat_completions");
    assert.equal(configResolved.authSource, "raxode-config");

    const resolved = resolveRaxodeConfiguredModelOptions({ roleId: "core.main", startDir: home, forceCodexEnvCompatibility: true });

    assert.equal(resolved.provider, "openai");
    assert.equal(resolved.model, "gpt-5.5");
    assert.equal(resolved.reasoningEffort, "low");
    assert.equal(resolved.endpointShape, "responses");
    assert.equal(resolved.providerRoute, "chatgpt_codex_responses");
  });
  if (previousModel === undefined) {
    delete process.env.AGENTCORE_CODEX_MODEL;
  } else {
    process.env.AGENTCORE_CODEX_MODEL = previousModel;
  }
  if (previousReasoning === undefined) {
    delete process.env.AGENTCORE_CODEX_REASONING_EFFORT;
  } else {
    process.env.AGENTCORE_CODEX_REASONING_EFFORT = previousReasoning;
  }
});

test("raxode configured model options do not let matching Codex env compatibility hijack chat completions config", async () => {
  const previousModel = process.env.AGENTCORE_CODEX_MODEL;
  const previousReasoning = process.env.AGENTCORE_CODEX_REASONING_EFFORT;
  process.env.AGENTCORE_CODEX_MODEL = "deepseek-v4-pro";
  process.env.AGENTCORE_CODEX_REASONING_EFFORT = "low";
  try {
    await withRaxodeHome({
      provider: "openai",
      apiStyle: "chat_completions",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      apiKey: "sk-config-test",
    }, async (home) => {
      const resolved = resolveRaxodeConfiguredModelOptions({ roleId: "core.main", startDir: home });

      assert.equal(resolved.provider, "openai");
      assert.equal(resolved.model, "deepseek-v4-pro");
      assert.equal(resolved.reasoningEffort, "low");
      assert.equal(resolved.endpointShape, "chat_completions");
      assert.equal(resolved.baseURL, "https://api.deepseek.com");
      assert.equal(resolved.providerRoute, "openai_chat_completions");
      assert.equal(resolved.authSource, "raxode-config");
    });
  } finally {
    if (previousModel === undefined) {
      delete process.env.AGENTCORE_CODEX_MODEL;
    } else {
      process.env.AGENTCORE_CODEX_MODEL = previousModel;
    }
    if (previousReasoning === undefined) {
      delete process.env.AGENTCORE_CODEX_REASONING_EFFORT;
    } else {
      process.env.AGENTCORE_CODEX_REASONING_EFFORT = previousReasoning;
    }
  }
});

test("raxode configured model options ignore reasoning-only Codex env compatibility for non-Codex routes", async () => {
  const previousModel = process.env.AGENTCORE_CODEX_MODEL;
  const previousReasoning = process.env.AGENTCORE_CODEX_REASONING_EFFORT;
  delete process.env.AGENTCORE_CODEX_MODEL;
  process.env.AGENTCORE_CODEX_REASONING_EFFORT = "medium";
  try {
    await withRaxodeHome({
      provider: "openai",
      apiStyle: "chat_completions",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-config-test",
    }, async (home) => {
      const resolved = resolveRaxodeConfiguredModelOptions({ roleId: "core.main", startDir: home });

      assert.equal(resolved.model, "deepseek-v4-flash");
      assert.equal(resolved.reasoningEffort, "low");
      assert.equal(resolved.endpointShape, "chat_completions");
      assert.equal(resolved.providerRoute, "openai_chat_completions");
      assert.equal(resolved.authSource, "raxode-config");
    });
  } finally {
    if (previousModel === undefined) {
      delete process.env.AGENTCORE_CODEX_MODEL;
    } else {
      process.env.AGENTCORE_CODEX_MODEL = previousModel;
    }
    if (previousReasoning === undefined) {
      delete process.env.AGENTCORE_CODEX_REASONING_EFFORT;
    } else {
      process.env.AGENTCORE_CODEX_REASONING_EFFORT = previousReasoning;
    }
  }
});

test("raxode live provider maps raxode OpenAI chat completions config to chat caller", async () => {
  await withRaxodeHome({
    provider: "openai",
    apiStyle: "chat_completions",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o",
    apiKey: "sk-chat-test",
  }, async (home) => {
    const resolved = resolveRaxodeConfiguredModelOptions({ roleId: "core.main", startDir: home });
    assert.equal(resolved.endpointShape, "chat_completions");
    assert.equal(resolved.providerRoute, "openai_chat_completions");
    assert.equal(resolved.baseURL, "https://api.openai.com/v1");

    const requests: Array<{ url: string; headers?: Readonly<Record<string, string>>; body?: unknown }> = [];
    const provider = createRaxodeLiveProvider(manifestFor(resolved), {
      startDir: home,
      transport: async (request) => {
        requests.push({ url: request.url, headers: request.headers, body: request.body });
        return {
          status: 200,
          headers: {},
          body: {
            choices: [{ message: { content: "chat ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          },
        };
      },
    });

    assert.equal(provider.providerRoute, "openai_chat_completions");
    assert.equal(typeof provider.openaiChatCompletionsCaller, "function");
    assert.equal(provider.openaiResponsesCaller, undefined);
    await provider.openaiChatCompletionsCaller?.({
      provider: "openai",
      endpoint: "/v1/chat/completions",
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      requestBody: { model: "gpt-4o", messages: [] },
      headers: {},
      timeoutMs: 30_000,
      trace: {},
    });

    assert.equal(requests[0]?.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(requests[0]?.headers?.authorization, "Bearer sk-chat-test");
    assert.deepEqual(requests[0]?.body, { model: "gpt-4o", messages: [] });
  });
});

test("raxode live provider maps raxode Anthropic messages config to messages caller", async () => {
  await withRaxodeHome({
    provider: "anthropic",
    apiStyle: "messages",
    baseURL: "https://api.deepseek.com/anthropic/",
    model: "claude-test",
    apiKey: "sk-ant-test",
    maxOutputTokens: 777,
  }, async (home) => {
    const resolved = resolveRaxodeConfiguredModelOptions({ roleId: "core.main", startDir: home });
    assert.equal(resolved.provider, "anthropic");
    assert.equal(resolved.endpointShape, "messages");
    assert.equal(resolved.providerRoute, "anthropic_messages");
    assert.equal(resolved.maxOutputTokens, 777);

    const requests: Array<{ url: string; headers?: Readonly<Record<string, string>>; body?: unknown }> = [];
    const provider = createRaxodeLiveProvider(manifestFor(resolved), {
      startDir: home,
      transport: async (request) => {
        requests.push({ url: request.url, headers: request.headers, body: request.body });
        return {
          status: 200,
          headers: {},
          body: {
            content: [{ type: "text", text: "anthropic ok" }],
            usage: { input_tokens: 4, output_tokens: 5 },
          },
        };
      },
    });

    assert.equal(provider.providerRoute, "anthropic_messages");
    assert.equal(typeof provider.anthropicMessagesCaller, "function");
    assert.equal(provider.openaiResponsesCaller, undefined);
    await provider.anthropicMessagesCaller?.({
      provider: "anthropic",
      apiVersion: "v1",
      endpoint: "/v1/messages",
      operation: "messages.create",
      method: "POST",
      urlPath: "/v1/messages",
      query: {},
      headers: {},
      body: { model: "claude-test", messages: [] },
      runtime: { runtimeId: "runtime-test", correlationId: "", callerId: "" },
      requestedScopes: [],
      grantedScopes: [],
      dryRun: false,
      unsafeSideEffects: false,
      providerFieldsOpaque: true,
    });

    assert.equal(requests[0]?.url, "https://api.deepseek.com/anthropic/");
    assert.equal(requests[0]?.headers?.["x-api-key"], "sk-ant-test");
    assert.equal(requests[0]?.headers?.["anthropic-version"], "2023-06-01");
    assert.deepEqual(requests[0]?.body, { model: "claude-test", messages: [] });
  });
});
