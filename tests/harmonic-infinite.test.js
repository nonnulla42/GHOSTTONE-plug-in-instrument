import assert from "node:assert/strict";
import test from "node:test";

import { parseChord } from "../src/core/ghosttone-core.js";
import {
  buildInfiniteSections,
  buildInfiniteSectionSequence,
  createHarmonicStateFromSection,
  evolveHarmonicState,
} from "../src/core/harmonic-infinite.js";

function makeRandom(seed) {
  let value = Math.trunc(seed) % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function seedSection(chordLabel = "Am9", startBeat = 0, durationBeats = 4) {
  const chord = parseChord(chordLabel);
  return {
    label: chord.label,
    rootPc: chord.rootPc,
    notes: chord.notes.map((note, index) => ({
      ...note,
      harmonicRole: index === 0 ? "anchor" : note.role === "color" ? "color" : "tension",
    })),
    baseNotes: chord.notes,
    startBeat,
    durationBeats,
    slotState: { voicingSeed: 0, arpSeed: 0 },
  };
}

test("evolveHarmonicState produces a valid next state with an anchor", () => {
  const initial = createHarmonicStateFromSection(seedSection("Am9"));
  const next = evolveHarmonicState(initial, {
    random: makeRandom(101),
    settings: { harmonicMotion: 0.3, harmonyLock: 0.72, stayMusical: true },
  });

  assert.ok(next.voices.length > 0);
  assert.ok(next.voices.some((voice) => voice.role === "anchor"));
  assert.ok(Number.isFinite(next.stabilityScore));
  assert.ok(Number.isFinite(next.tensionScore));
});

test("infinite evolution is deterministic for identical seeds", () => {
  const initial = createHarmonicStateFromSection(seedSection("Fmaj7"));
  const settings = { harmonicMotion: 0.3, harmonyLock: 0.4, stayMusical: true };
  const first = evolveHarmonicState(initial, {
    random: makeRandom(202),
    settings,
  });
  const second = evolveHarmonicState(initial, {
    random: makeRandom(202),
    settings,
  });

  assert.deepEqual(second, first);
});

test("restless harmonic motion moves more than static", () => {
  const initial = createHarmonicStateFromSection(seedSection("Cadd9"));
  const staticState = evolveHarmonicState(initial, {
    random: makeRandom(303),
    settings: { harmonicMotion: 0, harmonyLock: 0.8, stayMusical: true },
  });
  const restlessState = evolveHarmonicState(initial, {
    random: makeRandom(303),
    settings: { harmonicMotion: 1, harmonyLock: 0.1, stayMusical: true },
  });

  assert.ok(restlessState.movedVoices >= staticState.movedVoices);
  assert.ok(restlessState.leapCount >= staticState.leapCount);
});

test("roles are reassigned after movement", () => {
  const initial = createHarmonicStateFromSection(seedSection("Gsus4"));
  const next = evolveHarmonicState(initial, {
    random: makeRandom(404),
    settings: { harmonicMotion: 0.3, harmonyLock: 0.3, stayMusical: false },
  });

  assert.ok(next.voices.every((voice) => ["anchor", "color", "tension"].includes(voice.role)));
  assert.ok(next.voices.every((voice) => typeof voice.degree === "string"));
});

test("stayMusical prevents total harmonic collapse", () => {
  const initial = createHarmonicStateFromSection(seedSection("Am9"));
  const next = evolveHarmonicState(initial, {
    random: makeRandom(505),
    settings: { harmonicMotion: 1, harmonyLock: 0.2, stayMusical: true },
  });

  assert.ok(new Set(next.voices.map((voice) => voice.pc)).size >= 2);
  assert.ok(next.stabilityScore > 0.2);
});

test("infinite evolution keeps four unique chord tones voiced", () => {
  const skeleton = [
    seedSection("Cmaj7", 0, 4),
    seedSection("Cmaj7", 4, 4),
    seedSection("Cmaj7", 8, 4),
    seedSection("Cmaj7", 12, 4),
  ];
  const sections = buildInfiniteSectionSequence(skeleton, {
    harmonicMotion: 0.3,
    harmonicDistanceTarget: 4,
    harmonyLock: 0.68,
    stayMusical: true,
  }, 808, 16, makeRandom);

  sections.forEach((section) => {
    assert.equal(section.notes.length, 4);
    assert.equal(new Set(section.notes.map((note) => note.pc)).size, 4);
  });
});

test("buildInfiniteSections creates a finite evolving window from a seed progression skeleton", () => {
  const skeleton = [
    seedSection("Am9", 0, 4),
    seedSection("Fmaj7", 4, 4),
    seedSection("Cadd9", 8, 2),
    seedSection("Gsus4", 10, 2),
  ];

  const sections = buildInfiniteSections(skeleton, {
    harmonicMotion: 0.3,
    harmonyLock: 0.6,
    stayMusical: true,
  }, 606, makeRandom);

  assert.equal(sections.length, skeleton.length);
  assert.ok(sections.every((section) => section.notes.some((note) => note.harmonicRole === "anchor")));
  assert.ok(sections.slice(1).some((section) => section.label.includes("infinite")));
});

test("longer infinite evolution keeps the register from drifting upward", () => {
  const skeleton = [
    seedSection("Am9", 0, 4),
    seedSection("Fmaj7", 4, 4),
    seedSection("Cadd9", 8, 4),
    seedSection("Gsus4", 12, 4),
  ];
  const sections = buildInfiniteSectionSequence(skeleton, {
    harmonicMotion: 0.3,
    harmonyLock: 0.42,
    stayMusical: true,
  }, 707, 32, makeRandom);
  const centers = sections.map((section) => {
    const sum = section.notes.reduce((total, note) => total + note.midi, 0);
    return sum / section.notes.length;
  });
  const initialCenter = centers[0];
  const finalCenter = centers[centers.length - 1];

  assert.ok(Math.max(...centers) <= 72);
  assert.ok(finalCenter - initialCenter < 10);
});
