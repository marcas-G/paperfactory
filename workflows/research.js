#!/usr/bin/env node
// Workflow: Full research pipeline
// Usage: node workflows/research.js "research question"

const { execSync } = require("child_process");

const question = process.argv[2];
if (!question) {
  console.error("Usage: node workflows/research.js \"your research question\"");
  process.exit(1);
}

console.log("Starting research workflow for:", question);

// Step 1: Init project
console.log("\n1. Initializing project...");
execSync('npx tsx src/app/cli.ts init "' + question.replace(/"/g, '\\"') + '"', {
  cwd: __dirname + "/../ts",
  stdio: "inherit",
});

// Step 2: Run research
console.log("\n2. Running research pipeline...");
execSync('npx tsx src/app/cli.ts research "' + question.replace(/"/g, '\\"') + '"', {
  cwd: __dirname + "/../ts",
  stdio: "inherit",
});

console.log("\nResearch workflow complete.");
