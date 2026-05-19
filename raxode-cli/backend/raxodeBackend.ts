/*
 * 文件定位：raxode-cli / Raxode applicationLayer 后端。
 * 核心目的：让 Raxode CLI/TUI 通过 framework applicationLayer 使用 Praxis 后端项目。
 */

import path from "node:path";

import {
  createApplicationProjectRuntime,
  createApplicationRestServer,
  createApplicationWebSocketServer,
  createLocalApplicationTransport,
  type PraxisApplicationCommand,
  type PraxisApplicationCommandResult,
  type PraxisApplicationPermissionProfile,
  type PraxisApplicationReasoningEffort,
  type PraxisApplicationRestServer,
  type PraxisApplicationRuntimeMode,
  type PraxisApplicationViewModel,
  type PraxisApplicationWebSocketServer,
} from "@praxis-ai/praxis/application-layer";
import {
  createRaxodeLiveProvider,
  resolveRaxodeConfiguredModelOptions,
} from "./authentication/liveProvider.js";

export type RaxodeBackendCommand = {
  task?: string;
  cwd?: string;
  mode?: PraxisApplicationRuntimeMode;
  sessionId?: string;
  model?: string;
  reasoningEffort?: PraxisApplicationReasoningEffort;
  permissionProfile?: PraxisApplicationPermissionProfile;
};

export type RaxodeBackendResult = PraxisApplicationCommandResult;

export type RaxodeBackend = {
  readonly backendId: "applicationLayer";
  readonly projectRoot: string;
  getView(): Promise<PraxisApplicationViewModel>;
  dispatch(command: PraxisApplicationCommand): Promise<PraxisApplicationCommandResult>;
  run(command?: RaxodeBackendCommand): Promise<RaxodeBackendResult>;
};

export type RaxodeBackendServerOptions = {
  projectRoot?: string;
  host?: string;
  port?: number;
  now?: () => string;
};

async function createRaxodeRuntime(options: {
  projectRoot?: string;
  now?: () => string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? "raxode-cli/backend");
  const modelOptions = resolveRaxodeConfiguredModelOptions({ roleId: "core.main", startDir: process.cwd() });
  const runtimeResult = await createApplicationProjectRuntime(projectRoot, {
    applicationId: "application.raxode.coding",
    mode: "dry-run",
    provider: modelOptions.provider,
    endpointShape: modelOptions.endpointShape,
    baseURL: modelOptions.baseURL,
    providerRoute: modelOptions.providerRoute,
    model: modelOptions.model,
    reasoningEffort: modelOptions.reasoningEffort,
    maxOutputTokens: modelOptions.maxOutputTokens,
    permissionProfile: "standard",
    now: options.now,
    liveProviderResolver: async (manifest, context) => createRaxodeLiveProvider(manifest, {
      startDir: process.cwd(),
      sessionId: context?.sessionId,
      runtimeId: context?.runtimeId,
      turnId: context?.turnId,
      onTextDelta: context?.onTextDelta,
      onProviderStreamEvent: context?.onProviderStreamEvent,
    }),
  });
  if (!runtimeResult.ok) {
    throw new Error(runtimeResult.error.message);
  }
  return { projectRoot, runtime: runtimeResult.runtime };
}

export async function createRaxodeBackend(options: {
  projectRoot?: string;
  now?: () => string;
} = {}): Promise<RaxodeBackend> {
  const { projectRoot, runtime } = await createRaxodeRuntime(options);
  const transport = createLocalApplicationTransport(runtime);

  return {
    backendId: "applicationLayer",
    projectRoot,
    async getView() {
      return await transport.getView();
    },
    async dispatch(command) {
      return await transport.dispatch(command);
    },
    async run(command = {}) {
      const mode = command.mode ?? "dry-run";
      const cwd = path.resolve(command.cwd ?? process.cwd());
      const start = await transport.dispatch({
        type: "application.start",
        sessionId: command.sessionId,
        cwd,
        mode,
      });
      if (!start.ok) return start;
      if (command.model || command.reasoningEffort) {
        const model = await transport.dispatch({
          type: "application.changeModel",
          sessionId: command.sessionId,
          model: command.model ?? start.view.model.model,
          reasoningEffort: command.reasoningEffort ?? start.view.model.reasoningEffort,
        });
        if (!model.ok) return model;
      }
      if (command.permissionProfile) {
        const permission = await transport.dispatch({
          type: "application.changePermissionProfile",
          sessionId: command.sessionId,
          profile: command.permissionProfile,
        });
        if (!permission.ok) return permission;
      }
      return await transport.dispatch({
        type: "application.submitTurn",
        sessionId: command.sessionId,
        mode,
        input: {
          type: "application.input",
          text: command.task?.trim() || "Describe the Raxode application backend readiness.",
          cwd,
        },
      });
    },
  };
}

export async function createRaxodeBackendRestServer(
  options: RaxodeBackendServerOptions = {},
): Promise<PraxisApplicationRestServer> {
  const { runtime } = await createRaxodeRuntime(options);
  return await createApplicationRestServer(runtime, {
    host: options.host,
    port: options.port,
  });
}

export async function createRaxodeBackendWebSocketServer(
  options: RaxodeBackendServerOptions = {},
): Promise<PraxisApplicationWebSocketServer> {
  const { runtime } = await createRaxodeRuntime(options);
  return await createApplicationWebSocketServer(runtime, {
    host: options.host,
    port: options.port,
  });
}
