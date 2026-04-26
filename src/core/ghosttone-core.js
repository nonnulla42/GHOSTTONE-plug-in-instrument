import {
  assignHarmonicRole,
  generateRoleDriftEndCents,
  generateRoleMicroOffsetCents,
  pickMotionType,
  resolveDurationBeats,
  shouldCarryForward,
} from "./harmonic-roles.js";
import { buildInfiniteSections } from "./harmonic-infinite.js";

const noteMap = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const noteNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const colorProfiles = {
  warm: { bias: -1, stable: 0.65, color: 0.82, tension: 0.72, passing: 0.52 },
  dreamy: { bias: 1, stable: 0.72, color: 1.0, tension: 0.92, passing: 0.7 },
  dark: { bias: -1, stable: 0.72, color: 0.9, tension: 1.12, passing: 0.84 },
  alien: { bias: 1, stable: 0.9, color: 1.2, tension: 1.55, passing: 1.35 },
};

const roleIntensity = {
  stable: { range: [0, 14], chance: [0.08, 0.48] },
  color: { range: [4, 38], chance: [0.2, 0.78] },
  tension: { range: [8, 62], chance: [0.34, 0.92] },
  passing: { range: [6, 46], chance: [0.26, 0.86] },
};

export const defaultSettings = Object.freeze({
  generatorMode: "classic",
  harmonicMotion: "subtle",
  harmonicDistanceTarget: 1,
  harmonicDistanceFalloff: 1,
  mode: "pad",
  ghostAmount: 0.48,
  drift: 0.35,
  harmonyLock: 0.68,
  colorMode: "dreamy",
  stayMusical: true,
  ghostEnabled: true,
  voicingStyle: "open",
  voicingVariation: 0.35,
  voicingContinuity: 0.65,
  arpDirection: "up",
  arpFeel: "even",
  arpDensity: 0.5,
  arpVariation: 0.35,
  arpContinuity: 0.6,
});

export const defaultProgression = Object.freeze([
  { split: false, slots: [{ chord: "Am9", voicingSeed: 0, arpSeed: 0 }] },
  { split: false, slots: [{ chord: "Fmaj7", voicingSeed: 0, arpSeed: 0 }] },
  { split: false, slots: [{ chord: "Cadd9", voicingSeed: 0, arpSeed: 0 }] },
  { split: false, slots: [{ chord: "Gsus4", voicingSeed: 0, arpSeed: 0 }] },
]);

function makeRandom(seed) {
  let value = Math.trunc(seed) % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

function seedToInt(seed) {
  const value = Number(seed);
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1;
}

function slotSeedToInt(seed) {
  const value = Number(seed);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizeUnit(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, 0, 1);
}

function normalizeSettings(settings = {}) {
  const merged = { ...defaultSettings, ...settings };
  return {
    ...merged,
    generatorMode: ["classic", "roleBased", "infinite"].includes(merged.generatorMode) ? merged.generatorMode : defaultSettings.generatorMode,
    harmonicMotion: ["static", "subtle", "evolving", "restless"].includes(merged.harmonicMotion) ? merged.harmonicMotion : defaultSettings.harmonicMotion,
    harmonicDistanceTarget: normalizeDistanceTarget(merged.harmonicDistanceTarget, defaultSettings.harmonicDistanceTarget),
    harmonicDistanceFalloff: normalizeDistanceFalloff(merged.harmonicDistanceFalloff, defaultSettings.harmonicDistanceFalloff),
    mode: ["pad", "arp", "evolve"].includes(merged.mode) ? merged.mode : defaultSettings.mode,
    ghostAmount: normalizeUnit(merged.ghostAmount, defaultSettings.ghostAmount),
    drift: normalizeUnit(merged.drift, defaultSettings.drift),
    harmonyLock: normalizeUnit(merged.harmonyLock, defaultSettings.harmonyLock),
    colorMode: colorProfiles[merged.colorMode] ? merged.colorMode : defaultSettings.colorMode,
    stayMusical: Boolean(merged.stayMusical),
    ghostEnabled: Boolean(merged.ghostEnabled),
    voicingVariation: normalizeUnit(merged.voicingVariation, defaultSettings.voicingVariation),
    voicingContinuity: normalizeUnit(merged.voicingContinuity, defaultSettings.voicingContinuity),
    arpDensity: normalizeUnit(merged.arpDensity, defaultSettings.arpDensity),
    arpVariation: normalizeUnit(merged.arpVariation, defaultSettings.arpVariation),
    arpContinuity: normalizeUnit(merged.arpContinuity, defaultSettings.arpContinuity),
  };
}

function normalizeDistanceTarget(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return normalizePc(Math.trunc(number));
}

function normalizeDistanceFalloff(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, 0, 6);
}

