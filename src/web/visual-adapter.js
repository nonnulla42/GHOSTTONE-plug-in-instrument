import { clamp } from "./ui-adapter.js";

export const VIEW_BEATS_BEFORE = 4;
export const VIEW_BEATS_AFTER = 4;
export const VIEWPORT_RERENDER_STEP_BEATS = 0.0625;

export function getVisibleBeatRange(currentBeat = 0, before = VIEW_BEATS_BEFORE, after = VIEW_BEATS_AFTER) {
  const beat = Number.isFinite(currentBeat) ? currentBeat : 0;
  return {
    startBeat: beat - before,
    endBeat: beat + after,
  };
}

export function isEventVisible(event, range) {
  return event.startBeat + event.durationBeats >= range.startBeat && event.startBeat <= range.endBeat;
}

export function beatToViewportX(beat, range) {
  return ((beat - range.startBeat) / Math.max(0.001, range.endBeat - range.startBeat)) * 100;
}

export class GridVisualizer {
  constructor(grid) {
    this.grid = grid;
    this.pattern = null;
    this.currentSectionIndex = 0;
    this.currentBeat = 0;
    this.visualBeat = 0;
    this.lastRenderedBeat = null;
    this.lastViewportAnchor = null;
    this.renderedRange = null;
    this.sectionBands = new Map();
  }

  render(pattern, currentSectionIndex = this.currentSectionIndex, currentBeat = this.currentBeat) {
    this.pattern = pattern;
    this.currentSectionIndex = currentSectionIndex;
    this.currentBeat = Number.isFinite(currentBeat) ? currentBeat : 0;
    this.visualBeat = this.currentBeat;
    this.renderViewport(this.visualBeat);
  }

