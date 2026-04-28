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
    settings: { harmonicMotion: 0.3 },
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

test("getNoteSimilarity can disable adjacent harmonic distance falloff", () => {
  assert.equal(getNoteSimilarity(0, 4, { harmonicDistanceTarget: 4, harmonicDistanceFalloff: 0 }), 0.5);
  assert.equal(getNoteSimilarity(0, 5, { harmonicDistanceTarget: 4, harmonicDistanceFalloff: 0 }), 0);
  assert.equal(getNoteSimilarity(0, 5, { harmonicDistanceTarget: 4, harmonicDistanceFalloff: 1 }), 0.25);
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
    settings: { harmonicMotion: 0.3, harmonicDistanceTarget: 0 },
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

test("applyVoiceLeading preserves anchor inversions instead of forcing root position", () => {
  const current = {
    notes: [
      { pitchClass: 9, midi: 45, voiceId: 0, role: "anchor" },
      { pitchClass: 0, midi: 48, voiceId: 1, role: "color" },
      { pitchClass: 5, midi: 53, voiceId: 2, role: "support" },
      { pitchClass: 4, midi: 64, voiceId: 3, role: "color" },
    ],
  };
  const voiced = applyVoiceLeading({ root: 5, pitchClasses: [5, 9, 0, 4] }, current, {
    settings: { harmonyLock: 0.6 },
  });
  const anchor = voiced.notes.find((note) => note.voiceId === 0);

  assert.equal(anchor.pitchClass, 9);
  assert.equal(anchor.midi, 45);
});

test("applyVoiceLeading keeps all four chord tones voiced", () => {
  const current = currentChord();
  const candidate = { pitchClasses: [9, 10, 0, 5] };
  const voiced = applyVoiceLeading(candidate, current, {
    settings: { harmonyLock: 0.5 },
  });
  const voicedPitchClasses = new Set(voiced.notes.map((note) => note.pitchClass));

  assert.equal(voicedPitchClasses.size, 4);
  candidate.pitchClasses.forEach((pc) => assert.ok(voicedPitchClasses.has(pc)));
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
  const settings = { harmonicMotion: 0.3, harmonyLock: 0.48 };
  const first = generateNextChord(current, { random: makeRandom(1003), settings });
  const second = generateNextChord(current, { random: makeRandom(1003), settings });

  assert.deepEqual(second, first);
  assert.equal(first.notes.length, 4);
  assert.equal(new Set(first.notes.map((note) => note.pitchClass)).size, 4);
  assert.ok(countCommonPitchClasses(first, current) >= 1);
  assert.ok(typeof first.quality === "string");
  assert.ok(Number.isFinite(first.root));
});

test("harmonic distance target changes candidate scoring", () => {
  const current = currentChord();
  const fourthRelated = { pitchClasses: [0, 8, 3, 5], qualityWeight: 1 };
  const secondTarget = scoreCandidate(fourthRelated, current, {
    random: makeRandom(1005),
    settings: { harmonicMotion: 0.3, harmonicDistanceTarget: 2 },
  });
  const fourthTarget = scoreCandidate(fourthRelated, current, {
    random: makeRandom(1005),
    settings: { harmonicMotion: 0.3, harmonicDistanceTarget: 4 },
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
    settings: { harmonicMotion: 0.3, harmonicDistanceTarget: 4 },
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
    settings: { harmonicMotion: 0.3 },
  });
  const withHistory = scoreCandidate(candidate, current, {
    random: makeRandom(1004),
    settings: { harmonicMotion: 0.3 },
    history: [{ notes: withoutHistory.notes }],
  });

  assert.ok(withHistory.score < withoutHistory.score);
});

test("global scale influence at full strength keeps candidate chords inside the scale", () => {
  const current = currentChord();
  const majorScale = new Set([0, 2, 4, 5, 7, 9, 11]);
  const candidates = generateCandidates(current, {
    settings: {
      harmonicMotion: 0.3,
      globalRoot: "0",
      scaleName: "major",
      scaleInfluence: 1,
    },
  });

  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => candidate.pitchClasses.every((pc) => majorScale.has(pc))));
});

test("low harmonic motion gives local target degree more authority over top-scoring roots", () => {
  const current = currentChord();
  const rankTopRoot = (localTargetDegree) => {
    const settings = {
      harmonicMotion: 0,
      localScaleType: "major",
      localTargetDegree,
      localDegreeFalloff: 1,
      harmonyLock: 0.65,
    };

    return generateCandidates(current, { settings })
      .map((candidate) => scoreCandidate(candidate, current, { settings }))
      .filter(Boolean)
      .sort((left, right) => right.score - left.score)[0];
  };

  const tonicTarget = rankTopRoot(1);
  const dominantTarget = rankTopRoot(5);

  assert.equal(tonicTarget.candidate.root, 0);
  assert.equal(dominantTarget.candidate.root, 7);
  assert.ok(dominantTarget.localTargetBonus >= tonicTarget.localTargetBonus);
});

test("high harmonic motion can prefer lower-movement voicings over local target roots", () => {
  const current = currentChord();
  const settings = {
    harmonicMotion: 1,
    localScaleType: "major",
    localTargetDegree: 5,
    localDegreeFalloff: 1,
    harmonyLock: 0.65,
  };
  const ranked = generateCandidates(current, { settings })
    .map((candidate) => scoreCandidate(candidate, current, { settings }))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  const top = ranked[0];
  const bestDominantTarget = ranked.find((entry) => entry.candidate.root === 7);

  assert.ok(bestDominantTarget);
  assert.ok(top.totalMovement <= bestDominantTarget.totalMovement);
  assert.ok(top.score >= bestDominantTarget.score);
});

test("local target stays influential when degree falloff is disabled", () => {
  const current = currentChord();
  const settings = {
    harmonicMotion: 0,
    localScaleType: "major",
    localTargetDegree: 5,
    localDegreeFalloff: 0,
    harmonyLock: 0.65,
  };
  const dominant = { root: 7, pitchClasses: [7, 11, 2, 9], qualityWeight: 1.08 };
  const tonic = { root: 0, pitchClasses: [0, 4, 7, 11], qualityWeight: 1 };

  const dominantScore = scoreCandidate(dominant, current, { settings });
  const tonicScore = scoreCandidate(tonic, current, { settings });

  assert.ok(dominantScore.similarityWeight > tonicScore.similarityWeight);
  assert.ok(dominantScore.localTargetBonus > tonicScore.localTargetBonus);
  assert.ok(dominantScore.score > tonicScore.score);
});
