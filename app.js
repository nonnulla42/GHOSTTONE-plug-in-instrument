import { generatePattern } from "./src/core/ghosttone-core.js";
import {
  applyPresetToPatchState,
  createPatchFromPreset,
  createPatchState,
  deserializePatchState,
  getActivePatch,
  patchToCoreSettings,
  patchToProgression,
  patchToSoundSettings,
  serializePatchState,
  setActiveCompareSlot,
  setActivePatch,
  setPatchSlot,
} from "./src/state/patch-state.js";
import { WebAudioAdapter } from "./src/web/audio-adapter.js";
import { exportMidi } from "./src/web/midi-export-adapter.js";
import { exportWav } from "./src/web/wav-export-adapter.js";
import { applyPatch, capturePatch, updateCompareUi } from "./src/web/patch-adapter.js";
import { findPreset } from "./src/web/presets.js";
import { getElements, refreshProgressionUi, updateReadouts } from "./src/web/ui-adapter.js";
import { GridVisualizer } from "./src/web/visual-adapter.js";

const initialPreset = findPreset("dreamy-pad");

const state = {
  patchState: createPatchState({
    slots: {
      A: createPatchFromPreset(initialPreset),
      B: { ...createPatchFromPreset(initialPreset), name: "Slot B", seed: Math.floor(Math.random() * 100000) + 1 },
    },
  }),
  pattern: null,
  currentSectionIndex: 0,
  raf: null,
};

const els = getElements();
const audio = new WebAudioAdapter();
const visualizer = new GridVisualizer(els.gridView);

audio.onPatternExtended = (pattern) => {
  state.pattern = pattern;
  updateReadouts(els, state.pattern, patchToCoreSettings(activePatch()), activePatch().bpm, patchToSoundSettings(activePatch()), state.currentSectionIndex);
  visualizer.render(state.pattern, state.currentSectionIndex, getVisualBeat());
};

function activePatch() {
  return getActivePatch(state.patchState);
}

function syncActivePatchFromUi() {
  state.patchState = setActivePatch(state.patchState, capturePatch(els, activePatch()));
}

function applyActivePatchToUi() {
  const patch = activePatch();
  applyPatch(els, patch);
  refreshProgressionUi(patch.barStates);
  updateCompareUi(document, state.patchState.activeCompareSlot);
}

function rebuildPattern({ restartAudio = true } = {}) {
  const patch = activePatch();
  const coreSettings = patchToCoreSettings(patch);
  const progression = patchToProgression(patch);
  const soundSettings = patchToSoundSettings(patch);

  state.pattern = generatePattern(coreSettings, progression, patch.seed);
  if (state.currentSectionIndex >= state.pattern.sections.length) state.currentSectionIndex = 0;

  updateReadouts(els, state.pattern, coreSettings, patch.bpm, soundSettings, state.currentSectionIndex);
  visualizer.render(state.pattern, state.currentSectionIndex, getVisualBeat(patch.bpm));

  if (restartAudio) {
    audio.restart(state.pattern, coreSettings, soundSettings, patch.bpm);
  }
}

function getVisualBeat(bpm = activePatch().bpm) {
  if (!audio.isPlaying || !state.pattern) return visualizer.currentBeat || 0;
  return audio.getCurrentBeat(bpm, state.pattern) ?? visualizer.currentBeat ?? 0;
}

function refreshSoundOnly({ restartAudio = true } = {}) {
  const patch = activePatch();
  const coreSettings = patchToCoreSettings(patch);
  const soundSettings = patchToSoundSettings(patch);

  updateReadouts(els, state.pattern, coreSettings, patch.bpm, soundSettings, state.currentSectionIndex);
  if (restartAudio) {
    audio.restart(state.pattern, coreSettings, soundSettings, patch.bpm);
  }
}

function loadCurrentPatch({ restartAudio = true } = {}) {
  applyActivePatchToUi();
  rebuildPattern({ restartAudio });
}

function applyPreset(presetId) {
  state.patchState = applyPresetToPatchState(state.patchState, findPreset(presetId));
  loadCurrentPatch();
}

function switchCompareSlot(slot) {
  syncActivePatchFromUi();

  if (!state.patchState.slots[slot]) {
    state.patchState = setPatchSlot(state.patchState, slot, {
      ...activePatch(),
      name: `Slot ${slot}`,
      seed: Math.floor(Math.random() * 100000) + 1,
    });
  }

  state.patchState = setActiveCompareSlot(state.patchState, slot);
  loadCurrentPatch();
}

function updateActivePatch(mutator, { restartAudio = true, syncUi = true } = {}) {
  const nextPatch = mutator(activePatch());
  state.patchState = setActivePatch(state.patchState, nextPatch);
  if (syncUi) applyActivePatchToUi();
  rebuildPattern({ restartAudio });
}

function updateActivePatchFromUi({ restartAudio = true, soundOnly = false } = {}) {
  syncActivePatchFromUi();
  if (soundOnly) {
    refreshSoundOnly({ restartAudio });
  } else {
    rebuildPattern({ restartAudio });
  }
}

async function togglePlay() {
  if (!audio.isPlaying) {
    updateActivePatchFromUi({ restartAudio: false });
    const patch = activePatch();
    await audio.start(state.pattern, patchToCoreSettings(patch), patchToSoundSettings(patch), patch.bpm);
    els.playButton.textContent = "Stop";
    animate();
    return;
  }

  audio.stop();
  els.playButton.textContent = "Play";
  visualizer.updatePlayhead(null);
  if (state.raf) cancelAnimationFrame(state.raf);
}

