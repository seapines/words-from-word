# Слова из слова

Static Russian word game prototype.

## Run

Run a local static server:

```sh
npm run serve
```

This uses `npx serve . -l 5173`. You can still open `index.html` directly in a browser for a quick local check.

The current `data/game-data.js` contains demonstration data only. It is intentionally small and should be replaced by generated data from the selected dictionary.

## Gameplay

- Choose a large word from the start menu.
- Type nouns that can be built from its letters.
- `е` and `ё` are treated as equivalent.
- The exact large word is not accepted.
- Same-length anagrams are allowed if they are different words.
- The full answer list is visible as length-revealing blanks.
- Guessed words reveal their definitions when clicked.
- Hints are unlimited and show the first letter plus definition.
- Progress and hint count are saved in `localStorage`.

## Data Pipeline

See `tools/README.md`.

The current generated data uses:

- OpenRussian dictionary data: `https://github.com/Badestrand/russian-dictionary` under CC BY-SA 4.0, used for noun/headword selection.
- Ozhegov dictionary text: `https://github.com/Layerex/ozhegov-dict` under Unlicense, used for Russian definitions.
- Cached Russian definitions from Russian Wiktionary/Gramota when available.

OpenRussian and dmklinger English translations are intentionally not used as game definitions. Words without a Russian definition are excluded from the playable answer list. See `tools/README.md` for the Russian-only definition workflow.

The intended final source can still be `Большой толковый словарь русских существительных` if we later obtain a complete machine-readable headword and definition export. The website itself uses generated/cached local data rather than fetching definitions during play.
