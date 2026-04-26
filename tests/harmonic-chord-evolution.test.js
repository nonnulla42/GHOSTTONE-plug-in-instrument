import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVoiceLeading,
  computeChordSimilarityDetails,
  computeChordSimilarity,
  computePitchCenterPenalty,
  countCommonPitchClasses,
  generateCandidates,
  generateNextChord,
  getRegisterDriftWeight,
  getNoteSimilarity,
  scoreCandidate,
} from "../src/core/harmonic-chord-evolution.js";

function makeRandom(seed) {
  let value = Math.trunc(seed) % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function currentChord() {
  return {
    notes: [
      { pitchClass: 0, midi: 48, voiceId: 0, role: "anchor" },
      { pitchClass: 4, midi: 52, voiceId: 1, role: "color" },
      { pitchClass: 7, midi: 55, voiceId: 2, role: "color" },
      { pitchClass: 11, midi: 59, voiceId: 3, role: "tension" },
    ],
  };
}

function movementSum(previous, next) {
  return next.notes.reduce((sum, note) => {
    const previousNote = previous.notes.find((candidate) => candidate.voiceId === note.voiceId);
    return sum + Math.abs(note.midi - previousNote.midi);
  }, 0);
}

test("generateCandidates returns valid chord candidates with harmonic similarity", () => {
  const current = currentChord();
  const candidates = generateCandidates(current, {
    random: makeRandom(1001),
    settings: { harmonicMotion: "evolving" },
  });

  assert.ok(candidates.length >= 12);
  assert.ok(candidates.every((candidate) => candidate.kind === "valid-chord"));
  assert.ok(candidates.every((candidate) => computeChordSimilarity(candidate, current) >= 0.5));
  assert.ok(candidates.every((candidate) => candidate.pitchClasses.length === 4));
});

test("computeChordSimilarity counts exact and semitone relationships", () => {
  const current = currentChord();
  const related = { pitchClasses: [0, 5, 8, 10] };

  assert.equal(computeChordSimilarity(related, current), 2.5);
});

test("getNoteSimilarity supports configurable harmonic distance targets", () => {
  assert.equal(getNoteSimilarity(0, 0, { harmonicDistanceTarget: 7 }), 1);
  assert.equal(getNoteSimilarity(0, 7, { harmonicDistanceTarget: 7 }), 0.5);
  assert.equal(getNoteSimilarity(7, 0, { harmonicDistanceTarget: 7 }), 0.5);
  assert.equal(getNoteSimilarity(0, 4, { harmonicDistanceTarget: 4 }), 0.5);
  assert.equal(getNoteSimilarity(0, 5, { harmonicDistanceTarget: 4 }), 0.25);
  assert.equal(getNoteSimilarity(0, 2, { harmonicDistanceTarget: 7 }), 0);
});

test("computeChordSimilarityDetails reports exact and distance matches", () => {
  const current = currentChord();
  const candidate = { pitchClasses: [0, 4, 2, 6] };
  const details = computeChordSimilarityDetails(candidate, current, {
    settings: { harmonicDistanceTarget: 7 },
  });

  assert.equal(details.exactMatches, 2);
  assert.equal(details.distanceMatches, 2);
  assert.equal(details.totalScore, 3);
});

test("scoreCandidate rejects candidates with no harmonic similarity", () => {
  const current = currentChord();
  const unrelated = { pitchClasses: [1, 2, 5, 8] };

  assert.equal(scoreCandidate(unrelated, current, {
    random: makeRandom(1002),
    settings: { harmonicMotion: "subtle", harmonicDistanceTarget: 0 },
  }), null);
});

test("applyVoiceLeading assigns candidate tones to nearby previous voices", () => {
  const current = currentChord();
  const voiced = applyVoiceLeading({ pitchClasses: [0, 5, 7, 10] }, current, {
    settings: { harmonyLock: 0.7 },
  });

  assert.equal(voiced.notes.length, 4);
  assert.ok(voiced.notes.every((note) => current.notes.some((previous) => previous.voiceId === note.voiceId)));
  assert.ok(Math.max(...voiced.notes.map((note) => {
    const previous = current.notes.find((candidate) => candidate.voiceId === note.voiceId);
    return Math.abs(note.midi - previous.midi);
  })) <= 7);
});

test("computePitchCenterPenalty discourages upward register drift", () => {
  const current = currentChord();
  const nearby = {
    notes: [
      { pitchClass: 0, midi: 48, voiceId: 0 },
      { pitchClass: 5, midi: 53, voiceId: 1 },
      { pitchClass: 7, midi: 55, voiceId: 2 },
      { pitchClass: 10, midi: 58, voiceId: 3 },
    ],
  };
  const tooHigh = {
    notes: nearby.notes.map((note) => ({ ...note, midi: note.midi + 24 })),
  };

  assert.ok(
    computePitchCenterPenalty(tooHigh, current, {
      settings: { harmonicMotion: "subtle" },
      history: [current],
    }) > computePitchCenterPenalty(nearby, current, {
      settings: { harmonicMotion: "subtle" },
      history: [current],
    }),
  );
});

test("generateNextChord is deterministic and preserves voice continuity", () => {
  const current = currentChord();
  const settings = { harmonicMotion: "evolving", harmonyLock: 0.48 };
  const first = generateNextChord(current, { random: makeRandom(1003), settings });
  const second = generateNextChord(current, { random: makeRandom(1003), settings });

  assert.deepEqual(second, first);
  assert.equal(first.notes.length, 4);
  assert.ok(countCommonPitchClasses(first, current) >= 1);
  assert.ok(movementSum(current, first) > 0);
});

test("harmonic distance target changes candidate scoring", () => {
  const current = currentChord();
  const fourthRelated = { pitchClasses: [0, 8, 3, 5], qualityWeight: 1 };
  const secondTarget = scoreCandidate(fourthRelated, current, {
    random: makeRandom(1005),
    settings: { harmonicMotion: "evolving", harmonicDistanceTarget: 2 },
  });
  const fourthTarget = scoreCandidate(fourthRelated, current, {
    random: makeRandom(1005),
    settings: { harmonicMotion: "evolving", harmonicDistanceTarget: 4 },
  });

  assert.ok(fourthTarget.similarity >= secondTarget.similarity);
  assert.ok(fourthTarget.score >= secondTarget.score);
});

test("getRegisterDriftWeight softly penalizes upward register drift", () => {
  assert.ok(getRegisterDriftWeight(70, 58) < 1);
  assert.ok(getRegisterDriftWeight(52, 58) > 1);
});

test("high harmonic distance targets prefer equivalent downward motion over upward drift", () => {
  const current = {
    notes: [
      { pitchClass: 0, midi: 48, voiceId: 0, role: "anchor" },
      { pitchClass: 4, midi: 52, voiceId: 1, role: "color" },
      { pitchClass: 7, midi: 55, voiceId: 2, role: "color" },
      { pitchClass: 11, midi: 59, voiceId: 3, role: "tension" },
    ],
  };
  const history = [
    current,
    {
      notes: current.notes.map((note) => ({ ...note, midi: note.midi + 1 })),
    },
  ];
  const upward = {
    pitchClasses: [4, 8, 11, 3],
    qualityWeight: 1,
  };
  const downward = {
    pitchClasses: [8, 0, 3, 7],
    qualityWeight: 1,
  };
  const options = {
    random: makeRandom(1006),
    settings: { harmonicMotion: "evolving", harmonicDistanceTarget: 4 },
    history,
  };
  const upwardScore = scoreCandidate(upward, current, options);
  const downwardScore = scoreCandidate(downward, current, options);

  assert.ok(downwardScore.gravityWeight > upwardScore.gravityWeight);
  assert.ok(downwardScore.score > upwardScore.score);
});

test("recent chord memory lowers the score of repeated candidates", () => {
  const current = currentChord();
  const candidate = { pitchClasses: [0, 5, 7, 10] };
  const withoutHistory = scoreCandidate(candidate, current, {
    random: makeRandom(1004),
    settings: { harmonicMotion: "subtle" },
  });
  const withHistory = scoreCandidate(candidate, current, {
    random: makeRandom(1004),
    settings: { harmonicMotion: "subtle" },
    history: [{ notes: withoutHistory.notes }],
  });

  assert.ok(withHistory.score < withoutHistory.score);
});
