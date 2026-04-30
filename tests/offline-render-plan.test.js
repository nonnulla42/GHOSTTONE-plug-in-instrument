import assert from "node:assert/strict";
import test from "node:test";

import { createOfflineRenderPlan } from "../src/render/offline-render-plan.js";
import { createDefaultPatch, createPatchFromPreset } from "../src/state/patch-state.js";
import { PRESETS } from "../src/web/presets.js";

test("computes render duration and block count", () => {
  const plan = createOfflineRenderPlan(createPatchFromPreset(PRESETS[0]), {
    bpm: 120,
    sampleRate: 48000,
    startBeat: 0,
    endBeat: 4,
    blockSize: 24000,
  });

  assert.equal(plan.durationBeats, 4);
  assert.equal(plan.durationSamples, 96000);
  assert.equal(plan.totalBlocks, 4);
  assert.deepEqual(
    plan.blocks.map((block) => [block.blockIndex, block.sampleStart, block.blockSize, block.blockStartBeat, block.blockEndBeat]),
    [
      [0, 0, 24000, 0, 1],
      [1, 24000, 24000, 1, 2],
      [2, 48000, 24000, 2, 3],
      [3, 72000, 24000, 3, 4],
    ],
  );
});

test("places scheduled events into the correct offline block", () => {
  const plan = createOfflineRenderPlan(createPatchFromPreset(PRESETS[0]), {
    bpm: 120,
    sampleRate: 48000,
    startBeat: 0,
    endBeat: 4,
    blockSize: 24000,
  });

  assert.equal(plan.blocks[0].scheduledEvents.length > 0, true);
  assert.equal(plan.blocks[1].scheduledEvents.length, 0);
  assert.ok(plan.blocks[0].scheduledEvents.every((event) => event.blockIndex === 0));
  assert.ok(plan.blocks[0].scheduledEvents.every((event) => event.sampleOffset === 0));
});

test("uses half-open render range boundaries", () => {
  const patch = createDefaultPatch({
    mode: "pad",
    barStates: [
      { split: false, slots: [{ voicingSeed: 0, arpSeed: 0 }, { voicingSeed: 0, arpSeed: 0 }] },
      { split: false, slots: [{ voicingSeed: 0, arpSeed: 0 }, { voicingSeed: 0, arpSeed: 0 }] },
    ],
    chords: [
      { bar: 0, slot: 0, value: "Am9" },
      { bar: 1, slot: 0, value: "Fmaj7" },
    ],
  });
  const plan = createOfflineRenderPlan(patch, {
    bpm: 120,
    sampleRate: 48000,
    startBeat: 4,
    endBeat: 8,
    blockSize: 24000,
  });
  const scheduled = plan.blocks.flatMap((block) => block.scheduledEvents);

  assert.equal(scheduled.length > 0, true);
  assert.ok(scheduled.every((event) => event.startBeat >= 4));
  assert.ok(scheduled.every((event) => event.startBeat < 8));
  assert.equal(scheduled.some((event) => event.startBeat === 8), false);
});

test("is deterministic for identical patch and render options", () => {
  const patch = createPatchFromPreset(PRESETS[2]);
  const options = {
    bpm: 90,
    sampleRate: 44100,
    startBeat: 0,
    endBeat: 16,
    blockSize: 1024,
  };

  assert.deepEqual(createOfflineRenderPlan(patch, options), createOfflineRenderPlan(patch, options));
});

test("handles split progression patches", () => {
  const patch = createDefaultPatch({
    mode: "arp",
    seed: 1234,
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
  const plan = createOfflineRenderPlan(patch, {
    bpm: 120,
    sampleRate: 48000,
    startBeat: 0,
    endBeat: 4,
    blockSize: 12000,
  });
  const scheduled = plan.blocks.flatMap((block) => block.scheduledEvents);

  assert.equal(plan.pattern.sections.length >= 2, true);
  assert.equal(plan.pattern.sections[0].durationBeats, 2);
  assert.equal(plan.pattern.sections[1].durationBeats, 2);
  assert.equal(scheduled.length > 0, true);
});

test("rejects invalid render options", () => {
  const patch = createPatchFromPreset(PRESETS[0]);

  assert.throws(() => createOfflineRenderPlan(patch, { bpm: 0, sampleRate: 48000, endBeat: 1, blockSize: 128 }), /bpm/);
  assert.throws(() => createOfflineRenderPlan(patch, { bpm: 120, sampleRate: 0, endBeat: 1, blockSize: 128 }), /sampleRate/);
  assert.throws(() => createOfflineRenderPlan(patch, { bpm: 120, sampleRate: 48000, startBeat: 2, endBeat: 1, blockSize: 128 }), /endBeat/);
});

test("default offline render range follows selected time signature", () => {
  const patch = createDefaultPatch({
    core: {
      ...createDefaultPatch().core,
      timeSignature: "5/4",
    },
  });
  const plan = createOfflineRenderPlan(patch, {
    bpm: 120,
    sampleRate: 48000,
    blockSize: 24000,
  });

  assert.equal(plan.startBeat, 0);
  assert.equal(plan.endBeat, 40);
  assert.equal(plan.durationBeats, 40);
});
