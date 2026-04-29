import assert from "node:assert/strict";
import test from "node:test";

import { generatePattern, parseChord } from "../src/core/ghosttone-core.js";
import { getNoteSimilarity } from "../src/core/harmonic-chord-evolution.js";

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

function cmaj7Progression(length = 4) {
  return Array.from({ length }, () => ({
    split: false,
    slots: [{ chord: "Cmaj7", voicingSeed: 0, arpSeed: 0 }],
  }));
}

function sectionEvents(result, sectionIndex) {
  return result.events.filter((event) => event.sectionIndex === sectionIndex);
}

function assertNoVoiceOverlaps(events) {
  const byVoice = new Map();
  events.forEach((event) => {
    if (!byVoice.has(event.voiceId)) byVoice.set(event.voiceId, []);
    byVoice.get(event.voiceId).push(event);
  });

  byVoice.forEach((voiceEvents) => {
    voiceEvents.sort((left, right) => left.startBeat - right.startBeat);
    for (let index = 1; index < voiceEvents.length; index += 1) {
      const previousEnd = voiceEvents[index - 1].startBeat + voiceEvents[index - 1].durationBeats;
      assert.ok(voiceEvents[index].startBeat >= previousEnd - 1e-6);
    }
  });
}

test("parseChord returns chord tones with roles", () => {
  const chord = parseChord("Am9");

  assert.equal(chord.label, "Am9");
  assert.equal(chord.rootPc, 9);
  assert.deepEqual(
    chord.notes.map((note) => [note.name, note.degree, note.role]),
    [
      ["A", "1", "anchor"],
      ["C", "3", "color"],
      ["E", "5", "color"],
      ["B", "9", "tension"],
    ],
  );
});

