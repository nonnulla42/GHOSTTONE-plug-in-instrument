import assert from "node:assert/strict";
import test from "node:test";

import { getBrowserScheduleBlock, getNextBrowserScheduleBlock, scheduleBrowserEvents } from "../src/web/web-audio-engine.js";

test("builds a looping host-time block from browser audio time", () => {
  const block = getBrowserScheduleBlock({
    audioCurrentTime: 2,
    loopStartTime: 1,
    bpm: 120,
    sampleRate: 48000,
    loopBeats: 16,
    lookaheadSeconds: 0.1,
  });

  assert.deepEqual(block, {
    bpm: 120,
    sampleRate: 48000,
    blockSize: 4800,
    blockStartBeat: 2,
    isLooping: true,
    loopStartBeat: 0,
    loopEndBeat: 16,
  });
});

test("schedules browser events through the host-time adapter", () => {
  const scheduled = scheduleBrowserEvents([event("a", 2.05), event("b", 2.2), event("c", 0)], {
    audioCurrentTime: 2,
    loopStartTime: 1,
    bpm: 120,
    sampleRate: 48000,
    loopBeats: 16,
    lookaheadSeconds: 0.1,
  });

  assert.deepEqual(
    scheduled.map((item) => [item.id, item.sampleOffset]),
    [["a", 1200]],
  );
});

test("continues scheduling from the previous lookahead edge", () => {
  const block = getNextBrowserScheduleBlock({
    audioCurrentTime: 2.02,
    loopStartTime: 1,
    bpm: 120,
    sampleRate: 48000,
    loopBeats: 16,
    lookaheadSeconds: 0.1,
    lastScheduledBeat: 2.2,
  });

  assert.equal(block.blockStartBeat, 2.2);
  assert.equal(block.blockSize, 960);
});

test("browser scheduling supports loop wrap", () => {
  const scheduled = scheduleBrowserEvents([event("late", 15.98), event("zero", 0), event("outside", 0.16)], {
    audioCurrentTime: 8.975,
    loopStartTime: 1,
    bpm: 120,
    sampleRate: 48000,
    loopBeats: 16,
    lookaheadSeconds: 0.1,
  });

  assert.deepEqual(
    scheduled.map((item) => [item.id, item.sampleOffset]),
    [
      ["late", 720],
      ["zero", 1200],
    ],
  );
});

function event(id, startBeat) {
  return {
    id,
    sectionIndex: 0,
    sectionLabel: "Am9",
    voiceId: 0,
    noteName: "A",
    midi: 57,
    startBeat,
    durationBeats: 0.5,
    cents: 0,
    driftAmount: 0,
    driftEnd: 0,
    role: "stable",
    degree: "1",
    motionType: "pad",
    velocity: 0.5,
  };
}
