import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_PATH = path.join(ROOT, "tools", "input", "ozhegov.txt");
const CACHE_PATH = path.join(ROOT, "tools", "input", "definition-cache.json");

function normalizeWord(word) {
  return word
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^а-я]/g, "");
}

function isUsefulCachedDefinition(definition) {
  return definition && !/ручной проверки|пока не добавлено/i.test(definition) && !/^==/.test(definition.trim());
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function cleanPart(text) {
  return text
    .replace(/!\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDefinition(row) {
  const context = cleanPart(row[3] || "");
  const definition = cleanPart(row[5] || "");
  const example = cleanPart(row[7] || "");
  const pieces = [];

  if (context && context !== "+") {
    pieces.push(context.replace(/[.:;\s]+$/g, ""));
  }

  if (definition && definition !== "+") {
    pieces.push(definition.replace(/[.:;\s]+$/g, ""));
  }

  if (pieces.length === 0) {
    return null;
  }

  if (pieces.some((piece) => /^==/.test(piece))) {
    return null;
  }

  const text = `${pieces.join(": ")}.`;
  if (example) {
    return `${text} ${example}`.slice(0, 420).trim();
  }

  return text.slice(0, 320).trim();
}

async function main() {
  const [raw, cache] = await Promise.all([
    fs.readFile(INPUT_PATH, "utf8"),
    readJson(CACHE_PATH, {}),
  ]);
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).slice(1);
  let imported = 0;
  let skipped = 0;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const row = line.split("|");
    const word = cleanPart(row[0] || "");
    const normalized = normalizeWord(word);

    if (!normalized || !/^[а-яё-]+$/iu.test(word)) {
      skipped += 1;
      continue;
    }

    if (isUsefulCachedDefinition(cache[normalized]?.definition)) {
      skipped += 1;
      continue;
    }

    const definition = buildDefinition(row);
    if (!definition) {
      skipped += 1;
      continue;
    }

    cache[normalized] = {
      definition,
      sourceUrl: "https://github.com/Layerex/ozhegov-dict",
      source: "ozhegov-dict",
    };
    imported += 1;
  }

  await fs.writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  console.log(`Imported ${imported} Ozhegov definitions. Skipped ${skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
