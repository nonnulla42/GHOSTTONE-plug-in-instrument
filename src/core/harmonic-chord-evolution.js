const DEFAULT_IDEAL_CENTER = Object.freeze({ min: 48, max: 72 });
const VOICE_RANGES = Object.freeze([
  Object.freeze({ min: 42, max: 55, center: 48 }),
  Object.freeze({ min: 48, max: 62, center: 55 }),
  Object.freeze({ min: 53, max: 69, center: 60 }),
  Object.freeze({ min: 57, max: 76, center: 67 }),
]);

const MOTION_PROFILES = Object.freeze({
  static: Object.freeze({
    similarityTarget: 3.05,
    similarityFloor: 2,
    similarityWidth: 0.55,
    movementWeight: 1.42,
    centerWeight: 1.55,
    upwardDriftAllowance: 0.4,
    repetitionWeight: 1.35,
    restlessBias: 0,
  }),
  subtle: Object.freeze({
    similarityTarget: 2.25,
    similarityFloor: 2,
    similarityWidth: 0.62,
    movementWeight: 1.18,
    centerWeight: 1.24,
    upwardDriftAllowance: 0.9,
    repetitionWeight: 1.1,
    restlessBias: 0.16,
  }),
  evolving: Object.freeze({
    similarityTarget: 1.85,
    similarityFloor: 1,
    similarityWidth: 0.82,
    movementWeight: 0.92,
    centerWeight: 1.0,
    upwardDriftAllowance: 1.5,
    repetitionWeight: 0.86,
    restlessBias: 0.36,
  }),
  restless: Object.freeze({
    similarityTarget: 1.05,
    similarityFloor: 0.5,
    similarityWidth: 0.78,
    movementWeight: 0.68,
    centerWeight: 0.82,
    upwardDriftAllowance: 2.2,
    repetitionWeight: 0.62,
    restlessBias: 0.62,
  }),
});