function normalizeSlot(slot, fallbackChord = "C") {
  if (typeof slot === "string") {
    return { chord: slot, voicingSeed: 0, arpSeed: 0 };
  }

  return {
    chord: slot?.chord || slot?.label || fallbackChord,
    voicingSeed: slotSeedToInt(slot?.voicingSeed),
    arpSeed: slotSeedToInt(slot?.arpSeed),
  };
}

function normalizeProgression(progression = defaultProgression) {
  const source = Array.isArray(progression) && progression.length ? progression : defaultProgression;

  return source.map((bar, index) => {
    if (typeof bar === "string") {
      return { split: false, slots: [normalizeSlot(bar)] };
    }

    const slots = Array.isArray(bar?.slots) && bar.slots.length ? bar.slots : [bar?.chord || defaultProgression[index % defaultProgression.length].slots[0].chord];
    return {
      split: Boolean(bar?.split) && slots.length > 1,
      slots: slots.slice(0, 2).map((slot) => normalizeSlot(slot, defaultProgression[index % defaultProgression.length].slots[0].chord)),
    };
  });
}

export function parseChord(input) {
  const cleaned = String(input || "C").trim() || "C";
  const match = cleaned.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return parseChord("C");

  const rootName = match[1].toUpperCase() + match[2];
  const rootPc = noteMap[rootName] ?? 0;
  const suffix = match[3].toLowerCase();
  const isMinor = suffix.includes("min") || /^m(?!aj)/.test(suffix);
  const isSus2 = suffix.includes("sus2");
  const isSus4 = suffix.includes("sus");
  const isDim = suffix.includes("dim");
  const isAug = suffix.includes("aug") || suffix.includes("+");

  const intervals = [{ semis: 0, role: "stable", degree: "1" }];
  if (isSus2) {
    intervals.push({ semis: 2, role: "color", degree: "2" });
  } else if (isSus4) {
    intervals.push({ semis: 5, role: "tension", degree: "4" });
  } else {
    intervals.push({ semis: isMinor ? 3 : 4, role: "color", degree: "3" });
  }

  intervals.push({ semis: isDim ? 6 : isAug ? 8 : 7, role: "stable", degree: "5" });

  if (suffix.includes("maj7")) {
    intervals.push({ semis: 11, role: "tension", degree: "7" });
  } else if (suffix.includes("7")) {
    intervals.push({ semis: 10, role: "tension", degree: "b7" });
  }

  if (suffix.includes("6") || suffix.includes("13")) {
    intervals.push({ semis: 9, role: "color", degree: "6" });
  }
  if (suffix.includes("9") || suffix.includes("add9")) {
    intervals.push({ semis: 14, role: "tension", degree: "9" });
  }
  if (suffix.includes("11")) {
    intervals.push({ semis: 17, role: "tension", degree: "11" });
  }

  return {
    label: cleaned,
    rootPc,
    notes: intervals.map((item) => ({
      ...item,
      pc: normalizePc(rootPc + item.semis),
      midi: 48 + rootPc + item.semis,
      name: noteNames[normalizePc(rootPc + item.semis)],
    })),
  };
}

function rotateNotes(notes, amount) {
  if (!notes.length) return [];
  const shift = normalizePc(amount) % notes.length;
  return [...notes.slice(shift), ...notes.slice(0, shift)];
}

function octaveNear(midi, target) {
  let result = midi;
  while (result - target > 6) result -= 12;
  while (target - result > 6) result += 12;
  return result;
}

function normalizeAscending(notes) {
  let lastMidi = -Infinity;
  return notes.map((note) => {
    let midi = note.midi;
    while (midi <= lastMidi) midi += 12;
    lastMidi = midi;
    return { ...note, midi };
  });
}

