# GhostTone Parameter Map

This is a practical map of what the main parameters actually do in the current project.

It is not a math spec. It is a "what family does this control belong to, and what does it push" guide.

## Fast View

### Chooses Harmony

- `generatorMode`
- `harmonicMotion`
- `harmonicDistanceTarget`
- `harmonicDistanceFalloff`
- `localScaleType`
- `localTargetDegree`
- `localDegreeFalloff`
- `globalRoot`
- `scaleName`
- `scaleInfluence`
- `memoryStrength`
- written `chords`
- `seed`

### Realizes The Voicing

- `voicingStyle`
- `voicingVariation`
- `voicingContinuity`
- `registerCenter`
- `mode` (`pad` or `arp`)
- per-slot `voicingSeed`
- per-slot `arpSeed`

### Shapes Event Behavior

- `arpDirection`
- `arpFeel`
- `arpDensity`
- `arpContinuity`
- `stayMusical`

### Colors The Sound

- `ghostAmount`
- `drift`
- `harmonyLock`
- `colorMode`
- `ghostEnabled`
- `sound`
- `waveform`
- `cutoff`
- `attack`
- `release`
- `space`
- `reverbMix`
- `delayMix`

## Harmony Layer

These parameters decide what harmony the engine wants, especially in `infinite`.

### `generatorMode`

- `classic`: uses the written progression directly
- `roleBased`: still uses the written progression directly, but note behavior follows harmonic role
- `infinite`: uses the progression as a seed skeleton, then keeps generating future harmonic states

This is the first fork in behavior.

### Written `chords`

In `classic` and `roleBased`, the chord grid is the actual harmony.

In `infinite`, the chord grid is the launch point and initial identity, not the whole future result.

### `globalRoot`, `scaleName`, `scaleInfluence`

These are the outer harmonic fence.

- `globalRoot` chooses the pitch-class center
- `scaleName` chooses the global scale
- `scaleInfluence` decides how hard that scale shapes or filters the candidate chord pool

Important current behavior:

- the global scale acts before local-scale scoring
- when `scaleInfluence` is high, the candidate pool is much more tightly constrained
- this does not directly decide voicing; it decides which harmonic candidates are even in the room

### `localScaleType`, `localTargetDegree`, `localDegreeFalloff`

These are the directional local force inside the global fence.

- `localScaleType` defines the local mode used when comparing the current harmony to possible next harmony
- `localTargetDegree` says which degree the system should lean toward
- `localDegreeFalloff` is currently an on/off neighborhood switch around that degree

Current intent:

- low `harmonicMotion` lets this layer speak more strongly
- with falloff on, nearby degrees can still score
- with falloff off, the target behaves more like a narrow focal point

### `harmonicMotion`

This is one of the most important parameters in `infinite`.

It controls the balance between:

- local-scale direction
- minimum displacement and root continuity

Rule of thumb:

- low `harmonicMotion`: local scale and target degree are more authoritative
- high `harmonicMotion`: minimum voice movement and continuity matter more

It does not bypass the global scale. The global scale still shapes the candidate pool first.

### `harmonicDistanceTarget`, `harmonicDistanceFalloff`

These push the preferred amount of harmonic root movement between states.

- `harmonicDistanceTarget` says what root-distance relation is attractive
- `harmonicDistanceFalloff` says how tolerant the system is around that target

These are secondary steering controls compared to `harmonicMotion`, but they still affect which candidates feel "in family".

### `memoryStrength`

This gives local structure over time, especially in `infinite`.

It affects how strongly the engine:

- recalls earlier harmonic states
- mutates remembered material
- prefers recent internal history over constant novelty

Current intent:

- low memory: more forward movement, fewer direct recalls
- high memory: more local recurrence and structure

It should not mean "repeat the same chord immediately forever". The recent fixes try to preserve structure without getting sticky.

### `seed`

This is the determinism anchor.

Same settings, same progression, same seed should give the same result.

If the behavior is surprising but repeatable, the seed is doing its job.

## Voicing Layer

These parameters decide how the chosen harmony is embodied in notes.

### `voicingStyle`

Broad voicing flavor:

- `close`
- `open`
- `spread`
- `smooth`

This is a top-level disposition choice, not a full harmonic policy.

### `voicingContinuity`

How strongly each voice wants to stay near its previous position.

