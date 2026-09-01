import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const mode = process.argv[2];
const nextArguments = process.argv.slice(3);

if (mode !== "dev" && mode !== "start") {
  throw new Error("run-next.mjs 仅支持 dev 或 start 模式");
}

const validator = path.resolve(root, "scripts", "validate-question-banks.mjs");
const nextCli = path.resolve(root, "node_modules", "next", "dist", "bin", "next");

const validation = spawn(process.execPath, [validator], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});
const [validationCode] = await once(validation, "exit");

if (validationCode !== 0) {
  process.exitCode = typeof validationCode === "number" ? validationCode : 1;
} else {
  const nextServer = spawn(process.execPath, [nextCli, mode, ...nextArguments], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });

  const forwardSignal = (signal) => {
    if (nextServer.exitCode === null) {
      nextServer.kill(signal);
    }
  };
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  const [nextCode] = await once(nextServer, "exit");
  process.exitCode = typeof nextCode === "number" ? nextCode : 1;
}
