import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_DIR = path.join(ROOT, "tools", "input");
const OUTPUT_DATA = path.join(ROOT, "data", "game-data.js");
const OUTPUT_REPORT = path.join(ROOT, "tools", "report.json");

function normalizeWord(word) {
  return word
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^а-я]/g, "");
}

function countLetters(word) {
  const counts = new Map();
  for (const letter of normalizeWord(word)) {
    counts.set(letter, (counts.get(letter) || 0) + 1);
  }
  return counts;
}

function canBuildFromLetters(candidate, source) {
  const available = countLetters(source);
  const needed = countLetters(candidate);

  for (const [letter, count] of needed.entries()) {
    if ((available.get(letter) || 0) < count) {
      return false;
    }
  }

  return true;
}

function isAllowedDictionaryEntry(entry) {
  if (!entry || typeof entry.word !== "string") {
    return false;
  }

  if (entry.word.includes("-")) {
    return false;
  }

  if (entry.isProperName || entry.isAbbreviation) {
    return false;
  }

  if (entry.number === "plural" && !entry.isPluralOnly) {
    return false;
  }

  return normalizeWord(entry.word).length > 0;
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

async function readBigWords() {
  const filePath = path.join(INPUT_DIR, "big-words.txt");
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildData(bigWords, dictionaryEntries, definitionCache) {
  const allowedEntries = dictionaryEntries
    .filter(isAllowedDictionaryEntry)
    .map((entry) => ({
      ...entry,
      normalized: normalizeWord(entry.word),
    }));

  const missingDefinitions = [];
  const bigWordData = bigWords.map((bigWord) => {
    const normalizedBigWord = normalizeWord(bigWord);
    const answers = allowedEntries
      .filter((entry) => entry.normalized !== normalizedBigWord)
      .filter((entry) => canBuildFromLetters(entry.word, bigWord))
      .map((entry) => {
        const definition = definitionCache[entry.normalized] || null;
        if (!definition) {
          missingDefinitions.push(entry.word);
        }

        return {
          word: entry.word,
          definition: definition?.definition || "Определение пока не добавлено.",
          sourceUrl: definition?.sourceUrl || `https://gramota.ru/poisk?query=${encodeURIComponent(entry.word)}`,
        };
      })
      .sort((a, b) => a.word.localeCompare(b.word, "ru"));

    return { word: bigWord, answers };
  });

  return {
    data: {
      dictionaryName: "Большой толковый словарь русских существительных",
      generatedAt: new Date().toISOString(),
      bigWords: bigWordData,
    },
    report: {
      bigWords: bigWordData.map((item) => ({ word: item.word, answerCount: item.answers.length })),
      missingDefinitions: [...new Set(missingDefinitions)].sort((a, b) => a.localeCompare(b, "ru")),
    },
  };
}

async function main() {
  const bigWords = await readBigWords();
  const dictionaryEntries = await readJson(path.join(INPUT_DIR, "dictionary-nouns.json"), []);
  const definitionCache = await readJson(path.join(INPUT_DIR, "definition-cache.json"), {});

  if (dictionaryEntries.length === 0) {
    throw new Error("tools/input/dictionary-nouns.json is missing or empty.");
  }

  const { data, report } = buildData(bigWords, dictionaryEntries, definitionCache);
  const js = `window.GAME_DATA = ${JSON.stringify(data, null, 2)};\n`;
  await fs.writeFile(OUTPUT_DATA, js, "utf8");
  await fs.writeFile(OUTPUT_REPORT, JSON.stringify(report, null, 2), "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
