import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  dts: true,
  clean: true,
  sourcemap: true,
  noExternal: [
    "@mieweb/jerry-agent-runtime",
    "@mieweb/jerry-tools",
    "ozwellai",
    "@mieweb/cloud-types",
  ],
  external: [
    "ink",
    "ink-spinner",
    "react",
    "ai",
    "@ai-sdk/openai-compatible",
    "zod",
    "conf",
    "@modelcontextprotocol/sdk",
  ],
});