function animate() {
  const patch = activePatch();
  const beat = audio.getCurrentBeat(patch.bpm, state.pattern);
  visualizer.updatePlayhead(beat);

  if (beat !== null) {
    const sectionIndex = state.pattern.sections.findIndex((section) => beat >= section.startBeat && beat < section.startBeat + section.durationBeats);
    const nextSectionIndex = sectionIndex >= 0 ? sectionIndex : 0;
    if (nextSectionIndex !== state.currentSectionIndex) {
      state.currentSectionIndex = nextSectionIndex;
      visualizer.updateActiveSection(nextSectionIndex);
      refreshSoundOnly({ restartAudio: false });
    }
  }

  if (audio.isPlaying) {
    state.raf = requestAnimationFrame(animate);
  }
}

function setMode(mode) {
  updateActivePatch((patch) => ({ ...patch, mode }));
}

function setGeneratorMode(generatorMode) {
  updateActivePatch((patch) => ({
    ...patch,
    core: {
      ...patch.core,
      generatorMode,
    },
  }));
}

function setSound(sound) {
  updateActivePatch((patch) => ({ ...patch, sound }), { restartAudio: true });
}

function toggleSplit(barIndex) {
  updateActivePatch((patch) => ({
    ...patch,
    barStates: patch.barStates.map((bar, index) => (index === barIndex ? { ...bar, split: !bar.split } : bar)),
  }));
}

function randomizeVoicing(barIndex, slotIndex) {
  updateActivePatch((patch) => ({
    ...patch,
    barStates: updateSlotSeed(patch.barStates, barIndex, slotIndex, "voicingSeed"),
  }));
}

function randomizeArp(barIndex, slotIndex) {
  updateActivePatch((patch) => ({
    ...patch,
    barStates: updateSlotSeed(patch.barStates, barIndex, slotIndex, "arpSeed"),
  }));
}

function regenerateSeed() {
  updateActivePatch((patch) => ({
    ...patch,
    seed: Math.floor(Math.random() * 100000) + 1,
  }));
}

function exportPatchJson() {
  syncActivePatchFromUi();
  const blob = new Blob([serializePatchState(state.patchState)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ghosttone-patch.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importPatchJson(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      state.patchState = deserializePatchState(String(reader.result));
      loadCurrentPatch();
    } catch (error) {
      console.error(error);
      window.alert("Could not import this GhostTone patch JSON.");
    } finally {
      els.importPatchFile.value = "";
    }
  });
  reader.readAsText(file);
}

function updateSlotSeed(barStates, barIndex, slotIndex, seedKey) {
  return barStates.map((bar, index) => {
    if (index !== barIndex) return bar;
    return {
      ...bar,
      slots: bar.slots.map((slot, innerIndex) => (innerIndex === slotIndex ? { ...slot, [seedKey]: Math.floor(Math.random() * 100000) + 1 } : slot)),
    };
  });
}

function bindEvents() {
  els.playButton.addEventListener("click", () => {
    togglePlay().catch((error) => console.error(error));
  });

  els.generateButton.addEventListener("click", regenerateSeed);
  els.presetSelect.addEventListener("change", () => applyPreset(els.presetSelect.value));
  els.exportPatchButton.addEventListener("click", exportPatchJson);
  els.importPatchButton.addEventListener("click", () => els.importPatchFile.click());
  els.importPatchFile.addEventListener("change", () => importPatchJson(els.importPatchFile.files?.[0]));

  els.compareButtons.forEach((button) => {
    button.addEventListener("click", () => switchCompareSlot(button.dataset.compareSlot));
  });

  els.exportButton.addEventListener("click", () => {
    updateActivePatchFromUi({ restartAudio: false });
    const patch = activePatch();
    exportMidi(state.pattern, patch.bpm, patch.sound);
  });

  els.exportWavButton.addEventListener("click", () => {
    updateActivePatchFromUi({ restartAudio: false });
    const patch = activePatch();
    exportWav(patch, {
      sampleRate: 44100,
      bpm: patch.bpm,
      startBeat: 0,
      endBeat: state.pattern.loopBeats,
      blockSize: 2048,
      channelCount: 2,
    });
  });

  els.bpm.addEventListener("input", () => updateActivePatchFromUi({ soundOnly: true }));
  els.bpm.addEventListener("change", () => updateActivePatchFromUi({ soundOnly: true }));

  els.generatorButtons.forEach((button) => {
    button.addEventListener("click", () => setGeneratorMode(button.dataset.generatorMode));
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  document.querySelectorAll(".sound-segment").forEach((button) => {
    button.addEventListener("click", () => setSound(button.dataset.sound));
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

  [
    els.ghostAmount,
    els.drift,
    els.harmonyLock,
    els.colorMode,
    els.harmonicMotion,
    els.harmonicDistanceTarget,
    els.harmonicDistanceFalloff,
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
    control.addEventListener("input", () => updateActivePatchFromUi());
  });

  [els.waveform, els.cutoff, els.attack, els.release, els.space].forEach((control) => {
    control.addEventListener("input", () => updateActivePatchFromUi({ soundOnly: true }));
  });

  window.addEventListener("resize", () => {
    if (state.pattern) visualizer.render(state.pattern, state.currentSectionIndex, getVisualBeat());
  });
}

bindEvents();
loadCurrentPatch({ restartAudio: false });
