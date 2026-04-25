const DEFAULT_IDEAL_CENTER = Object.freeze({ min: 48, max: 72 });

const MOTION_PROFILES = Object.freeze({
  static: Object.freeze({
    commonToneWeights: Object.freeze({ 3: 1.45, 2: 0.64, 1: 0.14 }),
    movementWeight: 1.42,
    centerWeight: 1.55,
    upwardDriftAllowance: 0.4,
    repetitionWeight: 1.35,
    restlessBias: 0,
  }),
  subtle: Object.freeze({
    commonToneWeights: Object.freeze({ 3: 1.22, 2: 0.86, 1: 0.24 }),
    movementWeight: 1.18,
    centerWeight: 1.24,
    upwardDriftAllowance: 0.9,
    repetitionWeight: 1.1,
    restlessBias: 0.16,
  }),
  evolving: Object.freeze({
    commonToneWeights: Object.freeze({ 3: 0.92, 2: 1.08, 1: 0.48 }),
    movementWeight: 0.92,
    centerWeight: 1.0,
    upwardDriftAllowance: 1.5,
    repetitionWeight: 0.86,
    restlessBias: 0.36,
  }),
  restless: Object.freeze({
    commonToneWeights: Object.freeze({ 3: 0.58, 2: 1.08, 1: 0.88 }),
    movementWeight: 0.68,
    centerWeight: 0.82,
    upwardDriftAllowance: 2.2,
    repetitionWeight: 0.62,
    restlessBias: 0.62,
  }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

function octaveNear(midi, target) {
  let result = midi;
  while (result - target > 6) result -= 12;
  while (target - result > 6) result += 12;
  return result;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function chordCenter(notes) {
  return average(notes.map((note) => note.midi));
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

function randomSign(random) {
  return random() < 0.5 ? -1 : 1;
}

function roleDeltaEntries(role, motionMode) {
  const restlessScale = motionMode === "restless" ? 1.35 : motionMode === "evolving" ? 1.12 : motionMode === "static" ? 0.62 : 0.88;
  if (role === "anchor") {
    return [
      { value: -2, weight: 0.08 * restlessScale },
      { value: -1, weight: 0.26 },
      { value: 1, weight: 0.26 },
      { value: 2, weight: 0.08 * restlessScale },
    ];
  }
  if (role === "tension") {
    return [
      { value: -2, weight: 0.28 * restlessScale },
      { value: -1, weight: 0.34 },
      { value: 1, weight: 0.34 },
      { value: 2, weight: 0.28 * restlessScale },
      { value: -3, weight: 0.08 * restlessScale },
      { value: 3, weight: 0.08 * restlessScale },
    ];
  }
  return [
    { value: -2, weight: 0.18 * restlessScale },
    { value: -1, weight: 0.36 },
    { value: 1, weight: 0.36 },
    { value: 2, weight: 0.18 * restlessScale },
  ];
}

function pickLocalDelta(note, settings, random) {
  const motionMode = settings?.harmonicMotion || "subtle";
  const picked = weightedChoice(roleDeltaEntries(note.role, motionMode), random);
  return picked ?? randomSign(random);
}

function movedPitchClasses(notes, moves, settings, random) {
  const pitchClasses = notes.map((note) => note.pitchClass);
  moves.forEach((voiceIndex) => {
    pitchClasses[voiceIndex] = normalizePc(pitchClasses[voiceIndex] + pickLocalDelta(notes[voiceIndex], settings, random));
  });
  return pitchClasses;
}

/**
 * Candidate generation is intentionally local: each option is a small
 * mutation of the current chord, so harmony emerges from voice movement.
 */
export function generateCandidates(current, options = {}) {
  const random = options.random || Math.random;
  const settings = options.settings || {};
  const notes = normalizeNotes(current);
  const candidates = [];
  const seen = new Set();
  if (!notes.length) return candidates;

  notes.forEach((note, index) => {
    [-2, -1, 1, 2].forEach((delta) => {
      const pitchClasses = notes.map((candidate) => candidate.pitchClass);
      pitchClasses[index] = normalizePc(note.pitchClass + delta);
      pushUnique(candidates, seen, uniqueCandidate(pitchClasses, "single-step"));
    });
  });

  const pairTarget = settings.harmonicMotion === "static" ? 3 : settings.harmonicMotion === "restless" ? 7 : 5;
  for (let attempt = 0; attempt < pairTarget * 2 && candidates.length < 22; attempt += 1) {
    const first = Math.floor(random() * notes.length);
    let second = Math.floor(random() * notes.length);
    if (second === first) second = (second + 1) % notes.length;
    pushUnique(candidates, seen, uniqueCandidate(movedPitchClasses(notes, [first, second], settings, random), "double-step"));
  }

  const replacementTarget = settings.harmonicMotion === "restless" ? 5 : 3;
  for (let attempt = 0; attempt < replacementTarget; attempt += 1) {
    const index = Math.floor(random() * notes.length);
    const widerDelta = randomSign(random) * (3 + Math.floor(random() * 3));
    const pitchClasses = notes.map((candidate) => candidate.pitchClass);
    pitchClasses[index] = normalizePc(notes[index].pitchClass + widerDelta);
    pushUnique(candidates, seen, uniqueCandidate(pitchClasses, "nearby-replacement"));
  }

  if (settings.harmonicMotion === "evolving" || settings.harmonicMotion === "restless") {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const held = Math.floor(random() * notes.length);
      const moving = notes.map((_, index) => index).filter((index) => index !== held);
      pushUnique(candidates, seen, uniqueCandidate(movedPitchClasses(notes, moving, settings, random), "three-voice-slide"));
    }
  }

  return candidates.slice(0, 18);
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
      const previous = previousNotes[index];
      const midi = octaveNear(48 + pc, previous.midi);
      const movement = Math.abs(midi - previous.midi);
      return {
        pitchClass: pc,
        midi,
        voiceId: previous.voiceId,
        role: previous.role,
        movement,
      };
    });

    const totalMovement = voicedNotes.reduce((sum, note) => sum + note.movement, 0);
    const largeJumpPenalty = voicedNotes.reduce((sum, note) => {
      if (note.movement <= 7) return sum;
      return sum + (note.movement - 7) * (note.movement - 7) * 1.2;
    }, 0);
    const penalty = largeJumpPenalty + crossingPenalty(previousNotes, voicedNotes) + spacingPenalty(voicedNotes);
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
  if (commonToneCount === 0) return null;

  const voiced = applyVoiceLeading(candidate, current, options);
  const movements = voiced.notes.map((note) => {
    const previous = normalizeNotes(current).find((candidateNote) => candidateNote.voiceId === note.voiceId);
    return Math.abs(note.midi - (previous?.midi ?? note.midi));
  });
  const smallMoves = movements.filter((movement) => movement > 0 && movement <= 2).length;
  const largeJumps = movements.filter((movement) => movement > 7).length;
  const stationary = movements.filter((movement) => movement === 0).length;
  const duplicatePitchClasses = voiced.notes.length - new Set(voiced.notes.map((note) => note.pitchClass)).size;
  const commonToneBase = { 3: 38, 2: 24, 1: 10 }[commonToneCount] || 0;
  const commonToneBonus = commonToneBase * (profile.commonToneWeights[commonToneCount] || 1);
  const smoothBonus = Math.max(0, 34 - voiced.totalMovement * 1.7 * profile.movementWeight);
  const stepwiseBonus = smallMoves * (5 + profile.restlessBias * 2) + stationary * (1.8 - profile.restlessBias);
  const motionAmountBonus = settings.harmonicMotion === "restless"
    ? voiced.totalMovement * 0.72
    : settings.harmonicMotion === "evolving"
      ? voiced.totalMovement * 0.34
      : -voiced.totalMovement * 0.12;
  const pitchCenterPenalty = computePitchCenterPenalty({ notes: voiced.notes }, current, options);
  const repeatPenalty = repetitionPenalty({ notes: voiced.notes }, options);
  const clusterPenalty = duplicatePitchClasses * 8 + spacingPenalty(voiced.notes) * 0.72;
  const jumpPenalty = largeJumps * 16 + voiced.voiceLeadingPenalty;
  const score =
    3 +
    commonToneBonus +
    smoothBonus +
    stepwiseBonus +
    motionAmountBonus -
    pitchCenterPenalty -
    repeatPenalty -
    clusterPenalty -
    jumpPenalty;

  return {
    candidate,
    notes: voiced.notes,
    score: Math.max(0.01, score),
    commonToneCount,
    totalMovement: voiced.totalMovement,
    pitchCenterPenalty,
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
  };
}
