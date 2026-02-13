import * as fs from "fs";
import * as path from "path";
import * as https from "https";

// --- Types ---

export type AspectRatio =
  | "IMAGE_ASPECT_RATIO_LANDSCAPE"
  | "IMAGE_ASPECT_RATIO_PORTRAIT"
  | "IMAGE_ASPECT_RATIO_SQUARE";

export interface GenerateTask {
  token: string;
  prompt: string;
  seed?: number;
  aspectRatio?: AspectRatio;
}

interface GeneratedImage {
  encodedImage: string;
  seed: number;
  mediaGenerationId: string;
}

interface ImagePanel {
  generatedImages: GeneratedImage[];
}

interface RunImageFxResponse {
  imagePanels: ImagePanel[];
}

export interface GenerateResult {
  taskIndex: number;
  prompt: string;
  success: boolean;
  filePath?: string;
  seed?: number;
  mediaId?: string;
  error?: string;
}

// --- HTTP helper (native, no dependencies) ---

function httpsPost(url: string, headers: Record<string, string>, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(text);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 500)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// --- Main generation function ---

export async function generateImage(task: GenerateTask): Promise<GenerateResult> {
  const { token, prompt, seed = 0, aspectRatio = "IMAGE_ASPECT_RATIO_LANDSCAPE" } = task;

  const body = JSON.stringify({
    userInput: {
      candidatesCount: 1,
      prompts: [{ text: prompt }],
      seed,
    },
    clientContext: {
      sessionId: crypto.randomUUID(),
      tool: "TOOL_WHISK",
    },
    modelInput: {
      modelNameEnum: "IMAGEN_3_5",
    },
    aspectRatio,
  });

  const response = await httpsPost(
    "https://aisandbox-pa.googleapis.com/v1:runImageFx",
    { authorization: `Bearer ${token}` },
    body
  );

  const data: RunImageFxResponse = JSON.parse(response);

  const image = data.imagePanels?.[0]?.generatedImages?.[0];
  if (!image?.encodedImage) {
    throw new Error("No image in response");
  }

  return {
    taskIndex: -1,
    prompt,
    success: true,
    seed: image.seed,
    mediaId: image.mediaGenerationId,
    filePath: "", // filled by caller
  };
}

// --- Save base64 image to file ---

export function saveImage(base64Data: string, outputDir: string, filename: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  return filePath;
}

// --- Batch runner: N tokens × N prompts in parallel ---

export async function runBatch(
  tasks: GenerateTask[],
  outputDir: string
): Promise<GenerateResult[]> {
  const promises = tasks.map(async (task, index) => {
    const label = `[${index + 1}/${tasks.length}]`;
    console.log(`${label} Generating: "${task.prompt.slice(0, 60)}..." with token #${index + 1}`);

    try {
      const body = JSON.stringify({
        userInput: {
          candidatesCount: 1,
          prompts: [{ text: task.prompt }],
          seed: task.seed ?? 0,
        },
        clientContext: {
          sessionId: crypto.randomUUID(),
          tool: "TOOL_WHISK",
        },
        modelInput: {
          modelNameEnum: "IMAGEN_3_5",
        },
        aspectRatio: task.aspectRatio ?? "IMAGE_ASPECT_RATIO_LANDSCAPE",
      });

      const response = await httpsPost(
        "https://aisandbox-pa.googleapis.com/v1:runImageFx",
        { authorization: `Bearer ${task.token}` },
        body
      );

      const data: RunImageFxResponse = JSON.parse(response);
      const image = data.imagePanels?.[0]?.generatedImages?.[0];

      if (!image?.encodedImage) {
        return {
          taskIndex: index,
          prompt: task.prompt,
          success: false,
          error: "No image in response",
        };
      }

      const timestamp = Date.now();
      const filename = `whisk_${index + 1}_${timestamp}.png`;
      const filePath = saveImage(image.encodedImage, outputDir, filename);

      console.log(`${label} Saved: ${filePath} (seed: ${image.seed})`);

      return {
        taskIndex: index,
        prompt: task.prompt,
        success: true,
        filePath,
        seed: image.seed,
        mediaId: image.mediaGenerationId,
      };
    } catch (err: any) {
      console.error(`${label} FAILED: ${err.message}`);
      return {
        taskIndex: index,
        prompt: task.prompt,
        success: false,
        error: err.message,
      };
    }
  });

  return Promise.all(promises);
}
