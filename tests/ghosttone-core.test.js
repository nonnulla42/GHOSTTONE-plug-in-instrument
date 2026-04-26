import assert from "node:assert/strict";
import test from "node:test";

import { generatePattern, parseChord } from "../src/core/ghosttone-core.js";

const progression = [
  { split: false, slots: [{ chord: "Am9", voicingSeed: 0, arpSeed: 0 }] },
  {
    split: true,
    slots: [
      { chord: "Fmaj7", voicingSeed: 123, arpSeed: 0 },
      { chord: "F6", voicingSeed: 0, arpSeed: 456 },
    ],
  },
  { split: false, slots: [{ chord: "Cadd9", voicingSeed: 0, arpSeed: 0 }] },
  { split: false, slots: [{ chord: "Gsus4", voicingSeed: 0, arpSeed: 0 }] },
];

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

test("parseChord returns chord tones with roles", () => {
  const chord = parseChord("Am9");

  assert.equal(chord.label, "Am9");
  assert.equal(chord.rootPc, 9);
  assert.deepEqual(
    chord.notes.map((note) => [note.name, note.degree, note.role]),
    [
      ["A", "1", "stable"],
      ["C", "3", "color"],
      ["E", "5", "stable"],
      ["B", "9", "tension"],
    ],
  );
});

test("generatePattern is deterministic for identical inputs", () => {
  const settings = {
    mode: "evolve",
    ghostAmount: 0.62,
    drift: 0.41,
    harmonyLock: 0.7,
    colorMode: "dreamy",
    voicingStyle: "smooth",
  };

  const first = generatePattern(settings, progression, 4242);
  const second = generatePattern(settings, progression, 4242);

  assert.deepEqual(second, first);
});

test("generatePattern returns a fixed beat-based event contract", () => {
  const result = generatePattern({ mode: "arp", arpDensity: 0.5 }, progression, 99);
  const event = result.events[0];

  assert.equal(result.loopBeats, 16);
  assert.equal(result.sections.length, 5);
  assert.ok(result.events.length > 0);
  assert.deepEqual(Object.keys(event), [
    "id",
    "sectionIndex",
    "sectionLabel",
    "voiceId",
    "noteName",
    "midi",
    "startBeat",
    "durationBeats",
    "cents",
    "driftAmount",
    "driftEnd",
    "role",
    "degree",
    "motionType",
    "carriedFromPrevious",
    "velocity",
  ]);
  assert.equal(typeof event.startBeat, "number");
  assert.equal(typeof event.durationBeats, "number");
  assert.ok(["stay", "step", "leap"].includes(event.motionType));
  assert.ok(!("time" in event));
  assert.ok(!("duration" in event));
});

test("spread voicing creates a wider register than close voicing", () => {
  const close = generatePattern({ mode: "pad", voicingStyle: "close", ghostEnabled: false }, progression, 123);
  const spread = generatePattern({ mode: "pad", voicingStyle: "spread", ghostEnabled: false }, progression, 123);
  const closeFirst = close.sections[0].notes.map((note) => note.midi);
  const spreadFirst = spread.sections[0].notes.map((note) => note.midi);

  assert.ok(range(spreadFirst) > range(closeFirst));
});

test("higher arp density produces more events", () => {
  const low = generatePattern({ mode: "arp", arpDensity: 0, ghostEnabled: false }, progression, 222);
  const high = generatePattern({ mode: "arp", arpDensity: 1, ghostEnabled: false }, progression, 222);

  assert.ok(high.events.length > low.events.length);
});

test("arp directions produce different contours", () => {
  const up = generatePattern({ mode: "arp", arpDirection: "up", arpDensity: 0.75, ghostEnabled: false }, progression, 333);
  const bounce = generatePattern({ mode: "arp", arpDirection: "bounce", arpDensity: 0.75, ghostEnabled: false }, progression, 333);
  const upContour = up.events.slice(0, 8).map((event) => event.midi);
  const bounceContour = bounce.events.slice(0, 8).map((event) => event.midi);

  assert.notDeepEqual(bounceContour, upContour);
});

