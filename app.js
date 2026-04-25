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

const state = {
  mode: "pad",
  sound: "pad",
  view: "magic",
  seed: Math.floor(Math.random() * 100000),
  events: [],
  chords: [],
  sections: [],
  barStates: Array.from({ length: 4 }, () => ({
    split: false,
    slots: [
      { voicingSeed: 0, arpSeed: 0 },
      { voicingSeed: 0, arpSeed: 0 },
    ],
  })),
  isPlaying: false,
  loopTimer: null,
  loopStart: 0,
  restartToken: 0,
  raf: null,
  currentSectionIndex: 0,
};

let audio = null;

const els = {
  playButton: document.querySelector("#playButton"),
  generateButton: document.querySelector("#generateButton"),
  exportButton: document.querySelector("#exportButton"),
  bpm: document.querySelector("#bpm"),
  chordInputs: [...document.querySelectorAll(".chord-input")],
  splitButtons: [...document.querySelectorAll(".split-button")],
  voiceButtons: [...document.querySelectorAll(".voice-button")],
  arpButtons: [...document.querySelectorAll(".arp-button")],
  ghostAmount: document.querySelector("#ghostAmount"),
  drift: document.querySelector("#drift"),
  harmonyLock: document.querySelector("#harmonyLock"),
  colorMode: document.querySelector("#colorMode"),
  stayMusical: document.querySelector("#stayMusical"),
  ghostEnabled: document.querySelector("#ghostEnabled"),
  voicingStyle: document.querySelector("#voicingStyle"),
  voicingVariation: document.querySelector("#voicingVariation"),
  voicingContinuity: document.querySelector("#voicingContinuity"),
  arpDirection: document.querySelector("#arpDirection"),
  arpFeel: document.querySelector("#arpFeel"),
  arpDensity: document.querySelector("#arpDensity"),
  arpVariation: document.querySelector("#arpVariation"),
  arpContinuity: document.querySelector("#arpContinuity"),
  waveform: document.querySelector("#waveform"),
  cutoff: document.querySelector("#cutoff"),
  attack: document.querySelector("#attack"),
  release: document.querySelector("#release"),
  space: document.querySelector("#space"),
  gridView: document.querySelector("#gridView"),
  currentChord: document.querySelector("#currentChord"),
  rangeReadout: document.querySelector("#rangeReadout"),
  eventReadout: document.querySelector("#eventReadout"),
  patternTitle: document.querySelector("#patternTitle"),
  ghostValue: document.querySelector("#ghostValue"),
  driftValue: document.querySelector("#driftValue"),
  lockValue: document.querySelector("#lockValue"),
  cutoffValue: document.querySelector("#cutoffValue"),
  attackValue: document.querySelector("#attackValue"),
  releaseValue: document.querySelector("#releaseValue"),
  spaceValue: document.querySelector("#spaceValue"),
  voicingVariationValue: document.querySelector("#voicingVariationValue"),
  voicingContinuityValue: document.querySelector("#voicingContinuityValue"),
  arpDensityValue: document.querySelector("#arpDensityValue"),
  arpVariationValue: document.querySelector("#arpVariationValue"),
  arpContinuityValue: document.querySelector("#arpContinuityValue"),
};

