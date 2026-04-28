const DEFAULT_IDEAL_CENTER = Object.freeze({ min: 48, max: 72 });

const SCALE_DEFINITIONS = Object.freeze({
  major:         Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  minor:         Object.freeze([0, 2, 3, 5, 7, 8, 10]),
  dorian:        Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  mixolydian:    Object.freeze([0, 2, 4, 5, 7, 9, 10]),
  phrygian:      Object.freeze([0, 1, 3, 5, 7, 8, 10]),
  harmonicMinor: Object.freeze([0, 2, 3, 5, 7, 8, 11]),
});
function getVoiceRanges(registerCenter) {
  // offsets and spans relative to registerCenter (at rc=60 produces original values)
  const voices = [
    { offset: -12, below: 6,  above: 7 },
    { offset:  -5, below: 7,  above: 7 },
    { offset:   0, below: 7,  above: 9 },
    { offset:   7, below: 10, above: 9 },
  ];
  return voices.map(({ offset, below, above }) => {
    const center = registerCenter + offset;
    return { min: center - below, max: center + above, center };
  });
}

const ROLE_WEIGHTS = Object.freeze({
  anchor: 0.25,
  support: 0.5,
  tension: 0.5,
  color: 0.2,
});

const ROLE_CENTER_WEIGHTS = Object.freeze({
  anchor: 3.0,
  support: 1.6,
  color: 0.8,
  tension: 0.45,
  passing: 0.25,
});

function getMotionProfile(harmonicMotion) {
  const h = Math.max(0, Math.min(1, Number(harmonicMotion) || 0));
  const lerp = (a, b) => a + (b - a) * h;
  return {
    similarityTarget:     lerp(3.7,   0.4),
    similarityFloor:      lerp(2.5,   0.0),
    similarityWidth:      lerp(0.5,   1.8),
    movementWeight:       lerp(1.42,  0.5),
    centerWeight:         lerp(1.55,  0.7),
    upwardDriftAllowance: lerp(0.4,   3.0),
    repetitionWeight:     lerp(1.35,  0.4),
    restlessBias:         lerp(0.0,   0.8),
    rootMotionFactor:     lerp(0.54,  0.22),
    motionAmountFactor:   lerp(-0.12, 0.72),
  };
}

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

function buildScaleNotes(scaleName, root) {
  const intervals = SCALE_DEFINITIONS[scaleName];
  if (!intervals) return null;
  return intervals.map((interval) => normalizePc(root + interval));
}

function computeScaleScore(pitchClasses, scaleNotes, root) {
  if (!scaleNotes) return 0;
  return pitchClasses.reduce((score, pc) => {
    const normalized = normalizePc(pc);
    if (!scaleNotes.includes(normalized)) return score - 0.5;
    const interval = normalizePc(normalized - root);
    if (interval === 0)             return score + 2.0;
    if (interval === 7)             return score + 1.5;
    if (interval === 3 || interval === 4) return score + 1.3;
    if (interval === 5 || interval === 11) return score + 0.7;
    return score + 1.0;
  }, 0);
}

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

function midiCandidatesForPitchClass(pc, range) {
  const normalized = normalizePc(pc);
  const candidates = [];
  let midi = normalized;
  while (midi < range.min) midi += 12;
  while (midi <= range.max) {
    candidates.push(midi);
    midi += 12;
  }
  return candidates;
}

function rankedChordMidiTargets(pitchClasses, range, target, preferredPc = null) {
  const preferred = preferredPc == null ? null : normalizePc(preferredPc);
  const candidates = pitchClasses
    .flatMap((pc) => midiCandidatesForPitchClass(pc, range))
    .map((midi) => ({
      midi,
      pitchClass: normalizePc(midi),
      distance: Math.abs(midi - target),
      preferredDistance: preferred == null ? 0 : (normalizePc(midi) === preferred ? 0 : 1),
      centerDistance: Math.abs(midi - range.center),
    }))
    .sort((left, right) =>
      left.distance - right.distance ||
      left.preferredDistance - right.preferredDistance ||
      left.centerDistance - right.centerDistance ||
      left.midi - right.midi);

  if (candidates.length) return candidates;

  const fallbackPc = normalizePc(preferred ?? pitchClasses[0] ?? 0);
  const fallbackMidi = midiInRangeForVoice(fallbackPc, range, target);
  return [{
    midi: fallbackMidi,
    pitchClass: normalizePc(fallbackMidi),
    distance: Math.abs(fallbackMidi - target),
    preferredDistance: 0,
    centerDistance: Math.abs(fallbackMidi - range.center),
  }];
}

