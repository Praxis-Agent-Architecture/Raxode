import { praxis } from "@praxis-ai/praxis";
import type { ModelEndpointSpec, ModelFleetSpec, ModelSpec } from "@praxis-ai/praxis";
import { createModelMetadataRecord } from "@praxis-ai/praxis/provider/providerAccessLayer/modelMetadataRegistry";

import type { NormalizedRaxodeTuiOptions } from "./options.js";

function endpointPathFor(shape: NormalizedRaxodeTuiOptions["endpointShape"]): ModelEndpointSpec["endpoint"] {
  if (shape === "messages") return "/v1/messages";
  if (shape === "chat_completions") return "/v1/chat/completions";
  return "/v1/responses";
}

function metadataFor(options: NormalizedRaxodeTuiOptions): Readonly<Record<string, unknown>> | undefined {
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

export function createRaxodeTuiModel(options: NormalizedRaxodeTuiOptions): ModelSpec {
  const metadata = metadataFor(options);
  return praxis.model(options.model, {
    provider: options.provider,
    endpointShape: options.endpointShape,
    carrierId: "carrier.raxode.tui.primary",
    baseURL: options.baseURL,
    reasoning: {
      effort: options.reasoningEffort,
      summary: "concise",
    },
    metadata,
  });
}

export function createRaxodeTuiModelFleet(options: NormalizedRaxodeTuiOptions): ModelFleetSpec {
  const metadata = metadataFor(options);
  return praxis.modelFleet.auto({
    primary: praxis.endpoint(endpointPathFor(options.endpointShape), {
      role: options.endpointShape === "messages" ? "reasoning" : "background",
      provider: options.provider,
      model: options.model,
      carrierId: "carrier.raxode.tui.primary",
      baseURL: options.baseURL,
      capabilityMatrix: { text: true, reasoning: true, metadata },
      failurePolicy: { onUnavailable: "degrade", maxRetries: 0, timeoutMs: options.timeoutMs },
      metadata,
    }),
  }, {
    probeStrategy: "lazy",
    primaryRef: "primary",
  });
}
