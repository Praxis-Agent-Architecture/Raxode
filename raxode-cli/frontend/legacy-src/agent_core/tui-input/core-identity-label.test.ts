import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoreIdentityLabelPresentation,
  buildOpenAIStatusIdentityRows,
  formatApiRouteIdentityText,
  formatChatGPTPlanLabel,
  resolveChatGPTPlanTone,
} from "./core-identity-label.js";

test("formatApiRouteIdentityText uses the new endpoint wording", () => {
  assert.equal(formatApiRouteIdentityText("openai_responses"), "GPT Endpoint (Responses API)");
  assert.equal(formatApiRouteIdentityText("openai_chat_completions"), "GPT Compatible (Completions API)");
  assert.equal(formatApiRouteIdentityText("anthropic_messages"), "Anthropic Endpoint (Messages API)");
});

test("formatChatGPTPlanLabel normalizes known subscription tiers", () => {
  assert.equal(formatChatGPTPlanLabel("pro"), "Pro");
  assert.equal(formatChatGPTPlanLabel("plus"), "Plus");
  assert.equal(formatChatGPTPlanLabel("pro20x"), "Pro20x");
  assert.equal(formatChatGPTPlanLabel("pro_5x"), "Pro5x");
  assert.equal(formatChatGPTPlanLabel("enterprise_custom"), "Enterprise Custom");
});

test("resolveChatGPTPlanTone maps subscription tiers onto display tones", () => {
  assert.equal(resolveChatGPTPlanTone("pro"), "success");
  assert.equal(resolveChatGPTPlanTone("pro5x"), "fast");
  assert.equal(resolveChatGPTPlanTone("plus"), "info");
  assert.equal(resolveChatGPTPlanTone("go"), "warning");
  assert.equal(resolveChatGPTPlanTone("free"), "default");
  assert.equal(resolveChatGPTPlanTone("unknown"), undefined);
});

test("buildCoreIdentityLabelPresentation prefers subscription identity for official auth", () => {
  const presentation = buildCoreIdentityLabelPresentation({
    authMode: "chatgpt_oauth",
    planType: "plus",
    routeKind: "openai_responses",
  });

  assert.equal(presentation.kind, "subscription");
  assert.equal(presentation.text, "ChatGPT Account with Plus Subscription");
  assert.deepEqual(presentation.valueSegments, [
    { text: "ChatGPT Account with " },
    { text: "Plus", tone: "info" },
    { text: " Subscription" },
  ]);
});

test("buildCoreIdentityLabelPresentation falls back to route identity for api auth", () => {
  const presentation = buildCoreIdentityLabelPresentation({
    authMode: "api_key",
    routeKind: "anthropic_messages",
  });

  assert.equal(presentation.kind, "route");
  assert.equal(presentation.text, "Anthropic Endpoint (Messages API)");
  assert.deepEqual(presentation.valueSegments, [{ text: "Anthropic Endpoint (Messages API)" }]);
});

test("buildOpenAIStatusIdentityRows describes ChatGPT subscription auth with plan and account facts", () => {
  const rows = buildOpenAIStatusIdentityRows({
    authStatus: {
      authMode: "chatgpt_oauth",
      activeAuthProfileId: "auth.openai.official",
      activeProviderProfileId: "profile.provider.openai.official",
      email: "user@example.com",
      planType: "pro",
      accountId: "acct_123",
      accessTokenExpiresAt: "2026-05-12T12:00:00.000Z",
      refreshTokenPresent: true,
    },
    routeKind: "openai_responses",
    baseURL: "https://chatgpt.com/backend-api/codex",
  });

  assert.deepEqual(rows.map((row) => [row.label, row.text]), [
    ["Provider auth path:", "ChatGPT subscription"],
    ["Provider identity:", "ChatGPT Account with Pro Subscription"],
    ["ChatGPT plan:", "Pro"],
    ["ChatGPT account:", "acct_123"],
    ["ChatGPT email:", "user@example.com"],
    ["Provider auth profile:", "auth.openai.official"],
    ["Provider profile:", "profile.provider.openai.official"],
    ["Provider route:", "GPT Endpoint (Responses API)"],
    ["Provider base URL:", "https://chatgpt.com/backend-api/codex"],
    ["OAuth refresh token:", "present"],
    ["Access token expires:", "2026-05-12T12:00:00.000Z"],
  ]);
  assert.deepEqual(rows[1]?.segments, [
    { text: "ChatGPT Account with " },
    { text: "Pro", tone: "success" },
    { text: " Subscription" },
  ]);
});

test("buildOpenAIStatusIdentityRows describes API key auth without pretending it has a ChatGPT plan", () => {
  const rows = buildOpenAIStatusIdentityRows({
    authStatus: {
      authMode: "api_key",
      activeAuthProfileId: "auth.openai.default",
      activeProviderProfileId: "profile.provider.openai.default",
      refreshTokenPresent: false,
    },
    routeKind: "openai_chat_completions",
    baseURL: "https://api.example.com/v1",
  });

  assert.deepEqual(rows.map((row) => [row.label, row.text]), [
    ["Provider auth path:", "API key"],
    ["Provider identity:", "GPT Compatible (Completions API)"],
    ["Provider auth profile:", "auth.openai.default"],
    ["Provider profile:", "profile.provider.openai.default"],
    ["Provider route:", "GPT Compatible (Completions API)"],
    ["Provider base URL:", "https://api.example.com/v1"],
  ]);
  assert.equal(rows.some((row) => row.label === "ChatGPT plan:"), false);
});
