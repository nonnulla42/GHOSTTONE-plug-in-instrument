import { generatePattern } from "./src/core/ghosttone-core.js";
import { WebAudioAdapter } from "./src/web/audio-adapter.js";
import { exportMidi } from "./src/web/midi-export-adapter.js";
import {
  applySoundPreset,
  createInitialBarStates,
  getElements,
  readBpm,
  readCoreSettings,
  readProgression,
  readSoundSettings,
  refreshProgressionUi,
  updateReadouts,
} from "./src/web/ui-adapter.js";
import { GridVisualizer } from "./src/web/visual-adapter.js";

const state = {
  mode: "pad",
  sound: "pad",
  seed: Math.floor(Math.random() * 100000),
  pattern: null,
  barStates: createInitialBarStates(4),
  currentSectionIndex: 0,
  raf: null,
};

const els = getElements();
const audio = new WebAudioAdapter();
const visualizer = new GridVisualizer(els.gridView);

function currentCoreSettings() {
  return readCoreSettings(els, state.mode);
}

function currentSoundSettings() {
  return readSoundSettings(els, state.sound);
}

function rebuildPattern({ restartAudio = true } = {}) {
  const coreSettings = currentCoreSettings();
  const progression = readProgression(els, state.barStates);
  const bpm = readBpm(els);
  const soundSettings = currentSoundSettings();

  state.pattern = generatePattern(coreSettings, progression, state.seed);
  if (state.currentSectionIndex >= state.pattern.sections.length) state.currentSectionIndex = 0;

  updateReadouts(els, state.pattern, coreSettings, bpm, soundSettings, state.currentSectionIndex);
  visualizer.render(state.pattern, state.currentSectionIndex);

  if (restartAudio) {
    audio.restart(state.pattern, coreSettings, soundSettings, bpm);
  }
}

function refreshSoundOnly({ restartAudio = true } = {}) {
  const coreSettings = currentCoreSettings();
  const bpm = readBpm(els);
  const soundSettings = currentSoundSettings();

  updateReadouts(els, state.pattern, coreSettings, bpm, soundSettings, state.currentSectionIndex);
  if (restartAudio) {
    audio.restart(state.pattern, coreSettings, soundSettings, bpm);
  }
}

async function togglePlay() {
  if (!audio.isPlaying) {
    rebuildPattern({ restartAudio: false });
    await audio.start(state.pattern, currentCoreSettings(), currentSoundSettings(), readBpm(els));
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
  const bpm = readBpm(els);
  const beat = audio.getCurrentBeat(bpm, state.pattern.loopBeats);
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
  state.mode = mode;
  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  refreshProgressionUi(state.barStates);
  rebuildPattern();
}

function setSound(sound) {
  state.sound = sound;
  applySoundPreset(els, sound);
  refreshSoundOnly();
}

function toggleSplit(barIndex) {
  state.barStates[barIndex].split = !state.barStates[barIndex].split;
  refreshProgressionUi(state.barStates);
  rebuildPattern();
}

function randomizeVoicing(barIndex, slotIndex) {
  state.barStates[barIndex].slots[slotIndex].voicingSeed = Math.floor(Math.random() * 100000) + 1;
  refreshProgressionUi(state.barStates);
  rebuildPattern();
}

function randomizeArp(barIndex, slotIndex) {
  state.barStates[barIndex].slots[slotIndex].arpSeed = Math.floor(Math.random() * 100000) + 1;
  refreshProgressionUi(state.barStates);
  rebuildPattern();
}

function bindEvents() {
  els.playButton.addEventListener("click", () => {
    togglePlay().catch((error) => console.error(error));
  });

  els.generateButton.addEventListener("click", () => {
    state.seed = Math.floor(Math.random() * 100000);
    rebuildPattern();
  });

  els.exportButton.addEventListener("click", () => {
    rebuildPattern({ restartAudio: false });
    exportMidi(state.pattern, readBpm(els), state.sound);
  });

  els.bpm.addEventListener("input", () => {
    refreshSoundOnly();
  });
  els.bpm.addEventListener("change", () => {
    els.bpm.value = readBpm(els);
    refreshSoundOnly();
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
    control.addEventListener("input", () => rebuildPattern());
  });

  [els.waveform, els.cutoff, els.attack, els.release, els.space].forEach((control) => {
    control.addEventListener("input", () => refreshSoundOnly());
  });

  window.addEventListener("resize", () => {
    if (state.pattern) visualizer.render(state.pattern, state.currentSectionIndex);
  });
}

bindEvents();
refreshProgressionUi(state.barStates);
rebuildPattern({ restartAudio: false });