function applyVoicing(notes, slotState, settings, previousNotes, sectionIndex, seed) {
  if (!notes.length) return [];
  const variation = settings.voicingVariation;
  const continuity = settings.voicingContinuity;
  const rand = makeRandom(seed + sectionIndex * 997 + (slotState.voicingSeed || 0) + 11);
  const organicShift = variation > 0.05 && rand() < variation * (1 - continuity) ? Math.floor(rand() * notes.length) : 0;
  const seededShift = slotState.voicingSeed ? Math.floor(rand() * notes.length * Math.max(1, variation * 2)) % notes.length : organicShift;
  const baseShift = settings.voicingStyle === "smooth" && previousNotes?.length ? 0 : seededShift;
  let voiced = normalizeAscending(rotateNotes(notes, baseShift));

  voiced = voiced.map((note, index) => {
    let midi = note.midi;
    if (settings.voicingStyle === "open" && index % 2 === 1) midi += 12;
    if (settings.voicingStyle === "spread") midi += Math.floor(index / 2) * 12;
    if (settings.voicingStyle === "low") midi -= index < 2 ? 12 : 0;
    if (settings.voicingStyle === "high") midi += 12;
    if (settings.voicingStyle === "smooth" && previousNotes?.[index]) {
      midi = octaveNear(midi, previousNotes[index].midi);
    }
    const variationChance = slotState.voicingSeed ? variation * 0.55 : variation * (1 - continuity) * 0.22;
    if (variation > 0.05 && rand() < variationChance) {
      midi += rand() > 0.5 ? 12 : -12;
    }
    return { ...note, midi };
  });

  if (previousNotes?.length && continuity > 0) {
    voiced = voiced.map((note, index) => {
      const previous = previousNotes[index % previousNotes.length];
      const closeMidi = octaveNear(note.midi, previous.midi);
      const closeDistance = Math.abs(closeMidi - previous.midi);
      const currentDistance = Math.abs(note.midi - previous.midi);
      return {
        ...note,
        midi: closeDistance < currentDistance && continuity > 0.18 ? closeMidi : note.midi,
      };
    });
  }

  voiced = normalizeAscending(voiced);
  if (settings.voicingStyle === "low") voiced = voiced.map((note) => ({ ...note, midi: note.midi - 12 }));
  if (settings.voicingStyle === "high") voiced = voiced.map((note) => ({ ...note, midi: note.midi + 12 }));
  return voiced;
}

