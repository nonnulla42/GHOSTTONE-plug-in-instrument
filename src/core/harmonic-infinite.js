import { assignHarmonicRole, pickMotionType, ROLE_BEHAVIORS } from "./harmonic-roles.js";
import { generateNextChord } from "./harmonic-chord-evolution.js";

const noteNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const COLOR_INTERVALS = [3, 4, 7, 9];
const TENSION_INTERVALS = [1, 2, 5, 6, 8, 10, 11];

function getHarmonicMotionProfile(harmonicMotion) {
  const h = Math.max(0, Math.min(1, Number(harmonicMotion) || 0));
  const lerp = (a, b) => a + (b - a) * h;
  return {
    changeProbability: lerp(0.18, 0.72),
    maxChangingVoices: lerp(1, 4),
    leapMultiplier:    lerp(0.2, 1.0),
    rootPull:          lerp(0.9, 0.3),
    preserveCenter:    lerp(0.9, 0.2),
  };
}

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

function intervalToDegree(interval) {
  return {
    0: "1",
    1: "b2",
    2: "2",
    3: "b3",
    4: "3",
    5: "4",
    6: "b5",
    7: "5",
    8: "b6",
    9: "6",
    10: "b7",
    11: "7",
  }[normalizePc(interval)] || "?";
}

function noteNameFromMidi(midi) {
  return noteNames[normalizePc(midi)];
}

function weightedChoice(entries, random) {
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  if (total <= 0) return entries[0]?.[0] || null;

  let cursor = random() * total;
  for (const [value, weight] of entries) {
    cursor -= Math.max(0, weight);
    if (cursor <= 0) return value;
  }

  return entries[entries.length - 1]?.[0] || null;
}

export function createHarmonicStateFromSection(section) {
  const voices = section.notes
    .map((note, voiceId) => ({
      voiceId,
      midi: note.midi,
      pc: normalizePc(note.midi),
      role: note.harmonicRole || assignHarmonicRole(note),
      noteName: note.name || noteNameFromMidi(note.midi),
      degree: note.degree || "1",
      changed: false,
    }))
    .sort((left, right) => left.midi - right.midi);

  const rootCandidate = normalizePc(section.rootPc ?? voices[0]?.pc ?? 0);
  return evaluateHarmonicState({
    voices: assignRolesForVoices(voices, rootCandidate),
    rootCandidate,
    stabilityScore: 0,
    tensionScore: 0,
    movedVoices: 0,
    leapCount: 0,
    label: formatStateLabel(rootCandidate),
  });
}

export function assignRolesForVoices(voices, rootCandidate) {
  const labeled = voices.map((voice) => {
    const interval = normalizePc(voice.pc - rootCandidate);
    let role = "tension";

    if (interval === 0) {
      role = "anchor";
    } else if (COLOR_INTERVALS.includes(interval)) {
      role = "color";
    } else if (TENSION_INTERVALS.includes(interval)) {
      role = "tension";
    }

    return {
      ...voice,
      role,
      degree: intervalToDegree(interval),
      noteName: noteNameFromMidi(voice.midi),
      pc: normalizePc(voice.midi),
    };
  });

  if (!labeled.some((voice) => voice.role === "anchor") && labeled.length) {
    const anchorIndex = labeled.reduce((bestIndex, voice, index, all) => {
      const bestVoice = all[bestIndex];
      const voiceDistance = Math.abs(normalizePc(voice.pc - rootCandidate));
      const bestDistance = Math.abs(normalizePc(bestVoice.pc - rootCandidate));
      if (voiceDistance < bestDistance) return index;
      if (voiceDistance === bestDistance && voice.midi < bestVoice.midi) return index;
      return bestIndex;
    }, 0);
    labeled[anchorIndex] = { ...labeled[anchorIndex], role: "anchor", degree: "1" };
  }

  return labeled.sort((left, right) => left.midi - right.midi);
}

export function evaluateHarmonicState(state) {
  const voices = state.voices || [];
  const anchorCount = voices.filter((voice) => voice.role === "anchor").length;
  const tensionCount = voices.filter((voice) => voice.role === "tension").length;
  const colorCount = voices.filter((voice) => voice.role === "color").length;
  const pitchClasses = new Set(voices.map((voice) => voice.pc)).size;
  const span = voices.length ? voices[voices.length - 1].midi - voices[0].midi : 0;

  const stabilityScore = clamp(
    anchorCount * 1.25 + colorCount * 0.55 + pitchClasses * 0.12 - tensionCount * 0.4 - Math.max(0, 4 - span) * 0.08,
    0,
    4,
  );
  const tensionScore = clamp(tensionCount / Math.max(1, voices.length) + Math.max(0, 6 - pitchClasses) * 0.02, 0, 1);

  return {
    ...state,
    stabilityScore,
    tensionScore,
    label: state.label || formatStateLabel(state.rootCandidate),
  };
}

