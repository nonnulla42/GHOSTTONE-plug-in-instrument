import assert from "node:assert/strict";
import test from "node:test";

import { generatePattern } from "../src/core/ghosttone-core.js";
import { presetToPatch } from "../src/web/patch-adapter.js";
import { PRESETS } from "../src/web/presets.js";

test("all web presets produce deterministic core patterns", () => {
  PRESETS.forEach((preset) => {
    const patch = presetToPatch(preset);
    const progression = patch.barStates.map((barState, barIndex) => ({
      split: barState.split,
      slots: [
        {
          chord: patch.chords.find((chord) => chord.bar === barIndex && chord.slot === 0)?.value || "C",
          voicingSeed: 0,
          arpSeed: 0,
        },
      ],
    }));
    const first = generatePattern({ ...patch.core, mode: patch.mode }, progression, patch.seed);
    const second = generatePattern({ ...patch.core, mode: patch.mode }, progression, patch.seed);

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