test("ghost amount controls offset range", () => {
  const off = generatePattern({ mode: "pad", ghostAmount: 0, ghostEnabled: true }, progression, 444);
  const high = generatePattern({ mode: "pad", ghostAmount: 1, ghostEnabled: true }, progression, 444);

  assert.equal(maxAbs(off.events.map((event) => event.cents)), 0);
  assert.ok(maxAbs(high.events.map((event) => event.cents)) > 0);
});

test("higher drift increases drift movement with identical musical inputs", () => {
  const low = generatePattern({ mode: "pad", ghostAmount: 0.8, drift: 0.05, ghostEnabled: true }, progression, 555);
  const high = generatePattern({ mode: "pad", ghostAmount: 0.8, drift: 1, ghostEnabled: true }, progression, 555);

  assert.ok(sum(high.events.map((event) => event.driftAmount)) > sum(low.events.map((event) => event.driftAmount)));
});

test("role-based generator emits harmonic roles and carry metadata", () => {
  const result = generatePattern({ generatorMode: "roleBased", mode: "pad", ghostAmount: 0.8, drift: 0.6 }, progression, 8080);

  assert.ok(result.events.length > 0);
  assert.ok(result.events.some((event) => event.role === "anchor"));
  assert.ok(result.events.some((event) => event.role === "color"));
  assert.ok(result.events.some((event) => event.role === "tension"));
  assert.ok(result.events.every((event) => typeof event.carriedFromPrevious === "boolean"));
  assert.ok(result.events.every((event) => ["stay", "step", "leap"].includes(event.motionType)));
});

test("role-based generator stays deterministic with same seed", () => {
  const settings = {
    generatorMode: "roleBased",
    mode: "evolve",
    ghostAmount: 0.7,
    drift: 0.42,
    harmonyLock: 0.6,
    colorMode: "alien",
    voicingStyle: "smooth",
  };

  const first = generatePattern(settings, progression, 9090);
  const second = generatePattern(settings, progression, 9090);

  assert.deepEqual(second, first);
});

test("infinite generator evolves sections deterministically and preserves anchors", () => {
  const settings = {
    generatorMode: "infinite",
    harmonicMotion: "evolving",
    mode: "evolve",
    ghostAmount: 0.72,
    drift: 0.38,
    harmonyLock: 0.52,
    stayMusical: true,
  };

  const first = generatePattern(settings, progression, 12012);
  const second = generatePattern(settings, progression, 12012);

  assert.deepEqual(second, first);
  assert.ok(first.sections.every((section) => section.notes.some((note) => note.harmonicRole === "anchor")));
  assert.ok(first.sections.slice(1).some((section) => (section.state?.movedVoices || 0) > 0));
});

test("infinite arp events preserve each section chord tone", () => {
  const cmaj7Progression = Array.from({ length: 4 }, () => ({
    split: false,
    slots: [{ chord: "Cmaj7", voicingSeed: 0, arpSeed: 0 }],
  }));
  const result = generatePattern({
    generatorMode: "infinite",
    harmonicMotion: "subtle",
    harmonicDistanceTarget: 4,
    mode: "arp",
    arpDensity: 0.7,
    harmonyLock: 0.68,
    stayMusical: true,
  }, cmaj7Progression, 13013);

  result.sections.forEach((section, sectionIndex) => {
    const sectionPcs = new Set(section.notes.map((note) => note.pc));
    const eventPcs = new Set(result.events
      .filter((event) => event.sectionIndex === sectionIndex)
      .map((event) => normalizePc(event.midi)));

    assert.equal(sectionPcs.size, 4);
    sectionPcs.forEach((pc) => assert.ok(eventPcs.has(pc)));
  });
});

function range(values) {
  return Math.max(...values) - Math.min(...values);
}

function maxAbs(values) {
  return Math.max(...values.map((value) => Math.abs(value)));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
