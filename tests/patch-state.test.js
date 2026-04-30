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
          generatorMode: "chaos",
          timeSignature: "9/8",
          harmonicMotion: "panic",
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
  assert.equal(restored.slots.B.core.generatorMode, "classic");
  assert.equal(restored.slots.B.core.timeSignature, "4/4");
  assert.equal(restored.slots.B.core.harmonicMotion, 30);
  assert.equal(restored.slots.B.core.harmonicDistanceTarget, 1);
  assert.equal(restored.slots.B.core.harmonicDistanceFalloff, 1);
  assert.equal(restored.slots.B.core.ghostAmount, 100);
  assert.equal(restored.slots.B.core.drift, 0);
  assert.equal(restored.slots.B.soundControls.cutoff, 6400);
});

test("applies a preset to the active compare slot", () => {
  const state = createPatchState({ activeCompareSlot: "B" });
  const updated = applyPresetToPatchState(state, PRESETS[2]);

  assert.equal(updated.activeCompareSlot, "B");
  assert.equal(updated.slots.B.name, "Nocturne Current");
  assert.equal(updated.slots.B.mode, "pad");
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
  assert.equal(patchToCoreSettings(patch).generatorMode, "classic");
  assert.equal(patchToCoreSettings(patch).timeSignature, "4/4");
  assert.equal(patchToCoreSettings(patch).harmonicMotion, 0.3);
  assert.equal(patchToCoreSettings(patch).harmonicDistanceTarget, 1);
  assert.equal(patchToCoreSettings(patch).mode, "pad");
  assert.equal(patchToSoundSettings(patch).space, 0.22);
  assert.deepEqual(
    patchToProgression(patch).map((bar) => bar.slots[0].chord),
    ["Am9", "Fmaj7", "Cadd9", "Gsus4"],
  );
});

test("patch conversion preserves role-based generator mode", () => {
  const patch = createDefaultPatch({
    core: {
      ...createDefaultPatch().core,
      generatorMode: "roleBased",
      timeSignature: "5/4",
      harmonicMotion: 100,
    },
  });

  assert.equal(patchToCoreSettings(patch).generatorMode, "roleBased");
  assert.equal(patchToCoreSettings(patch).timeSignature, "5/4");
  assert.equal(patchToCoreSettings(patch).harmonicMotion, 1);
});

test("patch conversion preserves infinite phrase generator mode", () => {
  const patch = createDefaultPatch({
    core: {
      ...createDefaultPatch().core,
      generatorMode: "infinitePhrase",
      harmonicMotion: 64,
    },
  });

  assert.equal(patch.core.generatorMode, "infinitePhrase");
  assert.equal(patchToCoreSettings(patch).generatorMode, "infinitePhrase");
  assert.equal(patchToCoreSettings(patch).harmonicMotion, 0.64);
});

test("patch conversion preserves harmonic distance controls", () => {
  const patch = createDefaultPatch({
    core: {
      ...createDefaultPatch().core,
      generatorMode: "infinite",
      harmonicDistanceTarget: 7,
      harmonicDistanceFalloff: 2,
      localScaleType: "harmonicMinor",
      scaleName: "harmonicMinor",
    },
  });

  assert.equal(patch.core.harmonicDistanceTarget, 7);
  assert.equal(patchToCoreSettings(patch).harmonicDistanceTarget, 7);
  assert.equal(patchToCoreSettings(patch).harmonicDistanceFalloff, 2);
  assert.equal(patchToCoreSettings(patch).localScaleType, "harmonicMinor");
  assert.equal(patchToCoreSettings(patch).scaleName, "harmonicMinor");
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
