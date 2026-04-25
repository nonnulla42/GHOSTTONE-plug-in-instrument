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
    isLooping: false,
    segments: [{ startBeat: 4, endBeat: 6, offsetBeat: 0 }],
  });
});

test("schedules events across a loop wrap", () => {
  const scheduled = scheduleEventsForBlock([event("late", 15.98, 0.25), event("zero", 0, 0.5), event("early", 0.04, 0.5), event("outside", 0.06, 0.5)], {
    bpm: 120,
    sampleRate: 48000,
    blockSize: 2400,
    blockStartBeat: 15.95,
    isLooping: true,
    loopStartBeat: 0,
    loopEndBeat: 16,
  });

  assert.deepEqual(
    scheduled.map((item) => [item.id, item.sampleOffset]),
    [
      ["late", 720],
      ["zero", 1200],
      ["early", 2160],
    ],
  );
});

test("includes loop-start boundary and excludes block-end boundary", () => {
  const scheduled = scheduleEventsForBlock([event("zero", 0, 0.5), event("end", 0.05, 0.5)], {
    bpm: 120,
    sampleRate: 48000,
    blockSize: 2400,
    blockStartBeat: 15.95,
    isLooping: true,
    loopStartBeat: 0,
    loopEndBeat: 16,
  });

  assert.deepEqual(
    scheduled.map((item) => item.id),
    ["zero"],
  );
});

test("reports wrapped block segments", () => {
  const window = getLoopingBlockWindow({
    bpm: 120,
    sampleRate: 48000,
    blockSize: 2400,
    blockStartBeat: 15.95,
    isLooping: true,
    loopStartBeat: 0,
    loopEndBeat: 16,
  });

  assert.equal(window.startBeat, 15.95);
  assert.ok(Math.abs(window.durationBeats - 0.1) < 1e-9);
  assert.equal(window.isLooping, true);
  assert.deepEqual(window.segments.map(roundSegment), [
    { startBeat: 15.95, endBeat: 16, offsetBeat: 0 },
    { startBeat: 0, endBeat: 0.05, offsetBeat: 0.05 },
  ]);
});

test("wraps absolute host beat into loop domain", () => {
  const scheduled = scheduleEventsForBlock([event("zero", 0, 0.5)], {
    bpm: 120,
    sampleRate: 48000,
    blockSize: 2400,
    blockStartBeat: 31.95,
    isLooping: true,
    loopStartBeat: 0,
    loopEndBeat: 16,
  });

  assert.deepEqual(
    scheduled.map((item) => [item.id, item.sampleOffset]),
    [["zero", 1200]],
  );
});

test("rejects invalid host timing context", () => {
  assert.throws(() => beatsToSamples(1, 0, 48000), /bpm/);
  assert.throws(() => samplesToBeats(1, 120, 0), /sampleRate/);
  assert.throws(() => scheduleEventsForBlock(events, { bpm: 120, sampleRate: 48000, blockSize: 0 }), /blockSize/);
  assert.throws(() => scheduleEventsForBlock(events, { bpm: 120, sampleRate: 48000, blockSize: 128, isLooping: true, loopEndBeat: 0 }), /loopEndBeat/);
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

function roundSegment(segment) {
  return {
    startBeat: roundBeat(segment.startBeat),
    endBeat: roundBeat(segment.endBeat),
    offsetBeat: roundBeat(segment.offsetBeat),
  };
}

function roundBeat(value) {
  return Math.round(value * 1000000) / 1000000;
}