function shuffleNotes(notes, seed, amount = 1) {
  if (!seed) return notes;
  const rand = makeRandom(seed);
  const shuffled = [...notes];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    if (rand() > amount) continue;
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function preserveUniqueArpNotes(order, sourceNotes) {
  const used = new Set();
  const unique = [];

  order.forEach((note) => {
    const key = normalizePc(note.pc ?? note.midi);
    if (used.has(key)) return;
    used.add(key);
    unique.push(note);
  });

  sourceNotes.forEach((note) => {
    const key = normalizePc(note.pc ?? note.midi);
    if (used.has(key)) return;
    used.add(key);
    unique.push(note);
  });

  return unique.slice(0, sourceNotes.length);
}

function buildArpOrder(notes, section, settings, previousSection, seed) {
  const ascending = [...notes].sort((a, b) => a.midi - b.midi);
  const descending = [...ascending].reverse();
  const middle = Math.floor((ascending.length - 1) / 2);
  const insideOut = [];
  const outsideIn = [];

  for (let offset = 0; offset <= ascending.length; offset += 1) {
    const left = middle - offset;
    const right = middle + 1 + offset;
    if (left >= 0) insideOut.push(ascending[left]);
    if (right < ascending.length) insideOut.push(ascending[right]);
  }

  for (let i = 0; i < Math.ceil(ascending.length / 2); i += 1) {
    if (ascending[i]) outsideIn.push(ascending[i]);
    if (ascending[ascending.length - 1 - i] && ascending.length - 1 - i !== i) {
      outsideIn.push(ascending[ascending.length - 1 - i]);
    }
  }

  const directionMap = {
    up: ascending,
    down: descending,
    updown: [...ascending, ...descending.slice(1, -1)],
    insideout: insideOut,
    outsidein: outsideIn,
    bounce: [...ascending, ascending[Math.max(0, ascending.length - 2)], ascending[1] || ascending[0]].filter(Boolean),
    free: shuffleNotes(ascending, seed + section.startBeat * 101 + (section.slotState.arpSeed || 0), 1),
  };

  let order = directionMap[settings.arpDirection] || ascending;
  if (previousSection && settings.arpContinuity > 0.55 && section.slotState.arpSeed === 0) {
    const previousOrder = buildArpOrder(previousSection.notes, previousSection, { ...settings, arpContinuity: 0 }, null, seed);
    order = previousOrder.map((previousNote, index) => {
      const target = order[index % order.length];
      return order.find((note) => note.degree === previousNote.degree) || target;
    });
    order = preserveUniqueArpNotes(order, ascending);
  }

  const organicSeed = seed + Math.round(section.startBeat * 191) + 23;
  const shuffleSeed = section.slotState.arpSeed || organicSeed;
  const shuffleAmount = section.slotState.arpSeed ? settings.arpVariation : settings.arpVariation * (1 - settings.arpContinuity) * 0.55;
  if (shuffleAmount > 0.02) {
    order = shuffleNotes(order, shuffleSeed, shuffleAmount);
  }

  return order.length ? order : ascending;
}

function getArpStepOffsets(sectionBeats, settings) {
  const densitySteps = Math.round(lerp(sectionBeats, sectionBeats * 4, settings.arpDensity));
  const steps = clamp(densitySteps, sectionBeats <= 2 ? 2 : 4, sectionBeats <= 2 ? 8 : 16);
  const stepSize = sectionBeats / steps;
  const offsets = [];

  for (let step = 0; step < steps; step += 1) {
    let offset = step * stepSize;
    if (settings.arpFeel === "flowing") offset += (step % 2) * stepSize * 0.18;
    if (settings.arpFeel === "syncopated" && step % 4 === 2) offset += stepSize * 0.45;
    if (settings.arpFeel === "broken" && step % 3 === 1) offset += stepSize * 0.32;
    if (settings.arpFeel === "pulsing" && step % 2 === 1) offset += stepSize * 0.08;
    offsets.push(clamp(offset, 0, sectionBeats - 0.05));
  }

  return offsets;
}

function getArpDuration(sectionBeats, offsets, index, settings) {
  const nextOffset = offsets[index + 1] ?? sectionBeats;
  const gap = Math.max(0.08, nextOffset - offsets[index]);
  const feelScale = {
    even: 0.78,
    flowing: 0.92,
    broken: 0.52,
    syncopated: 0.62,
    pulsing: index % 2 === 0 ? 0.86 : 0.46,
  };

  return Math.max(0.12, gap * (feelScale[settings.arpFeel] || 0.78));
}

export function buildSections(progression, settings, seed) {
  const sections = [];
  let previousNotes = null;

  progression.forEach((barState, barIndex) => {
    const slotCount = barState.split ? 2 : 1;
    const durationBeats = 4 / slotCount;

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const slotState = barState.slots[slotIndex] || barState.slots[0];
      const chord = parseChord(slotState.chord);
      const roleLabeledNotes = chord.notes.map((note) => ({
        ...note,
        harmonicRole: assignHarmonicRole(note),
      }));
      const sectionIndex = sections.length;
      const voicedNotes = applyVoicing(roleLabeledNotes, slotState, settings, previousNotes, sectionIndex, seed);

      sections.push({
        label: chord.label,
        rootPc: chord.rootPc,
        notes: voicedNotes,
        baseNotes: roleLabeledNotes,
        barIndex,
        slotIndex,
        startBeat: barIndex * 4 + slotIndex * durationBeats,
        durationBeats,
        slotState: { voicingSeed: slotState.voicingSeed, arpSeed: slotState.arpSeed },
      });
      previousNotes = voicedNotes;
    }
  });

  return sections;
}

