# CLAUDE.md

This file provides guidance for AI assistants working in this repository.

## Repository Overview

**bb** — batch parallel image generation tool using the Google Whisk (AI Sandbox) API. Takes N bearer tokens and N prompts, sends all requests concurrently, saves generated images to disk.

## Project Structure

```
bb/
├── CLAUDE.md              # AI assistant guidance (this file)
├── package.json           # Node.js project config
├── tsconfig.json          # TypeScript config (ES2022, ESM)
├── .gitignore             # Ignores node_modules, dist, output, config.json
├── config.example.json    # Example configuration (copy to config.json)
├── src/
│   ├── index.ts           # Entry point: config loading, CLI args, main()
│   └── whisk-client.ts    # Whisk API client: HTTP calls, batch runner, image saving
└── output/                # Generated images land here (gitignored)
```

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js (ES2022 modules)
- **Dependencies:** ts-node (for direct TS execution), typescript
- **No external HTTP libraries** — uses native `node:https`

## Development Setup

```sh
npm install
```

## Build & Run

```sh
# Option 1: Run directly via ts-node
npx ts-node --esm src/index.ts

# Option 2: Compile then run
npm run build
npm start
```

## Configuration

Two ways to configure:

### 1. config.json (recommended)

Copy `config.example.json` to `config.json` and fill in real tokens/prompts:
```json
{
  "tokens": ["eyJ...token1", "eyJ...token2"],
  "prompts": ["prompt 1", "prompt 2"],
  "aspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE",
  "outputDir": "./output"
}
```

### 2. CLI arguments

```sh
npx ts-node --esm src/index.ts \
  --tokens "token1" "token2" \
  --prompts "A cyberpunk cat" "A mountain sunset" \
  --aspect IMAGE_ASPECT_RATIO_LANDSCAPE \
  --output ./output
```

## How It Works

1. Pairs each prompt with a token (1:1, round-robin if fewer tokens)
2. Sends all requests to `POST https://aisandbox-pa.googleapis.com/v1:runImageFx` in parallel via `Promise.all`
3. Each request uses Bearer token auth, model `IMAGEN_3_5`, and `TOOL_WHISK` context
4. Response contains base64-encoded PNG; saved to `output/whisk_{n}_{timestamp}.png`

## Key API Details

- **Endpoint:** `https://aisandbox-pa.googleapis.com/v1:runImageFx`
- **Auth:** `Authorization: Bearer <token>` header
- **Model:** `IMAGEN_3_5`
- **Aspect ratios:** `IMAGE_ASPECT_RATIO_LANDSCAPE`, `IMAGE_ASPECT_RATIO_PORTRAIT`, `IMAGE_ASPECT_RATIO_SQUARE`
- **Tokens expire** after ~24 hours; obtain from labs.google browser session

## Key Conventions

- `config.json` is gitignored (contains secrets) — never commit tokens
- Keep this CLAUDE.md updated as the project evolves
- Use native Node.js APIs where possible (no unnecessary dependencies)

## Common Pitfalls

- Tokens are Bearer JWTs, not browser cookies — don't confuse the two auth flows
- Tokens expire after ~24h; if requests return 401/403, tokens need refreshing
- Aggressive parallel requests may trigger Google rate limits; start with 5 or fewer concurrent
- Only `IMAGEN_3_5` model is confirmed working
- The API is unofficial/reverse-engineered and can change without notice
