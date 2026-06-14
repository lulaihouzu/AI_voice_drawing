import { describe, expect, it } from "vitest";
import { parseEnvContent, resolveDevMode } from "../scripts/dev.mjs";

describe("dev startup script", () => {
  it("parses local env files without overriding comments or quotes", () => {
    expect(
      parseEnvContent(`
        # local settings
        DEEPSEEK_API_KEY="test-key"
        AI_PROXY_PORT=9876
        EMPTY_LINE=
      `),
    ).toEqual({
      DEEPSEEK_API_KEY: "test-key",
      AI_PROXY_PORT: "9876",
      EMPTY_LINE: "",
    });
  });

  it("uses an explicit AI endpoint before starting a local proxy", () => {
    const mode = resolveDevMode({
      VITE_AI_COMMAND_ENDPOINT: "http://example.test/api",
      DEEPSEEK_API_KEY: "test-key",
    });

    expect(mode).toMatchObject({
      mode: "external-endpoint",
      endpoint: "http://example.test/api",
      viteEnv: {
        VITE_AI_COMMAND_ENDPOINT: "http://example.test/api",
      },
    });
  });

  it("starts in DeepSeek proxy mode when only the api key is configured", () => {
    const mode = resolveDevMode({
      DEEPSEEK_API_KEY: "test-key",
      AI_PROXY_PORT: "9876",
    });

    expect(mode).toMatchObject({
      mode: "deepseek-proxy",
      endpoint: "http://localhost:9876/api/ai/commands",
      viteEnv: {
        VITE_AI_COMMAND_ENDPOINT: "http://localhost:9876/api/ai/commands",
      },
    });
  });

  it("falls back to mock mode without an endpoint or api key", () => {
    expect(resolveDevMode({})).toEqual({
      mode: "mock",
      viteEnv: {},
    });
  });
});