function chooseOffset(role, currentNote, prevChord, nextChord, rand, settings) {
  if (!settings.ghostEnabled || settings.ghostAmount <= 0.01) return 0;

  const profile = colorProfiles[settings.colorMode];
  const cfg = roleIntensity[role] || roleIntensity.color;
  const amount = settings.ghostAmount;
  const chance = lerp(cfg.chance[0], cfg.chance[1], amount) * profile[role];

  if (rand() > chance) return 0;

  let maxRange = lerp(cfg.range[0], cfg.range[1], amount) * profile[role];
  const inNext = nextChord?.notes.some((note) => note.pc === currentNote.pc);
  const inPrev = prevChord?.notes.some((note) => note.pc === currentNote.pc);
  const lock = settings.harmonyLock;

  if (inNext) maxRange *= lerp(1.0, 0.45, lock);
  if (!inNext && role === "tension") maxRange *= lerp(1.0, 1.28, 1 - lock);
  if (inPrev && inNext) maxRange *= 0.78;
  if (settings.stayMusical && role === "stable") maxRange *= 0.65;
  if (settings.stayMusical && settings.colorMode === "alien") maxRange *= 0.82;

  const sign = rand() > 0.5 ? 1 : -1;
  const colorDirection = profile.bias * (role === "tension" ? 1 : 0.55);
  const randomShape = Math.pow(rand(), 0.68);
  return clamp((sign + colorDirection * 0.35) * maxRange * randomShape, -72, 72);
}

function pushEvent(events, note, sectionIndex, voiceId, startBeat, durationBeats, chord, details) {
  const role = details.role || note.role;
  const driftEnd = clamp(details.driftEnd, -80, 80);
  events.push({
    id: `${sectionIndex}:${voiceId}:${startBeat.toFixed(3)}:${events.length}`,
    sectionIndex,
    sectionLabel: chord.label,
    voiceId,
    noteName: note.name,
    midi: note.midi,
    startBeat,
    durationBeats,
    cents: details.cents,
    driftAmount: Math.abs(driftEnd - details.cents),
    driftEnd,
    role,
    degree: note.degree,
    motionType: details.motionType,
    carriedFromPrevious: Boolean(details.carriedFromPrevious),
    velocity: role === "anchor" || role === "stable" ? 0.58 : role === "tension" ? 0.42 : 0.5,
  });
}

function addClassicEvent(events, note, sectionIndex, voiceId, startBeat, durationBeats, rand, settings, prevChord, chord, nextChord) {
  const cents = chooseOffset(note.role, note, prevChord, nextChord, rand, settings);
  const driftWidth = settings.ghostEnabled ? settings.drift * (note.role === "stable" ? 8 : 18) : 0;
  const driftEnd = clamp(cents + (rand() - 0.5) * driftWidth, -80, 80);
  const motionType = settings.mode === "pad" ? "stay" : "step";

  pushEvent(events, note, sectionIndex, voiceId, startBeat, durationBeats, chord, {
    cents,
    driftEnd,
    motionType,
    carriedFromPrevious: false,
  });
}

function getRoleColorIntensity(role, settings) {
  const profile = colorProfiles[settings.colorMode];
  if (role === "anchor") return profile.stable;
  if (role === "tension") return profile.tension;
  return profile.color;
}

function pickClosestNote(notes, previousMidi) {
  return notes.reduce((best, candidate) => {
    const candidateMidi = octaveNear(candidate.midi, previousMidi);
    const candidateDistance = Math.abs(candidateMidi - previousMidi);
    if (!best || candidateDistance < best.distance) {
      return { note: { ...candidate, midi: candidateMidi }, distance: candidateDistance };
    }
    return best;
  }, null)?.note || notes[0];
}

function chooseMotionNote(notes, previousEvent, motionType, carriedFromPrevious) {
  if (!previousEvent) return notes[0];

  const previousPc = normalizePc(previousEvent.midi);
  const candidates = notes.map((candidate) => {
    let midi = octaveNear(candidate.midi, previousEvent.midi);
    let distance = Math.abs(midi - previousEvent.midi);

    if (motionType === "leap" && distance < 5) {
      const up = midi + 12;
      const down = midi - 12;
      midi = Math.abs(up - previousEvent.midi) >= Math.abs(down - previousEvent.midi) ? up : down;
      distance = Math.abs(midi - previousEvent.midi);
    }

    return {
      note: { ...candidate, midi },
      distance,
      samePc: candidate.pc === previousPc,
    };
  });

  if (carriedFromPrevious) {
    const carried = candidates.filter((candidate) => candidate.samePc).sort((left, right) => left.distance - right.distance)[0];
    if (carried) return carried.note;
  }

  if (motionType === "stay") {
    return candidates.sort((left, right) => left.distance - right.distance)[0]?.note || notes[0];
  }

  if (motionType === "step") {
    const steps = candidates.filter((candidate) => candidate.distance > 0 && candidate.distance <= 4).sort((left, right) => left.distance - right.distance);
    return (steps[0] || candidates.sort((left, right) => left.distance - right.distance)[0])?.note || notes[0];
  }

  const leaps = candidates.filter((candidate) => candidate.distance >= 5).sort((left, right) => left.distance - right.distance);
  return (leaps[0] || candidates.sort((left, right) => right.distance - left.distance)[0])?.note || notes[0];
}