const CHORD_QUALITIES = Object.freeze([
  Object.freeze({ name: "maj7", intervals: Object.freeze([0, 4, 7, 11]), weight: 1 }),
  Object.freeze({ name: "7", intervals: Object.freeze([0, 4, 7, 10]), weight: 1.05 }),
  Object.freeze({ name: "6", intervals: Object.freeze([0, 4, 7, 9]), weight: 0.88 }),
  Object.freeze({ name: "add9", intervals: Object.freeze([0, 4, 7, 14]), weight: 1.08 }),
  Object.freeze({ name: "m7", intervals: Object.freeze([0, 3, 7, 10]), weight: 1.05 }),
  Object.freeze({ name: "mMaj7", intervals: Object.freeze([0, 3, 7, 11]), weight: 0.48 }),
  Object.freeze({ name: "m6", intervals: Object.freeze([0, 3, 7, 9]), weight: 0.72 }),
  Object.freeze({ name: "m9", intervals: Object.freeze([0, 3, 7, 14]), weight: 1.02 }),
  Object.freeze({ name: "sus4", intervals: Object.freeze([0, 5, 7, 10]), weight: 0.84 }),
  Object.freeze({ name: "sus2", intervals: Object.freeze([0, 2, 7, 10]), weight: 0.72 }),
  Object.freeze({ name: "dim7", intervals: Object.freeze([0, 3, 6, 9]), weight: 0.42 }),
  Object.freeze({ name: "m7b5", intervals: Object.freeze([0, 3, 6, 10]), weight: 0.58 }),
  Object.freeze({ name: "aug7", intervals: Object.freeze([0, 4, 8, 10]), weight: 0.34 }),
  Object.freeze({ name: "maj7#11", intervals: Object.freeze([0, 4, 11, 18]), weight: 0.5 }),
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

function normalizeDistanceTarget(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return normalizePc(Math.trunc(number));
}

function normalizeFalloff(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(6, number));
}

function octaveNear(midi, target) {
  let result = midi;
  while (result - target > 6) result -= 12;
  while (target - result > 6) result += 12;
  return result;
}

function midiInRangeForVoice(pc, range, target) {
  let midi = octaveNear(48 + pc, target);
  while (midi < range.min) midi += 12;
  while (midi > range.max) midi -= 12;
  if (midi < range.min) midi = octaveNear(48 + pc, range.center);
  return midi;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function chordCenter(notes) {
  return average(notes.map((note) => note.midi));
}

function chordBass(notes) {
  return notes.length ? Math.min(...notes.map((note) => note.midi)) : 0;
}

function chordSignature(notes) {
  return [...new Set(notes.map((note) => normalizePc(note.pitchClass ?? note.pc ?? note.midi)))]
    .sort((left, right) => left - right)
    .join(",");
}

function weightedChoice(entries, random) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return entries[0]?.value || null;

  let cursor = random() * total;
  for (const entry of entries) {
    cursor -= Math.max(0, entry.weight);
    if (cursor <= 0) return entry.value;
  }

  return entries[entries.length - 1]?.value || null;
}

function normalizeNotes(current) {
  const source = current?.notes || current?.voices || [];
  return source.slice(0, 4).map((note, index) => ({
    pitchClass: normalizePc(note.pitchClass ?? note.pc ?? note.midi),
    midi: Number(note.midi),
    voiceId: note.voiceId ?? index,
    role: note.role || note.harmonicRole || "color",
  }));
}

function uniqueCandidate(pitchClasses, kind) {
  return {
    kind,
    pitchClasses: pitchClasses.map(normalizePc),
  };
}

function candidateKey(candidate) {
  return candidate.pitchClasses.join(":");
}

function pushUnique(candidates, seen, candidate) {
  const key = candidateKey(candidate);
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(candidate);
}

function getSimilarityOptions(options = {}) {
  const settings = options.settings || options;
  return {
    harmonicDistanceTarget: normalizeDistanceTarget(settings.harmonicDistanceTarget, 1),
    harmonicDistanceFalloff: normalizeFalloff(settings.harmonicDistanceFalloff, 1),
  };
}

function targetDistance(rawDistance, target) {
  const distance = normalizePc(rawDistance);
  const inverted = distance === 0 ? 0 : 12 - distance;
  return Math.min(Math.abs(distance - target), Math.abs(inverted - target));
}

export function getNoteSimilarity(a, b, options = {}) {
  const { harmonicDistanceTarget, harmonicDistanceFalloff } = getSimilarityOptions(options);
  const distance = normalizePc(Math.abs(normalizePc(a) - normalizePc(b)));
  if (distance === 0) return 1;
  if (harmonicDistanceTarget === 0) return 0;

  const diff = targetDistance(distance, harmonicDistanceTarget);
  if (diff === 0) return 0.5;
  if (harmonicDistanceFalloff > 0 && diff <= harmonicDistanceFalloff) return 0.25;
  return 0;
}

function buildChordCandidate(root, quality) {
  const pitchClasses = quality.intervals.map((interval) => normalizePc(root + interval));
  return {
    kind: "valid-chord",
    root: normalizePc(root),
    quality: quality.name,
    qualityWeight: quality.weight,
    pitchClasses,
  };
}

function enumerateChordVocabulary() {
  const candidates = [];
  for (let root = 0; root < 12; root += 1) {
    CHORD_QUALITIES.forEach((quality) => candidates.push(buildChordCandidate(root, quality)));
  }
  return candidates;
}

export function computeChordSimilarityDetails(candidate, current, options = {}) {
  const currentPcs = normalizeNotes(current).map((note) => note.pitchClass);
  const candidatePcs = (candidate.pitchClasses || normalizeNotes(candidate).map((note) => note.pitchClass)).map(normalizePc);
  const used = new Set();
  let exactMatches = 0;
  let distanceMatches = 0;
  let falloffMatches = 0;

  const totalScore = currentPcs.reduce((sum, pc) => {
    let best = { index: -1, score: 0 };
    candidatePcs.forEach((candidatePc, index) => {
      if (used.has(index)) return;
      const score = getNoteSimilarity(pc, candidatePc, options);
      if (score > best.score) best = { index, score };
    });

    if (best.index >= 0) used.add(best.index);
    if (best.score === 1) exactMatches += 1;
    if (best.score === 0.5) distanceMatches += 1;
    if (best.score === 0.25) falloffMatches += 1;
    return sum + best.score;
  }, 0);

  return {
    exactMatches,
    distanceMatches,
    falloffMatches,
    totalScore,
  };
}

export function computeChordSimilarity(candidate, current, options = {}) {
  return computeChordSimilarityDetails(candidate, current, options).totalScore;
}

function rootDistanceToCurrent(candidate, current) {
  const currentNotes = normalizeNotes(current);
  const bassPc = currentNotes[0]?.pitchClass ?? candidate.root ?? 0;
  const root = candidate.root ?? candidate.pitchClasses?.[0] ?? bassPc;
  return Math.min(normalizePc(root - bassPc), normalizePc(bassPc - root));
}

/**
 * Candidate generation now uses a small vocabulary of valid four-note chords.
 * Harmonic Motion controls how much each chord should resemble the previous
 * one; voice-leading happens later, so macro harmony and micro movement stay
 * separate.
 */
export function generateCandidates(current, options = {}) {
  const settings = options.settings || {};
  const notes = normalizeNotes(current);
  const candidates = [];
  const seen = new Set();
  if (!notes.length) return candidates;

  enumerateChordVocabulary()
    .map((candidate) => ({
      ...candidate,
      similarity: computeChordSimilarity(candidate, current, { settings }),
      similarityDetails: computeChordSimilarityDetails(candidate, current, { settings }),
      rootDistance: rootDistanceToCurrent(candidate, current),
    }))
    .filter((candidate) => candidate.similarity >= 0.5)
    .sort((left, right) => {
      const profile = MOTION_PROFILES[settings.harmonicMotion || "subtle"] || MOTION_PROFILES.subtle;
      const leftDistance = Math.abs(left.similarity - profile.similarityTarget) + left.rootDistance * 0.035;
      const rightDistance = Math.abs(right.similarity - profile.similarityTarget) + right.rootDistance * 0.035;
      return leftDistance - rightDistance;
    })
    .slice(0, 54)
    .forEach((candidate) => pushUnique(candidates, seen, candidate));

  if (!candidates.length) {
    pushUnique(candidates, seen, uniqueCandidate(notes.map((note) => note.pitchClass), "current-fallback"));
  }

  return candidates;
}

export function countCommonPitchClasses(candidate, current) {
  const currentPcs = new Set(normalizeNotes(current).map((note) => note.pitchClass));
  const candidatePcs = new Set((candidate.pitchClasses || normalizeNotes(candidate).map((note) => note.pitchClass)).map(normalizePc));
  let common = 0;
  candidatePcs.forEach((pc) => {
    if (currentPcs.has(pc)) common += 1;
  });
  return common;
}

function harmonicMotionSimilarityWeight(similarity, settings = {}) {
  const profile = MOTION_PROFILES[settings.harmonicMotion || "subtle"] || MOTION_PROFILES.subtle;
  if (similarity < profile.similarityFloor) {
    const distanceBelow = profile.similarityFloor - similarity;
    return Math.max(0.06, 0.34 - distanceBelow * 0.22);
  }

  const distanceToTarget = Math.abs(similarity - profile.similarityTarget);
  return Math.exp(-(distanceToTarget * distanceToTarget) / (2 * profile.similarityWidth * profile.similarityWidth));
}

function permute(values) {
  if (values.length <= 1) return [values];
  const result = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    permute(rest).forEach((tail) => result.push([value, ...tail]));
  });
  return result;
}

