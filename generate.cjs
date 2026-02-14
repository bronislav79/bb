#!/usr/bin/env node

/*
 * Whisk Batch Image Generator
 *
 * Как использовать:
 * 1. Установи Node.js (https://nodejs.org) — скачай LTS версию, установи
 * 2. Открой эту папку в терминале
 * 3. Запусти: node generate.js
 * 4. Картинки появятся в папке output/
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ╔══════════════════════════════════════════════════════════════╗
// ║  НАСТРОЙКИ — ЗАПОЛНИ НИЖЕ                                   ║
// ╚══════════════════════════════════════════════════════════════╝

// Вставь свои Bearer токены (eyJ...) — по одному на строку
const TOKENS = [
  "ВСТАВЬ_ТОКЕН_1_СЮДА",
  "ВСТАВЬ_ТОКЕН_2_СЮДА",
  "ВСТАВЬ_ТОКЕН_3_СЮДА",
  "ВСТАВЬ_ТОКЕН_4_СЮДА",
  "ВСТАВЬ_ТОКЕН_5_СЮДА",
];

// Вставь свои промпты — по одному на строку
const PROMPTS = [
  "A cyberpunk cat in a neon-lit alley",
  "A peaceful mountain landscape at sunrise",
  "An underwater city with bioluminescent buildings",
  "A steampunk airship flying over Victorian London",
  "A crystal forest on an alien planet",
];

// Соотношение сторон: "LANDSCAPE", "PORTRAIT" или "SQUARE"
const ASPECT = "LANDSCAPE";

// Папка для картинок
const OUTPUT_DIR = "./output";

// ╔══════════════════════════════════════════════════════════════╗
// ║  ДАЛЬШЕ НИЧЕГО НЕ ТРОГАЙ                                    ║
// ╚══════════════════════════════════════════════════════════════╝

const ASPECT_MAP = {
  LANDSCAPE: "IMAGE_ASPECT_RATIO_LANDSCAPE",
  PORTRAIT: "IMAGE_ASPECT_RATIO_PORTRAIT",
  SQUARE: "IMAGE_ASPECT_RATIO_SQUARE",
};

function httpsPost(url, headers, body) {
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
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(text);
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            reject(new Error(`Токен истёк или невалидный (HTTP ${res.statusCode}). Обнови токен.`));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function generateOne(token, prompt, index, total) {
  const label = `[${index + 1}/${total}]`;
  console.log(`${label} Генерирую: "${prompt}"`);

  const body = JSON.stringify({
    userInput: {
      candidatesCount: 1,
      prompts: [{ text: prompt }],
      seed: 0,
    },
    clientContext: {
      sessionId: crypto.randomUUID(),
      tool: "TOOL_WHISK",
    },
    modelInput: {
      modelNameEnum: "IMAGEN_3_5",
    },
    aspectRatio: ASPECT_MAP[ASPECT] || ASPECT_MAP.LANDSCAPE,
  });

  const response = await httpsPost(
    "https://aisandbox-pa.googleapis.com/v1:runImageFx",
    { authorization: `Bearer ${token}` },
    body
  );

  const data = JSON.parse(response);
  const image = data.imagePanels?.[0]?.generatedImages?.[0];

  if (!image?.encodedImage) {
    throw new Error("Нет картинки в ответе от API");
  }

  // Сохраняем
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filename = `whisk_${index + 1}_${Date.now()}.png`;
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(image.encodedImage, "base64"));

  console.log(`${label} Сохранено: ${filePath}`);
  return filePath;
}

async function main() {
  console.log("");
  console.log("===========================================");
  console.log("   Whisk Batch Image Generator");
  console.log("===========================================");
  console.log("");

  // Проверки
  const realTokens = TOKENS.filter((t) => !t.startsWith("ВСТАВЬ_"));
  if (realTokens.length === 0) {
    console.error("ОШИБКА: Ты не вставил токены!");
    console.error("Открой файл generate.js в блокноте и замени ВСТАВЬ_ТОКЕН_..._СЮДА на настоящие токены.");
    console.error("");
    process.exit(1);
  }

  const realPrompts = PROMPTS.filter((p) => p.trim().length > 0);
  if (realPrompts.length === 0) {
    console.error("ОШИБКА: Нет промптов!");
    process.exit(1);
  }

  console.log(`Токенов:  ${realTokens.length}`);
  console.log(`Промптов: ${realPrompts.length}`);
  console.log(`Формат:   ${ASPECT}`);
  console.log(`Папка:    ${path.resolve(OUTPUT_DIR)}`);
  console.log("");

  // Запускаем все параллельно
  const tasks = realPrompts.map((prompt, i) => {
    const token = realTokens[i % realTokens.length];
    return generateOne(token, prompt, i, realPrompts.length).catch((err) => {
      console.error(`[${i + 1}/${realPrompts.length}] ОШИБКА: ${err.message}`);
      return null;
    });
  });

  const results = await Promise.all(tasks);

  // Итоги
  const ok = results.filter(Boolean).length;
  const fail = results.length - ok;

  console.log("");
  console.log("===========================================");
  console.log(`   Готово: ${ok} из ${results.length} картинок`);
  if (fail > 0) console.log(`   Ошибок: ${fail}`);
  console.log(`   Папка:  ${path.resolve(OUTPUT_DIR)}`);
  console.log("===========================================");
  console.log("");
}

main();
