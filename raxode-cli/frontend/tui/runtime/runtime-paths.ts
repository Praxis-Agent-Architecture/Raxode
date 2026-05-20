import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function resolveUserHome(fallbackDir = process.cwd()): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? fallbackDir;
}

export function resolveRaxodeHome(fallbackDir = process.cwd()): string {
  return resolve(process.env.RAXODE_HOME ?? join(resolveUserHome(fallbackDir), ".raxode"));
}

export function resolveConfigRoot(fallbackDir = process.cwd()): string {
  return resolveRaxodeHome(fallbackDir);
}

export function resolveStateRoot(fallbackDir = process.cwd()): string {
  return resolveRaxodeHome(fallbackDir);
}

export function resolveWorkspaceRoot(fallbackDir = process.cwd()): string {
  return resolve(process.env.PRAXIS_WORKSPACE_ROOT ?? process.env.INIT_CWD ?? fallbackDir);
}

export function resolveAppRoot(fallbackDir = process.cwd()): string {
  return resolve(process.env.PRAXIS_APP_ROOT ?? fallbackDir);
}

export function resolveWorkspaceRaxodeRoot(workspaceRoot = process.cwd()): string {
  return resolve(workspaceRoot, ".raxode");
}

export function resolveWorkspaceRaxodeAgentsMarkdownPath(workspaceRoot = process.cwd()): string {
  return resolve(resolveWorkspaceRaxodeRoot(workspaceRoot), "AGENTS.md");
}

export function resolveWorkspaceRaxodeInitStatePath(workspaceRoot = process.cwd()): string {
  return resolve(resolveWorkspaceRaxodeRoot(workspaceRoot), "init-state.json");
}

export function resolveWorkspaceRaxodeAgentsDir(workspaceRoot = process.cwd()): string {
  return resolve(resolveWorkspaceRaxodeRoot(workspaceRoot), "agents");
}

export function resolveWorkspaceRaxodeRewindDir(workspaceRoot = process.cwd()): string {
  return resolve(resolveWorkspaceRaxodeRoot(workspaceRoot), "rewind");
}

export function resolveWorkspaceRaxodeSessionsDir(workspaceRoot = process.cwd()): string {
  return resolve(resolveWorkspaceRaxodeRoot(workspaceRoot), "sessions");
}

export function resolveConfiguredLiveEnvPath(fallbackDir = process.cwd()): string {
  return resolve(process.env.PRAXIS_LIVE_ENV_FILE ?? join(resolveConfigRoot(fallbackDir), ".env"));
}

export function resolveAuthJsonPath(fallbackDir = process.cwd()): string {
  return resolve(resolveConfigRoot(fallbackDir), "auth.json");
}

export function resolveConfigJsonPath(fallbackDir = process.cwd()): string {
  return resolve(resolveConfigRoot(fallbackDir), "config.json");
}

export function resolveLegacyLiveEnvPath(startDir = process.cwd()): string {
  let current = resolve(startDir);

  while (true) {
    const candidate = resolve(current, ".env.local");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(startDir, ".env.local");
    }
    current = parent;
  }
}

export function resolveLiveEnvPath(startDir = process.cwd()): string {
  const configuredPath = resolveConfiguredLiveEnvPath(startDir);
  if (process.env.PRAXIS_LIVE_ENV_FILE || existsSync(configuredPath)) {
    return configuredPath;
  }
  return resolveLegacyLiveEnvPath(resolveAppRoot(startDir));
}

export function resolveLiveReportsDir(fallbackDir = process.cwd()): string {
  return resolve(resolveStateRoot(fallbackDir), "live-reports");
}

export function resolveLogsDir(fallbackDir = process.cwd()): string {
  return resolve(resolveStateRoot(fallbackDir), "logs");
}

export function resolveSessionsDir(fallbackDir = process.cwd()): string {
  return resolve(resolveStateRoot(fallbackDir), "sessions");
}

export function resolveCacheDir(fallbackDir = process.cwd()): string {
  return resolve(resolveStateRoot(fallbackDir), "cache");
}