function crossingPenalty(previousNotes, voicedNotes) {
  const ordered = previousNotes
    .map((note, index) => ({ note, index }))
    .sort((left, right) => left.note.midi - right.note.midi);
  let penalty = 0;

  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const left = voicedNotes[ordered[i].index];
      const right = voicedNotes[ordered[j].index];
      if (left.midi > right.midi) penalty += 8;
    }
  }

  return penalty;
}

function spacingPenalty(voicedNotes) {
  const sorted = [...voicedNotes].sort((left, right) => left.midi - right.midi);
  let penalty = 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index].midi - sorted[index - 1].midi;
    if (gap < 1) penalty += 8;
    if (gap < 2) penalty += 3;
    if (gap > 16) penalty += (gap - 16) * 0.8;
  }

  return penalty;
}

export function getRegisterDriftWeight(currentMean, targetMean) {
  const diff = currentMean - targetMean;
  if (diff > 0) return 1 - Math.min(diff / 24, 0.6);
  return 1 + Math.min(Math.abs(diff) / 48, 0.2);
}

function getHistoricalRegisterCenter(current, options = {}) {
  const history = Array.isArray(options.history) ? options.history : [];
  const historyCenters = history
    .map((state) => normalizeNotes(state))
    .filter((notes) => notes.length)
    .map(chordCenter);

  if (!historyCenters.length) return chordCenter(normalizeNotes(current));

  const alpha = 0.28;
  return historyCenters.slice(-8).reduce((ema, center) => ema + (center - ema) * alpha, historyCenters[0]);
}

