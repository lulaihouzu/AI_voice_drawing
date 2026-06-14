import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = join(rootDir, "node_modules", "vite", "bin", "vite.js");
const proxyScript = join(rootDir, "server", "deepseekProxy.mjs");

const childProcesses = [];

export function resolveDevMode(env) {
  const explicitAiEndpoint = env.VITE_AI_COMMAND_ENDPOINT?.trim();
  const deepSeekApiKey = env.DEEPSEEK_API_KEY?.trim();
  const aiProxyPort = env.AI_PROXY_PORT?.trim() || "8787";
  const localAiEndpoint = `http://localhost:${aiProxyPort}/api/ai/commands`;

  if (explicitAiEndpoint) {
    return {
      mode: "external-endpoint",
      endpoint: explicitAiEndpoint,
      viteEnv: {
        ...env,
        VITE_AI_COMMAND_ENDPOINT: explicitAiEndpoint,
      },
    };
  }

  if (deepSeekApiKey) {
    return {
      mode: "deepseek-proxy",
      endpoint: localAiEndpoint,
      viteEnv: {
        ...env,
        VITE_AI_COMMAND_ENDPOINT: localAiEndpoint,
      },
    };
  }

  return {
    mode: "mock",
    viteEnv: env,
  };
}

export function parseEnvContent(content) {
  const parsed = {};

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    parsed[key] = unquote(trimmed.slice(separatorIndex + 1).trim());
  });

  return parsed;
}

export function runDev() {
  loadEnvFile(join(rootDir, ".env"));
  loadEnvFile(join(rootDir, ".env.local"));

  const viteArgs = process.argv.slice(2);
  const devMode = resolveDevMode(process.env);

  if (devMode.mode === "external-endpoint") {
    console.log(`AI provider endpoint: ${devMode.endpoint}`);
    startVite(viteArgs, devMode.viteEnv);
  } else if (devMode.mode === "deepseek-proxy") {
    console.log(`DeepSeek proxy endpoint: ${devMode.endpoint}`);
    startProxy();
    startVite(viteArgs, devMode.viteEnv);
  } else {
    console.log("DEEPSEEK_API_KEY is not configured. Starting frontend with local mock AI provider.");
    startVite(viteArgs, devMode.viteEnv);
  }

  process.on("SIGINT", () => stopChildren("SIGINT"));
  process.on("SIGTERM", () => stopChildren("SIGTERM"));
}

function startProxy() {
  startChild("DeepSeek proxy", process.execPath, [proxyScript], process.env);
}

function startVite(viteArgs, env) {
  startChild("Vite", process.execPath, [viteBin, ...viteArgs], env);
}

function startChild(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env,
    stdio: "inherit",
  });

  childProcesses.push(child);
  child.on("exit", (code, signal) => {
    if (signal) {
      return;
    }

    const exitCode = code ?? 1;
    console.log(`${label} exited with code ${exitCode}.`);
    stopChildren();
    process.exit(exitCode);
  });
}

function stopChildren(signal = "SIGTERM") {
  childProcesses.forEach((child) => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const parsed = parseEnvContent(readFileSync(filePath, "utf8"));

  Object.entries(parsed).forEach(([key, value]) => {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDev();
}
