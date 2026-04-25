import assert from "node:assert/strict";
import test from "node:test";

import { generatePattern } from "../src/core/ghosttone-core.js";
import { patchToCoreSettings, patchToProgression } from "../src/state/patch-state.js";
import { presetToPatch } from "../src/web/patch-adapter.js";
import { PRESETS } from "../src/web/presets.js";

test("all web presets produce deterministic core patterns", () => {
  PRESETS.forEach((preset) => {
    const patch = presetToPatch(preset);
    const first = generatePattern(patchToCoreSettings(patch), patchToProgression(patch), patch.seed);
    const second = generatePattern(patchToCoreSettings(patch), patchToProgression(patch), patch.seed);

    assert.equal(first.events.length > 0, true);
    assert.deepEqual(second, first);
  });
});

test("preset patches include identity controls", () => {
  const patch = presetToPatch(PRESETS[0]);

  assert.equal(patch.name, "Dreamy Pad");
  assert.equal(patch.mode, "pad");
  assert.equal(patch.sound, "pad");
  assert.equal(patch.chords.length, 4);
  assert.equal(typeof patch.seed, "number");
});