test("generatePattern is deterministic for identical inputs", () => {
  const settings = {
    mode: "pad",
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
    mode: "pad",
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
    harmonicMotion: 0.3,
    mode: "pad",
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

test("pad mode emits one full-section event per harmonic voice", () => {
  const result = generatePattern({
    generatorMode: "infinite",
    mode: "pad",
    harmonicMotion: "subtle",
    harmonyLock: 0.68,
    stayMusical: true,
    ghostEnabled: false,
  }, cmaj7Progression(), 13010);

  result.sections.forEach((section, sectionIndex) => {
    const events = sectionEvents(result, sectionIndex);
    const voiceIds = new Set(section.notes.map((note) => note.voiceId));

    assert.equal(events.length, section.notes.length);
    assert.equal(new Set(events.map((event) => event.voiceId)).size, voiceIds.size);
    events.forEach((event) => {
      assert.equal(event.startBeat, section.startBeat);
      assert.equal(event.durationBeats, section.durationBeats);
      assert.ok(voiceIds.has(event.voiceId));
    });
  });
});

test("arp mode keeps ordered offsets without per-voice overlap", () => {
  const result = generatePattern({
    generatorMode: "infinite",
    mode: "arp",
    arpDensity: 0.75,
    arpFeel: "syncopated",
    harmonicMotion: 0.3,
    harmonyLock: 0.68,
    stayMusical: true,
    ghostEnabled: false,
  }, cmaj7Progression(), 13011);

  result.sections.forEach((section, sectionIndex) => {
    const events = sectionEvents(result, sectionIndex).sort((left, right) => left.startBeat - right.startBeat);

    events.forEach((event, index) => {
      assert.ok(event.durationBeats > 0);
      assert.ok(event.startBeat >= section.startBeat);
      assert.ok(event.startBeat < section.startBeat + section.durationBeats);
      if (index > 0) {
        assert.ok(event.startBeat >= events[index - 1].startBeat);
      }
    });
    assertNoVoiceOverlaps(events);
  });
});

test("full global scale influence keeps infinite pad harmony inside the chosen scale", () => {
  const result = generatePattern({
    generatorMode: "infinite",
    mode: "pad",
    harmonicMotion: 0.3,
    harmonyLock: 0.52,
    stayMusical: true,
    ghostEnabled: false,
    globalRoot: "0",
    scaleName: "major",
    scaleInfluence: 1,
  }, cmaj7Progression(), 13012);
  const majorScale = new Set([0, 2, 4, 5, 7, 9, 11]);

  result.sections.forEach((section, sectionIndex) => {
    const events = sectionEvents(result, sectionIndex);
    const voiceIds = new Set(section.notes.map((note) => note.voiceId));

    assert.equal(events.length, section.notes.length);
    assert.ok(events.every((event) => voiceIds.has(event.voiceId)));
    assert.ok(section.notes.every((note) => majorScale.has(note.pc)));
    assertNoVoiceOverlaps(events);
  });
});

test("infinite arp events preserve each section chord tone", () => {
  const result = generatePattern({
    generatorMode: "infinite",
    harmonicMotion: 0.3,
    harmonicDistanceTarget: 4,
    mode: "arp",
    arpDensity: 0.7,
    harmonyLock: 0.68,
    stayMusical: true,
  }, cmaj7Progression(), 13013);

  result.sections.forEach((section, sectionIndex) => {
    const sectionPcs = new Set(section.notes.map((note) => note.pc));
    const eventPcs = new Set(result.events
      .filter((event) => event.sectionIndex === sectionIndex)
      .map((event) => normalizePc(event.midi)));

    assert.equal(sectionPcs.size, 4);
    sectionPcs.forEach((pc) => assert.ok(eventPcs.has(pc)));
  });
});

test("infinite arp events avoid upward register ratcheting", () => {
  const result = generatePattern({
    generatorMode: "infinite",
    harmonicMotion: 0.3,
    harmonicDistanceTarget: 9,
    mode: "arp",
    arpDensity: 0.75,
    harmonyLock: 0.68,
    stayMusical: true,
  }, cmaj7Progression(), 13013);
  const eventMidis = result.events.map((event) => event.midi);
  const sectionVoiceIds = new Set(result.sections.flatMap((section) => section.notes.map((note) => note.voiceId)));

  assert.ok(Math.max(...eventMidis) <= 84);
  assert.ok(result.events.every((event) => sectionVoiceIds.has(event.voiceId)));
  result.events.forEach((event) => {
    const section = result.sections[event.sectionIndex];
    const sourceVoice = section.notes.find((note) => note.voiceId === event.voiceId);
    assert.ok(Math.abs(event.midi - sourceVoice.midi) <= 12);
  });
});

test("infinite phrase is deterministic and emits phrase-tagged events", () => {
  const settings = {
    generatorMode: "infinitePhrase",
    harmonicMotion: 0.22,
    harmonyLock: 0.58,
    stayMusical: true,
    ghostEnabled: false,
    localScaleType: "minor",
    localTargetDegree: 5,
    globalRoot: "0",
    scaleName: "major",
    scaleInfluence: 0.48,
    arpDensity: 0.6,
    registerCenter: 60,
  };

  const first = generatePattern(settings, progression, 14001);
  const second = generatePattern(settings, progression, 14001);

  assert.deepEqual(second, first);
  assert.ok(first.events.length > first.sections.length);
  assert.ok(first.events.every((event) => event.role === "phrase"));
  assert.ok(first.events.every((event) => event.motionType === "infinitePhrase"));
  assert.ok(first.events.every((event) => event.voiceId === 0));
});

test("infinite phrase keeps the harmonic sections intact while changing only event realization", () => {
  const settings = {
    harmonicMotion: 0.3,
    harmonyLock: 0.52,
    stayMusical: true,
    ghostEnabled: false,
    localScaleType: "major",
    localTargetDegree: 3,
    globalRoot: "0",
    scaleName: "major",
    scaleInfluence: 0.45,
    arpDensity: 0.5,
  };
  const infinite = generatePattern({ ...settings, generatorMode: "infinite", mode: "pad" }, cmaj7Progression(), 14002);
  const phrase = generatePattern({ ...settings, generatorMode: "infinitePhrase", mode: "pad" }, cmaj7Progression(), 14002);

  assert.deepEqual(
    phrase.sections.map((section) => section.notes.map((note) => [note.pc, note.midi])),
    infinite.sections.map((section) => section.notes.map((note) => [note.pc, note.midi])),
  );
  assert.ok(infinite.events.every((event) => event.role !== "phrase"));
  assert.ok(phrase.events.every((event) => event.role === "phrase"));
  assert.notEqual(phrase.events.length, infinite.events.length);
});

test("infinite phrase keeps its register centered over long playback", () => {
  const result = generatePattern({
    generatorMode: "infinitePhrase",
    harmonicMotion: 0.82,
    harmonyLock: 0.4,
    stayMusical: true,
    ghostEnabled: false,
    localScaleType: "minor",
    localTargetDegree: 4,
    globalRoot: "2",
    scaleName: "minor",
    scaleInfluence: 0.52,
    arpDensity: 0.78,
    voicingVariation: 0.42,
    voicingContinuity: 0.76,
    registerCenter: 60,
  }, cmaj7Progression(16), 14003);
  const midis = result.events.map((event) => event.midi);
  const chunkAverages = chunk(result.events, 16).map((events) => average(events.map((event) => event.midi)));

  assert.ok(Math.abs(average(midis) - 60) <= 5);
  assert.ok(Math.max(...midis) <= 79);
  assert.ok(Math.min(...midis) >= 41);
  assert.ok(Math.abs(chunkAverages[chunkAverages.length - 1] - chunkAverages[0]) <= 4.5);
});

test("infinite phrase obeys the global scale fence at full scale influence", () => {
  const result = generatePattern({
    generatorMode: "infinitePhrase",
    harmonicMotion: 0.28,
    harmonyLock: 0.58,
    stayMusical: true,
    ghostEnabled: false,
    localScaleType: "major",
    localTargetDegree: 5,
    localDegreeFalloff: 1,
    globalRoot: "0",
    scaleName: "major",
    scaleInfluence: 1,
    arpDensity: 0.65,
  }, cmaj7Progression(8), 14004);
  const globalScale = new Set([0, 2, 4, 5, 7, 9, 11]);

  assert.ok(result.events.length > 0);
  assert.ok(result.events.every((event) => globalScale.has(normalizePc(event.midi))));
});

test("infinite phrase only uses pitch classes with positive local score after global filtering", () => {
  const settings = {
    generatorMode: "infinitePhrase",
    harmonicMotion: 0.18,
    harmonyLock: 0.58,
    stayMusical: true,
    ghostEnabled: false,
    localScaleType: "major",
    localTargetDegree: 5,
    localDegreeFalloff: 1,
    globalRoot: "0",
    scaleName: "major",
    scaleInfluence: 1,
    arpDensity: 0.6,
  };
  const result = generatePattern(settings, cmaj7Progression(8), 14005);

  result.sections.forEach((section, sectionIndex) => {
    const previousSection = result.sections[sectionIndex - 1] || section;
    const localRoot = previousSection.notes.find((note) => note.harmonicRole === "anchor")?.pc ?? previousSection.rootPc;
    const previousPcs = [...new Set(previousSection.notes.map((note) => note.pc))];
    const allowed = new Set();

    for (let candidatePc = 0; candidatePc < 12; candidatePc += 1) {
      const score = previousPcs.reduce((best, previousPc) =>
        Math.max(best, getNoteSimilarity(previousPc, candidatePc, {
          localScaleType: settings.localScaleType,
          localTargetDegree: settings.localTargetDegree,
          localDegreeFalloff: settings.localDegreeFalloff,
          localRootPitchClass: localRoot,
        })), 0);
      if (score > 0) allowed.add(candidatePc);
    }

    const sectionEventPcs = result.events
      .filter((event) => event.sectionIndex === sectionIndex)
      .map((event) => normalizePc(event.midi));

    assert.ok(sectionEventPcs.length > 0);
    assert.ok(sectionEventPcs.every((pc) => allowed.has(pc)));
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

function average(values) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
