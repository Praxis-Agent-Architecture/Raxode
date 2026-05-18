/*
 * 文件定位：raxode-cli / 前端 TUI 入口。
 * 核心目的：渲染 application contract view model；组件和后端桥接分层放在 frontend 子目录。
 * 边界：不导入 agentCore，不解析 agent 文件，不执行 runtime。
 */

import React from "react";

import type { RaxodeApplicationViewModel } from "../contracts.js";
import { RaxodeShell } from "./components/Shell.js";
import { RaxodeProcessApp } from "./components/ProcessApp.js";
import { renderFastInk } from "./tui-input/fast-ink-render.js";

const h = React.createElement;

export function RaxodeApplicationTui(props: { view: RaxodeApplicationViewModel }): React.ReactElement {
  return h(RaxodeShell, { view: props.view });
}

export function renderRaxodeApplicationTui(view: RaxodeApplicationViewModel): { unmount: () => void } {
  const instance = renderFastInk(h(RaxodeApplicationTui, { view }));
  return { unmount: () => instance.unmount() };
}

export function renderRaxodeInteractiveTui(): { unmount: () => void; waitUntilExit: () => Promise<void> } {
  const instance = renderFastInk(h(RaxodeProcessApp));
  return {
    unmount: () => instance.unmount(),
    waitUntilExit: () => instance.waitUntilExit(),
  };
}
