const coreRangeControls = ["ghostAmount", "drift", "harmonyLock", "voicingVariation", "voicingContinuity", "arpDensity", "arpVariation", "arpContinuity"];
const coreSelectControls = ["colorMode", "voicingStyle", "arpDirection", "arpFeel"];
const coreToggleControls = ["stayMusical", "ghostEnabled"];
const soundControls = ["waveform", "cutoff", "attack", "release", "space"];

export function capturePatch(els, state, name = "Patch") {
  return {
    name,
    seed: state.seed,
    bpm: Number(els.bpm.value),
    mode: state.mode,
    sound: state.sound,
    barStates: cloneBarStates(state.barStates),
    chords: els.chordInputs.map((input) => ({
      bar: Number(input.dataset.bar),
      slot: Number(input.dataset.slot),
      value: input.value,
    })),
    core: readControlGroup(els, [...coreRangeControls, ...coreSelectControls, ...coreToggleControls]),
    soundControls: readControlGroup(els, soundControls),
  };
}

export function presetToPatch(preset) {
  return {
    name: preset.name,
    seed: preset.seed,
    bpm: preset.bpm,
    mode: preset.mode,
    sound: preset.sound,
    barStates: createPresetBarStates(preset.chords.length),
    chords: preset.chords.map((value, index) => ({ bar: index, slot: 0, value })),
    core: { ...preset.core },
    soundControls: { ...preset.soundControls },
  };
}

export function applyPatch(els, state, patch) {
  state.seed = patch.seed;
  state.mode = patch.mode;
  state.sound = patch.sound;
  state.barStates = cloneBarStates(patch.barStates);
  els.bpm.value = patch.bpm;

  applyControlGroup(els, patch.core);
  applyControlGroup(els, patch.soundControls);
  applyChords(els, patch.chords);
  setActiveButton(".segment", "mode", state.mode);
  setActiveButton(".sound-segment", "sound", state.sound);
}

export function updateCompareUi(root, activeSlot) {
  root.querySelectorAll(".compare-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.compareSlot === activeSlot);
  });
}

function readControlGroup(els, ids) {
  return ids.reduce((values, id) => {
    const control = els[id];
    values[id] = control.type === "checkbox" ? control.checked : control.value;
    return values;
  }, {});
}

function applyControlGroup(els, values) {
  Object.entries(values).forEach(([id, value]) => {
    if (!els[id]) return;
    if (els[id].type === "checkbox") {
      els[id].checked = Boolean(value);
    } else {
      els[id].value = value;
    }
  });
}

function applyChords(els, chords) {
  chords.forEach((chord) => {
    const input = els.chordInputs.find((control) => Number(control.dataset.bar) === chord.bar && Number(control.dataset.slot) === chord.slot);
    if (input) input.value = chord.value;
  });
}

function createPresetBarStates(length) {
  return Array.from({ length: 4 }, (_, index) => ({
    split: false,
    slots: [
      { voicingSeed: 0, arpSeed: 0 },
      { voicingSeed: 0, arpSeed: 0 },
    ],
  })).slice(0, Math.max(4, length));
}

function cloneBarStates(barStates) {
  return barStates.map((bar) => ({
    split: bar.split,
    slots: bar.slots.map((slot) => ({ ...slot })),
  }));
}

function setActiveButton(selector, dataKey, value) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("active", button.dataset[dataKey] === value);
  });
}

