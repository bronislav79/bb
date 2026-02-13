import * as fs from "fs";
import * as path from "path";
import { runBatch, type GenerateTask, type AspectRatio } from "./whisk-client.js";

// --- Configuration ---

interface Config {
  tokens: string[];
  prompts: string[];
  aspectRatio?: AspectRatio;
  outputDir?: string;
}

function loadConfig(): Config {
  // 1) Try config.json
  const configPath = path.resolve("config.json");
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw) as Config;
    if (!cfg.tokens?.length) throw new Error("config.json: 'tokens' array is empty");
    if (!cfg.prompts?.length) throw new Error("config.json: 'prompts' array is empty");
    return cfg;
  }

  // 2) Try CLI args: --tokens t1,t2 --prompts "p1" "p2"
  const args = process.argv.slice(2);
  const tokensIdx = args.indexOf("--tokens");
  const promptsIdx = args.indexOf("--prompts");
  const aspectIdx = args.indexOf("--aspect");
  const outIdx = args.indexOf("--output");

  if (tokensIdx === -1 || promptsIdx === -1) {
    printUsage();
    process.exit(1);
  }

  // Collect tokens (comma-separated or space-separated until next flag)
  const tokensRaw = collectArgs(args, tokensIdx + 1);
  const tokens = tokensRaw.flatMap((t) => t.split(",")).filter(Boolean);

  // Collect prompts (each arg until next flag)
  const prompts = collectArgs(args, promptsIdx + 1);

  const aspectRatio = aspectIdx !== -1 ? (args[aspectIdx + 1] as AspectRatio) : undefined;
  const outputDir = outIdx !== -1 ? args[outIdx + 1] : undefined;

  if (!tokens.length) throw new Error("No tokens provided");
  if (!prompts.length) throw new Error("No prompts provided");

  return { tokens, prompts, aspectRatio, outputDir };
}

function collectArgs(args: string[], startIdx: number): string[] {
  const result: string[] = [];
  for (let i = startIdx; i < args.length; i++) {
    if (args[i].startsWith("--")) break;
    result.push(args[i]);
  }
  return result;
}

function printUsage(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              Whisk Batch Image Generator                     ║
╚══════════════════════════════════════════════════════════════╝

Usage (config.json):
  Create a config.json file and run:
    npx ts-node --esm src/index.ts

  config.json format:
  {
    "tokens": [
      "eyJ..token1..",
      "eyJ..token2.."
    ],
    "prompts": [
      "A cyberpunk cat in neon city",
      "A peaceful mountain landscape"
    ],
    "aspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE",
    "outputDir": "./output"
  }

Usage (CLI args):
  npx ts-node --esm src/index.ts \\
    --tokens "token1" "token2" \\
    --prompts "prompt 1" "prompt 2" \\
    --aspect IMAGE_ASPECT_RATIO_LANDSCAPE \\
    --output ./output

Aspect ratios:
  IMAGE_ASPECT_RATIO_LANDSCAPE  (default)
  IMAGE_ASPECT_RATIO_PORTRAIT
  IMAGE_ASPECT_RATIO_SQUARE

Note: Number of prompts and tokens should match.
      Each prompt is sent with its corresponding token in parallel.
      If fewer tokens than prompts, tokens are reused (round-robin).
`);
}

// --- Main ---

async function main(): Promise<void> {
  const config = loadConfig();
  const { tokens, prompts, aspectRatio, outputDir = "./output" } = config;

  console.log(`\nTokens:  ${tokens.length}`);
  console.log(`Prompts: ${prompts.length}`);
  console.log(`Output:  ${path.resolve(outputDir)}\n`);

  // Build tasks: pair each prompt with a token (round-robin if fewer tokens)
  const tasks: GenerateTask[] = prompts.map((prompt, i) => ({
    token: tokens[i % tokens.length],
    prompt,
    aspectRatio: aspectRatio ?? "IMAGE_ASPECT_RATIO_LANDSCAPE",
  }));

  const results = await runBatch(tasks, outputDir);

  // Summary
  console.log("\n=== Results ===");
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  for (const r of succeeded) {
    console.log(`  OK  [${r.taskIndex + 1}] ${r.filePath}`);
  }
  for (const r of failed) {
    console.log(`  ERR [${r.taskIndex + 1}] ${r.error}`);
  }

  console.log(`\nDone: ${succeeded.length}/${results.length} images generated.`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
