import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

export interface ApiConfig {
  host: string;
  port: number;
  llmProvider: "mock" | "doubao";
  doubao: {
    apiKey?: string;
    baseUrl: string;
    model?: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  };
  feishuWebhookUrl?: string;
}

export function loadConfig(): ApiConfig {
  loadLocalEnv();

  const port = Number(process.env.API_PORT ?? 4000);
  const provider = normalizeProvider(process.env.LLM_PROVIDER);

  return {
    host: process.env.API_HOST ?? "0.0.0.0",
    port: Number.isFinite(port) ? port : 4000,
    llmProvider: provider,
    doubao: {
      apiKey: process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY || undefined,
      baseUrl: trimTrailingSlash(
        process.env.DOUBAO_BASE_URL || process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"
      ),
      model:
        process.env.DOUBAO_ENDPOINT_ID ||
        process.env.ARK_ENDPOINT_ID ||
        process.env.DOUBAO_MODEL ||
        process.env.ARK_MODEL ||
        undefined,
      temperature: readNumber(process.env.DOUBAO_TEMPERATURE, 0.2),
      maxTokens: readInteger(process.env.DOUBAO_MAX_TOKENS, 8000),
      timeoutMs: readInteger(process.env.DOUBAO_TIMEOUT_MS, 120000)
    },
    feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL || undefined
  };
}

function normalizeProvider(value?: string): ApiConfig["llmProvider"] {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "doubao" || normalized === "ark" || normalized === "volcengine") {
    return "doubao";
  }

  return "mock";
}

function readInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function loadLocalEnv(): void {
  const envPath = findUp(".env", process.cwd());

  if (!envPath) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);

    if (!parsed || process.env[parsed.key] !== undefined) {
      continue;
    }

    process.env[parsed.key] = parsed.value;
  }
}

function findUp(fileName: string, startDirectory: string): string | undefined {
  let current = startDirectory;

  while (true) {
    const candidate = join(current, fileName);

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);

    if (parent === current || parse(current).root === current) {
      return undefined;
    }

    current = parent;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }

  const separatorIndex = trimmed.indexOf("=");

  if (separatorIndex <= 0) {
    return undefined;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  const rawValue = trimmed.slice(separatorIndex + 1).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return undefined;
  }

  return {
    key,
    value: stripEnvQuotes(rawValue)
  };
}

function stripEnvQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
