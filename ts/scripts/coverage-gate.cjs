#!/usr/bin/env node
// Layer-by-layer coverage gate
// Usage: node scripts/coverage-gate.js
// Exit 0 if all layers pass, exit 1 with details if any fail.

const fs = require("fs");
const path = require("path");

const THRESHOLDS = {
  Domain: 95,
  Control: 90,
  Runtime: 85,
  Capability: 70,
  Cognition: 80,
  API: 80,
  Persistence: 90,
  App: 85,
};

const LAYER_DIRS = {
  Domain: "src/domain",
  Control: "src/control",
  Runtime: "src/runtime",
  Capability: "src/capabilities",
  Cognition: "src/cognition",
  API: "src/api",
  Persistence: "src/persistence",
  App: "src/app",
};

const lcovPath = path.join(__dirname, "..", "coverage", "lcov.info");

try {
  const lcovContent = fs.readFileSync(lcovPath, "utf8");
  const layerCoverage = {};

  // Initialize all layers
  for (const layer of Object.keys(LAYER_DIRS)) {
    layerCoverage[layer] = [];
  }

  // Parse lcov.info
  let currentFile = "";
  let currentLayer = null;
  const totalLines = [];
  const hitLines = [];

  for (const line of lcovContent.split("\n")) {
    if (line.startsWith("SF:")) {
      // Process previous file
      if (currentLayer && totalLines.length > 0) {
        const cov = (hitLines.length / totalLines.length) * 100;
        layerCoverage[currentLayer].push({ file: currentFile, coverage: cov });
      }
      currentFile = line.slice(3);
      totalLines.length = 0;
      hitLines.length = 0;

      // Determine layer
      currentLayer = null;
      for (const [layer, srcDir] of Object.entries(LAYER_DIRS)) {
        if (currentFile.startsWith(srcDir)) {
          currentLayer = layer;
          break;
        }
      }
    }

    if (currentLayer && line.startsWith("DA:")) {
    const parts = line.split(",");
    // DA:lineNum,hits — split gives ['DA:lineNum', 'hits']
    const hits = parseInt(parts[1]);
    totalLines.push(1);
    if (hits > 0) hitLines.push(1);
    }
  }

  // Process last file
  if (currentLayer && totalLines.length > 0) {
    const cov = (hitLines.length / totalLines.length) * 100;
    layerCoverage[currentLayer].push({ file: currentFile, coverage: cov });
  }

  let allPass = true;
  console.log("\n=== Layer Coverage Gate ===\n");

  for (const [layer, threshold] of Object.entries(THRESHOLDS)) {
    const files = layerCoverage[layer] || [];
    if (files.length === 0) {
      console.log(`⚠️  ${layer}: no coverage data (threshold ${threshold}%)`);
      continue;
    }

    const avg = files.reduce((s, f) => s + f.coverage, 0) / files.length;
    const pass = avg >= threshold;
    const icon = pass ? "✅" : "❌";

    if (!pass) allPass = false;

    console.log(
      `${icon} ${layer}: ${avg.toFixed(1)}% (threshold ${threshold}%) — ${files.length} files`
    );

    // Show files below threshold
    for (const f of files.filter((x) => x.coverage < threshold)) {
      console.log(`    ⚠️  ${f.file}: ${f.coverage.toFixed(1)}%`);
    }
  }

  console.log("\n");
  if (allPass) {
    console.log("All layers pass coverage thresholds.\n");
    process.exit(0);
  } else {
    console.log("FAIL: Some layers below threshold.\n");
    process.exit(1);
  }
} catch (e) {
  console.error("Coverage gate failed:", e.message);
  process.exit(1);
}
