import net from "node:net";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { openSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "..");
const host = "127.0.0.1";
const port = 1420;
const readyUrl = `http://${host}:${port}/@vite/client`;
const appUrl = `http://${host}:${port}/`;
const readyTimeoutMs = 30000;
const logPath = resolve(workspaceRoot, ".vscode", "ui-dev.log");

function canConnect() {
  return new Promise((resolvePromise) => {
    const socket = net.createConnection({ host, port });

    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.end();
      resolvePromise(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolvePromise(false);
    });
    socket.once("error", () => {
      resolvePromise(false);
    });
  });
}

function isViteReady() {
  return new Promise((resolvePromise) => {
    const request = http.get(readyUrl, (response) => {
      response.resume();
      resolvePromise(response.statusCode === 200);
    });

    request.setTimeout(1000, () => {
      request.destroy();
      resolvePromise(false);
    });

    request.once("error", () => {
      resolvePromise(false);
    });
  });
}

async function waitForVite() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < readyTimeoutMs) {
    if ((await canConnect()) && (await isViteReady())) {
      console.log(`DataPad++ UI ready at ${appUrl}`);
      return true;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  return false;
}

if ((await canConnect()) && (await isViteReady())) {
  console.log(`DataPad++ UI ready at ${appUrl}`);
  process.exit(0);
}

const child =
  process.platform === "win32"
    ? spawn(
        "cmd.exe",
        ["/d", "/s", "/c", "npm run dev --workspace @datapadplusplus/desktop"],
        {
          cwd: workspaceRoot,
          detached: true,
          stdio: [
            "ignore",
            openSync(logPath, "a"),
            openSync(logPath, "a")
          ]
        }
      )
    : spawn("npm", ["run", "dev", "--workspace", "@datapadplusplus/desktop"], {
        cwd: workspaceRoot,
        detached: true,
        stdio: [
          "ignore",
          openSync(logPath, "a"),
          openSync(logPath, "a")
        ]
      });

child.once("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.unref();

function stopChild() {
  if (!child.killed) {
    child.kill();
  }
}

process.once("SIGINT", stopChild);
process.once("SIGTERM", stopChild);

if (!(await waitForVite())) {
  stopChild();
  console.error(`DataPad++ UI dev server did not become ready at ${appUrl}`);
  process.exit(1);
}

process.exit(0);