function directionalMovementWeight(movements, settings = {}) {
  const target = normalizeDistanceTarget(settings.harmonicDistanceTarget, 1);
  const highTargetCompensation = target >= 4 && target <= 7;

  return movements.reduce((weight, movement) => {
    if (movement > 0) return weight * 0.85;
    if (movement < 0) return weight * (highTargetCompensation ? 1.15 : 1.1);
    return weight;
  }, 1);
}

function bassGravityWeight(voicedNotes) {
  const bassSoftMax = 53;
  const bass = chordBass(voicedNotes);
  if (bass <= bassSoftMax) return 1;
  return Math.max(0.55, 1 - (bass - bassSoftMax) / 22);
}

/**
 * Finds the closest assignment between candidate pitch classes and previous
 * voices. This keeps voice identities continuous instead of jumping to a new
 * chord voicing every step.
 */
export function applyVoiceLeading(candidate, current, options = {}) {
  const previousNotes = normalizeNotes(current);
  if (!previousNotes.length) {
    return { notes: [], totalMovement: 0, voiceLeadingPenalty: 0 };
  }
  const pitchClasses = candidate.pitchClasses.map(normalizePc);
  const permutations = permute(pitchClasses);
  let best = null;

  permutations.forEach((permutation) => {
    const voicedNotes = permutation.map((pc, index) => {
      const previous = previousNotes[index] || previousNotes[previousNotes.length - 1];
      const range = VOICE_RANGES[index] || VOICE_RANGES[VOICE_RANGES.length - 1];
      const target = previous.midi * 0.72 + range.center * 0.28;
      const midi = midiInRangeForVoice(pc, range, target);
      const movement = Math.abs(midi - previous.midi);
      return {
        pitchClass: pc,
        midi,
        voiceId: previous.voiceId ?? index,
        role: previous.role,
        movement,
      };
    });

    const totalMovement = voicedNotes.reduce((sum, note) => sum + note.movement, 0);
    const largeJumpPenalty = voicedNotes.reduce((sum, note) => {
      if (note.movement <= 7) return sum;
      return sum + (note.movement - 7) * (note.movement - 7) * 1.2;
    }, 0);
    const rangePenalty = voicedNotes.reduce((sum, note, index) => {
      const range = VOICE_RANGES[index] || VOICE_RANGES[VOICE_RANGES.length - 1];
      const below = Math.max(0, range.min - note.midi);
      const above = Math.max(0, note.midi - range.max);
      const centerDistance = Math.abs(note.midi - range.center);
      return sum + (below + above) * 8 + centerDistance * 0.08;
    }, 0);
    const penalty = largeJumpPenalty + crossingPenalty(previousNotes, voicedNotes) + spacingPenalty(voicedNotes) + rangePenalty;
    const cost = totalMovement + penalty;

    if (!best || cost < best.cost) {
      best = { notes: voicedNotes, totalMovement, penalty, cost };
    }
  });

  const lock = clamp(Number(options.settings?.harmonyLock) || 0, 0, 1);
  const voiced = best?.notes || previousNotes;
  return {
    notes: voiced.map((note) => ({
      pitchClass: note.pitchClass,
      midi: note.midi,
      voiceId: note.voiceId,
      role: note.role,
    })),
    totalMovement: best?.totalMovement || 0,
    voiceLeadingPenalty: (best?.penalty || 0) * (0.75 + lock * 0.5),
  };
}

