import { praxis } from "@praxis-ai/praxis";
import type { ModelEndpointSpec, ModelFleetSpec, ModelSpec } from "@praxis-ai/praxis";
import { createModelMetadataRecord } from "@praxis-ai/praxis/provider/providerAccessLayer/modelMetadataRegistry";

import type { NormalizedRaxodeOptions } from "./raxodeOptions.js";

function endpointPathFor(shape: NormalizedRaxodeOptions["endpointShape"]): ModelEndpointSpec["endpoint"] {
  if (shape === "messages") return "/v1/messages";
  if (shape === "chat_completions") return "/v1/chat/completions";
  return "/v1/responses";
}

function metadataFor(options: NormalizedRaxodeOptions): Readonly<Record<string, unknown>> | undefined {
  const metadata = createModelMetadataRecord({ provider: options.provider, model: options.model });
  const routeMetadata = options.providerRoute
    ? { providerRoute: options.providerRoute }
    : {};
  const outputMetadata = typeof options.maxOutputTokens === "number" && Number.isFinite(options.maxOutputTokens)
    ? { maxOutputTokens: options.maxOutputTokens }
    : {};
  const baseMetadata = metadata ?? {};
  return Object.keys(baseMetadata).length > 0 || Object.keys(routeMetadata).length > 0 || Object.keys(outputMetadata).length > 0
    ? { ...baseMetadata, ...routeMetadata, ...outputMetadata }
    : undefined;
}

export function createRaxodeModel(options: NormalizedRaxodeOptions): ModelSpec {
  const metadata = metadataFor(options);
  return praxis.model(options.model, {
    provider: options.provider,
    endpointShape: options.endpointShape,
    carrierId: "carrier.raxode.coding.primary",
    baseURL: options.baseURL,
    reasoning: {
      effort: options.reasoningEffort,
      summary: "concise",
    },
    metadata,
  });
}

export function createRaxodeModelFleet(options: NormalizedRaxodeOptions): ModelFleetSpec {
  const primaryMetadata = metadataFor(options);
  return praxis.modelFleet.auto({
    primary: praxis.endpoint(endpointPathFor(options.endpointShape), {
      role: options.endpointShape === "messages" ? "reasoning" : "background",
      provider: options.provider,
      model: options.model,
      carrierId: "carrier.raxode.coding.primary",
      baseURL: options.baseURL,
      capabilityMatrix: { text: true, reasoning: true, toolCalling: true, metadata: primaryMetadata },
      failurePolicy: { onUnavailable: "degrade", maxRetries: 1, timeoutMs: 30_000 },
      metadata: primaryMetadata,
    }),
    fast: praxis.endpoint("/v1/responses", {
      role: "fast-path",
      provider: "openai",
      model: "gpt-5.4-mini",
      capabilityMatrix: { text: true, toolCalling: true },
      failurePolicy: { onUnavailable: "degrade", maxRetries: 1, timeoutMs: 15_000 },
    }),
    image: praxis.endpoint("/v1/images", {
      role: "image-generation",
      provider: "openai",
      model: "gpt-image-style",
      capabilityMatrix: { imageGeneration: true },
      failurePolicy: { onUnavailable: "skip" },
    }),
    realtime: praxis.endpoint("/v1/realtime", {
      role: "realtime",
      provider: "openai",
      model: "gpt-realtime-style",
      capabilityMatrix: { realtime: true },
      failurePolicy: { onUnavailable: "skip" },
    }),
  }, {
    probeStrategy: "lazy",
    primaryRef: "primary",
    failurePolicy: {
      onUnavailable: "degrade",
      fallbackEndpointRef: "fast",
      maxRetries: 1,
      metadata: { optionalEndpointPolicy: "record-and-continue" },
    },
  });
}