const EVENT_SOFT_CEILING = 84;
const EVENT_HARD_CEILING = 92;
const EVENT_LOW_FLOOR = 36;
const EVENT_HIGH_MEMORY = 78;

function scoreAssignedEventMidi(midi, previousMidi, motionType) {
  const distance = Math.abs(midi - previousMidi);
  let score = distance;

  if (midi > EVENT_SOFT_CEILING) score += (midi - EVENT_SOFT_CEILING) * 2.4;
  if (midi > EVENT_HARD_CEILING) score += (midi - EVENT_HARD_CEILING) * 5.2;
  if (midi < EVENT_LOW_FLOOR) score += (EVENT_LOW_FLOOR - midi) * 1.2;

  if (previousMidi > EVENT_HIGH_MEMORY && midi > previousMidi) {
    score += (midi - previousMidi) * 2.2 + (previousMidi - EVENT_HIGH_MEMORY) * 0.55;
  }

  if (previousMidi > EVENT_SOFT_CEILING && midi >= EVENT_SOFT_CEILING) {
    score += 8;
  }

  if (previousMidi > EVENT_HIGH_MEMORY && midi < previousMidi) {
    score -= Math.min(5, (previousMidi - EVENT_HIGH_MEMORY) * 0.55);
  }

  if (motionType === "leap") {
    if (distance > 0 && distance < 5) score += previousMidi > EVENT_HIGH_MEMORY ? 4.5 : 2.5;
    if (distance > 12) score += (distance - 12) * 1.6;
  } else if (distance > 12) {
    score += (distance - 12) * 3;
  }

  return score;
}

function keepAssignedPitchClass(note, previousEvent, motionType) {
  if (!previousEvent) return note;

  const nearest = octaveNear(note.midi, previousEvent.midi);
  const candidates = [...new Set([nearest - 24, nearest - 12, nearest, nearest + 12, nearest + 24])];
  const midi = candidates
    .map((candidate) => ({
      midi: candidate,
      score: scoreAssignedEventMidi(candidate, previousEvent.midi, motionType),
    }))
    .sort((left, right) => left.score - right.score || Math.abs(left.midi - previousEvent.midi) - Math.abs(right.midi - previousEvent.midi))[0]?.midi ?? nearest;

  return {
    ...note,
    midi,
    pc: normalizePc(midi),
  };
}

function addRoleBasedEvent(events, note, sectionIndex, voiceId, startBeat, durationBeats, rand, settings, prevChord, chord, nextChord, details = {}) {
  const role = note.harmonicRole || assignHarmonicRole(note);
  const cents = generateRoleMicroOffsetCents(role, rand, {
    ghostEnabled: settings.ghostEnabled,
    ghostAmount: settings.ghostAmount,
    harmonyLock: settings.harmonyLock,
    stayMusical: settings.stayMusical,
    colorIntensity: getRoleColorIntensity(role, settings),
  });
  const driftEnd = generateRoleDriftEndCents(role, cents, rand, {
    ghostEnabled: settings.ghostEnabled,
    driftAmount: settings.drift,
    colorIntensity: getRoleColorIntensity(role, settings),
  });

  pushEvent(events, note, sectionIndex, voiceId, startBeat, durationBeats, chord, {
    role,
    cents,
    driftEnd,
    motionType: details.motionType || pickMotionType(role, rand),
    carriedFromPrevious: details.carriedFromPrevious,
  });
}