  renderViewport(currentBeat = this.visualBeat) {
    if (!this.pattern) return;

    const grid = this.grid;
    const pattern = this.pattern;
    const range = getVisibleBeatRange(currentBeat);
    const visibleEvents = pattern.events.filter((event) => isEventVisible(event, range));
    const visibleSections = pattern.sections.filter((section) => section.startBeat + section.durationBeats >= range.startBeat && section.startBeat <= range.endBeat);
    const midiSource = visibleEvents.length ? visibleEvents : pattern.events;

    grid.innerHTML = "";
    this.sectionBands.clear();

    const minMidi = midiSource.length ? Math.max(36, Math.min(...midiSource.map((event) => event.midi)) - 3) : 45;
    const maxMidi = midiSource.length ? Math.min(96, Math.max(...midiSource.map((event) => event.midi)) + 3) : 84;
    const midiSpan = Math.max(12, maxMidi - minMidi);
    const laneCount = midiSpan + 1;

    grid.style.setProperty("--lane-count", laneCount);
    grid.dataset.viewStartBeat = range.startBeat.toFixed(2);
    grid.dataset.viewEndBeat = range.endBeat.toFixed(2);

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

    const firstMarkerBeat = Math.floor(range.startBeat);
    const lastMarkerBeat = Math.ceil(range.endBeat);
    const grouping = pattern.meterGrouping || [4];
    const beatsPerBar = pattern.beatsPerBar || grouping.reduce((sum, beats) => sum + beats, 0) || 4;
    for (let beat = firstMarkerBeat; beat <= lastMarkerBeat; beat += 1) {
      const marker = document.createElement("div");
      const beatInBar = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
      const isStrong = beatInBar === 0 || grouping.slice(0, -1).some((offset) => beatInBar === offset);
      marker.className = isStrong ? "beat-marker strong" : "beat-marker";
      marker.style.left = `${beatToViewportX(beat, range)}%`;
      beatLayer.appendChild(marker);
    }

    visibleSections.forEach((section) => {
      const band = document.createElement("div");
      const sectionIndex = section.sectionIndex ?? pattern.sections.indexOf(section);
      const left = clamp(beatToViewportX(section.startBeat, range), 0, 100);
      const right = clamp(beatToViewportX(section.startBeat + section.durationBeats, range), 0, 100);
      band.className = `section-band ${sectionIndex === this.currentSectionIndex ? "active" : ""}`;
      band.style.left = `${left}%`;
      band.style.width = `${Math.max(0.6, right - left)}%`;
      band.textContent = section.label;
      sectionLayer.appendChild(band);
      this.sectionBands.set(sectionIndex, band);
    });

    const eventPosition = (event, useEnd = false) => ({
      x: beatToViewportX(event.startBeat + (useEnd ? event.durationBeats : 0), range),
      y: 8 + (1 - (event.midi - minMidi) / midiSpan) * 84,
    });

    const chains = new Map();
    visibleEvents.forEach((event) => {
      if (!chains.has(event.voiceId)) chains.set(event.voiceId, []);
      chains.get(event.voiceId).push(event);
    });

    chains.forEach((events) => {
      events
        .sort((a, b) => a.startBeat - b.startBeat)
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

    visibleEvents.forEach((event) => {
      const block = document.createElement("div");
      const left = clamp(beatToViewportX(event.startBeat, range), 0, 100);
      const right = clamp(beatToViewportX(event.startBeat + event.durationBeats, range), 0, 100);
      const width = Math.max(2.6, right - left);
      const top = 8 + (1 - (event.midi - minMidi) / midiSpan) * 84;
      const hue = 170 + clamp(event.cents, -60, 60) * 1.6;
      const driftText = event.driftAmount >= 1 ? ` -> ${Math.round(event.driftEnd)}` : "";
      const carryText = event.carriedFromPrevious ? " | carried" : "";

      block.className = `note-block role-${event.role}`;
      block.style.left = `${left}%`;
      block.style.width = `${width}%`;
      block.style.top = `${clamp(top, 8, 92)}%`;
      block.style.background = `hsl(${hue}, 68%, 68%)`;
      block.style.setProperty("--drift", Math.min(1, event.driftAmount / 18).toFixed(2));
      block.title = `${event.sectionLabel} | ${event.noteName}${event.degree} | ${event.role} | ${event.motionType}${carryText} | cents ${Math.round(event.cents)}${driftText}`;
      block.textContent = `${event.noteName} ${Math.round(event.cents)}`;
      grid.appendChild(block);
    });

    grid.appendChild(playhead);
    this.updatePlayheadElement(playhead, currentBeat, range);
    this.lastRenderedBeat = currentBeat;
    this.lastViewportAnchor = quantizeViewportAnchor(range.startBeat);
    this.renderedRange = range;
  }

  updateActiveSection(sectionIndex) {
    if (sectionIndex === this.currentSectionIndex) return;
    const previousSectionIndex = this.currentSectionIndex;
    this.currentSectionIndex = sectionIndex;
    const previousBand = this.sectionBands.get(previousSectionIndex);
    const nextBand = this.sectionBands.get(sectionIndex);
    if (previousBand) previousBand.classList.remove("active");
    if (nextBand) nextBand.classList.add("active");
  }

  updatePlayhead(beat) {
    const existingPlayhead = this.grid.querySelector("#gridPlayhead");
    if (beat === null || !this.pattern) {
      if (existingPlayhead) existingPlayhead.hidden = true;
      return;
    }

    if (!existingPlayhead) return;

    const actualBeat = Number.isFinite(beat) ? beat : 0;
    const previousVisualBeat = Number.isFinite(this.visualBeat) ? this.visualBeat : actualBeat;
    this.currentBeat = actualBeat;
    this.visualBeat = previousVisualBeat + (actualBeat - previousVisualBeat) * 0.24;

    if (this.shouldRerenderViewport()) {
      this.renderViewport(this.visualBeat);
      return;
    }

    const range = this.renderedRange || getVisibleBeatRange(this.visualBeat);
    this.updatePlayheadElement(existingPlayhead, this.visualBeat, range);
  }

  shouldRerenderViewport() {
    if (this.lastRenderedBeat === null) return true;
    const range = getVisibleBeatRange(this.visualBeat);
    const nextAnchor = quantizeViewportAnchor(range.startBeat);
    return nextAnchor !== this.lastViewportAnchor;
  }

  updatePlayheadElement(playhead, beat, range) {
    if (!playhead) return;
    playhead.hidden = false;
    playhead.style.left = `${beatToViewportX(beat, range)}%`;
  }
}

function quantizeViewportAnchor(startBeat) {
  return Math.round((Number.isFinite(startBeat) ? startBeat : 0) / VIEWPORT_RERENDER_STEP_BEATS);
}
