// ─── ÉNERGIE / SIESTE ────────────────────────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif, 2026-08-06) : le calcul d'énergie,
// pure fonction du temps réel écoulé depuis `energyTs`. Vit ici parce qu'il est utilisé à la
// fois par `App.jsx` (dashboard, coffres, boutique, familier) et par la couche de fusion
// (`merge.js`) — évite un import circulaire entre les deux.
// Les seuils de coût (`CHEST_ENERGY`, `PLAY_ENERGY`…) restent dans `App.jsx` : ce sont des
// réglages de gameplay, pas de la mécanique de calcul.

export const ENERGY_MAX = 100;
export const ENERGY_REGEN_PER_MIN = ENERGY_MAX / 180; // pleine en 3 heures

// Énergie courante = valeur stockée + ce qui s'est rechargé depuis energyTs
export const currentEnergy = (gs) => {
  if (!gs) return ENERGY_MAX;
  const base = gs.energy == null ? ENERGY_MAX : gs.energy;
  const ts = gs.energyTs ? new Date(gs.energyTs).getTime() : 0;
  const mins = ts ? Math.max(0, (Date.now() - ts) / 60000) : 0;
  return Math.max(0, Math.min(ENERGY_MAX, Math.round(base + mins * ENERGY_REGEN_PER_MIN)));
};

// Minutes avant que l'énergie atteigne `target`
export const minsToEnergy = (gs, target) => {
  const cur = currentEnergy(gs);
  if (cur >= target) return 0;
  return Math.ceil((target - cur) / ENERGY_REGEN_PER_MIN);
};
