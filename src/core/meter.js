const TIME_SIGNATURE_BEATS = Object.freeze({
  "3/4": 3,
  "4/4": 4,
  "5/4": 5,
  "7/4": 7,
});

const METER_GROUPINGS = Object.freeze({
  "3/4": Object.freeze([2, 1]),
  "4/4": Object.freeze([4]),
  "5/4": Object.freeze([3, 2]),
  "7/4": Object.freeze([4, 3]),
});

export function normalizeTimeSignature(value) {
  const signature = String(value || "4/4");
  return TIME_SIGNATURE_BEATS[signature] ? signature : "4/4";
}

export function getBeatsPerBar(settingsOrSignature = "4/4") {
  const signature = typeof settingsOrSignature === "string"
    ? settingsOrSignature
    : settingsOrSignature?.timeSignature;
  return TIME_SIGNATURE_BEATS[normalizeTimeSignature(signature)];
}

export function getSlotsPerBar(settingsOrSignature = "4/4") {
  return getBeatsPerBar(settingsOrSignature) * 4;
}

export function getMeterGrouping(settingsOrSignature = "4/4") {
  const signature = typeof settingsOrSignature === "string"
    ? settingsOrSignature
    : settingsOrSignature?.timeSignature;
  return METER_GROUPINGS[normalizeTimeSignature(signature)];
}
