import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const nextRunner = path.resolve(root, "scripts", "run-next.mjs");
const playwrightCli = path.resolve(root, "node_modules", "@playwright", "test", "cli.js");
const baseUrl = "http://127.0.0.1:3100";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function startServer() {
  const child = spawn(process.execPath, [nextRunner, "start", "-p", "3100"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

async function waitForServer(server) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`E2E 生产服务启动失败：\n${server.getOutput()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/banks`, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until Next.js starts listening.
    }
    await delay(150);
  }
  throw new Error(`E2E 生产服务启动超时：\n${server.getOutput()}`);
}

async function stopServer(server) {
  if (server.child.exitCode !== null) {
    return;
  }
  const gracefulExit = once(server.child, "exit");
  server.child.kill("SIGTERM");
  await Promise.race([gracefulExit, delay(3_000)]);
  if (server.child.exitCode === null) {
    const forcedExit = once(server.child, "exit");
    server.child.kill("SIGKILL");
    await Promise.race([forcedExit, delay(3_000)]);
  }
  server.child.stdout.destroy();
  server.child.stderr.destroy();
}

const server = startServer();
let exitCode = 1;

try {
  await waitForServer(server);
  const runner = spawn(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  const [code] = await once(runner, "exit");
  exitCode = typeof code === "number" ? code : 1;
} finally {
  await stopServer(server);
}

process.exitCode = exitCode;
