#!/usr/bin/env node

/*
 * Whisk Batch Image Generator
 *
 * Как использовать:
 * 1. Установи Node.js (https://nodejs.org) — скачай LTS версию, установи
 * 2. Зайди на labs.google, войди в аккаунт Google
 * 3. Нажми F12 (DevTools) → Application → Cookies → labs.google
 * 4. Найди cookie "__Secure-next-auth.session-token", скопируй его ЗНАЧЕНИЕ
 * 5. Вставь скопированное значение ниже в TOKENS
 * 6. Открой терминал в этой папке и запусти: node generate.cjs
 * 7. Картинки появятся в папке output/
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ╔══════════════════════════════════════════════════════════════╗
// ║  НАСТРОЙКИ — ЗАПОЛНИ НИЖЕ                                   ║
// ╚══════════════════════════════════════════════════════════════╝

// Вставь значение cookie __Secure-next-auth.session-token
// (из DevTools → Application → Cookies → labs.google)
// Каждая строка = один аккаунт Google
// Если у тебя один аккаунт — оставь одну строку, остальные удали
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

const SESSION_COOKIE_NAME = "__Secure-next-auth.session-token";

// --- HTTP GET ---
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(text);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 500)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// --- HTTP POST ---
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
            reject(new Error(`Bearer токен невалидный (HTTP ${res.statusCode}). Обнови cookie.`));
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

// --- Шаг 1: Session Token → Bearer Token ---
async function sessionToBearer(sessionToken, index) {
  const label = `[аккаунт ${index + 1}]`;
  console.log(`${label} Получаю Bearer токен...`);

  const cookieHeader = `${SESSION_COOKIE_NAME}=${sessionToken}`;

  const response = await httpsGet("https://labs.google/fx/api/auth/session", {
    cookie: cookieHeader,
  });

  const data = JSON.parse(response);

  // Ищем токен в ответе
  const token =
    data.accessToken ||
    data.access_token ||
    data.token ||
    (data.user && data.user.accessToken) ||
    (data.user && data.user.token);

  if (!token) {
    // Логируем ответ для отладки
    console.error(`${label} Ответ сервера: ${JSON.stringify(data).slice(0, 300)}`);
    throw new Error("Не удалось получить Bearer токен. Cookie устарел или невалидный.");
  }

  console.log(`${label} Bearer токен получен!`);
  return token;
}

// --- Шаг 2: Генерация картинки ---
async function generateOne(bearerToken, prompt, index, total) {
  const label = `[${index + 1}/${total}]`;
  console.log(`${label} Генерирую: "${prompt}"`);

  const body = JSON.stringify({
    userInput: {
      candidatesCount: 1,
      prompts: [prompt],
      seed: 0,
    },
    clientContext: {
      sessionId: ";" + Date.now(),
      tool: "IMAGE_FX",
    },
    modelInput: {
      modelNameType: "IMAGEN_3_5",
    },
    aspectRatio: ASPECT_MAP[ASPECT] || ASPECT_MAP.LANDSCAPE,
  });

  const response = await httpsPost(
    "https://aisandbox-pa.googleapis.com/v1:runImageFx",
    { authorization: `Bearer ${bearerToken}` },
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

// --- Главная ---
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
    console.error("");
    console.error("Как получить токен:");
    console.error("  1. Зайди на labs.google (войди в Google аккаунт)");
    console.error("  2. Нажми F12 → Application → Cookies → labs.google");
    console.error("  3. Найди __Secure-next-auth.session-token");
    console.error("  4. Скопируй его ЗНАЧЕНИЕ (длинная строка eyJ...)");
    console.error("  5. Открой generate.cjs в блокноте");
    console.error("  6. Замени ВСТАВЬ_ТОКЕН_..._СЮДА на скопированное значение");
    console.error("");
    process.exit(1);
  }

  const realPrompts = PROMPTS.filter((p) => p.trim().length > 0);
  if (realPrompts.length === 0) {
    console.error("ОШИБКА: Нет промптов!");
    process.exit(1);
  }

  console.log(`Аккаунтов: ${realTokens.length}`);
  console.log(`Промптов:  ${realPrompts.length}`);
  console.log(`Формат:    ${ASPECT}`);
  console.log(`Папка:     ${path.resolve(OUTPUT_DIR)}`);
  console.log("");

  // Шаг 1: Получаем Bearer токены
  console.log("--- Шаг 1: Авторизация ---");
  const bearerTokens = [];
  for (let i = 0; i < realTokens.length; i++) {
    try {
      const bearer = await sessionToBearer(realTokens[i], i);
      bearerTokens.push(bearer);
    } catch (err) {
      console.error(`[аккаунт ${i + 1}] ОШИБКА: ${err.message}`);
    }
  }

  if (bearerTokens.length === 0) {
    console.error("");
    console.error("Ни один аккаунт не авторизовался.");
    console.error("Проверь что токены скопированы правильно и не устарели.");
    process.exit(1);
  }

  console.log(`\nАвторизовано: ${bearerTokens.length} из ${realTokens.length}`);
  console.log("");

  // Шаг 2: Генерируем картинки параллельно
  console.log("--- Шаг 2: Генерация картинок ---");
  const tasks = realPrompts.map((prompt, i) => {
    const token = bearerTokens[i % bearerTokens.length];
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