function generateClassicEvents(events, sections, settings, normalizedSeed) {
  const rand = makeRandom(normalizedSeed);

  sections.forEach((section, index) => {
    const prevChord = sections[(index - 1 + sections.length) % sections.length];
    const nextChord = sections[(index + 1) % sections.length];
    const baseBeat = section.startBeat;
    const sectionBeats = section.durationBeats;
    const notes = section.notes;

    if (settings.mode === "pad") {
      notes.slice(0, 5).forEach((note, voiceIndex) => {
        addClassicEvent(events, note, index, voiceIndex, baseBeat, Math.max(0.2, sectionBeats - 0.12), rand, settings, prevChord, section, nextChord);
      });
    }

    if (settings.mode === "arp") {
      const previousSection = sections[index - 1];
      const arpNotes = buildArpOrder(notes, section, settings, previousSection, normalizedSeed);
      const offsets = getArpStepOffsets(sectionBeats, settings);
      for (let step = 0; step < offsets.length; step += 1) {
        const note = arpNotes[step % arpNotes.length];
        const octave = settings.arpDirection === "down" ? 0 : step > offsets.length * 0.62 ? 12 : 0;
        const duration = getArpDuration(sectionBeats, offsets, step, settings);
        addClassicEvent(events, { ...note, midi: note.midi + octave }, index, step % arpNotes.length, baseBeat + offsets[step], duration, rand, settings, prevChord, section, nextChord);
      }
    }

    if (settings.mode === "evolve") {
      notes.slice(0, 4).forEach((note, voiceIndex) => {
        addClassicEvent(events, note, index, voiceIndex, baseBeat, Math.max(0.2, sectionBeats - 0.3), rand, settings, prevChord, section, nextChord);
      });
      const accents = sectionBeats <= 2 ? [0.75, 1.5] : [0.75, 1.5, 2.5, 3.25];
      accents.forEach((offset, step) => {
        const note = notes[(step + 1) % notes.length];
        addClassicEvent(events, { ...note, midi: note.midi + (step > 1 ? 12 : 0) }, index, (step + 1) % notes.length, baseBeat + offset, 0.52, rand, settings, prevChord, section, nextChord);
      });
    }
  });
}

