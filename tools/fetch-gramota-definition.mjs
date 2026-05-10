import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_PATH = path.join(ROOT, "tools", "input", "definition-cache.json");
const REPORT_PATH = path.join(ROOT, "tools", "report.json");

function normalizeWord(word) {
  return word
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^а-я]/g, "");
}

async function readCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function readMissingWords(limit) {
  const report = JSON.parse(await fs.readFile(REPORT_PATH, "utf8"));
  const words = Array.isArray(report.missingDefinitions) ? report.missingDefinitions : [];
  return words.slice(0, limit);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstDictionaryDefinition(html, word) {
  const text = stripHtml(html);
  const normalizedWord = normalizeWord(word);
  const wordIndex = text.toLocaleLowerCase("ru-RU").indexOf(normalizedWord);
  const dictionaryIndex = text.indexOf("Словари", Math.max(0, wordIndex - 200));
  const allAboutIndex = text.indexOf("Всё об этом слове", dictionaryIndex);
  const sliceEnd = allAboutIndex > dictionaryIndex ? allAboutIndex : dictionaryIndex + 1200;
  const slice = text.slice(dictionaryIndex, sliceEnd);
  const match = slice.match(/\b1\.\s+(.+?)(?:\s+2\.|\s+\[Всё об этом слове\]|$)/);

  if (match) {
    return match[1].trim();
  }

  return null;
}

function parseArgs(args) {
  const options = {
    missing: false,
    limit: 50,
    words: [],
  };

  for (const arg of args) {
    if (arg === "--missing") {
      options.missing = true;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number.parseInt(arg.slice("--limit=".length), 10);
    } else {
      options.words.push(arg);
    }
  }

  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  return options;
}

async function fetchDefinition(word) {
  const url = `https://gramota.ru/poisk?query=${encodeURIComponent(word)}&mode=slovari`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "personal-word-game-data-builder/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Gramota returned ${response.status} for ${word}`);
  }

  const html = await response.text();
  const definition = extractFirstDictionaryDefinition(html, word);
  return {
    definition: definition || "Определение требует ручной проверки.",
    sourceUrl: url,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const words = options.missing
    ? await readMissingWords(options.limit)
    : options.words.map((word) => word.trim()).filter(Boolean);

  if (words.length === 0) {
    throw new Error("Pass words or use --missing: node tools/fetch-gramota-definition.mjs --missing --limit=50");
  }

  const cache = await readCache();

  for (const word of words) {
    const key = normalizeWord(word);
    if (cache[key]) {
      console.log(`${word}: already cached`);
      continue;
    }

    cache[key] = await fetchDefinition(word);
    console.log(`${word}: cached`);
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  await fs.writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
