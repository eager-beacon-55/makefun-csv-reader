# makefun-csv-reader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/eager-beacon-55/makefun-csv-reader/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/eager-beacon-55/makefun-csv-reader/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0: `solve.js` exports `run(input)`, which reads a (possibly broken) CSV text in a single left-to-right pass and returns exactly csv-reader's `{columns, rows, errors}` — the same fields, the same error codes (stray_cr, quote_junk, unterminated_quote, short_row, long_row) and the same line/row numbering — while taking whole lines and fields as native slices instead of walking character by character, and `main.ts` is the harness driver that answers every case in `/input/cases.json` into `/output/answers.json`.

Entered in the make.fun bounty [Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121).