export function computePitchCenterPenalty(voicedChord, current, options = {}) {
  const settings = options.settings || {};
  const profile = MOTION_PROFILES[settings.harmonicMotion || "subtle"] || MOTION_PROFILES.subtle;
  const ideal = options.idealCenter || DEFAULT_IDEAL_CENTER;
  const notes = normalizeNotes(voicedChord);
  const previousNotes = normalizeNotes(current);
  const center = chordCenter(notes);
  const previousCenter = chordCenter(previousNotes);
  const outsideLow = Math.max(0, ideal.min - center);
  const outsideHigh = Math.max(0, center - ideal.max);
  const outsidePenalty = (outsideLow + outsideHigh) * 2.4;
  const upwardDrift = Math.max(0, center - previousCenter - profile.upwardDriftAllowance);
  const history = Array.isArray(options.history) ? options.history : [];
  const historyCenters = history
    .map((state) => normalizeNotes(state).length ? chordCenter(normalizeNotes(state)) : null)
    .filter((value) => Number.isFinite(value));
  const recentCenter = historyCenters.length ? average(historyCenters.slice(-4)) : previousCenter;
  const longUpwardDrift = Math.max(0, center - recentCenter - profile.upwardDriftAllowance * 1.6);

  return (outsidePenalty + upwardDrift * 3.8 + longUpwardDrift * 3.2) * profile.centerWeight;
}

function repetitionPenalty(voicedChord, options = {}) {
  const settings = options.settings || {};
  const profile = MOTION_PROFILES[settings.harmonicMotion || "subtle"] || MOTION_PROFILES.subtle;
  const history = Array.isArray(options.history) ? options.history.slice(-4) : [];
  if (!history.length) return 0;

  const currentSignature = chordSignature(normalizeNotes(voicedChord));
  const currentPcs = new Set(currentSignature.split(",").filter(Boolean).map(Number));
  return history.reduce((penalty, state, index) => {
    const historyNotes = normalizeNotes(state);
    const signature = chordSignature(historyNotes);
    if (signature === currentSignature) {
      return penalty + (18 - index * 2) * profile.repetitionWeight;
    }

    const historyPcs = new Set(signature.split(",").filter(Boolean).map(Number));
    let shared = 0;
    currentPcs.forEach((pc) => {
      if (historyPcs.has(pc)) shared += 1;
    });
    return penalty + (shared >= 3 ? 3.4 : 0) * profile.repetitionWeight;
  }, 0);
}

