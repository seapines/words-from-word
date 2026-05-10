# Data Generation Pipeline

This folder is for producing `data/game-data.js` from a noun list and cached Russian definitions.

The website is static. It should not scrape dictionary pages during play. Instead, generate and review the data ahead of time.

## Inputs

- `big-words.txt`: one large word per line.
- `openrussian-nouns.csv`: OpenRussian noun export used for Russian noun/headword selection only.
- `ozhegov.txt`: Ozhegov explanatory dictionary text used to populate Russian definitions.
- `definition-cache.json`: Russian definitions keyed by normalized word.

## Intended Output

- `../data/game-data.js`: the data consumed by the website.
- `report.json`: answer counts, missing definitions, and entries needing manual review.

## Commands

Generate website data from generic dictionary inputs:

```sh
node tools/generate-data.mjs
```

Generate from the OpenRussian noun CSV:

```sh
npm run generate
```

This uses `tools/input/openrussian-nouns.csv` from `https://github.com/Badestrand/russian-dictionary`.

OpenRussian translations are not copied into the game data. Words without cached Russian definitions are excluded from the playable answer list so hints and clicked answers always have Russian text.

Import Russian definitions from Ozhegov text into `tools/input/definition-cache.json`:

```sh
npm run definitions:ozhegov
```

Generate from a plain text noun list, one word per line:

```sh
npm run generate:harrix
```

The plain text fallback source is `tools/input/russian-nouns.txt` from `https://github.com/Harrix/Russian-Nouns`.

Cache one or more Gramota definitions:

```sh
node tools/fetch-gramota-definition.mjs место дело
```

Cache the next missing Russian noun definitions from `tools/report.json` using the Russian Wiktionary API:

```sh
npm run definitions:missing
```

Cache all remaining missing definitions:

```sh
npm run definitions:all
```

Then regenerate the game data so cached definitions are copied into `data/game-data.js`:

```sh
npm run generate
```

The Wiktionary fetcher is the default because it returns plain-text entries through a robust API and can fetch missing words in batches. It only accepts entries with a Russian noun section. The Gramota fetcher is still available as `npm run definitions:gramota`, but its output should be reviewed, especially for homonyms and words where multiple dictionaries return different definitions.

## Russian-only Definition Workflow

1. Run `npm run generate` to produce game data with only cached Russian definitions and Russian placeholders for missing entries.
2. Run `npm run definitions:ozhegov` to bulk-import Russian explanatory definitions from Ozhegov.
3. Run `npm run definitions:missing` to fetch the next batch of missing Russian noun definitions from Russian Wiktionary into `tools/input/definition-cache.json`.
4. Repeat `npm run generate` and `npm run definitions:missing`, or use `npm run definitions:all`, until `missingDefinitionCount` in `tools/report.json` is acceptable.
4. Review `tools/report.json` and spot-check cache entries before shipping, especially short words and homonyms.

## Filtering Rules

- Russian nouns only.
- Nominative singular nouns are allowed.
- Plural-only nouns are allowed.
- Regular plurals with singular forms are excluded.
- Proper nouns are excluded.
- Hyphenated entries are excluded.
- `ё` and `е` are equivalent for matching and guesses.
- The exact big word is excluded.
- Same-length anagrams are allowed if they are different words.
