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
    "velocity",
  ]);
  assert.equal(typeof event.startBeat, "number");
  assert.equal(typeof event.durationBeats, "number");
  assert.equal(event.motionType, "arp");
  assert.ok(!("time" in event));
  assert.ok(!("duration" in event));
});
