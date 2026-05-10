import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_DIR = path.join(ROOT, "tools", "input");
const BIG_WORDS_PATH = path.join(INPUT_DIR, "big-words.txt");
const NOUNS_CSV_PATH = path.join(INPUT_DIR, "openrussian-nouns.csv");
const DEFINITION_CACHE_PATH = path.join(INPUT_DIR, "definition-cache.json");
const OUTPUT_DATA = path.join(ROOT, "data", "game-data.js");
const OUTPUT_REPORT = path.join(ROOT, "tools", "report.json");
const MIN_WORD_LENGTH = 3;
const MISSING_DEFINITION = "Определение пока не добавлено.";

function normalizeWord(word) {
  return word
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[\u0301']/g, "")
    .replace(/[^а-я]/g, "");
}

function cleanText(text) {
  return text.replace(/[\u0301']/g, "").trim();
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

async function readLines(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

function parseTsvLine(line) {
  return line.split("\t");
}

function isUsableNoun(word) {
  return /^[а-яё]+$/iu.test(word) && normalizeWord(word).length >= MIN_WORD_LENGTH;
}

async function readOpenRussianNouns() {
  const lines = await readLines(NOUNS_CSV_PATH);
  const rows = lines.slice(1).map(parseTsvLine);
  const entriesByWord = new Map();

  for (const row of rows) {
    const bare = cleanText(row[0] || "");
    const sgNom = cleanText(row[10] || bare);
    const plOnly = row[9] === "1";
    const displayWord = cleanText(plOnly ? bare : sgNom || bare);
    const normalized = normalizeWord(displayWord);

    if (!isUsableNoun(displayWord) || entriesByWord.has(normalized)) {
      continue;
    }

    entriesByWord.set(normalized, {
      word: displayWord,
      normalized,
      sourceUrl: `https://ru.wiktionary.org/wiki/${encodeURIComponent(displayWord)}`,
    });
  }

  return [...entriesByWord.values()].sort((a, b) => a.word.localeCompare(b.word, "ru"));
}

function makeAnswer(entry, definitionCache) {
  const cached = definitionCache[entry.normalized];
  const cachedDefinition = cached?.definition || "";
  const hasUsefulCachedDefinition = cachedDefinition && !/ручной проверки|пока не добавлено/i.test(cachedDefinition) && !/^==/.test(cachedDefinition.trim());

  if (!hasUsefulCachedDefinition) {
    return null;
  }

  return {
    word: entry.word,
    definition: cleanDefinitionForDisplay(cachedDefinition),
    sourceUrl: cached.sourceUrl,
  };
}

function cleanDefinitionForDisplay(definition) {
  const cleaned = definition
    .replace(/==\s*/g, "см. ")
    .replace(/\s+/g, " ")
    .trim();
  return firstSentence(cleaned);
}

function firstSentence(text) {
  const match = text.match(/^.*?[.!?](?=\s|$)/u);
  return (match ? match[0] : text).trim();
}

function buildReport(sourceEntries, bigWordData, definitionCache) {
  return {
    sourceName: "OpenRussian nouns.csv",
    sourceWordCount: sourceEntries.length,
    minWordLength: MIN_WORD_LENGTH,
    definitionCoverage: bigWordData.map((item) => {
      const withDefinitions = item.answers.filter((answer) => answer.definition !== MISSING_DEFINITION).length;
      return {
        word: item.word,
        withDefinitions,
        total: item.answers.length,
      };
    }),
    bigWords: bigWordData.map((item) => ({ word: item.word, answerCount: item.answers.length })),
    lengthDistribution: bigWordData.map((item) => ({
      word: item.word,
      lengths: item.answers.reduce((lengths, answer) => {
        const length = normalizeWord(answer.word).length;
        lengths[length] = (lengths[length] || 0) + 1;
        return lengths;
      }, {}),
    })),
    cachedRussianDefinitions: Object.keys(definitionCache).length,
  };
}

async function main() {
  const [bigWords, sourceEntries, definitionCache] = await Promise.all([
    readLines(BIG_WORDS_PATH),
    readOpenRussianNouns(),
    readJson(DEFINITION_CACHE_PATH, {}),
  ]);

  const bigWordData = bigWords.map((bigWord) => {
    const normalizedBigWord = normalizeWord(bigWord);
    const answers = sourceEntries
      .filter((entry) => entry.normalized !== normalizedBigWord)
      .filter((entry) => canBuildFromLetters(entry.word, bigWord))
      .map((entry) => makeAnswer(entry, definitionCache))
      .filter(Boolean)
      .sort((a, b) => a.word.localeCompare(b.word, "ru"));

    return { word: bigWord, answers };
  });

  const data = {
    dictionaryName: "OpenRussian dictionary data",
    dictionaryUrl: "https://github.com/Badestrand/russian-dictionary",
    generatedAt: new Date().toISOString(),
    note: "Generated from OpenRussian noun data. Definitions are Russian-only entries from the local cache; missing entries use a Russian placeholder until fetched from Russian Wiktionary or reviewed manually.",
    bigWords: bigWordData,
  };
  const report = buildReport(sourceEntries, bigWordData, definitionCache);

  await fs.writeFile(OUTPUT_DATA, `window.GAME_DATA = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  await fs.writeFile(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Generated ${path.relative(ROOT, OUTPUT_DATA)} from ${sourceEntries.length} OpenRussian nouns.`);
  for (const item of report.bigWords) {
    console.log(`${item.word}: ${item.answerCount} answers`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