- low: more reconfiguration
- high: more line-by-line continuity

Current interaction:

- with low `harmonicMotion`, high continuity helps local-scale direction feel more coherent in the realized voicing
- with high `harmonicMotion`, high continuity reinforces minimum displacement

### `voicingVariation`

How much vertical freedom the realized voicing gets.

- low: tighter, more centered, more compact
- high: wider, more open, more permissive

Important nuance:

- this does not change the harmonic candidate pool directly
- it changes how flexibly the chosen harmony can be voiced

So high variation can make the result feel less strict, especially when `harmonicMotion` is already high.

### `registerCenter`

This is the register gravity control.

It acts like a soft center of mass for the harmonic body:

- discourages drift too far up or down
- keeps voice lanes usable
- does not hard-lock every note to one zone

This matters a lot in `infinite`, especially over long playback.

### `mode`

- `pad`: longer held-note behavior
- `arp`: broken-up event behavior

This does not choose harmony by itself, but it strongly changes how that harmony is experienced.

### `voicingSeed` and `arpSeed`

Per-slot local variation levers in the progression template.

- `voicingSeed` nudges local voicing treatment
- `arpSeed` nudges local arp treatment

These are useful for local contrast without changing the whole patch.

## Event And Motion Layer

These controls shape how note events are emitted once harmony and voicing exist.

### `arpDirection`

Ordering shape for arpeggiated behavior.

Examples:

- `up`
- `down`
- `updown`
- `insideout`
- `outsidein`
- `bounce`
- `free`

### `arpFeel`

Rhythmic personality of arp emission.

Examples:

- `even`
- `flowing`
- `broken`
- `syncopated`
- `pulsing`

### `arpDensity`

How busy the arp output becomes.

- low: fewer note events
- high: denser note activity

### `arpContinuity`

How strongly the arp contour keeps a coherent path instead of constantly resetting shape.

### `stayMusical`

A soft restraint flag.

It generally keeps behavior from wandering too far into unstable or harsher choices. It is not one single rule; it is a broad safety bias used in a few places.

## Microtonal And Expressive Color

These controls do not primarily choose harmony. They shape how notes behave and feel.

### `ghostAmount`

Overall intensity of microtonal offset behavior.

### `drift`

How much notes tend to move in pitch over their life.

### `harmonyLock`

How strongly pitch deviations stay tied to harmonic context instead of becoming more independent.

### `colorMode`

Broad color personality:

- `warm`
- `dreamy`
- `dark`
- `alien`

This affects micro behavior and expressive weighting more than harmony selection.

### `ghostEnabled`

Hard on/off switch for ghost offsets.

Useful when you want the same harmonic logic with less spectral blur.

## Sound Layer

These shape the synth and space around the generated events.

### `sound`

Broad body choice:

- `pad`
- `pluck`

### `waveform`, `cutoff`, `attack`, `release`

Core synth character controls.

### `space`

Stereo or breadth feel in the current browser synth body.

### `reverbMix`, `delayMix`

Space-processing amount in the current browser body.

These matter a lot for perception. A patch can feel "dry and mechanical" or "alive and floating" with the same harmonic engine underneath.

## Practical Recipes

### More Local Harmonic Direction

Try:

- lower `harmonicMotion`
- meaningful `localScaleType`
- stronger `localTargetDegree`
- `localDegreeFalloff` on
- moderate or high `voicingContinuity`

### More Minimum Displacement

Try:

- higher `harmonicMotion`
- higher `voicingContinuity`
- lower `voicingVariation`

### More Open, Airy Voicings

Try:

- higher `voicingVariation`
- medium to high `voicingContinuity`
- slightly higher `registerCenter`

### More Structure In Infinite

Try:

- moderate `memoryStrength`
- some `scaleInfluence`
- moderate `voicingContinuity`

### More Freedom And Instability

Try:

- lower `voicingContinuity`
- higher `voicingVariation`
- lower `harmonyLock`
- weaker `scaleInfluence`

## Mental Model

If the project feels overwhelming, this shorter model usually helps:

- harmony controls decide what chord wants to happen
- voicing controls decide where and how that chord lands
- event controls decide how it is articulated in time
- sound controls decide how the result feels in the ear

That is still a simplification, but it is the right simplification for working on the instrument without getting lost.
