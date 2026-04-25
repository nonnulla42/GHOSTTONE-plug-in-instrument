import assert from "node:assert/strict";
import test from "node:test";

import { beatsToSamples, getLoopingBlockWindow, samplesToBeats, scheduleEventsForBlock } from "../src/adapters/host-time-adapter.js";

const events = [
  event("a", 0, 1),
  event("b", 1, 0.5),
  event("c", 2, 1),
  event("d", 3, 1),
];

test("converts beats to samples", () => {
  assert.equal(beatsToSamples(1, 120, 48000), 24000);
  assert.equal(beatsToSamples(4, 120, 48000), 96000);
});

test("converts samples to beats", () => {
  assert.equal(samplesToBeats(24000, 120, 48000), 1);
  assert.equal(samplesToBeats(96000, 120, 48000), 4);
});

test("schedules events that start inside the current audio block", () => {
  const scheduled = scheduleEventsForBlock(events, {
    bpm: 120,
    sampleRate: 48000,
    blockSize: 48000,
    blockStartBeat: 1,
  });

  assert.deepEqual(
    scheduled.map((item) => [item.id, item.sampleOffset, item.durationSamples]),
    [
      ["b", 0, 12000],
      ["c", 24000, 24000],
    ],
  );
});

test("reports the beat window represented by a block", () => {
  const window = getLoopingBlockWindow({
    bpm: 120,
    sampleRate: 48000,
    blockSize: 48000,
    blockStartBeat: 4,
  });

  assert.deepEqual(window, {
    startBeat: 4,
    endBeat: 6,
    durationBeats: 2,
  });
});

test("rejects invalid host timing context", () => {
  assert.throws(() => beatsToSamples(1, 0, 48000), /bpm/);
  assert.throws(() => samplesToBeats(1, 120, 0), /sampleRate/);
  assert.throws(() => scheduleEventsForBlock(events, { bpm: 120, sampleRate: 48000, blockSize: 0 }), /blockSize/);
});

function event(id, startBeat, durationBeats) {
  return {
    id,
    sectionIndex: 0,
    sectionLabel: "Am9",
    voiceId: 0,
    noteName: "A",
    midi: 57,
    startBeat,
    durationBeats,
    cents: 0,
    driftAmount: 0,
    driftEnd: 0,
    role: "stable",
    degree: "1",
    motionType: "pad",
    velocity: 0.5,
  };
}