function chooseRootCandidate(voices, previousState, targetRootPc, settings, profile, random) {
  const previousRootPc = previousState.rootCandidate;
  const history = Array.isArray(settings.history) ? settings.history : [];
  const recentRoots = history.map((state) => state.rootCandidate).filter((value) => Number.isFinite(value));
  const repeatedRootCount = recentRoots.filter((root) => root === previousRootPc).length;
  const recentTensionAverage = history.length
    ? history.reduce((sum, state) => sum + (Number(state.tensionScore) || 0), 0) / history.length
    : 0;
  const candidates = [...new Set(voices.map((voice) => voice.pc))];

  const scored = candidates.map((candidate) => {
    const closenessToPrevious = Math.min(normalizePc(candidate - previousRootPc), normalizePc(previousRootPc - candidate));
    const closenessToTarget = targetRootPc == null
      ? 0
      : Math.min(normalizePc(candidate - targetRootPc), normalizePc(targetRootPc - candidate));
    const anchorWeight = voices.some((voice) => voice.pc === candidate && voice.role === "anchor") ? 0.4 : 0;
    const lowVoiceWeight = voices[0]?.pc === candidate ? 0.3 : 0;
    const repetitionPenalty = candidate === previousRootPc ? repeatedRootCount * (1 - profile.preserveCenter) * 0.08 : 0;
    const recoveryBonus = recentTensionAverage > 0.58 && candidate !== previousRootPc ? 0.12 : 0;
    const score =
      anchorWeight +
      lowVoiceWeight +
      recoveryBonus -
      repetitionPenalty -
      closenessToPrevious * profile.preserveCenter * (0.12 + settings.harmonyLock * 0.2) -
      closenessToTarget * profile.rootPull * 0.08 +
      random() * 0.05;
    return { candidate, score };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.candidate ?? previousRootPc;
}

function movementEntriesForVoice(role, settings, profile) {
  const behavior = ROLE_BEHAVIORS[role] || ROLE_BEHAVIORS.color;
  const lock = clamp(Number(settings.harmonyLock) || 0, 0, 1);
  const leapScale = lerp(0.22, 1, profile.leapMultiplier) * lerp(0.35, 1.05, 1 - lock);
  const stayScale = lerp(1.28, 0.72, profile.changeProbability) * lerp(1.24, 0.88, lock);
  const stepScale = lerp(0.9, 1.18, profile.changeProbability);

  return [
    ["stay", behavior.motionStepBias.stay * stayScale],
    ["step", behavior.motionStepBias.step * stepScale],
    ["leap", behavior.motionStepBias.leap * leapScale],
  ];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function chooseSemitoneDelta(motionType, role, settings, random) {
  if (motionType === "stay") return 0;

  if (motionType === "step") {
    return weightedChoice(
      [
        [-2, role === "tension" ? 0.18 : 0.1],
        [-1, 0.36],
        [1, 0.36],
        [2, role === "anchor" ? 0.08 : 0.18],
      ],
      random,
    );
  }

  const lock = clamp(Number(settings.harmonyLock) || 0, 0, 1);
  const wideLeapScale = lerp(1.1, 0.45, lock);
  return weightedChoice(
    [
      [-5, 0.12 * wideLeapScale],
      [-4, 0.18],
      [-3, 0.22],
      [3, 0.22],
      [4, 0.18],
      [5, 0.12 * wideLeapScale],
      [7, 0.08 * wideLeapScale],
    ],
    random,
  );
}

function moveSamePitchClassAbove(midi, minimum) {
  let result = midi;
  while (result <= minimum) result += 12;
  return result;
}

function enforceVoiceOrder(voices, previousState) {
  const ordered = voices
    .slice()
    .sort((left, right) => left.midi - right.midi);
  const result = [];

  ordered.forEach((voice) => {
    let midi = voice.midi;
    const previousVoice = previousState.voices.find((candidate) => candidate.voiceId === voice.voiceId);
    if (previousVoice) {
      midi = octaveNear(midi, previousVoice.midi);
    }

    if (result.length && midi <= result[result.length - 1].midi) {
      midi = moveSamePitchClassAbove(midi, result[result.length - 1].midi);
    }

    result.push({
      ...voice,
      midi,
      pc: normalizePc(midi),
      noteName: noteNameFromMidi(midi),
    });
  });

  return result;
}

function stabilizeState(voices, rootCandidate, previousState, settings) {
  let nextVoices = assignRolesForVoices(voices, rootCandidate);

  if (!settings.stayMusical) {
    return nextVoices;
  }

  const uniquePitchClasses = new Set(nextVoices.map((voice) => voice.pc)).size;
  const tensionVoices = nextVoices.filter((voice) => voice.role === "tension");

  if (uniquePitchClasses < 2 && nextVoices.length > 1) {
    const lastIndex = nextVoices.length - 1;
    const targetInterval = COLOR_INTERVALS[lastIndex % COLOR_INTERVALS.length];
    nextVoices[lastIndex] = {
      ...nextVoices[lastIndex],
      midi: nextVoices[0].midi + targetInterval,
      pc: normalizePc(nextVoices[0].midi + targetInterval),
    };
    nextVoices = assignRolesForVoices(nextVoices, rootCandidate);
  }

  if (tensionVoices.length > Math.ceil(nextVoices.length / 2)) {
    const candidate = nextVoices.filter((voice) => voice.role === "tension").sort((left, right) => right.midi - left.midi)[0];
    if (candidate) {
      const colorInterval = COLOR_INTERVALS.reduce((best, interval) => {
        const candidateMidi = nextVoices[0].midi + interval;
        const distance = Math.abs(candidateMidi - candidate.midi);
        return !best || distance < best.distance ? { interval, distance } : best;
      }, null);
      candidate.midi = nextVoices[0].midi + colorInterval.interval;
      candidate.pc = normalizePc(candidate.midi);
      nextVoices = assignRolesForVoices(nextVoices, rootCandidate);
    }
  }

  if (settings.harmonyLock > 0.75) {
    const changedVoices = nextVoices.filter((voice) => voice.changed);
    if (changedVoices.length === nextVoices.length && nextVoices.length) {
      const anchor = nextVoices.find((voice) => voice.role === "anchor") || nextVoices[0];
      const previousAnchor = previousState.voices.find((voice) => voice.voiceId === anchor.voiceId) || previousState.voices[0];
      const previousAnchorPc = normalizePc(previousAnchor.midi);
      if (anchor.pc === previousAnchorPc) {
        anchor.midi = octaveNear(previousAnchor.midi, anchor.midi);
        anchor.pc = normalizePc(anchor.midi);
        anchor.changed = false;
        nextVoices = assignRolesForVoices(nextVoices, rootCandidate);
      }
    }
  }

  return nextVoices;
}

export function evolveHarmonicState(previousState, options = {}) {
  const random = options.random;
  if (typeof random !== "function") {
    throw new TypeError("evolveHarmonicState requires a random() function");
  }

  const settings = options.settings || {};
  const history = Array.isArray(options.history) ? options.history : [];
  const profile = getHarmonicMotionProfile(settings.harmonicMotion ?? 0.3);
  const chordState = {
    notes: previousState.voices.map((voice) => ({
      pitchClass: voice.pc,
      midi: voice.midi,
      voiceId: voice.voiceId,
      role: voice.role,
    })),
  };
  const nextChord = generateNextChord(chordState, {
    random,
    settings,
    history,
    targetRootPc: options.targetRootPc,
  });
  const previousByVoiceId = new Map(previousState.voices.map((voice) => [voice.voiceId, voice]));
  let leapCount = 0;
  const movedVoices = [];

  const transformed = nextChord.notes.map((note) => {
    const previous = previousByVoiceId.get(note.voiceId) || previousState.voices[0];
    const delta = note.midi - previous.midi;
    const motionType = delta === 0 ? "stay" : Math.abs(delta) <= 2 ? "step" : "leap";
    if (Math.abs(delta) >= 3) leapCount += 1;
    if (delta !== 0) movedVoices.push(note.voiceId);

    return {
      ...previous,
      midi: note.midi,
      pc: normalizePc(note.midi),
      changed: delta !== 0,
      motionType,
    };
  });

  const ordered = enforceVoiceOrder(transformed, previousState);
  const rootCandidate = Number.isFinite(nextChord.root)
    ? normalizePc(nextChord.root)
    : chooseRootCandidate(ordered, previousState, options.targetRootPc, { ...settings, history }, profile, random);
  const stabilized = stabilizeState(ordered, rootCandidate, previousState, settings);

  return evaluateHarmonicState({
    voices: stabilized,
    rootCandidate,
    movedVoices: movedVoices.length,
    leapCount,
    label: formatStateLabel(rootCandidate),
  });
}

export function buildInfiniteSections(seedSections, settings, seed, makeRandom) {
  return buildInfiniteSectionSequence(seedSections, settings, seed, seedSections.length, makeRandom);
}

function pickFromMemory(progression, random) {
  const total = progression.reduce((sum, _, i) => sum + 1 / (progression.length - i), 0);
  let cursor = random() * total;
  for (let i = 0; i < progression.length; i++) {
    cursor -= 1 / (progression.length - i);
    if (cursor <= 0) return { state: progression[i], index: i };
  }
  return { state: progression[progression.length - 1], index: progression.length - 1 };
}

export function buildInfiniteSectionSequence(seedSections, settings, seed, totalSectionCount, makeRandom) {
  if (!Array.isArray(seedSections) || seedSections.length === 0) return [];

  const random = makeRandom(seed + 9173);
  const generated = [];
  const history = [];
  const templateLoopBeats = seedSections.reduce((max, section) => Math.max(max, section.startBeat + section.durationBeats), 0);
  let currentState = createHarmonicStateFromSection(seedSections[0]);

  generated.push(stateToSection(currentState, seedSections[0], 0, templateLoopBeats, seedSections.length));
  history.push(currentState);

  // progression memory: sliding window of up to 16 states, with recency-biased recall
  const MAX_MEMORY = 16;
  const progression = [currentState];
  let currentMemIndex = 0;
  const memoryStrength = Number(settings.memoryStrength) || 0;
  const useMemoryProb = 0.3 + memoryStrength * 0.5; // 0.3 at 0 (chaotic) → 0.8 at 1 (loop-heavy)

  for (let index = 1; index < totalSectionCount; index += 1) {
    const skeleton = seedSections[index % seedSections.length];
    const targetRootPc = index < seedSections.length ? skeleton.rootPc : null;

    let nextState;
    const r = random();

    if (progression.length < 4 || r >= useMemoryProb) {
      // CONTINUE FORWARD: generate a genuinely new chord
      nextState = evolveHarmonicState(currentState, { random, settings, targetRootPc, history });
      progression.push(nextState);
      if (progression.length > MAX_MEMORY) progression.shift();
      currentMemIndex = progression.length - 1;
    } else {
      const memR = random();
      if (memR < 0.5) {
        // LOOP / RETURN: recall a chord from memory with recency bias
        const picked = pickFromMemory(progression, random);
        nextState = picked.state;
        currentMemIndex = picked.index;
      } else if (memR < 0.75) {
        // REPEAT CURRENT: hold the present chord
        nextState = progression[currentMemIndex];
      } else {
        // MUTATION: evolve from a remembered chord (not necessarily the current one)
        const base = pickFromMemory(progression, random).state;
        nextState = evolveHarmonicState(base, { random, settings, targetRootPc, history });
        progression.push(nextState);
        if (progression.length > MAX_MEMORY) progression.shift();
        currentMemIndex = progression.length - 1;
      }
    }

    currentState = nextState;
    generated.push(stateToSection(currentState, skeleton, index, templateLoopBeats, seedSections.length));
    history.push(currentState);
    if (history.length > 8) history.shift();
  }

  return generated;
}

function stateToSection(state, skeleton, index, templateLoopBeats = 0, templateSectionCount = 1) {
  const cycle = Math.floor(index / templateSectionCount);
  const startBeat = skeleton.startBeat + cycle * templateLoopBeats;
  return {
    ...skeleton,
    label: state.label,
    rootPc: state.rootCandidate,
    notes: state.voices.map((voice) => ({
      semis: voice.midi - (48 + state.rootCandidate),
      role: voice.role,
      harmonicRole: voice.role,
      degree: voice.degree,
      pc: voice.pc,
      midi: voice.midi,
      name: voice.noteName,
      voiceId: voice.voiceId,
    })),
    baseNotes: state.voices.map((voice) => ({
      role: voice.role,
      harmonicRole: voice.role,
      degree: voice.degree,
      pc: voice.pc,
      midi: voice.midi,
      name: voice.noteName,
      voiceId: voice.voiceId,
    })),
    startBeat,
    state: {
      rootCandidate: state.rootCandidate,
      stabilityScore: state.stabilityScore,
      tensionScore: state.tensionScore,
      movedVoices: state.movedVoices,
      leapCount: state.leapCount,
    },
    sectionIndex: index,
  };
}

function formatStateLabel(rootCandidate) {
  return `${noteNames[normalizePc(rootCandidate)]} infinite`;
}
