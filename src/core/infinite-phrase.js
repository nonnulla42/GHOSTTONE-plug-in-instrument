import { getNoteSimilarity } from "./harmonic-chord-evolution.js";
import { generateRoleDriftEndCents, generateRoleMicroOffsetCents } from "./harmonic-roles.js";

const SCALE_DEFINITIONS = Object.freeze({
  major: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  minor: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
  dorian: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  mixolydian: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
  phrygian: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
  harmonicMinor: Object.freeze([0, 2, 3, 5, 7, 8, 11]),
});

const noteNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const PHRASE_COLOR_INTENSITY = Object.freeze({
  warm: 0.78,
  dreamy: 0.92,
  dark: 1.02,
  alien: 1.18,
});

const SIXTEENTH_BEATS = 0.25;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

function noteNameFromMidi(midi) {
  return noteNames[normalizePc(midi)];
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

function buildScaleNotes(scaleName, root) {
  const intervals = SCALE_DEFINITIONS[scaleName];
  if (!intervals || root == null) return null;
  return intervals.map((interval) => normalizePc(root + interval));
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

function getCurrentChordPitchClasses(section) {
  return [...new Set((section?.notes || []).map((note) => normalizePc(note.pc ?? note.midi)))];
}

function getLocalRoot(previousSection) {
  const anchor = previousSection?.notes?.find((note) => note.harmonicRole === "anchor" || note.role === "anchor");
  if (anchor) return normalizePc(anchor.pc ?? anchor.midi);
  if (Number.isFinite(previousSection?.rootPc)) return normalizePc(previousSection.rootPc);
  return null;
}

function hasGlobalScale(settings = {}) {
  return Boolean(
    settings.scaleName &&
    settings.scaleName !== "none" &&
    settings.globalRoot != null &&
    settings.globalRoot !== "none",
  );
}

function getGlobalWeight(pc, settings = {}) {
  if (!hasGlobalScale(settings)) return 1;

  const scaleInfluence = clamp(Number(settings.scaleInfluence) || 0, 0, 1);
  const globalScale = buildScaleNotes(settings.scaleName, Number(settings.globalRoot));
  if (!globalScale?.length) return 1;

  return globalScale.includes(normalizePc(pc))
    ? 1
    : Math.max(0, 1 - scaleInfluence) * 0.25;
}

function hasLocalScaleRule(settings = {}) {
  return Boolean(settings.localScaleType && settings.localScaleType !== "none");
}

function getLocalWeight(pc, previousSection, settings = {}) {
  if (!hasLocalScaleRule(settings)) return 1;

  const previousPitchClasses = getCurrentChordPitchClasses(previousSection);
  if (!previousPitchClasses.length) return 0;

  const localRootPitchClass = getLocalRoot(previousSection);
  const options = {
    localScaleType: settings.localScaleType,
    localTargetDegree: settings.localTargetDegree,
    localDegreeFalloff: settings.localDegreeFalloff,
    localRootPitchClass,
  };

  return previousPitchClasses.reduce((best, previousPc) =>
    Math.max(best, getNoteSimilarity(previousPc, pc, options)), 0);
}

function getSourcePitchClassWeights(section, previousSection, settings = {}) {
  const harmonicMotion = clamp(Number(settings.harmonicMotion) || 0, 0, 1);
  const globalScaleActive = hasGlobalScale(settings);
  const candidates = Array.from({ length: 12 }, (_, pc) => {
    const globalWeight = getGlobalWeight(pc, settings);
    const localWeight = getLocalWeight(pc, previousSection ?? section, settings);
    const effectiveLocalWeight = localWeight * (1 - harmonicMotion) + harmonicMotion;
    return {
      pc,
      globalWeight,
      localWeight,
      globalInScale: !globalScaleActive || globalWeight >= 1,
      effectiveLocalWeight,
      weight: globalWeight * effectiveLocalWeight,
    };
  }).filter((entry) => entry.globalWeight > 0);

  if (!candidates.length) {
    const fallbackPcs = getCurrentChordPitchClasses(section);
    return fallbackPcs.map((pc) => ({
      pc,
      globalWeight: 1,
      localWeight: 1,
      globalInScale: true,
      effectiveLocalWeight: 1,
      weight: 1,
    }));
  }

  const hasLocalRule = hasLocalScaleRule(settings);
  if (!hasLocalRule) {
    return candidates.filter((entry) => entry.weight > 0);
  }

  const strictlyPositive = candidates.filter((entry) => entry.localWeight > 0);
  if (strictlyPositive.length && harmonicMotion <= 0.001) {
    return strictlyPositive.map((entry) => ({
      ...entry,
      weight: entry.globalWeight * entry.localWeight,
      effectiveLocalWeight: entry.localWeight,
    }));
  }

  return candidates.filter((entry) => entry.weight > 0);
}

function phraseNotesPerFourBeats(density) {
  return 2 + Math.round(clamp(Number(density) || 0, 0, 1) * 6);
}

function getPhraseNoteCount(sectionBeats, density) {
  const count = Math.round(phraseNotesPerFourBeats(density) * (sectionBeats / 4));
  return Math.max(1, count);
}

function getPhraseOffsets(sectionBeats, noteCount, feel = "even") {
  const step = sectionBeats / noteCount;
  const offsets = [];
  const maxSlot = Math.max(0, Math.floor((sectionBeats - 0.0001) / SIXTEENTH_BEATS));
  let previousSlot = -1;

  for (let index = 0; index < noteCount; index += 1) {
    let offset = step * index;
    if (feel === "flowing" && index % 2 === 1) offset += step * 0.18;
    if (feel === "syncopated" && index % 2 === 1) offset += step * 0.28;
    if (feel === "broken" && index % 3 === 1) offset += step * 0.22;
    if (feel === "pulsing" && index % 2 === 1) offset += step * 0.08;
    let slot = Math.round(clamp(offset, 0, Math.max(0, sectionBeats - SIXTEENTH_BEATS)) / SIXTEENTH_BEATS);
    if (slot <= previousSlot) slot = previousSlot + 1;
    slot = Math.min(slot, maxSlot);
    previousSlot = slot;
    offsets.push(slot * SIXTEENTH_BEATS);
  }

  return offsets;
}

function classifyPhraseWeight(source) {
  if (source.globalInScale && source.localWeight > 0) return "globalLocal";
  if (source.globalInScale) return "globalOnly";
  if (source.localWeight > 0) return "localOnly";
  return "weak";
}

function durationPoolForClass(weightClass, startBeat) {
  const beatPhase = ((startBeat % 1) + 1) % 1;
  const strongStart = Math.abs(beatPhase) < 0.001;
  const mediumStart = strongStart || Math.abs(beatPhase - 0.5) < 0.001;

  switch (weightClass) {
    case "globalLocal":
      return strongStart
        ? [{ slots: 6, weight: 0.42 }, { slots: 4, weight: 0.38 }, { slots: 2, weight: 0.2 }]
        : mediumStart
          ? [{ slots: 4, weight: 0.48 }, { slots: 2, weight: 0.32 }, { slots: 6, weight: 0.2 }]
          : [{ slots: 2, weight: 0.48 }, { slots: 4, weight: 0.38 }, { slots: 6, weight: 0.14 }];
    case "globalOnly":
      return strongStart
        ? [{ slots: 4, weight: 0.62 }, { slots: 2, weight: 0.38 }]
        : [{ slots: 2, weight: 0.52 }, { slots: 4, weight: 0.48 }];
    case "localOnly":
      return [{ slots: 2, weight: 0.68 }, { slots: 1, weight: 0.32 }];
    default:
      return [{ slots: 1, weight: 1 }];
  }
}

function getPhraseDuration(weightClass, startBeat, nextBeat, sectionEndBeat, random) {
  const availableBeats = Math.max(SIXTEENTH_BEATS, (nextBeat ?? sectionEndBeat) - startBeat);
  const availableSlots = Math.max(1, Math.floor((availableBeats + 1e-6) / SIXTEENTH_BEATS));
  const pool = durationPoolForClass(weightClass, startBeat).filter((entry) => entry.slots <= availableSlots);
  const selected = weightedChoice(
    (pool.length ? pool : [{ slots: availableSlots, weight: 1 }]).map((entry) => ({ value: entry, weight: entry.weight })),
    random,
  );
  return Math.max(SIXTEENTH_BEATS, selected.slots * SIXTEENTH_BEATS);
}

function getPhraseRegisterProfile(settings = {}) {
  const variation = clamp(Number(settings.voicingVariation) || 0, 0, 1);
  const continuity = clamp(Number(settings.voicingContinuity) || 0, 0, 1);
  return {
    centerHalfRange: 7 + variation * 9,
    movementWeight: 0.16 + continuity * 0.16,
    centerWeight: 0.05 + (1 - variation) * 0.06,
    leapPenaltyWeight: 0.22 + continuity * 0.14,
  };
}

function enumerateMidiCandidates(pc, registerCenter, profile) {
  const minMidi = Math.max(38, Math.round(registerCenter - profile.centerHalfRange - 8));
  const maxMidi = Math.min(82, Math.round(registerCenter + profile.centerHalfRange + 8));
  const normalizedPc = normalizePc(pc);
  const candidates = [];
  let midi = normalizedPc;

  while (midi < minMidi) midi += 12;
  while (midi <= maxMidi) {
    candidates.push(midi);
    midi += 12;
  }

  return candidates.length ? candidates : [registerCenter + (normalizedPc - normalizePc(registerCenter))];
}

function contourPenalty(candidateMidi, previousMidi, lastDirection, repeatedDirectionCount) {
  if (!Number.isFinite(previousMidi)) return 0;
  const direction = Math.sign(candidateMidi - previousMidi);
  if (direction === 0) return 0.5;
  if (!lastDirection || direction !== lastDirection) return 0;
  return repeatedDirectionCount >= 2 ? 1.65 : 0.45;
}

function scorePhraseCandidate(source, candidateMidi, state, settings = {}) {
  const registerCenter = Number(settings.registerCenter ?? 60);
  const profile = getPhraseRegisterProfile(settings);
  const previousMidi = state.previousMidi;
  const movement = Number.isFinite(previousMidi) ? Math.abs(candidateMidi - previousMidi) : Math.abs(candidateMidi - registerCenter) * 0.65;
  const centerDistance = Math.abs(candidateMidi - registerCenter);
  const excessCenterDistance = Math.max(0, centerDistance - profile.centerHalfRange);
  let cost =
    movement * profile.movementWeight +
    centerDistance * profile.centerWeight +
    excessCenterDistance * 0.24 +
    contourPenalty(candidateMidi, previousMidi, state.lastDirection, state.repeatedDirectionCount);

  if (Number.isFinite(previousMidi) && Math.abs(candidateMidi - previousMidi) > 12) {
    cost += (Math.abs(candidateMidi - previousMidi) - 12) * profile.leapPenaltyWeight;
  }

  if (Number.isFinite(previousMidi) && normalizePc(candidateMidi) === normalizePc(previousMidi)) {
    cost += 0.35;
  }

  return Math.max(0.02, source.weight * Math.exp(-cost));
}

function choosePhraseNote(section, previousSection, stepIndex, sectionState, random, settings = {}) {
  const registerCenter = Number(settings.registerCenter ?? 60);
  const sources = getSourcePitchClassWeights(section, previousSection, settings);
  const profile = getPhraseRegisterProfile(settings);
  const candidates = [];

  sources.forEach((source) => {
    enumerateMidiCandidates(source.pc, registerCenter, profile).forEach((candidateMidi) => {
      candidates.push({
        value: {
          midi: candidateMidi,
          pc: normalizePc(candidateMidi),
          weightClass: classifyPhraseWeight(source),
        },
        weight: scorePhraseCandidate(source, candidateMidi, sectionState, settings),
      });
    });
  });

  const selected = weightedChoice(candidates, random) || {
    midi: registerCenter,
    pc: normalizePc(registerCenter),
    weightClass: "globalOnly",
  };
  const previousMidi = sectionState.previousMidi;
  const direction = Number.isFinite(previousMidi) ? Math.sign(selected.midi - previousMidi) : 0;

  sectionState.repeatedDirectionCount = direction !== 0 && direction === sectionState.lastDirection
    ? sectionState.repeatedDirectionCount + 1
    : 1;
  sectionState.lastDirection = direction;
  sectionState.previousMidi = selected.midi;

  return {
    ...selected,
    degree: intervalToDegree(selected.midi - (Number(section.rootPc) || 0)),
    stepIndex,
  };
}

function getPhraseColorIntensity(settings = {}) {
  return PHRASE_COLOR_INTENSITY[settings.colorMode] || 0.92;
}

function buildPhraseEvent(note, section, sectionIndex, startBeat, durationBeats, stepIndex, random, settings = {}) {
  const cents = generateRoleMicroOffsetCents("color", random, {
    ghostEnabled: settings.ghostEnabled,
    ghostAmount: settings.ghostAmount,
    harmonyLock: settings.harmonyLock,
    stayMusical: settings.stayMusical,
    colorIntensity: getPhraseColorIntensity(settings),
  });
  const driftEnd = generateRoleDriftEndCents("color", cents, random, {
    ghostEnabled: settings.ghostEnabled,
    driftAmount: settings.drift,
    colorIntensity: getPhraseColorIntensity(settings),
  });

  return {
    id: `${sectionIndex}:phrase:${stepIndex}:${startBeat.toFixed(3)}`,
    sectionIndex,
    sectionLabel: section.label,
    voiceId: 0,
    noteName: noteNameFromMidi(note.midi),
    midi: note.midi,
    startBeat,
    durationBeats,
    cents,
    driftAmount: Math.abs(driftEnd - cents),
    driftEnd,
    role: "phrase",
    degree: note.degree,
    motionType: "infinitePhrase",
    carriedFromPrevious: false,
    velocity: clamp(0.48 + (stepIndex === 0 ? 0.08 : 0) + (random() - 0.5) * 0.06, 0.34, 0.76),
  };
}

export function buildInfinitePhraseEvents(sections, settings = {}, seed = 1, makeRandom) {
  const random = makeRandom(seed + 48031);
  const events = [];
  const phraseState = {
    previousMidi: null,
    lastDirection: 0,
    repeatedDirectionCount: 0,
  };

  sections.forEach((section, sectionIndex) => {
    const previousSection = sections[sectionIndex - 1] || section;
    const noteCount = getPhraseNoteCount(section.durationBeats, settings.arpDensity ?? 0.5);
    const offsets = getPhraseOffsets(section.durationBeats, noteCount, settings.arpFeel);

    for (let stepIndex = 0; stepIndex < offsets.length; stepIndex += 1) {
      const note = choosePhraseNote(section, previousSection, stepIndex, phraseState, random, settings);
      const startBeat = section.startBeat + offsets[stepIndex];
      const nextBeat = stepIndex + 1 < offsets.length ? section.startBeat + offsets[stepIndex + 1] : null;
      const durationBeats = getPhraseDuration(note.weightClass, startBeat, nextBeat, section.startBeat + section.durationBeats, random);
      events.push(buildPhraseEvent(note, section, sectionIndex, startBeat, durationBeats, stepIndex, random, settings));
    }
  });

  return events.sort((left, right) => left.startBeat - right.startBeat);
}