function makeRandom(seed) {
  let value = seed % 2147483647;
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

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

function normalizePc(pc) {
  return ((pc % 12) + 12) % 12;
}

function parseChord(input) {
  const cleaned = input.trim() || "C";
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

function getSlotState(barIndex, slotIndex) {
  return state.barStates[barIndex].slots[slotIndex];
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

function applyVoicing(notes, slotState, settings, previousNotes, sectionIndex) {
  if (!notes.length) return [];
  const variation = settings.voicingVariation;
  const continuity = settings.voicingContinuity;
  const rand = makeRandom(state.seed + sectionIndex * 997 + (slotState.voicingSeed || 0) + 11);
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
      const shouldUseCloseOctave = closeDistance < currentDistance && continuity > 0.18;
      return {
        ...note,
        // Preserve pitch class: voice leading may change octave, not the chord tone.
        midi: shouldUseCloseOctave ? closeMidi : note.midi,
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

function buildArpOrder(notes, section, settings, previousSection) {
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
    free: shuffleNotes(ascending, state.seed + section.startBeat * 101 + (section.slotState.arpSeed || 0), 1),
  };

  let order = directionMap[settings.arpDirection] || ascending;
  if (previousSection && settings.arpContinuity > 0.55 && section.slotState.arpSeed === 0) {
    const previousOrder = buildArpOrder(previousSection.notes, previousSection, { ...settings, arpContinuity: 0 }, null);
    order = previousOrder.map((previousNote, index) => {
      const target = order[index % order.length];
      return order.find((note) => note.degree === previousNote.degree) || target;
    });
  }

  const organicSeed = state.seed + Math.round(section.startBeat * 191) + 23;
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

function readSections() {
  const sections = [];
  const settings = readSettings();
  let previousNotes = null;

  state.barStates.forEach((barState, barIndex) => {
    const slotCount = barState.split ? 2 : 1;
    const durationBeats = 4 / slotCount;

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const input = document.querySelector(`.chord-input[data-bar="${barIndex}"][data-slot="${slotIndex}"]`);
      const chord = parseChord(input?.value || "C");
      const slotState = getSlotState(barIndex, slotIndex);
      const sectionIndex = sections.length;
      const voicedNotes = applyVoicing(chord.notes, slotState, settings, previousNotes, sectionIndex);

      sections.push({
        ...chord,
        notes: voicedNotes,
        baseNotes: chord.notes,
        barIndex,
        slotIndex,
        startBeat: barIndex * 4 + slotIndex * durationBeats,
        durationBeats,
        slotState,
      });
      previousNotes = voicedNotes;
    }
  });

  return sections;
}

function refreshProgressionUi() {
  state.barStates.forEach((barState, barIndex) => {
    const card = document.querySelector(`.bar-card[data-bar="${barIndex}"]`);
    const variation = document.querySelector(`.variation-slot[data-bar="${barIndex}"]`);
    const splitButton = document.querySelector(`.split-button[data-bar="${barIndex}"]`);

    card?.classList.toggle("is-split", barState.split);
    if (variation) variation.hidden = !barState.split;
    if (splitButton) {
      splitButton.classList.toggle("active", barState.split);
      splitButton.textContent = barState.split ? "Unsplit" : "Split";
    }

    barState.slots.forEach((slotState, slotIndex) => {
      const voiceButton = document.querySelector(`.voice-button[data-bar="${barIndex}"][data-slot="${slotIndex}"]`);
      const arpButton = document.querySelector(`.arp-button[data-bar="${barIndex}"][data-slot="${slotIndex}"]`);
      voiceButton?.classList.toggle("active", Boolean(slotState.voicingSeed));
      arpButton?.classList.toggle("active", Boolean(slotState.arpSeed));
    });
  });
}

function readSettings() {
  return {
    bpm: clamp(Number(els.bpm.value) || 92, 40, 180),
    ghostAmount: Number(els.ghostAmount.value) / 100,
    drift: Number(els.drift.value) / 100,
    harmonyLock: Number(els.harmonyLock.value) / 100,
    colorMode: els.colorMode.value,
    stayMusical: els.stayMusical.checked,
    ghostEnabled: els.ghostEnabled.checked,
    voicingStyle: els.voicingStyle.value,
    voicingVariation: Number(els.voicingVariation.value) / 100,
    voicingContinuity: Number(els.voicingContinuity.value) / 100,
    arpDirection: els.arpDirection.value,
    arpFeel: els.arpFeel.value,
    arpDensity: Number(els.arpDensity.value) / 100,
    arpVariation: Number(els.arpVariation.value) / 100,
    arpContinuity: Number(els.arpContinuity.value) / 100,
    waveform: els.waveform.value,
    cutoff: Number(els.cutoff.value),
    attack: Number(els.attack.value),
    release: Number(els.release.value),
    space: Number(els.space.value) / 100,
  };
}

function chooseOffset(role, currentNote, chord, prevChord, nextChord, rand, settings) {
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

function addEvent(events, note, sectionIndex, voiceId, time, duration, rand, settings, prevChord, chord, nextChord) {
  const cents = chooseOffset(note.role, note, chord, prevChord, nextChord, rand, settings);
  const driftWidth = settings.ghostEnabled ? settings.drift * (note.role === "stable" ? 8 : 18) : 0;
  const driftEnd = clamp(cents + (rand() - 0.5) * driftWidth, -80, 80);
  events.push({
    id: `${sectionIndex}:${voiceId}:${time.toFixed(3)}:${events.length}`,
    time,
    duration,
    midi: note.midi,
    cents,
    driftEnd,
    driftAmount: Math.abs(driftEnd - cents),
    role: note.role,
    degree: note.degree,
    name: note.name,
    sectionIndex,
    voiceId,
    sectionLabel: chord.label,
    velocity: note.role === "stable" ? 0.58 : note.role === "tension" ? 0.42 : 0.5,
  });
}

function generatePattern() {
  const settings = readSettings();
  const rand = makeRandom(state.seed);
  const sections = readSections();
  const events = [];

  sections.forEach((section, index) => {
    const prevChord = sections[(index - 1 + sections.length) % sections.length];
    const nextChord = sections[(index + 1) % sections.length];
    const baseTime = section.startBeat;
    const sectionBeats = section.durationBeats;
    const notes = section.notes;

    if (state.mode === "pad") {
      notes.slice(0, 5).forEach((note, voiceIndex) => {
        addEvent(events, note, index, voiceIndex, baseTime, Math.max(0.2, sectionBeats - 0.12), rand, settings, prevChord, section, nextChord);
      });
    }

    if (state.mode === "arp") {
      const previousSection = sections[index - 1];
      const arpNotes = buildArpOrder(notes, section, settings, previousSection);
      const offsets = getArpStepOffsets(sectionBeats, settings);
      for (let step = 0; step < offsets.length; step += 1) {
        const note = arpNotes[step % arpNotes.length];
        const octave = settings.arpDirection === "down" ? 0 : step > offsets.length * 0.62 ? 12 : 0;
        const duration = getArpDuration(sectionBeats, offsets, step, settings);
        addEvent(events, { ...note, midi: note.midi + octave }, index, step % arpNotes.length, baseTime + offsets[step], duration, rand, settings, prevChord, section, nextChord);
      }
    }

    if (state.mode === "evolve") {
      notes.slice(0, 4).forEach((note, voiceIndex) => {
        addEvent(events, note, index, voiceIndex, baseTime, Math.max(0.2, sectionBeats - 0.3), rand, settings, prevChord, section, nextChord);
      });
      const accents = sectionBeats <= 2 ? [0.75, 1.5] : [0.75, 1.5, 2.5, 3.25];
      accents.forEach((offset, step) => {
        const note = notes[(step + 1) % notes.length];
        addEvent(events, { ...note, midi: note.midi + (step > 1 ? 12 : 0) }, index, (step + 1) % notes.length, baseTime + offset, 0.52, rand, settings, prevChord, section, nextChord);
      });
    }
  });

  state.sections = sections;
  state.chords = sections;
  if (state.currentSectionIndex >= sections.length) state.currentSectionIndex = 0;
  state.events = events.sort((a, b) => a.time - b.time);
  updateReadouts();
  renderGrid();
}

function setupAudio() {
  if (audio) return audio;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const delay = ctx.createDelay(1.2);
  const feedback = ctx.createGain();
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();

  master.gain.value = 0.78;
  filter.type = "lowpass";
  delay.delayTime.value = 0.18;
  feedback.gain.value = 0.22;
  wet.gain.value = 0.22;
  dry.gain.value = 0.86;

  filter.connect(dry);
  filter.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  dry.connect(compressor);
  wet.connect(compressor);
  compressor.connect(master);
  master.connect(ctx.destination);

  audio = { ctx, filter, wet, dry, delay, feedback };
  return audio;
}

function playVoice(event, when, durationSeconds, settings) {
  const { ctx, filter, wet, dry, feedback } = setupAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const detune = settings.ghostEnabled ? event.cents : 0;
  const endDetune = settings.ghostEnabled ? event.driftEnd : 0;
  const startFreq = midiToFreq(event.midi) * centsToRatio(detune);
  const endFreq = midiToFreq(event.midi) * centsToRatio(endDetune);
  const attack = Math.min(settings.attack, durationSeconds * 0.42);
  const release = Math.min(settings.release, durationSeconds * 0.75);
  const peak = event.velocity * (state.sound === "pluck" ? 0.22 : 0.16);

  osc.type = settings.waveform;
  osc.frequency.setValueAtTime(startFreq, when);
  if (durationSeconds > 0.45) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), when + durationSeconds);
  }

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.setValueAtTime(peak * 0.78, Math.max(when + attack, when + durationSeconds - release));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + durationSeconds + release);

  filter.frequency.setTargetAtTime(settings.cutoff, when, 0.02);
  filter.Q.setTargetAtTime(state.sound === "pluck" ? 1.2 : 0.72, when, 0.02);
  wet.gain.setTargetAtTime(settings.space * 0.42, when, 0.04);
  dry.gain.setTargetAtTime(0.9 - settings.space * 0.22, when, 0.04);
  feedback.gain.setTargetAtTime(0.14 + settings.space * 0.22, when, 0.04);

  osc.connect(gain);
  gain.connect(filter);
  osc.start(when);
  osc.stop(when + durationSeconds + release + 0.05);
}

function scheduleLoop() {
  const { ctx } = setupAudio();
  const settings = readSettings();
  const secondsPerBeat = 60 / settings.bpm;
  const loopBeats = 16;
  const loopSeconds = loopBeats * secondsPerBeat;
  const start = ctx.currentTime + 0.08;
  state.loopStart = start;

  state.events.forEach((event) => {
    playVoice(event, start + event.time * secondsPerBeat, event.duration * secondsPerBeat, settings);
  });

  clearTimeout(state.loopTimer);
  state.loopTimer = setTimeout(() => {
    if (state.isPlaying) scheduleLoop();
  }, loopSeconds * 1000);
}

async function restartPlaybackSchedule() {
  if (!state.isPlaying) return;

  const token = ++state.restartToken;
  clearTimeout(state.loopTimer);
  const previousAudio = audio;
  audio = null;
  previousAudio?.ctx.close().catch(() => {});

  const { ctx } = setupAudio();
  if (ctx.state === "suspended") await ctx.resume();
  if (!state.isPlaying || token !== state.restartToken) return;
  scheduleLoop();
}

async function togglePlay() {
  if (!state.isPlaying) {
    generatePattern();
    const { ctx } = setupAudio();
    if (ctx.state === "suspended") await ctx.resume();
    state.isPlaying = true;
    els.playButton.textContent = "Stop";
    scheduleLoop();
    animate();
    return;
  }

  state.isPlaying = false;
  state.restartToken += 1;
  els.playButton.textContent = "Play";
  clearTimeout(state.loopTimer);
  audio?.ctx.close();
  audio = null;
}

function updateReadouts() {
  const settings = readSettings();
  const maxOffset = state.events.reduce((max, event) => Math.max(max, Math.abs(event.cents)), 0);
  els.ghostValue.textContent = Math.round(settings.ghostAmount * 100);
  els.driftValue.textContent = Math.round(settings.drift * 100);
  els.lockValue.textContent = Math.round(settings.harmonyLock * 100);
  els.cutoffValue.textContent = String(settings.cutoff);
  els.attackValue.textContent = settings.attack.toFixed(2);
  els.releaseValue.textContent = settings.release.toFixed(2);
  els.spaceValue.textContent = Math.round(settings.space * 100);
  els.voicingVariationValue.textContent = Math.round(settings.voicingVariation * 100);
  els.voicingContinuityValue.textContent = Math.round(settings.voicingContinuity * 100);
  els.arpDensityValue.textContent = Math.round(settings.arpDensity * 100);
  els.arpVariationValue.textContent = Math.round(settings.arpVariation * 100);
  els.arpContinuityValue.textContent = Math.round(settings.arpContinuity * 100);
  els.rangeReadout.textContent = `+/-${Math.round(maxOffset)} cents`;
  els.eventReadout.textContent = String(state.events.length);
  els.currentChord.textContent = state.sections[state.currentSectionIndex]?.label || "-";
  els.patternTitle.textContent = `${capitalize(settings.colorMode)} ${state.mode} at ${settings.bpm} BPM`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderGrid() {
  const grid = els.gridView;
  grid.innerHTML = "";
  const minMidi = state.events.length ? Math.max(36, Math.min(...state.events.map((event) => event.midi)) - 3) : 45;
  const maxMidi = state.events.length ? Math.min(96, Math.max(...state.events.map((event) => event.midi)) + 3) : 84;
  const midiSpan = Math.max(12, maxMidi - minMidi);
  const laneCount = midiSpan + 1;

  grid.style.setProperty("--lane-count", laneCount);

  const lineLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  lineLayer.classList.add("connection-layer");
  lineLayer.setAttribute("viewBox", "0 0 100 100");
  lineLayer.setAttribute("preserveAspectRatio", "none");

  const sectionLayer = document.createElement("div");
  sectionLayer.className = "section-layer";

  const beatLayer = document.createElement("div");
  beatLayer.className = "beat-layer";

  const playhead = document.createElement("div");
  playhead.id = "gridPlayhead";
  playhead.className = "grid-playhead";

  for (let beat = 0; beat <= 16; beat += 1) {
    const marker = document.createElement("div");
    marker.className = beat % 4 === 0 ? "beat-marker strong" : "beat-marker";
    marker.style.left = `${(beat / 16) * 100}%`;
    beatLayer.appendChild(marker);
  }

  state.sections.forEach((section, index) => {
    const band = document.createElement("div");
    band.className = `section-band ${index === state.currentSectionIndex ? "active" : ""}`;
    band.style.left = `${(section.startBeat / 16) * 100}%`;
    band.style.width = `${(section.durationBeats / 16) * 100}%`;
    band.textContent = section.label;
    sectionLayer.appendChild(band);
  });

  const eventPosition = (event, useEnd = false) => ({
    x: ((event.time + (useEnd ? event.duration : 0)) / 16) * 100,
    y: 8 + (1 - (event.midi - minMidi) / midiSpan) * 84,
  });

  const chains = new Map();
  state.events.forEach((event) => {
    if (!chains.has(event.voiceId)) chains.set(event.voiceId, []);
    chains.get(event.voiceId).push(event);
  });

  chains.forEach((events) => {
    events
      .sort((a, b) => a.time - b.time)
      .forEach((event, index) => {
        const next = events[index + 1];
        if (!next) return;

        const start = eventPosition(event, true);
        const end = eventPosition(next);
        const controlX = (start.x + end.x) / 2;
        const driftShape = clamp((event.driftAmount + next.driftAmount) / 28, 0, 1);
        const curve = (end.y - start.y) * 0.18 + (driftShape - 0.5) * 7;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const hue = 170 + clamp((event.cents + next.cents) / 2, -60, 60) * 1.6;

        path.setAttribute("d", `M ${start.x} ${start.y} C ${controlX} ${start.y + curve}, ${controlX} ${end.y - curve}, ${end.x} ${end.y}`);
        path.setAttribute("stroke", `hsla(${hue}, 62%, 68%, ${0.28 + driftShape * 0.2})`);
        path.setAttribute("stroke-width", String(0.28 + driftShape * 0.34));
        path.setAttribute("fill", "none");
        if (event.driftAmount > 6 || next.driftAmount > 6) path.setAttribute("stroke-dasharray", "3 2");
        lineLayer.appendChild(path);
      });
  });

  grid.append(sectionLayer, beatLayer, lineLayer);

  state.events.forEach((event) => {
    const block = document.createElement("div");
    const left = (event.time / 16) * 100;
    const width = Math.max(2.6, (event.duration / 16) * 100);
    const top = 8 + (1 - (event.midi - minMidi) / midiSpan) * 84;
    const hue = 170 + clamp(event.cents, -60, 60) * 1.6;
    const driftText = event.driftAmount >= 1 ? ` -> ${Math.round(event.driftEnd)}` : "";
    const roleClass = `role-${event.role}`;

    block.className = `note-block ${roleClass}`;
    block.style.left = `${left}%`;
    block.style.width = `${width}%`;
    block.style.top = `${clamp(top, 8, 92)}%`;
    block.style.background = `hsl(${hue}, 68%, 68%)`;
    block.style.setProperty("--drift", Math.min(1, event.driftAmount / 18).toFixed(2));
    block.title = `${event.sectionLabel} | ${event.name}${event.degree} | ${event.role} | cents ${Math.round(event.cents)}${driftText}`;
    block.textContent = `${event.name} ${Math.round(event.cents)}`;
    grid.appendChild(block);
  });

  grid.appendChild(playhead);
  updateGridPlayhead();
}

function updateGridPlayhead() {
  const playhead = document.querySelector("#gridPlayhead");
  if (!playhead || !state.isPlaying || !audio) {
    if (playhead) playhead.hidden = true;
    return;
  }

  const settings = readSettings();
  const elapsed = (audio.ctx.currentTime - state.loopStart) % ((60 / settings.bpm) * 16);
  const beat = elapsed / (60 / settings.bpm);
  const sectionIndex = state.sections.findIndex((section) => beat >= section.startBeat && beat < section.startBeat + section.durationBeats);
  const nextSectionIndex = sectionIndex >= 0 ? sectionIndex : 0;

  playhead.hidden = false;
  playhead.style.left = `${(beat / 16) * 100}%`;

  if (nextSectionIndex !== state.currentSectionIndex) {
    state.currentSectionIndex = nextSectionIndex;
    renderGrid();
  }
}

function animate() {
  updateGridPlayhead();
  updateReadouts();
  if (state.isPlaying) {
    state.raf = requestAnimationFrame(animate);
  } else if (state.raf) {
    cancelAnimationFrame(state.raf);
  }
}

function applySoundPreset(sound) {
  state.sound = sound;
  document.querySelectorAll(".sound-segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.sound === sound);
  });

  if (sound === "pad") {
    els.waveform.value = "triangle";
    els.cutoff.value = 1800;
    els.attack.value = 0.28;
    els.release.value = 0.7;
    els.space.value = 28;
  } else {
    els.waveform.value = "square";
    els.cutoff.value = 3200;
    els.attack.value = 0.03;
    els.release.value = 0.22;
    els.space.value = 18;
  }
  updateReadouts();
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  refreshProgressionUi();
  generatePattern();
}

function toggleSplit(barIndex) {
  const barState = state.barStates[barIndex];
  barState.split = !barState.split;
  refreshProgressionUi();
  generatePattern();
}

function randomizeVoicing(barIndex, slotIndex) {
  const slotState = getSlotState(barIndex, slotIndex);
  slotState.voicingSeed = Math.floor(Math.random() * 100000) + 1;
  refreshProgressionUi();
  generatePattern();
}

function randomizeArp(barIndex, slotIndex) {
  const slotState = getSlotState(barIndex, slotIndex);
  slotState.arpSeed = Math.floor(Math.random() * 100000) + 1;
  refreshProgressionUi();
  generatePattern();
}

function encodeVarLen(value) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

function writeText(text) {
  return [...text].map((char) => char.charCodeAt(0));
}

function int32(value) {
  return [(value >> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function int16(value) {
  return [(value >> 8) & 255, value & 255];
}

function exportMidi() {
  generatePattern();
  const settings = readSettings();
  const ticksPerBeat = 480;
  const midiEvents = [];
  const channelCount = 15;

  for (let channel = 0; channel < channelCount; channel += 1) {
    midiEvents.push({ tick: 0, data: [0xb0 + channel, 101, 0] });
    midiEvents.push({ tick: 0, data: [0xb0 + channel, 100, 0] });
    midiEvents.push({ tick: 0, data: [0xb0 + channel, 6, 2] });
    midiEvents.push({ tick: 0, data: [0xc0 + channel, state.sound === "pluck" ? 11 : 88] });
  }

  const microsecondsPerBeat = Math.round(60000000 / settings.bpm);
  midiEvents.push({
    tick: 0,
    data: [
      0xff,
      0x51,
      0x03,
      (microsecondsPerBeat >> 16) & 255,
      (microsecondsPerBeat >> 8) & 255,
      microsecondsPerBeat & 255,
    ],
  });

  state.events.forEach((event, index) => {
    const channel = index % channelCount;
    const startTick = Math.round(event.time * ticksPerBeat);
    const endTick = Math.round((event.time + event.duration) * ticksPerBeat);
    const bend = clamp(Math.round(8192 + (event.cents / 200) * 8192), 0, 16383);
    const lsb = bend & 0x7f;
    const msb = (bend >> 7) & 0x7f;
    const note = clamp(Math.round(event.midi), 0, 127);
    const velocity = clamp(Math.round(event.velocity * 112), 1, 127);

    midiEvents.push({ tick: startTick, data: [0xe0 + channel, lsb, msb] });
    midiEvents.push({ tick: startTick, data: [0x90 + channel, note, velocity] });
    midiEvents.push({ tick: endTick, data: [0x80 + channel, note, 0] });
    midiEvents.push({ tick: endTick + 1, data: [0xe0 + channel, 0, 64] });
  });

  midiEvents.push({ tick: 16 * ticksPerBeat, data: [0xff, 0x2f, 0x00] });
  midiEvents.sort((a, b) => a.tick - b.tick);

  let lastTick = 0;
  const trackData = [];
  midiEvents.forEach((event) => {
    trackData.push(...encodeVarLen(event.tick - lastTick), ...event.data);
    lastTick = event.tick;
  });

  const header = [...writeText("MThd"), ...int32(6), ...int16(0), ...int16(1), ...int16(ticksPerBeat)];
  const track = [...writeText("MTrk"), ...int32(trackData.length), ...trackData];
  const bytes = new Uint8Array([...header, ...track]);
  const blob = new Blob([bytes], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ghosttone-pattern.mid";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  els.playButton.addEventListener("click", togglePlay);
  els.generateButton.addEventListener("click", () => {
    state.seed = Math.floor(Math.random() * 100000);
    generatePattern();
  });
  els.exportButton.addEventListener("click", exportMidi);
  els.bpm.addEventListener("input", () => {
    updateReadouts();
    restartPlaybackSchedule();
  });
  els.bpm.addEventListener("change", () => {
    els.bpm.value = readSettings().bpm;
    updateReadouts();
    restartPlaybackSchedule();
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  els.splitButtons.forEach((button) => {
    button.addEventListener("click", () => toggleSplit(Number(button.dataset.bar)));
  });
  els.voiceButtons.forEach((button) => {
    button.addEventListener("click", () => randomizeVoicing(Number(button.dataset.bar), Number(button.dataset.slot)));
  });
  els.arpButtons.forEach((button) => {
    button.addEventListener("click", () => randomizeArp(Number(button.dataset.bar), Number(button.dataset.slot)));
  });
  document.querySelectorAll(".sound-segment").forEach((button) => {
    button.addEventListener("click", () => applySoundPreset(button.dataset.sound));
  });
  [
    els.ghostAmount,
    els.drift,
    els.harmonyLock,
    els.colorMode,
    els.stayMusical,
    els.ghostEnabled,
    els.voicingStyle,
    els.voicingVariation,
    els.voicingContinuity,
    els.arpDirection,
    els.arpFeel,
    els.arpDensity,
    els.arpVariation,
    els.arpContinuity,
    ...els.chordInputs,
  ].forEach((control) => {
    control.addEventListener("input", generatePattern);
  });

  [els.waveform, els.cutoff, els.attack, els.release, els.space].forEach((control) => {
    control.addEventListener("input", updateReadouts);
  });

  window.addEventListener("resize", () => {
    renderGrid();
  });
}

bindEvents();
refreshProgressionUi();
generatePattern();
