# GhostTone Plugin Core

GhostTone is moving toward an instrument plugin: a host-synced generative microtonal instrument with a simple internal sound engine.

This repo now prioritizes the plugin-first musical core over the browser prototype.

## Core

The first extracted module is:

```txt
src/core/ghosttone-core.js
```

It exposes:

```js
generatePattern(settings, progression, seed)
```

The core is deterministic and beat-based. It does not know about browser UI, Web Audio, MIDI export, or BPM in seconds.

## Test

```txt
npm test
```

The tests currently verify chord parsing, deterministic generation, and the fixed event schema.

## Roadmap

See:

- `docs/plugin-first-roadmap.md`
- `docs/engine-spec.md`
