import { spawn } from "node:child_process";
import { once } from "node:events";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dataDirectory = path.resolve(root, "data", "question-banks");
const validPath = path.resolve(dataDirectory, "__quizx-lifecycle-valid.json");
const invalidPath = path.resolve(dataDirectory, "__quizx-lifecycle-invalid.json");
const nextRunner = path.resolve(root, "scripts", "run-next.mjs");
const port = 3210;
const baseUrl = `http://127.0.0.1:${port}`;

if (!validPath.startsWith(`${dataDirectory}${path.sep}`) || !invalidPath.startsWith(`${dataDirectory}${path.sep}`)) {
  throw new Error("生命周期测试文件必须位于题库目录内");
}

const temporaryBank = {
  id: "lifecycle-temporary",
  title: "生命周期临时题库",
  description: "仅用于验证进程内只读和重启加载。",
  version: 1,
  questions: [
    {
      id: "q1",
      type: "judgment",
      stemMd: "临时题目",
      options: [
        { id: "true", text: "正确" },
        { id: "false", text: "错误" },
      ],
      correctOptionIds: ["true"],
      explanationMd: "用于生命周期测试的临时解析。",
    },
  ],
};

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function startServer() {
  const child = spawn(process.execPath, [nextRunner, "start", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

async function waitForReady(server, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`服务在就绪前退出：\n${server.getOutput()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/banks`, { cache: "no-store" });
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Startup races are expected until the listener is ready.
    }
    await delay(150);
  }
  throw new Error(`等待生产服务就绪超时：\n${server.getOutput()}`);
}

async function stopServer(server) {
  if (!server || server.child.exitCode !== null) {
    return;
  }
  const gracefulExit = once(server.child, "exit");
  server.child.kill("SIGTERM");
  await Promise.race([gracefulExit, delay(5_000)]);
  if (server.child.exitCode === null) {
    const forcedExit = once(server.child, "exit");
    server.child.kill("SIGKILL");
    await Promise.race([forcedExit, delay(3_000)]);
  }
  server.child.stdout.destroy();
  server.child.stderr.destroy();
}

async function removeTemporaryFiles() {
  await Promise.all([
    unlink(validPath).catch((error) => { if (error.code !== "ENOENT") throw error; }),
    unlink(invalidPath).catch((error) => { if (error.code !== "ENOENT") throw error; }),
  ]);
}

let server;
try {
  await removeTemporaryFiles();

  server = startServer();
  const baseline = await waitForReady(server);
  if (baseline.some((bank) => bank.id === temporaryBank.id)) {
    throw new Error("基线中意外存在生命周期临时题库");
  }

  await writeFile(validPath, JSON.stringify(temporaryBank), "utf8");
  const withoutRestart = await (await fetch(`${baseUrl}/api/banks`, { cache: "no-store" })).json();
  if (withoutRestart.some((bank) => bank.id === temporaryBank.id)) {
    throw new Error("运行中的服务不应热加载新题库");
  }

  await stopServer(server);
  server = startServer();
  const afterRestart = await waitForReady(server);
  if (!afterRestart.some((bank) => bank.id === temporaryBank.id)) {
    throw new Error("重启后未加载新增题库");
  }

  await stopServer(server);
  server = undefined;
  await unlink(validPath);
  await writeFile(invalidPath, "{", "utf8");

  const invalidServer = startServer();
  server = invalidServer;
  await Promise.race([
    once(invalidServer.child, "exit"),
    delay(15_000).then(() => { throw new Error("非法 JSON 未阻止服务启动"); }),
  ]);
  const invalidOutput = invalidServer.getOutput();
  if (
    invalidServer.child.exitCode === 0 ||
    !invalidOutput.includes(path.basename(invalidPath)) ||
    !invalidOutput.includes("JSON 语法位置")
  ) {
    throw new Error(`非法 JSON 的启动日志无法定位文件或位置：\n${invalidOutput}`);
  }

  console.log("✓ 生产服务真实启动并可访问三个 API");
  console.log("✓ 运行中题库保持只读，重启后加载新内容");
  console.log("✓ 非法 JSON 阻止启动且日志包含文件与语法位置");
} finally {
  await stopServer(server);
  await removeTemporaryFiles();
}
