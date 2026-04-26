import { clamp } from "./ui-adapter.js";

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

function buildMidiBytes(events, loopBeats, bpm, sound) {
  const ticksPerBeat = 480;
  const midiEvents = [];
  const channelCount = 15;

  for (let channel = 0; channel < channelCount; channel += 1) {
    midiEvents.push({ tick: 0, data: [0xb0 + channel, 101, 0] });
    midiEvents.push({ tick: 0, data: [0xb0 + channel, 100, 0] });
    midiEvents.push({ tick: 0, data: [0xb0 + channel, 6, 2] });
    midiEvents.push({ tick: 0, data: [0xc0 + channel, sound === "pluck" ? 11 : 88] });
  }

  const microsecondsPerBeat = Math.round(60000000 / bpm);
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

  events.forEach((event, index) => {
    const channel = index % channelCount;
    const startTick = Math.round(event.startBeat * ticksPerBeat);
    const endTick = Math.max(startTick + 1, Math.round((event.startBeat + event.durationBeats) * ticksPerBeat));
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

  midiEvents.push({ tick: Math.round(loopBeats * ticksPerBeat), data: [0xff, 0x2f, 0x00] });
  midiEvents.sort((a, b) => a.tick - b.tick);

  let lastTick = 0;
  const trackData = [];
  midiEvents.forEach((event) => {
    trackData.push(...encodeVarLen(event.tick - lastTick), ...event.data);
    lastTick = event.tick;
  });

  const header = [...writeText("MThd"), ...int32(6), ...int16(0), ...int16(1), ...int16(ticksPerBeat)];
  const track = [...writeText("MTrk"), ...int32(trackData.length), ...trackData];
  return new Uint8Array([...header, ...track]);
}

function downloadMidi(bytes, filename) {
  const blob = new Blob([bytes], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportMidi(pattern, bpm, sound) {
  downloadMidi(buildMidiBytes(pattern.events, pattern.loopBeats, bpm, sound), "ghosttone-pattern.mid");
}

export function exportInfiniteMidi(pattern, bpm, sound) {
  const MAX_BARS = 16;
  const beatsPerBar = pattern.templateLoopBeats / Math.max(1, pattern.templateSections?.length || 1);
  const maxBeats = MAX_BARS * beatsPerBar;

  const filteredEvents = pattern.events
    .filter((e) => e.startBeat < maxBeats)
    .map((e) => ({ ...e, durationBeats: Math.min(e.durationBeats, maxBeats - e.startBeat) }))
    .sort((a, b) => a.startBeat - b.startBeat);

  const loopBeats = Math.min(pattern.loopBeats, maxBeats);
  downloadMidi(buildMidiBytes(filteredEvents, loopBeats, bpm, sound), "ghosttone-infinite.mid");
}

