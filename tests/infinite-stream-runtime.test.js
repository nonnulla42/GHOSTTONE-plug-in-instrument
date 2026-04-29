import assert from "node:assert/strict";
import test from "node:test";

import { generatePattern } from "../src/core/ghosttone-core.js";
import { createInfiniteStreamRuntime, ensureInfiniteBeats } from "../src/core/infinite-stream-runtime.js";

const progression = [
  { split: false, slots: [{ chord: "Am9", voicingSeed: 0, arpSeed: 0 }] },
  { split: false, slots: [{ chord: "Fmaj7", voicingSeed: 0, arpSeed: 0 }] },
  { split: false, slots: [{ chord: "Cadd9", voicingSeed: 0, arpSeed: 0 }] },
  { split: false, slots: [{ chord: "Gsus4", voicingSeed: 0, arpSeed: 0 }] },
];

test("extends infinite generation beyond the initial window", () => {
  const settings = {
    generatorMode: "infinite",
    harmonicMotion: 0.3,
    mode: "pad",
    harmonyLock: 0.52,
    stayMusical: true,
  };
  const pattern = generatePattern(settings, progression, 7001);
  const runtime = createInfiniteStreamRuntime(pattern, settings, 7001, {
    initialLoopCount: 1,
    extendLoopCount: 1,
    lowWaterBeats: 16,
  });

  const initialLoopBeats = pattern.loopBeats;
  ensureInfiniteBeats(runtime, initialLoopBeats - 0.5);

  assert.ok(pattern.loopBeats > initialLoopBeats);
  assert.ok(pattern.sections.length > progression.length);
  assert.ok(runtime.generatedBars > 4);
});

test("streaming infinite extension does not reset to the initial section sequence", () => {
  const settings = {
    generatorMode: "infinite",
    harmonicMotion: 1,
    mode: "pad",
    harmonyLock: 0.18,
    stayMusical: true,
  };
  const pattern = generatePattern(settings, progression, 7002);
  const initialSnapshot = pattern.sections.map((section) => section.notes.map((note) => note.midi));
  const runtime = createInfiniteStreamRuntime(pattern, settings, 7002, {
    initialLoopCount: 1,
    extendLoopCount: 1,
    lowWaterBeats: 16,
  });

  ensureInfiniteBeats(runtime, 15.8);

  const nextLoopSnapshot = pattern.sections.slice(initialSnapshot.length, initialSnapshot.length * 2).map((section) => section.notes.map((note) => note.midi));
  assert.notDeepEqual(nextLoopSnapshot, initialSnapshot);
});

test("events in later chunks keep absolute startBeat values", () => {
  const settings = {
    generatorMode: "infinite",
    harmonicMotion: 0.3,
    mode: "arp",
    harmonyLock: 0.45,
    stayMusical: true,
  };
  const pattern = generatePattern(settings, progression, 7010);
  const runtime = createInfiniteStreamRuntime(pattern, settings, 7010, {
    initialLoopCount: 1,
    extendLoopCount: 1,
    lowWaterBeats: 16,
  });

  ensureInfiniteBeats(runtime, 15.9);

  const firstChunkEvents = pattern.events.filter((event) => event.startBeat >= 0 && event.startBeat < pattern.templateLoopBeats);
  const secondChunkEvents = pattern.events.filter((event) => event.startBeat >= pattern.templateLoopBeats && event.startBeat < pattern.templateLoopBeats * 2);

  assert.ok(firstChunkEvents.length > 0);
  assert.ok(secondChunkEvents.length > 0);
  assert.ok(secondChunkEvents.every((event) => event.startBeat >= pattern.templateLoopBeats));
});

test("runtime exposes a consumable timeline beyond the template loop", () => {
  const settings = {
    generatorMode: "infinite",
    harmonicMotion: 0.3,
    mode: "pad",
    harmonyLock: 0.6,
    stayMusical: true,
  };
  const pattern = generatePattern(settings, progression, 7011);
  const runtime = createInfiniteStreamRuntime(pattern, settings, 7011, {
    initialLoopCount: 1,
    extendLoopCount: 1,
    lowWaterBeats: 16,
  });

  ensureInfiniteBeats(runtime, pattern.templateLoopBeats + 0.5);

  assert.ok(pattern.loopBeats > pattern.templateLoopBeats);
  assert.ok(pattern.events.some((event) => event.startBeat > pattern.templateLoopBeats));
});

