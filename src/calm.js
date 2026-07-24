// ─── FLAG D'ACCESSIBILITÉ « MODE CALME » (neurodivergence) ──────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : `CALM` était un `let` mutable au
// niveau module, ce qui bloquait l'extraction de tout composant qui le lit (AvatarCanvas,
// InlineRitualTimer, spawnParticles) — un import ES ne peut pas réassigner un binding d'un
// autre module. Même patron que `sfx.js`/`setSfxMuted` : App.jsx passe désormais par
// `setCalm()` au lieu d'assigner `CALM` directement ; les modules extraits importent `CALM`
// en lecture seule (binding live ES — toujours à jour, jamais besoin de le réassigner eux-mêmes).
export let CALM = false; // mode calme : pas de confettis/particules, animations réduites (+ classe CSS)

export function setCalm(v) { CALM = !!v; }