function generateRoleBasedEvents(events, sections, settings, normalizedSeed) {
  const rand = makeRandom(normalizedSeed);
  const previousVoiceEvents = new Map();

  sections.forEach((section, index) => {
    const prevChord = sections[(index - 1 + sections.length) % sections.length];
    const nextChord = sections[(index + 1) % sections.length];
    const baseBeat = section.startBeat;
    const sectionBeats = section.durationBeats;
    const notes = section.notes.map((note) => ({
      ...note,
      harmonicRole: note.harmonicRole || assignHarmonicRole(note),
    }));

    if (settings.mode === "pad" || settings.mode === "evolve") {
      const sustainedCount = settings.mode === "pad" ? Math.min(5, notes.length) : Math.min(4, notes.length);
      for (let voiceIndex = 0; voiceIndex < sustainedCount; voiceIndex += 1) {
        const baseNote = notes[voiceIndex % notes.length];
        const previousEvent = previousVoiceEvents.get(voiceIndex) || null;
        const sharedWithPrevious = Boolean(prevChord?.notes.some((candidate) => candidate.pc === baseNote.pc));
        const sharedWithNext = Boolean(nextChord?.notes.some((candidate) => candidate.pc === baseNote.pc));
        const role = baseNote.harmonicRole;
        const motionType = pickMotionType(role, rand);
        const carriedFromPrevious = Boolean(previousEvent) && shouldCarryForward(role, rand, { sharedWithPrevious, sharedWithNext });
        const selected = settings.generatorMode === "infinite"
          ? keepAssignedPitchClass(baseNote, previousEvent, motionType)
          : previousEvent ? chooseMotionNote(notes, previousEvent, motionType, carriedFromPrevious) : baseNote;
        const durationBeats = resolveDurationBeats(role, settings.mode, rand, {
          sectionBeats,
          remainingBeats: sectionBeats,
        });

        addRoleBasedEvent(events, selected, index, voiceIndex, baseBeat, Math.min(sectionBeats, durationBeats), rand, settings, prevChord, section, nextChord, {
          motionType,
          carriedFromPrevious,
        });

        previousVoiceEvents.set(voiceIndex, {
          midi: selected.midi,
          role,
        });
      }
    }

    if (settings.mode === "arp") {
      const previousSection = sections[index - 1];
      const arpNotes = buildArpOrder(notes, section, settings, previousSection, normalizedSeed);
      const offsets = getArpStepOffsets(sectionBeats, settings);
      for (let step = 0; step < offsets.length; step += 1) {
        const note = arpNotes[step % arpNotes.length];
        const voiceId = note.voiceId ?? (step % arpNotes.length);
        const role = note.harmonicRole;
        const previousEvent = previousVoiceEvents.get(voiceId) || null;
        const sharedWithPrevious = Boolean(prevChord?.notes.some((candidate) => candidate.pc === note.pc));
        const sharedWithNext = Boolean(nextChord?.notes.some((candidate) => candidate.pc === note.pc));
        const motionType = pickMotionType(role, rand);
        const carriedFromPrevious = Boolean(previousEvent) && shouldCarryForward(role, rand, { sharedWithPrevious, sharedWithNext });
        const selected = settings.generatorMode === "infinite"
          ? keepAssignedPitchClass(note, previousEvent, motionType)
          : previousEvent ? chooseMotionNote(arpNotes, previousEvent, motionType, carriedFromPrevious) : note;
        const durationBeats = resolveDurationBeats(role, "arp", rand, {
          sectionBeats,
          remainingBeats: Math.max(0.25, sectionBeats - offsets[step]),
        });

        addRoleBasedEvent(events, selected, index, voiceId, baseBeat + offsets[step], durationBeats, rand, settings, prevChord, section, nextChord, {
          motionType,
          carriedFromPrevious,
        });

        previousVoiceEvents.set(voiceId, {
          midi: selected.midi,
          role,
        });
      }
    }

    if (settings.mode === "evolve") {
      const accents = sectionBeats <= 2 ? [0.75, 1.5] : [0.75, 1.5, 2.5, 3.25];
      accents.forEach((offset, step) => {
        if (offset >= sectionBeats) return;
        const accentSource = notes[(step + 1) % notes.length];
        const accentRole = accentSource.harmonicRole === "anchor" ? "color" : accentSource.harmonicRole;
        const motionType = pickMotionType(accentRole, rand);
        const accentNotes = notes.filter((note) => note.harmonicRole !== "anchor");
        const selected = pickClosestNote(accentNotes.length ? accentNotes : notes, accentSource.midi);
        addRoleBasedEvent(events, { ...selected, harmonicRole: accentRole, midi: selected.midi + (step > 1 ? 12 : 0) }, index, (step + 1) % notes.length, baseBeat + offset, 0.45, rand, settings, prevChord, section, nextChord, {
          motionType,
          carriedFromPrevious: false,
        });
      });
    }
  });
}

export function buildPatternEventsForSections(sections, settings = {}, seed = 1) {
  const normalizedSettings = normalizeSettings(settings);
  const normalizedSeed = seedToInt(seed);
  const events = [];

  if (normalizedSettings.generatorMode === "roleBased" || normalizedSettings.generatorMode === "infinite") {
    generateRoleBasedEvents(events, sections, normalizedSettings, normalizedSeed);
  } else {
    generateClassicEvents(events, sections, normalizedSettings, normalizedSeed);
  }

  return events.sort((a, b) => a.startBeat - b.startBeat);
}

export function generatePattern(settings = {}, progression = defaultProgression, seed = 1) {
  const normalizedSettings = normalizeSettings(settings);
  const normalizedProgression = normalizeProgression(progression);
  const normalizedSeed = seedToInt(seed);
  const templateSections = buildSections(normalizedProgression, normalizedSettings, normalizedSeed);
  let sections = templateSections;

  if (normalizedSettings.generatorMode === "infinite") {
    sections = buildInfiniteSections(sections, normalizedSettings, normalizedSeed, makeRandom);
  }
  const events = buildPatternEventsForSections(sections, normalizedSettings, normalizedSeed);
  const templateLoopBeats = normalizedProgression.length * 4;

  return {
    seed: normalizedSeed,
    settings: normalizedSettings,
    generatorMode: normalizedSettings.generatorMode,
    progression: normalizedProgression,
    loopBeats: sections.reduce((max, section) => Math.max(max, section.startBeat + section.durationBeats), templateLoopBeats),
    templateLoopBeats,
    templateSections,
    sections,
    events,
  };
}
