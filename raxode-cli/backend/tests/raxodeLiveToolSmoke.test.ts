import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

const liveEnabled = process.env.RAXODE_LIVE_TEST === "1";

type RaxodeSmokeView = {
  status: string;
  finalOutput?: string;
  counters?: {
    modelCalls?: number;
    toolCalls?: number;
  };
};

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function runRaxodeLiveSmoke(prompt: string): Promise<RaxodeSmokeView> {
  const { stdout } = await execFileAsync(
    "./bin/raxode-cli",
    ["--process", "--json", "--live", "--permission", "bapr", prompt],
    {
      cwd: process.cwd(),
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        AGENTCORE_CODEX_MODEL: process.env.AGENTCORE_CODEX_MODEL ?? "gpt-5.5",
        AGENTCORE_CODEX_REASONING_EFFORT: process.env.AGENTCORE_CODEX_REASONING_EFFORT ?? "low",
      },
    },
  );
  const jsonStart = stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, stdout);
  return JSON.parse(stdout.slice(jsonStart)) as RaxodeSmokeView;
}

const cases = [
  {
    name: "shell.commandExecution",
    prompt: "请实际调用 shell.commandExecution 执行 pwd，然后只回答命令输出。",
    expected: "/home/proview/Desktop/Praxis_series/Praxis_org",
  },
  {
    name: "git.getRepositoryStatus",
    prompt: "请实际调用 git.getRepositoryStatus 查看当前仓库状态，然后只用一句话总结 porcelain 状态。",
    expected: "porcelain",
  },
  {
    name: "code.read",
    prompt: "请实际调用 code.read 读取 package.json，只回答里面的 name 字段值。",
    expected: "@praxis-ai/praxis",
  },
  {
    name: "search.fetch",
    prompt: "请实际调用 search.fetch 抓取 https://example.com ，只回答页面标题。",
    expected: "Example",
  },
  {
    name: "skill.ripgrep",
    prompt: "请实际调用 skill.ripgrep 在当前仓库搜索字符串 \"PraxisApplicationRuntime\"，只回答匹配到的一个文件路径。",
    expected: "raxode-cli/backend/",
  },
  {
    name: "computeruse.fullscreenScreenshot",
    prompt: "请实际调用 computeruse.fullscreenScreenshot 截取当前屏幕；如果工具失败，只回答失败码和一句原因，不要声称成功。",
    expected: "screenshot",
  },
  {
    name: "mcp.listTools",
    prompt: "请实际调用 mcp.listTools，目标 serverId 用 nonexistent-raxode-smoke-server；如果失败，只回答失败码和原因。",
    expected: "echo",
  },
] as const;

for (const testCase of cases) {
  test(`raxode live tool smoke: ${testCase.name}`, { skip: liveEnabled ? false : "set RAXODE_LIVE_TEST=1 to run live provider/tool smoke" }, async () => {
    const view = await runRaxodeLiveSmoke(testCase.prompt);
    assert.equal(view.status, "completed");
    assert.equal(view.counters?.toolCalls, 1);
    assert.ok((view.counters?.modelCalls ?? 0) >= 1);
    if (testCase.name === "computeruse.fullscreenScreenshot") {
      const output = view.finalOutput ?? "";
      assert.match(output, /artifact:screenshot:|screenshot-[-\w]+\.png/iu);
      const pathMatch = output.match(/\/[^\s`]+screenshot-[-\w]+\.png/iu);
      if (pathMatch?.[0]) {
        await access(pathMatch[0]);
      }
      return;
    }
    assert.match(view.finalOutput ?? "", new RegExp(testCase.expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu"));
  });
}

test("raxode live tool smoke: omni.viewImage reports provider availability honestly", { skip: liveEnabled ? false : "set RAXODE_LIVE_TEST=1 to run live provider/tool smoke" }, async () => {
  await writeFile("/tmp/raxode-omni-smoke.png", tinyPng);
  const view = await runRaxodeLiveSmoke(
    "请实际调用 omni.viewImage 查看 /tmp/raxode-omni-smoke.png 这张图片；如果工具成功，只回答工具成功；如果失败，只回答失败码。",
  );
  assert.equal(view.status, "completed");
  assert.equal(view.counters?.toolCalls, 1);
  assert.match(view.finalOutput ?? "", /PROVIDER_UNAVAILABLE|工具成功/iu);
});
