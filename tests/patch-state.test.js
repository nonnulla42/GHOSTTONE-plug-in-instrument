import assert from "node:assert/strict";
import test from "node:test";

import { generatePattern } from "../src/core/ghosttone-core.js";
import {
  applyPresetToPatchState,
  clonePatchState,
  createDefaultPatch,
  createPatchFromPreset,
  createPatchState,
  deserializePatchState,
  patchToCoreSettings,
  patchToProgression,
  patchToSoundSettings,
  serializePatchState,
} from "../src/state/patch-state.js";
import { PRESETS } from "../src/web/presets.js";

test("serializes and deserializes patch state without changing it", () => {
  const state = createPatchState();
  const serialized = serializePatchState(state);
  const restored = deserializePatchState(serialized);

  assert.deepEqual(restored, state);
});

test("normalizes unsafe patch values", () => {
  const restored = deserializePatchState({
    activeCompareSlot: "b",
    slots: {
      B: {
        name: "Unsafe",
        seed: -2,
        bpm: 999,
        mode: "wrong",
        sound: "wrong",
        core: {
          ghostAmount: 200,
          drift: -4,
          colorMode: "wrong",
        },
        soundControls: {
          waveform: "wrong",
          cutoff: 100000,
        },
      },
    },
  });

  assert.equal(restored.activeCompareSlot, "B");
  assert.equal(restored.slots.B.seed, 1);
  assert.equal(restored.slots.B.bpm, 240);
  assert.equal(restored.slots.B.mode, "pad");
  assert.equal(restored.slots.B.core.ghostAmount, 100);
  assert.equal(restored.slots.B.core.drift, 0);
  assert.equal(restored.slots.B.soundControls.cutoff, 6400);
});

test("applies a preset to the active compare slot", () => {
  const state = createPatchState({ activeCompareSlot: "B" });
  const updated = applyPresetToPatchState(state, PRESETS[2]);

  assert.equal(updated.activeCompareSlot, "B");
  assert.equal(updated.slots.B.name, "Dark Drift");
  assert.equal(updated.slots.B.mode, "evolve");
  assert.equal(updated.slots.A.name, "Slot A");
});

test("preset patch can drive the core deterministically", () => {
  const patch = createPatchFromPreset(PRESETS[3]);
  const first = generatePattern(patchToCoreSettings(patch), patchToProgression(patch), patch.seed);
  const second = generatePattern(patchToCoreSettings(patch), patchToProgression(patch), patch.seed);

  assert.equal(first.events.length > 0, true);
  assert.deepEqual(second, first);
});

test("patch conversion feeds core, progression, and sound adapters", () => {
  const patch = createPatchFromPreset(PRESETS[0]);

  assert.equal(patchToCoreSettings(patch).ghostAmount, 0.48);
  assert.equal(patchToCoreSettings(patch).mode, "pad");
  assert.equal(patchToSoundSettings(patch).space, 0.18);
  assert.deepEqual(
    patchToProgression(patch).map((bar) => bar.slots[0].chord),
    ["Am9", "Fmaj7", "Cadd9", "Gsus4"],
  );
});

test("split bars include the second chord slot in progression conversion", () => {
  const patch = createDefaultPatch({
    barStates: [
      {
        split: true,
        slots: [
          { voicingSeed: 11, arpSeed: 22 },
          { voicingSeed: 33, arpSeed: 44 },
        ],
      },
    ],
    chords: [
      { bar: 0, slot: 0, value: "Am9" },
      { bar: 0, slot: 1, value: "Fmaj7" },
    ],
  });

  assert.deepEqual(patchToProgression(patch)[0], {
    split: true,
    slots: [
      { chord: "Am9", voicingSeed: 11, arpSeed: 22 },
      { chord: "Fmaj7", voicingSeed: 33, arpSeed: 44 },
    ],
  });
});

test("clonePatchState returns an isolated copy", () => {
  const state = createPatchState({ slots: { A: createDefaultPatch({ name: "Original" }) } });
  const clone = clonePatchState(state);

  clone.slots.A.name = "Changed";

  assert.equal(state.slots.A.name, "Original");
  assert.equal(clone.slots.A.name, "Changed");
});