export function scoreCandidate(candidate, current, options = {}) {
  const settings = options.settings || {};
  const profile = MOTION_PROFILES[settings.harmonicMotion || "subtle"] || MOTION_PROFILES.subtle;
  const commonToneCount = countCommonPitchClasses(candidate, current);
  const similarityDetails = candidate.similarityDetails || computeChordSimilarityDetails(candidate, current, options);
  const similarity = Number.isFinite(candidate.similarity) ? candidate.similarity : similarityDetails.totalScore;
  if (similarity < 0.5) return null;

  const voiced = applyVoiceLeading(candidate, current, options);
  const movements = voiced.notes.map((note) => {
    const previous = normalizeNotes(current).find((candidateNote) => candidateNote.voiceId === note.voiceId);
    return Math.abs(note.midi - (previous?.midi ?? note.midi));
  });
  const signedMovements = voiced.notes.map((note) => {
    const previous = normalizeNotes(current).find((candidateNote) => candidateNote.voiceId === note.voiceId);
    return note.midi - (previous?.midi ?? note.midi);
  });
  const smallMoves = movements.filter((movement) => movement > 0 && movement <= 2).length;
  const largeJumps = movements.filter((movement) => movement > 7).length;
  const stationary = movements.filter((movement) => movement === 0).length;
  const duplicatePitchClasses = voiced.notes.length - new Set(voiced.notes.map((note) => note.pitchClass)).size;
  const similarityWeight = harmonicMotionSimilarityWeight(similarity, settings);
  const similarityBonus = 36 * similarityWeight + similarity * 7;
  const qualityBonus = (candidate.qualityWeight || 0.6) * 6;
  const rootMotionPenalty = rootDistanceToCurrent(candidate, current) * (settings.harmonicMotion === "restless" ? 0.26 : 0.54);
  const smoothBonus = Math.max(0, 34 - voiced.totalMovement * 1.7 * profile.movementWeight);
  const stepwiseBonus = smallMoves * (5 + profile.restlessBias * 2) + stationary * (1.8 - profile.restlessBias);
  const motionAmountBonus = settings.harmonicMotion === "restless"
    ? voiced.totalMovement * 0.72
    : settings.harmonicMotion === "evolving"
      ? voiced.totalMovement * 0.34
      : -voiced.totalMovement * 0.12;
  const pitchCenterPenalty = computePitchCenterPenalty({ notes: voiced.notes }, current, options);
  const registerDriftWeight = getRegisterDriftWeight(chordCenter(voiced.notes), getHistoricalRegisterCenter(current, options));
  const directionWeight = directionalMovementWeight(signedMovements, settings);
  const bassWeight = bassGravityWeight(voiced.notes);
  const gravityWeight = registerDriftWeight * directionWeight * bassWeight;
  const repeatPenalty = repetitionPenalty({ notes: voiced.notes }, options);
  const clusterPenalty = duplicatePitchClasses * 8 + spacingPenalty(voiced.notes) * 0.72;
  const jumpPenalty = largeJumps * 16 + voiced.voiceLeadingPenalty;
  const rawScore =
    3 +
    similarityBonus +
    qualityBonus +
    smoothBonus +
    stepwiseBonus +
    motionAmountBonus -
    rootMotionPenalty -
    pitchCenterPenalty -
    repeatPenalty -
    clusterPenalty -
    jumpPenalty;
  const score = rawScore * gravityWeight;

  return {
    candidate,
    notes: voiced.notes,
    score: Math.max(0.01, score),
    commonToneCount,
    similarity,
    similarityDetails,
    similarityWeight,
    totalMovement: voiced.totalMovement,
    pitchCenterPenalty,
    registerDriftWeight,
    directionWeight,
    bassWeight,
    gravityWeight,
    repetitionPenalty: repeatPenalty,
  };
}

export function generateNextChord(current, options = {}) {
  const random = options.random || Math.random;
  const candidates = generateCandidates(current, { ...options, random });
  const scored = candidates
    .map((candidate) => scoreCandidate(candidate, current, options))
    .filter(Boolean);

  if (!scored.length) {
    const notes = normalizeNotes(current);
    return { notes };
  }

  const selected = weightedChoice(
    scored.map((entry) => ({
      value: entry,
      weight: Math.pow(entry.score, 1.18),
    })),
    random,
  ) || scored[0];

  return {
    notes: selected.notes.map((note) => ({
      pitchClass: normalizePc(note.pitchClass),
      midi: note.midi,
      voiceId: note.voiceId,
    })),
    root: selected.candidate.root,
    quality: selected.candidate.quality,
  };
}