test("incremental infinite generation is deterministic", () => {
  const settings = {
    generatorMode: "infinite",
    harmonicMotion: 0.3,
    mode: "pad",
    harmonyLock: 0.66,
    stayMusical: true,
  };
  const firstPattern = generatePattern(settings, progression, 7003);
  const secondPattern = generatePattern(settings, progression, 7003);
  const firstRuntime = createInfiniteStreamRuntime(firstPattern, settings, 7003, {
    initialLoopCount: 1,
    extendLoopCount: 1,
    lowWaterBeats: 16,
  });
  const secondRuntime = createInfiniteStreamRuntime(secondPattern, settings, 7003, {
    initialLoopCount: 1,
    extendLoopCount: 1,
    lowWaterBeats: 16,
  });

  ensureInfiniteBeats(firstRuntime, 15.8);
  ensureInfiniteBeats(secondRuntime, 15.8);
  ensureInfiniteBeats(firstRuntime, 31.8);
  ensureInfiniteBeats(secondRuntime, 31.8);

  assert.deepEqual(secondPattern.sections, firstPattern.sections);
  assert.deepEqual(secondPattern.events, firstPattern.events);
});

test("streaming infinite keeps anchors and avoids collapse across multiple windows", () => {
  const settings = {
    generatorMode: "infinite",
    harmonicMotion: 0.3,
    mode: "pad",
    harmonyLock: 0.42,
    stayMusical: true,
  };
  const pattern = generatePattern(settings, progression, 7004);
  const runtime = createInfiniteStreamRuntime(pattern, settings, 7004, {
    initialLoopCount: 1,
    extendLoopCount: 2,
    lowWaterBeats: 16,
  });

  ensureInfiniteBeats(runtime, 47.5);

  assert.ok(pattern.sections.every((section) => section.notes.some((note) => note.harmonicRole === "anchor")));
  assert.ok(pattern.sections.slice(-8).every((section) => (section.state?.stabilityScore || 0) > 0.2));
});

test("streaming infinite avoids excessive immediate repeats at low memory", () => {
  const repeatRates = [];

  for (let seed = 7100; seed < 7108; seed += 1) {
    const settings = {
      generatorMode: "infinite",
      harmonicMotion: 0.3,
      mode: "pad",
      harmonyLock: 0.42,
      stayMusical: true,
      memoryStrength: 0,
    };
    const pattern = generatePattern(settings, progression, seed);
    const runtime = createInfiniteStreamRuntime(pattern, settings, seed, {
      initialLoopCount: 1,
      extendLoopCount: 2,
      lowWaterBeats: 16,
    });

    ensureInfiniteBeats(runtime, 47.5);
    repeatRates.push(immediateRepeatRate(pattern.sections));
  }

  const averageRepeatRate = repeatRates.reduce((sum, value) => sum + value, 0) / repeatRates.length;
  assert.ok(averageRepeatRate < 0.03);
});

function averageAdjacentSimilarity(sections) {
  const scores = [];
  for (let index = 1; index < sections.length; index += 1) {
    scores.push(sectionSimilarity(sections[index - 1], sections[index]));
  }
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function sectionSimilarity(previous, next) {
  const used = new Set();
  return previous.notes.reduce((sum, note) => {
    let best = { index: -1, score: 0 };
    next.notes.forEach((candidate, index) => {
      if (used.has(index)) return;
      const distance = pcDistance(note.pc, candidate.pc);
      const score = distance === 0 ? 1 : distance === 1 ? 0.5 : 0;
      if (score > best.score) best = { index, score };
    });
    if (best.index >= 0) used.add(best.index);
    return sum + best.score;
  }, 0);
}

function pcDistance(left, right) {
  const up = ((left - right) % 12 + 12) % 12;
  const down = ((right - left) % 12 + 12) % 12;
  return Math.min(up, down);
}

function immediateRepeatRate(sections) {
  let repeats = 0;
  for (let index = 1; index < sections.length; index += 1) {
    if (sectionSignature(sections[index - 1]) === sectionSignature(sections[index])) {
      repeats += 1;
    }
  }
  return repeats / Math.max(1, sections.length - 1);
}

function sectionSignature(section) {
  return JSON.stringify({
    rootPc: section.rootPc,
    notes: section.notes
      .map((note) => [note.pc, note.midi])
      .sort((left, right) => left[1] - right[1] || left[0] - right[0]),
  });
}
