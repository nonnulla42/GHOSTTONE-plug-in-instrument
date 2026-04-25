import { clamp } from "./ui-adapter.js";

export class GridVisualizer {
  constructor(grid) {
    this.grid = grid;
    this.pattern = null;
    this.currentSectionIndex = 0;
  }

  render(pattern, currentSectionIndex = this.currentSectionIndex) {
    this.pattern = pattern;
    this.currentSectionIndex = currentSectionIndex;
    const grid = this.grid;
    grid.innerHTML = "";

    const minMidi = pattern.events.length ? Math.max(36, Math.min(...pattern.events.map((event) => event.midi)) - 3) : 45;
    const maxMidi = pattern.events.length ? Math.min(96, Math.max(...pattern.events.map((event) => event.midi)) + 3) : 84;
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

    for (let beat = 0; beat <= pattern.loopBeats; beat += 1) {
      const marker = document.createElement("div");
      marker.className = beat % 4 === 0 ? "beat-marker strong" : "beat-marker";
      marker.style.left = `${(beat / pattern.loopBeats) * 100}%`;
      beatLayer.appendChild(marker);
    }

    pattern.sections.forEach((section, index) => {
      const band = document.createElement("div");
      band.className = `section-band ${index === this.currentSectionIndex ? "active" : ""}`;
      band.style.left = `${(section.startBeat / pattern.loopBeats) * 100}%`;
      band.style.width = `${(section.durationBeats / pattern.loopBeats) * 100}%`;
      band.textContent = section.label;
      sectionLayer.appendChild(band);
    });

    const eventPosition = (event, useEnd = false) => ({
      x: ((event.startBeat + (useEnd ? event.durationBeats : 0)) / pattern.loopBeats) * 100,
      y: 8 + (1 - (event.midi - minMidi) / midiSpan) * 84,
    });

    const chains = new Map();
    pattern.events.forEach((event) => {
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

    pattern.events.forEach((event) => {
      const block = document.createElement("div");
      const left = (event.startBeat / pattern.loopBeats) * 100;
      const width = Math.max(2.6, (event.durationBeats / pattern.loopBeats) * 100);
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
    this.updatePlayhead(null);
  }

  updateActiveSection(sectionIndex) {
    if (sectionIndex === this.currentSectionIndex) return;
    this.currentSectionIndex = sectionIndex;
    if (this.pattern) this.render(this.pattern, sectionIndex);
  }

  updatePlayhead(beat) {
    const playhead = this.grid.querySelector("#gridPlayhead");
    if (!playhead || beat === null || !this.pattern) {
      if (playhead) playhead.hidden = true;
      return;
    }

    playhead.hidden = false;
    playhead.style.left = `${(beat / this.pattern.loopBeats) * 100}%`;
  }
}
