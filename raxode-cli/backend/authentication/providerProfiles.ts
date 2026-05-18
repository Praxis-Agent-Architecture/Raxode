export const providerProfiles = {
  primary: {
    provider: "openai",
    endpointShape: "responses",
    model: "gpt-5.5",
    authSource: "codex-openai-profile",
  },
  image: {
    provider: "openai",
    endpointShape: "images",
    authSource: "codex-openai-profile",
    optional: true,
  },
} as const;

