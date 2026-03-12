# Xiangse Validator

Standalone simulation validator for Xiangse (StandarReader 2.56.1).

## Install

```bash
cd tools/validator
npm install
```

## Run

```bash
node src/cli.js run --input /abs/source.fixed.json --source-key "书源名" --mode live
```

## Output

Prints one JSON object to stdout containing step-by-step simulation results and verdict.
