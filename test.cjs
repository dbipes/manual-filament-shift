const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { analyzeGcode, transformGcode } = require("./gcode-core.js");

const samplePath = path.join(
  __dirname,
  "Icemaker Vents - Part Plates_PLA_4h45m.gcode"
);
const source = fs.readFileSync(samplePath, "utf8");
const analysis = analyzeGcode(source);

assert.equal(analysis.metadata.totalLayers, 180);
assert.equal(analysis.events.length, 3);
assert.deepEqual(
  analysis.events.map((event) => event.kind),
  ["initial", "change", "change"]
);
assert.deepEqual(
  analysis.events.map((event) => event.targetTool),
  [4, 3, 4]
);
assert.deepEqual(
  analysis.events.map((event) => event.layer),
  [0, 29, 30]
);
assert.equal(analysis.cleanupBlocks.length, 1);

const converted = transformGcode(analysis, {
  selectedEventIds: analysis.events.map((event) => event.id),
  names: {
    3: "Yellow PLA",
    4: "White TPU",
  },
  pauseCommand: "M400 U1",
  waitForTemperature: true,
  removeAmsCleanup: true,
  setFilamentType: true,
});

assert.equal(converted.convertedCount, 3);
assert.equal(converted.cleanupRemoved, 1);
assert.equal((converted.text.match(/^M400 U1\b/gm) || []).length, 3);
assert.equal((converted.text.match(/^; CP TOOLCHANGE WIPE\b/gm) || []).length, 2);
assert.equal(converted.remainingAmsCommands.length, 0);
assert.doesNotMatch(converted.text, /^M620 S[34]A\b/gm);
assert.doesNotMatch(converted.text, /^M621 S[34]A\b/gm);
assert.doesNotMatch(converted.text, /^T[34]\s*$/gm);
assert.doesNotMatch(converted.text, /^T255\s*$/gm);
assert.doesNotMatch(converted.text, /^M621 S255\b/gm);
assert.match(converted.text, /^; manual_filament_change = 1$/gm);
assert.match(converted.text, /Change White TPU -> Yellow PLA/);
assert.match(converted.text, /Change Yellow PLA -> White TPU/);
assert.ok(converted.text.length < source.length);

const rawSource = [
  "; total layer number: 2",
  "; filament_colour = #ff0000;#0000ff",
  "; filament_type = PLA;PLA",
  "; layer num/total_layer_count: 1/2",
  "T1",
  "G1 X10",
].join("\n");
const rawAnalysis = analyzeGcode(rawSource);
assert.equal(rawAnalysis.events.length, 1);
assert.equal(rawAnalysis.events[0].kind, "raw");
assert.equal(
  (
    transformGcode(rawAnalysis, {
      selectedEventIds: [rawAnalysis.events[0].id],
      pauseCommand: "M400 U1",
    }).text.match(/^M400 U1\b/gm) || []
  ).length,
  1
);

console.log(
  `PASS: ${analysis.events.length} pauses found, ${converted.outputLineCount.toLocaleString()} output lines, no actionable AMS commands remain.`
);
