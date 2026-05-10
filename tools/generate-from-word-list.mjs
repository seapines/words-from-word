import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_DIR = path.join(ROOT, "tools", "input");
const BIG_WORDS_PATH = path.join(INPUT_DIR, "big-words.txt");
const WORD_LIST_PATH = path.join(INPUT_DIR, "russian-nouns.txt");
const DEFINITION_CACHE_PATH = path.join(INPUT_DIR, "definition-cache.json");
const OUTPUT_DATA = path.join(ROOT, "data", "game-data.js");
const OUTPUT_REPORT = path.join(ROOT, "tools", "report.json");
const MIN_WORD_LENGTH = 3;

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

async function readLines(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function readDefinitionCache() {
  try {
    return JSON.parse(await fs.readFile(DEFINITION_CACHE_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function isUsableNoun(word) {
  return /^[а-яё]+$/iu.test(word) && !word.includes("-") && normalizeWord(word).length >= MIN_WORD_LENGTH;
}

function makeAnswer(word, definitionCache) {
  const normalized = normalizeWord(word);
  const cached = definitionCache[normalized];

  return {
    word,
    definition: cached?.definition || "Определение пока не добавлено. Откройте источник, чтобы посмотреть словарную статью.",
    sourceUrl: cached?.sourceUrl || `https://gramota.ru/poisk?query=${encodeURIComponent(word)}&mode=slovari`,
  };
}

async function main() {
  const [bigWords, rawWords, definitionCache] = await Promise.all([
    readLines(BIG_WORDS_PATH),
    readLines(WORD_LIST_PATH),
    readDefinitionCache(),
  ]);

  const sourceWords = [...new Set(rawWords.filter(isUsableNoun))].sort((a, b) => a.localeCompare(b, "ru"));
  const bigWordData = bigWords.map((bigWord) => {
    const normalizedBigWord = normalizeWord(bigWord);
    const answers = sourceWords
      .filter((candidate) => normalizeWord(candidate) !== normalizedBigWord)
      .filter((candidate) => canBuildFromLetters(candidate, bigWord))
      .map((candidate) => makeAnswer(candidate, definitionCache))
      .sort((a, b) => a.word.localeCompare(b.word, "ru"));

    return { word: bigWord, answers };
  });

  const data = {
    dictionaryName: "Harrix Russian-Nouns word list",
    dictionaryUrl: "https://github.com/Harrix/Russian-Nouns",
    generatedAt: new Date().toISOString(),
    note: "Interim generated data from a public Russian nouns list. Definitions are Gramota lookup links until cached definitions are added.",
    bigWords: bigWordData,
  };

  const report = {
    sourceWordCount: sourceWords.length,
    minWordLength: MIN_WORD_LENGTH,
    bigWords: bigWordData.map((item) => ({ word: item.word, answerCount: item.answers.length })),
    lengthDistribution: bigWordData.map((item) => ({
      word: item.word,
      lengths: item.answers.reduce((lengths, answer) => {
        const length = normalizeWord(answer.word).length;
        lengths[length] = (lengths[length] || 0) + 1;
        return lengths;
      }, {}),
    })),
    missingDefinitions: bigWordData.flatMap((item) =>
      item.answers
        .filter((answer) => !definitionCache[normalizeWord(answer.word)])
        .map((answer) => answer.word)
    ),
  };

  await fs.writeFile(OUTPUT_DATA, `window.GAME_DATA = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  await fs.writeFile(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Generated ${path.relative(ROOT, OUTPUT_DATA)} from ${sourceWords.length} source nouns.`);
  for (const item of report.bigWords) {
    console.log(`${item.word}: ${item.answerCount} answers`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
