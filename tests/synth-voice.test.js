import assert from "node:assert/strict";
import test from "node:test";

import { buildSynthVoicePlan, centsToRatio, midiToFreq } from "../src/audio/synth-voice.js";

const coreSettings = {
  ghostEnabled: true,
};

const soundSettings = {
  sound: "pad",
  waveform: "triangle",
  cutoff: 1800,
  attack: 0.3,
  release: 0.8,
  space: 0.5,
};

test("converts MIDI and cents to frequency", () => {
  assert.equal(midiToFreq(69), 440);
  assert.equal(centsToRatio(1200), 2);
});

test("builds pitch plan from cents and driftEnd", () => {
  const event = makeEvent({ midi: 69, cents: 50, driftEnd: -25 });
  const plan = buildSynthVoicePlan(event, coreSettings, soundSettings, 2);

  assert.equal(round(plan.startFrequency), round(440 * centsToRatio(50)));
  assert.equal(round(plan.endFrequency), round(440 * centsToRatio(-25)));
  assert.equal(plan.shouldDrift, true);
});

test("bypasses microtonal pitch when ghost is disabled", () => {
  const event = makeEvent({ midi: 69, cents: 50, driftEnd: -25 });
  const plan = buildSynthVoicePlan(event, { ghostEnabled: false }, soundSettings, 2);

  assert.equal(plan.startFrequency, 440);
  assert.equal(plan.endFrequency, 440);
  assert.equal(plan.shouldDrift, false);
});

test("builds stable envelope and stop plan", () => {
  const plan = buildSynthVoicePlan(makeEvent(), coreSettings, soundSettings, 1);

  assert.equal(plan.attack, 0.3);
  assert.equal(plan.release, 0.75);
  assert.equal(plan.sustainStartOffset, 0.3);
  assert.equal(plan.stopOffset, 1.8);
  assert.ok(plan.peakGain > 0);
  assert.equal(plan.sustainGain, plan.peakGain * 0.78);
});

test("constrains pan and selects pluck filter", () => {
  const event = makeEvent({ voiceId: 20 });
  const plan = buildSynthVoicePlan(event, coreSettings, { ...soundSettings, sound: "pluck", space: 1 }, 1);

  assert.equal(plan.pan, 0.35);
  assert.equal(plan.filterQ, 1.05);
});

function makeEvent(overrides = {}) {
  return {
    id: "event",
    sectionIndex: 0,
    sectionLabel: "Am9",
    voiceId: 0,
    noteName: "A",
    midi: 57,
    startBeat: 0,
    durationBeats: 1,
    cents: 0,
    driftAmount: 0,
    driftEnd: 0,
    role: "stable",
    degree: "1",
    motionType: "pad",
    velocity: 0.5,
    ...overrides,
  };
}

function round(value) {
  return Math.round(value * 1000000) / 1000000;
}

