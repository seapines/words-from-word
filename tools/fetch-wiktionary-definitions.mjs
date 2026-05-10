import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_PATH = path.join(ROOT, "tools", "input", "definition-cache.json");
const REPORT_PATH = path.join(ROOT, "tools", "report.json");
const API_URL = "https://ru.wiktionary.org/w/api.php";
const BATCH_SIZE = 50;

function normalizeWord(word) {
  return word
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^а-я]/g, "");
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

function parseArgs(args) {
  const options = {
    missing: false,
    limit: 500,
    overwrite: false,
    words: [],
  };

  for (const arg of args) {
    if (arg === "--missing") {
      options.missing = true;
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else if (arg.startsWith("--limit=")) {
      const value = arg.slice("--limit=".length);
      options.limit = value === "all" ? Infinity : Number.parseInt(value, 10);
    } else {
      options.words.push(arg);
    }
  }

  if (options.limit !== Infinity && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer or all.");
  }

  return options;
}

async function getWords(options) {
  if (!options.missing) {
    return options.words.map((word) => word.trim()).filter(Boolean);
  }

  const report = await readJson(REPORT_PATH, {});
  const missing = Array.isArray(report.missingDefinitions) ? report.missingDefinitions : [];
  return [...new Set(missing)].slice(0, options.limit);
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function cleanDefinition(text) {
  return text
    .split("◆")[0]
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[;,.\s]+/, "")
    .trim();
}

function extractRussianSection(extract) {
  const russianHeading = /^==\s*Русский\s*==\s*$/m.exec(extract);
  if (!russianHeading) {
    return null;
  }

  const afterRussian = extract.slice(russianHeading.index + russianHeading[0].length);
  const nextLanguage = afterRussian.search(/^==[^=]+==\s*$/m);
  return nextLanguage === -1 ? afterRussian : afterRussian.slice(0, nextLanguage);
}

function extractDefinition(extract) {
  const russianSection = extractRussianSection(extract);
  if (!russianSection) {
    return null;
  }

  const hasNounSection = /^\s*Существительное(?:[,\s]|$)/m.test(russianSection) || /^===\s*Существительное\s*===\s*$/m.test(russianSection);
  if (!hasNounSection) {
    return null;
  }

  const meaningStart = russianSection.indexOf("==== Значение ====");
  if (meaningStart === -1) {
    return null;
  }

  const afterMeaning = russianSection.slice(meaningStart + "==== Значение ====".length);
  const nextSection = afterMeaning.search(/\n={3,4}[^=]+={3,4}/);
  const section = nextSection === -1 ? afterMeaning : afterMeaning.slice(0, nextSection);
  const definitions = section
    .split(/\r?\n/)
    .map(cleanDefinition)
    .filter((line) => line.length > 8 && line !== "—" && line !== "?")
    .map((line) => line.length > 260 ? `${line.slice(0, 257).trim()}...` : line);

  return definitions.slice(0, 2).join(" ") || null;
}

async function fetchBatch(words) {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    redirects: "1",
    format: "json",
    titles: words.join("|"),
  });

  const response = await fetch(`${API_URL}?${params}`, {
    headers: {
      "user-agent": "personal-russian-word-game/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Wiktionary returned ${response.status}`);
  }

  const payload = await response.json();
  return Object.values(payload.query?.pages || {});
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cache = await readJson(CACHE_PATH, {});
  const words = [...new Set(await getWords(options))].filter((word) => options.overwrite || !cache[normalizeWord(word)]);

  if (words.length === 0) {
    console.log("No definitions to fetch.");
    return;
  }

  let cached = 0;
  let missing = 0;

  for (const batch of chunks(words, BATCH_SIZE)) {
    const pages = await fetchBatch(batch);

    for (const page of pages) {
      if (page.missing !== undefined || !page.extract) {
        missing += 1;
        continue;
      }

      const definition = extractDefinition(page.extract);
      if (!definition) {
        missing += 1;
        continue;
      }

      cache[normalizeWord(page.title)] = {
        definition,
        sourceUrl: `https://ru.wiktionary.org/wiki/${encodeURIComponent(page.title)}`,
        source: "ru.wiktionary.org",
      };
      cached += 1;
    }

    await fs.writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    console.log(`Cached ${cached}; no definition found for ${missing}; processed ${Math.min(cached + missing, words.length)} of ${words.length}.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
