import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "..");
const stateDir = resolve(workspaceRoot, ".datapadplusplus");
const statePath = resolve(stateDir, "dev-workspace-root.json");
const lockPath = resolve(stateDir, "dev-workspace-preflight.lock");
const tauriTargetRoot = resolve(
  workspaceRoot,
  "apps",
  "desktop",
  "src-tauri",
  "target"
);
const generatedBuildRoots = [
  resolve(tauriTargetRoot, "debug", "build"),
  resolve(tauriTargetRoot, "release", "build")
];
const stalePathPatterns = [
  /C:[\\/]+Users[\\/]+gmont[\\/]+source[\\/]+repos[\\/]+Universality/i,
  /source[\\/]+repos[\\/]+Universality/i
];
const workspacePackageLinks = [
  resolve(workspaceRoot, "node_modules", "@datapadplusplus", "desktop"),
  resolve(workspaceRoot, "node_modules", "@datapadplusplus", "shared-types")
];
const maxScannedFileBytes = 1024 * 1024;
const lockTimeoutMs = 30000;
const lockPollMs = 100;

function sleep(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

async function withPreflightLock(callback) {
  mkdirSync(stateDir, { recursive: true });

  const startedAt = Date.now();
  let lockDescriptor = null;

  while (lockDescriptor === null) {
    try {
      lockDescriptor = openSync(lockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST" || Date.now() - startedAt > lockTimeoutMs) {
        throw error;
      }

      await sleep(lockPollMs);
    }
  }

  try {
    return await callback();
  } finally {
    closeSync(lockDescriptor);

    try {
      unlinkSync(lockPath);
    } catch {
      // A stale lock cleanup by another process is harmless.
    }
  }
}

function readPreviousRoot() {
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    return typeof state.workspaceRoot === "string" ? state.workspaceRoot : null;
  } catch {
    return null;
  }
}

function safeRemoveGeneratedBuildRoot(buildRoot) {
  const resolvedRoot = resolve(buildRoot);
  const resolvedTarget = resolve(tauriTargetRoot);
  const isInsideTarget =
    resolvedRoot === resolvedTarget || resolvedRoot.startsWith(`${resolvedTarget}${sep}`);
  const isExpectedBuildRoot = generatedBuildRoots.some(
    (expectedRoot) => resolve(expectedRoot) === resolvedRoot
  );

  if (!isInsideTarget || !isExpectedBuildRoot) {
    throw new Error(`Refusing to remove unexpected path: ${resolvedRoot}`);
  }

  if (existsSync(resolvedRoot)) {
    rmSync(resolvedRoot, { recursive: true, force: true });
  }
}

function fileContainsStalePath(filePath) {
  try {
    const stats = statSync(filePath);

    if (!stats.isFile() || stats.size > maxScannedFileBytes) {
      return false;
    }

    const content = readFileSync(filePath, "utf8");
    return stalePathPatterns.some((pattern) => pattern.test(content));
  } catch {
    return false;
  }
}

function directoryContainsStalePath(directory) {
  if (!existsSync(directory)) {
    return false;
  }

  const stack = [directory];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];

    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = resolve(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (fileContainsStalePath(entryPath)) {
        return true;
      }
    }
  }

  return false;
}

function writeCurrentRoot() {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    statePath,
    `${JSON.stringify({ workspaceRoot, updatedAt: new Date().toISOString() }, null, 2)}\n`
  );
}

function pathIsInsideWorkspace(path) {
  const resolvedPath = resolve(path);
  return resolvedPath === workspaceRoot || resolvedPath.startsWith(`${workspaceRoot}${sep}`);
}

function staleWorkspacePackageLinks() {
  return workspacePackageLinks.filter((linkPath) => {
    try {
      if (!existsSync(linkPath)) {
        return true;
      }

      const stats = lstatSync(linkPath);

      if (!stats.isSymbolicLink() && !stats.isDirectory()) {
        return false;
      }

      return !pathIsInsideWorkspace(realpathSync(linkPath));
    } catch {
      return true;
    }
  });
}

function refreshWorkspacePackageLinks() {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["install"], {
    cwd: workspaceRoot,
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    throw new Error(`npm install failed while refreshing workspace package links.`);
  }
}

await withPreflightLock(() => {
  const previousRoot = readPreviousRoot();
  const movedWorkspace = previousRoot !== null && resolve(previousRoot) !== workspaceRoot;
  const hasLegacyBuildOutput = generatedBuildRoots.some(directoryContainsStalePath);
  const stalePackageLinks = staleWorkspacePackageLinks();

  if (stalePackageLinks.length > 0) {
    console.log("DataPad++ debug preflight: refreshing stale workspace package links.");
    refreshWorkspacePackageLinks();

    const remainingStaleLinks = staleWorkspacePackageLinks();

    if (remainingStaleLinks.length > 0) {
      throw new Error(
        `Workspace package links still point outside this repo: ${remainingStaleLinks.join(", ")}`
      );
    }
  }

  if (movedWorkspace || hasLegacyBuildOutput) {
    const reason = movedWorkspace
      ? `workspace moved from ${previousRoot} to ${workspaceRoot}`
      : "generated Tauri build output references the old Universality path";

    console.log(`DataPad++ debug preflight: cleaning generated build-script output (${reason}).`);

    for (const buildRoot of generatedBuildRoots) {
      safeRemoveGeneratedBuildRoot(buildRoot);
    }
  } else {
    console.log("DataPad++ debug preflight: workspace path is ready.");
  }

  writeCurrentRoot();
});
