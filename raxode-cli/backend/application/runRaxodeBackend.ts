import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  describeApplicationRestTransport,
  describeApplicationWebSocketTransport,
} from "@praxis-ai/praxis/application-layer";
import { raxodeApplication } from "./raxodeApplication.js";

const runtimeResult = await createApplicationProjectRuntime(new URL("..", import.meta.url).pathname, {
  applicationId: raxodeApplication.id,
  mode: process.argv.includes("--live") ? "live" : "dry-run",
  model: "gpt-5.5",
  reasoningEffort: "low",
  permissionProfile: "standard",
});

if (!runtimeResult.ok) {
  console.error(runtimeResult.error.message);
  process.exit(1);
}

const transport = createLocalApplicationTransport(runtimeResult.runtime);
const start = await transport.dispatch({
  type: "application.start",
  cwd: process.cwd(),
});
if (!start.ok) {
  console.error(start.error.message);
  process.exit(1);
}

const task = process.argv.filter((arg) => !arg.startsWith("--")).join(" ").trim()
  || "Describe the Raxode application backend readiness.";
const result = await transport.dispatch({
  type: "application.submitTurn",
  mode: process.argv.includes("--live") ? "live" : "dry-run",
  input: {
    type: "application.input",
    text: task,
    cwd: process.cwd(),
  },
});

console.log(JSON.stringify({
  application: raxodeApplication,
  transports: {
    local: transport.descriptor,
    rest: describeApplicationRestTransport(),
    websocket: describeApplicationWebSocketTransport(),
  },
  result,
}, null, 2));

process.exitCode = result.ok ? 0 : 1;