function nearestChordMidi(pitchClasses, range, target, preferredPc = null) {
  return rankedChordMidiTargets(pitchClasses, range, target, preferredPc)[0].midi;
}

function roleWeight(role) {
  return ROLE_WEIGHTS[role] ?? ROLE_WEIGHTS.color;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function chordCenter(notes) {
  if (!notes.length) return 0;
  const bassMidi = Math.min(...notes.map((n) => n.midi));
  let total = 0;
  let weightSum = 0;
  for (const note of notes) {
    let w = ROLE_CENTER_WEIGHTS[note.role] ?? 1;
    if (note.midi === bassMidi) w *= 1.25;
    total += note.midi * w;
    weightSum += w;
  }
  return total / weightSum;
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

function hasFourUniquePitchClasses(candidate) {
  const pitchClasses = (candidate.pitchClasses || []).map(normalizePc);
  return pitchClasses.length === 4 && new Set(pitchClasses).size === 4;
}

function usesAllPitchClassesExactlyOnce(voicedNotes, pitchClasses) {
  const required = pitchClasses.map(normalizePc);
  const voiced = voicedNotes.map((note) => normalizePc(note.pitchClass ?? note.midi));
  if (voiced.length !== required.length) return false;
  if (new Set(voiced).size !== new Set(required).size) return false;
  return required.every((pc) => voiced.includes(pc));
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
    localScaleType: settings.localScaleType ?? null,
    localTargetDegree: Math.max(1, Math.min(11, Math.trunc(Number(settings.localTargetDegree)) || 1)),
    localDegreeFalloff: Math.max(0, Math.min(3, Math.trunc(Number(settings.localDegreeFalloff ?? 1)) || 1)),
  };
}

function targetDistance(rawDistance, target) {
  const distance = normalizePc(rawDistance);
  const inverted = distance === 0 ? 0 : 12 - distance;
  return Math.min(Math.abs(distance - target), Math.abs(inverted - target));
}

export function getNoteSimilarity(a, b, options = {}) {
  const { harmonicDistanceTarget, harmonicDistanceFalloff, localScaleType, localTargetDegree, localDegreeFalloff } = getSimilarityOptions(options);
  const distance = normalizePc(Math.abs(normalizePc(a) - normalizePc(b)));

  if (localScaleType && localScaleType !== "chromatic") {
    const localRoot = options.localRootPitchClass;
    if (localRoot != null) {
      const scale = buildScaleNotes(localScaleType, localRoot);
      if (scale) {
        const degreeIdx = Math.max(0, Math.min(scale.length - 1, localTargetDegree - 1));
        const bNorm = normalizePc(b);
        // delta is in scale degrees: odd=passing tone, even=chord-tone (thirds structure)
        const DEGREE_FALLOFF_SCORES = [0, 0.15, 0.4, 0.15];
        const roleScale = options.localScaleRoleWeight ?? 1;
        const exactMatch = distance === 0 ? 0.5 : 0;
        if (bNorm === scale[degreeIdx]) return exactMatch + 1 * roleScale;
        const maxDelta = localDegreeFalloff > 0 ? 3 : 0;
        for (let delta = 1; delta <= maxDelta; delta++) {
          const pcLow = scale[(degreeIdx - delta + scale.length) % scale.length];
          const pcHigh = scale[(degreeIdx + delta) % scale.length];
          if (bNorm === pcLow || bNorm === pcHigh) return exactMatch + (DEGREE_FALLOFF_SCORES[delta] ?? 0) * roleScale;
        }
        return exactMatch;
      }
    }
  }

  // chromatic / legacy path — original behavior, no cumulation
  if (distance === 0) return 1;
  const chromaticTarget = (localScaleType === "chromatic") ? localTargetDegree : harmonicDistanceTarget;
  const falloff = (localScaleType === "chromatic") ? localDegreeFalloff : harmonicDistanceFalloff;
  if (chromaticTarget === 0) return 0;
  const diff = targetDistance(distance, chromaticTarget);
  if (diff === 0) return 0.5;
  if (falloff > 0 && diff <= falloff) return 0.25;
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

const LOCAL_SCALE_ROLE_WEIGHTS = Object.freeze({ anchor: 1.3, support: 1.0, tension: 0.85, color: 0.65 });

export function computeChordSimilarityDetails(candidate, current, options = {}) {
  const settings = options.settings || {};
  const currentNotes = normalizeNotes(current);
  const anchorNote = currentNotes.find((n) => n.role === "anchor");
  const globalRootPc = (settings.globalRoot != null && settings.globalRoot !== "none")
    ? normalizePc(Number(settings.globalRoot))
    : null;
  const localRootPitchClass = globalRootPc ?? anchorNote?.pitchClass ?? currentNotes[0]?.pitchClass ?? null;
  const enrichedOptions = localRootPitchClass != null ? { ...options, localRootPitchClass } : options;
  const candidatePcs = (candidate.pitchClasses || normalizeNotes(candidate).map((note) => note.pitchClass)).map(normalizePc);
  const used = new Set();
  let exactMatches = 0;
  let distanceMatches = 0;
  let falloffMatches = 0;

  const totalScore = currentNotes.reduce((sum, note) => {
    const roleWeight = LOCAL_SCALE_ROLE_WEIGHTS[note.role] ?? 1.0;
    const noteOptions = roleWeight !== 1.0 ? { ...enrichedOptions, localScaleRoleWeight: roleWeight } : enrichedOptions;
    let best = { index: -1, score: 0 };
    candidatePcs.forEach((candidatePc, index) => {
      if (used.has(index)) return;
      const score = getNoteSimilarity(note.pitchClass, candidatePc, noteOptions);
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
    .filter(hasFourUniquePitchClasses)
    .sort((left, right) => {
      const profile = getMotionProfile(settings.harmonicMotion ?? 0.3);
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
  const profile = getMotionProfile(settings.harmonicMotion ?? 0.3);
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

function effectiveSemitoneTarget(settings) {
  const { localScaleType } = settings;
  if (localScaleType && localScaleType !== "chromatic") {
    const intervals = SCALE_DEFINITIONS[localScaleType];
    if (intervals) {
      const degreeIdx = Math.max(0, Math.min(intervals.length - 1, (Number(settings.localTargetDegree) || 1) - 1));
      return intervals[degreeIdx];
    }
  }
  if (localScaleType === "chromatic") return normalizeDistanceTarget(settings.localTargetDegree ?? 1, 1);
  return normalizeDistanceTarget(settings.harmonicDistanceTarget, 1);
}

function directionalMovementWeight(movements, settings = {}) {
  const target = effectiveSemitoneTarget(settings);
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

function shouldProtectInversionContinuity({ candidate, nearestTarget, previous, previousNotes, roleTarget }) {
  const role = previous.role || "color";
  const wasBass = previous.midi <= chordBass(previousNotes) + 0.001;
  if (role !== "anchor" && !wasBass) return false;

  const root = Number.isFinite(candidate.root) ? normalizePc(candidate.root) : null;
  const nearestPc = normalizePc(nearestTarget);
  const rolePc = normalizePc(roleTarget);
  const previousPc = normalizePc(previous.pitchClass ?? previous.midi);
  const commonToneAvailable = candidate.pitchClasses.some((pc) => normalizePc(pc) === previousPc);

  if (commonToneAvailable && nearestPc !== previousPc && rolePc === previousPc) return true;
  if (root != null && nearestPc === root && rolePc !== root && Math.abs(roleTarget - previous.midi) <= 7) return true;

  return false;
}

function blendedVoiceTarget({ candidate, pitchClasses, previous, previousNotes, range, rolePc, settings }) {
  const voicingContinuity = Number(settings?.voicingContinuity ?? 0.65);
  const continuityModifier = clamp(0.4 + (1 - voicingContinuity) * 1.6, 0.1, 2.0);
  const continuityTarget = previous.midi * 0.72 + range.center * 0.28;
  const roleTarget = midiInRangeForVoice(rolePc, range, continuityTarget);
  const nearestTarget = nearestChordMidi(pitchClasses, range, previous.midi, previous.pitchClass);
  let weight = clamp(roleWeight(previous.role) * continuityModifier, 0, 1);

  if (Math.abs(roleTarget - previous.midi) > 7) {
    weight = Math.min(weight, 0.18);
  }

  if (shouldProtectInversionContinuity({ candidate, nearestTarget, previous, previousNotes, roleTarget })) {
    weight = Math.max(weight, 0.72);
  }

  const blendedTarget = roleTarget * weight + nearestTarget * (1 - weight);
  return midiInRangeForVoice(rolePc, range, blendedTarget);
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
  const voiceRanges = getVoiceRanges(Number(options.settings?.registerCenter ?? 60));
  let best = null;

  permutations.forEach((permutation) => {
    const voicedNotes = permutation.map((pc, index) => {
      const previous = previousNotes[index] || previousNotes[previousNotes.length - 1];
      const range = voiceRanges[index] || voiceRanges[voiceRanges.length - 1];
      const midi = blendedVoiceTarget({
        candidate,
        pitchClasses,
        previous,
        previousNotes,
        range,
        rolePc: pc,
        settings: options.settings,
      });
      const movement = Math.abs(midi - previous.midi);
      return {
        pitchClass: normalizePc(midi),
        midi,
        voiceId: previous.voiceId ?? index,
        role: previous.role,
        movement,
      };
    });

    if (!usesAllPitchClassesExactlyOnce(voicedNotes, pitchClasses)) {
      return;
    }

    const totalMovement = voicedNotes.reduce((sum, note) => sum + note.movement, 0);
    const voicedPitchClasses = new Set(voicedNotes.map((note) => normalizePc(note.midi)));
    const missingPitchClasses = new Set(pitchClasses).size - voicedPitchClasses.size;
    const harmonicIdentityPenalty = Math.max(0, missingPitchClasses) * 10;
    const largeJumpPenalty = voicedNotes.reduce((sum, note) => {
      if (note.movement <= 7) return sum;
      return sum + (note.movement - 7) * (note.movement - 7) * 1.2;
    }, 0);
    const rangePenalty = voicedNotes.reduce((sum, note, index) => {
      const range = voiceRanges[index] || voiceRanges[voiceRanges.length - 1];
      const below = Math.max(0, range.min - note.midi);
      const above = Math.max(0, note.midi - range.max);
      const centerDistance = Math.abs(note.midi - range.center);
      return sum + (below + above) * 8 + centerDistance * 0.08;
    }, 0);
    const penalty = largeJumpPenalty + crossingPenalty(previousNotes, voicedNotes) + spacingPenalty(voicedNotes) + rangePenalty + harmonicIdentityPenalty;
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
  const profile = getMotionProfile(settings.harmonicMotion ?? 0.3);
  const variation = clamp(Number(settings.voicingVariation ?? 0.5), 0, 1);
  const halfRange = 6 + (18 - 6) * variation;
  const registerCenter = Number(settings.registerCenter ?? 60);
  const ideal = options.idealCenter || { min: registerCenter - halfRange, max: registerCenter + halfRange };
  const notes = normalizeNotes(voicedChord);
  const center = chordCenter(notes);
  const outsideLow = Math.max(0, ideal.min - center);
  const outsideHigh = Math.max(0, center - ideal.max);
  const outsidePenalty = (outsideLow + outsideHigh) * 2.4;
  const targetPull = Math.abs(center - registerCenter) * 1.8;

  return (outsidePenalty + targetPull) * profile.centerWeight;
}

function repetitionPenalty(voicedChord, options = {}) {
  const settings = options.settings || {};
  const profile = getMotionProfile(settings.harmonicMotion ?? 0.3);
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
  const profile = getMotionProfile(settings.harmonicMotion ?? 0.3);
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
  const rootMotionPenalty = rootDistanceToCurrent(candidate, current) * profile.rootMotionFactor;
  const smoothBonus = Math.max(0, 34 - voiced.totalMovement * 1.7 * profile.movementWeight);
  const stepwiseBonus = smallMoves * (5 + profile.restlessBias * 2) + stationary * (1.8 - profile.restlessBias);
  const motionAmountBonus = voiced.totalMovement * profile.motionAmountFactor;
  const pitchCenterPenalty = computePitchCenterPenalty({ notes: voiced.notes }, current, options);
  const directionWeight = directionalMovementWeight(signedMovements, settings);
  const gravityWeight = directionWeight;
  const repeatPenalty = repetitionPenalty({ notes: voiced.notes }, options);
  const clusterPenalty = duplicatePitchClasses * 8 + spacingPenalty(voiced.notes) * 0.72;
  const jumpPenalty = largeJumps * 16 + voiced.voiceLeadingPenalty;
  const currentNotes = normalizeNotes(current);
  const anchorNote = currentNotes.find((n) => n.role === "anchor");
  const dynamicRoot = anchorNote?.pitchClass ?? currentNotes[0]?.pitchClass ?? 0;
  const scaleRoot = (settings.globalRoot != null && settings.globalRoot !== "none")
    ? normalizePc(Number(settings.globalRoot))
    : dynamicRoot;
  const scaleNotes = (settings.scaleName && settings.scaleName !== "none")
    ? buildScaleNotes(settings.scaleName, scaleRoot)
    : null;
  const scaleBias = scaleNotes
    ? computeScaleScore(candidate.pitchClasses || [], scaleNotes, scaleRoot) * (Number(settings.scaleInfluence) || 0) * 5
    : 0;

  const rawScore =
    3 +
    similarityBonus +
    qualityBonus +
    smoothBonus +
    stepwiseBonus +
    motionAmountBonus +
    scaleBias -
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
    directionWeight,
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
