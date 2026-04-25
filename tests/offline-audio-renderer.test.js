import assert from "node:assert/strict";
import test from "node:test";

import { renderOfflineAudio } from "../src/render/offline-audio-renderer.js";
import { createDefaultPatch, createPatchFromPreset } from "../src/state/patch-state.js";
import { PRESETS } from "../src/web/presets.js";

const renderOptions = {
  bpm: 120,
  sampleRate: 12000,
  startBeat: 0,
  endBeat: 4,
  blockSize: 1200,
};

test("renders a buffer with the expected duration and channels", () => {
  const result = renderOfflineAudio(createPatchFromPreset(PRESETS[0]), renderOptions);

  assert.equal(result.sampleRate, 12000);
  assert.equal(result.channelCount, 2);
  assert.equal(result.durationSamples, 24000);
  assert.equal(result.left.length, 24000);
  assert.equal(result.right.length, 24000);
});

test("renders non-empty audio for a valid patch", () => {
  const result = renderOfflineAudio(createPatchFromPreset(PRESETS[0]), renderOptions);

  assert.ok(maxAbs(result.left) > 0);
  assert.ok(maxAbs(result.right) > 0);
});

test("is deterministic for the same patch and options", () => {
  const patch = createPatchFromPreset(PRESETS[2]);
  const first = renderOfflineAudio(patch, renderOptions);
  const second = renderOfflineAudio(patch, renderOptions);

  assert.deepEqual([...second.left], [...first.left]);
  assert.deepEqual([...second.right], [...first.right]);
});

test("ghost-enabled render differs from ghost-disabled render", () => {
  const patch = createPatchFromPreset(PRESETS[0]);
  const ghostOff = {
    ...patch,
    core: {
      ...patch.core,
      ghostEnabled: false,
    },
  };
  const on = renderOfflineAudio(patch, renderOptions);
  const off = renderOfflineAudio(ghostOff, renderOptions);

  assert.notDeepEqual([...on.left.slice(0, 4000)], [...off.left.slice(0, 4000)]);
});

test("render is stable across different block sizes", () => {
  const patch = createPatchFromPreset(PRESETS[0]);
  const smallBlocks = renderOfflineAudio(patch, {
    ...renderOptions,
    blockSize: 600,
  });
  const largeBlocks = renderOfflineAudio(patch, {
    ...renderOptions,
    blockSize: 2400,
  });

  assert.deepEqual([...smallBlocks.left], [...largeBlocks.left]);
  assert.deepEqual([...smallBlocks.right], [...largeBlocks.right]);
});

test("renders split patches without invalid samples", () => {
  const patch = createDefaultPatch({
    mode: "arp",
    sound: "pluck",
    seed: 5678,
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
  const result = renderOfflineAudio(patch, renderOptions);

  assert.equal(result.plan.pattern.sections[0].durationBeats, 2);
  assert.equal(result.plan.pattern.sections[1].durationBeats, 2);
  assert.ok(maxAbs(result.left) > 0);
  assertSamplesFinite(result.left);
  assertSamplesFinite(result.right);
});

test("can render mono", () => {
  const result = renderOfflineAudio(createPatchFromPreset(PRESETS[0]), {
    ...renderOptions,
    channelCount: 1,
  });

  assert.equal(result.channelCount, 1);
  assert.equal(result.left, result.right);
});

function maxAbs(buffer) {
  return buffer.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
}

function assertSamplesFinite(buffer) {
  for (const sample of buffer) {
    assert.equal(Number.isFinite(sample), true);
  }
}
