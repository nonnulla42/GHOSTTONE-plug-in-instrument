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

function getSourcePitchClassWeights(section, previousSection, settings = {}) {
  const harmonicMotion = clamp(Number(settings.harmonicMotion) || 0, 0, 1);
  const scaleInfluence = clamp(Number(settings.scaleInfluence) || 0, 0, 1);
  const chordPcs = getCurrentChordPitchClasses(section);
  const previousChordPcs = getCurrentChordPitchClasses(previousSection);
  const globalScale = settings.scaleName && settings.scaleName !== "none" && settings.globalRoot != null && settings.globalRoot !== "none"
    ? buildScaleNotes(settings.scaleName, Number(settings.globalRoot))
    : null;
  const localScale = settings.localScaleType && settings.localScaleType !== "chromatic"
    ? buildScaleNotes(settings.localScaleType, getLocalRoot(previousSection ?? section))
    : null;
  const entries = new Map();

  function push(pc, weight, source) {
    const key = normalizePc(pc);
    const existing = entries.get(key) || { pc: key, weight: 0, sources: new Set() };
    existing.weight += weight;
    existing.sources.add(source);
    entries.set(key, existing);
  }

  chordPcs.forEach((pc) => push(pc, 2.4 + harmonicMotion * 0.4, "chord"));
  previousChordPcs.forEach((pc) => push(pc, 0.55 + harmonicMotion * 0.15, "previous"));
  (globalScale || []).forEach((pc) => push(pc, 0.8 + scaleInfluence * 1.9, "global"));
  (localScale || []).forEach((pc) => push(pc, 0.7 + (1 - harmonicMotion) * 1.8, "local"));

  if (!entries.size) {
    chordPcs.forEach((pc) => push(pc, 1, "chord"));
  }

  return [...entries.values()].map((entry) => {
    let weight = entry.weight;
    if (entry.sources.has("global") && entry.sources.has("local")) weight += 0.85;
    if (entry.sources.has("chord") && entry.sources.has("local")) weight += 0.45;
    if (entry.sources.has("chord") && entry.sources.has("global")) weight += 0.3;
    return {
      pc: entry.pc,
      weight,
      sources: [...entry.sources],
    };
  });
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

  for (let index = 0; index < noteCount; index += 1) {
    let offset = step * index;
    if (feel === "flowing" && index % 2 === 1) offset += step * 0.18;
    if (feel === "syncopated" && index % 2 === 1) offset += step * 0.28;
    if (feel === "broken" && index % 3 === 1) offset += step * 0.22;
    if (feel === "pulsing" && index % 2 === 1) offset += step * 0.08;
    offsets.push(clamp(offset, 0, Math.max(0, sectionBeats - 0.08)));
  }

  return offsets;
}

function getPhraseDuration(sectionBeats, offsets, index, feel = "even") {
  const current = offsets[index];
  const next = offsets[index + 1] ?? sectionBeats;
  const gap = Math.max(0.15, next - current);
  const scale = {
    even: 0.72,
    flowing: 0.86,
    broken: 0.56,
    syncopated: 0.62,
    pulsing: index % 2 === 0 ? 0.9 : 0.52,
  }[feel] || 0.72;

  return Math.max(0.12, gap * scale);
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
          sources: source.sources,
        },
        weight: scorePhraseCandidate(source, candidateMidi, sectionState, settings),
      });
    });
  });

  const selected = weightedChoice(candidates, random) || {
    midi: registerCenter,
    pc: normalizePc(registerCenter),
    sources: ["fallback"],
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
      const durationBeats = getPhraseDuration(section.durationBeats, offsets, stepIndex, settings.arpFeel);
      events.push(buildPhraseEvent(note, section, sectionIndex, startBeat, durationBeats, stepIndex, random, settings));
    }
  });

  return events.sort((left, right) => left.startBeat - right.startBeat);
}
