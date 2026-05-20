import {Writable} from "node:stream";
import {performance} from "node:perf_hooks";

import React from "react";

import {Box, Text, render, renderToString} from "../raxode-cli/frontend/tui/runtime/ink/index.ts";

class BenchmarkStream extends Writable {
  columns = 120;
  rows = 40;
  isTTY = true;
  bytes = 0;
  writes = 0;

  _write(chunk, _encoding, callback) {
    this.writes += 1;
    this.bytes += Buffer.byteLength(chunk);
    callback();
  }
}

function createFrame(step, lineCount) {
  const rows = [];
  for (let index = 0; index < lineCount; index += 1) {
    rows.push(
      React.createElement(
        Text,
        {key: `line-${index}`, color: index % 3 === 0 ? "cyan" : undefined},
        `step=${step} line=${index} ${"agent-event ".repeat(6)}${index === step % lineCount ? "*" : ""}`,
      ),
    );
  }

  return React.createElement(
    Box,
    {flexDirection: "column", width: 100},
    React.createElement(Text, {bold: true, color: "green"}, `Raxode Ink runtime benchmark ${step}`),
    ...rows,
  );
}

function percentile(values, percentileRank) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor((percentileRank / 100) * sorted.length));
  return sorted[index];
}

async function benchLiveRender({label, incrementalRendering, iterations, lineCount}) {
  const stdout = new BenchmarkStream();
  const stderr = new BenchmarkStream();
  const frameTimes = [];
  let renderCalls = 0;
  let renderTimeTotal = 0;

  const instance = render(createFrame(0, lineCount), {
    stdout,
    stderr,
    stdin: process.stdin,
    patchConsole: false,
    exitOnCtrlC: false,
    interactive: true,
    maxFps: 10_000,
    incrementalRendering,
    onRender(metrics) {
      renderCalls += 1;
      renderTimeTotal += metrics.renderTime;
    },
  });

  await instance.waitUntilRenderFlush();

  const start = performance.now();
  for (let index = 1; index <= iterations; index += 1) {
    const frameStart = performance.now();
    instance.rerender(createFrame(index, lineCount));
    await instance.waitUntilRenderFlush();
    frameTimes.push(performance.now() - frameStart);
  }
  const elapsed = performance.now() - start;

  instance.unmount();
  await instance.waitUntilExit();

  return {
    label,
    iterations,
    lineCount,
    elapsedMs: Number(elapsed.toFixed(2)),
    avgFrameMs: Number((elapsed / iterations).toFixed(3)),
    p95FrameMs: Number(percentile(frameTimes, 95).toFixed(3)),
    renderCalls,
    avgInkRenderMs: Number((renderTimeTotal / Math.max(1, renderCalls)).toFixed(3)),
    writes: stdout.writes,
    bytes: stdout.bytes,
  };
}

function benchRenderToString({iterations, lineCount}) {
  const start = performance.now();
  let bytes = 0;
  for (let index = 0; index < iterations; index += 1) {
    bytes += Buffer.byteLength(renderToString(createFrame(index, lineCount), {columns: 120}));
  }
  const elapsed = performance.now() - start;
  return {
    label: "renderToString",
    iterations,
    lineCount,
    elapsedMs: Number(elapsed.toFixed(2)),
    avgFrameMs: Number((elapsed / iterations).toFixed(3)),
    bytes,
  };
}

const iterations = Number.parseInt(process.env.RAXODE_INK_BENCH_ITERATIONS ?? "400", 10);
const lineCount = Number.parseInt(process.env.RAXODE_INK_BENCH_LINES ?? "80", 10);

const results = [
  benchRenderToString({iterations, lineCount}),
  await benchLiveRender({label: "live/full-redraw", incrementalRendering: false, iterations, lineCount}),
  await benchLiveRender({label: "live/incremental", incrementalRendering: true, iterations, lineCount}),
];

console.log(JSON.stringify({iterations, lineCount, results}, null, 2));
