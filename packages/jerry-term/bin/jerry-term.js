#!/usr/bin/env node
import { run } from "../dist/index.js";
run(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exit(1);
});
