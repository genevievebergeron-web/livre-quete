// ─── PETITS UTILITAIRES PARTAGÉS ────────────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : deux constantes/fonctions pures
// utilisées à la fois par App.jsx (44+ appels) et par des composants extraits (ex. WeekView) —
// vivent ici pour éviter tout import circulaire entre App.jsx et les modules extraits.
export const DAYS_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

export const displayName = (player) => (player?.pseudo?.trim()) || player?.name || "";
