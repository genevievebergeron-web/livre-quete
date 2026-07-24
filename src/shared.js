// ─── PETITS UTILITAIRES PARTAGÉS ────────────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : deux constantes/fonctions pures
// utilisées à la fois par App.jsx (44+ appels) et par des composants extraits (ex. WeekView) —
// vivent ici pour éviter tout import circulaire entre App.jsx et les modules extraits.
export const DAYS_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

export const displayName = (player) => (player?.pseudo?.trim()) || player?.name || "";

// Thèmes visuels d'ACCENT/UI (Minecraft/Galaxie/Océan/Volcan/Forêt) — distinct de PLAYER_THEMES
// (themes.js, thèmes cosmétiques choisis par le joueur). Utilisé par App.jsx (thème hebdo) et
// par des composants extraits (PinPad, RewardPopup).
export const THEMES = {
  minecraft: { name:"Minecraft", bg:"#1a1a2e", primary:"#5D9E34", accent:"#FFD700", card:"rgba(0,0,0,0.5)", text:"#fff" },
  galaxy:    { name:"Galaxie",   bg:"#0a0a1a", primary:"#7B2FBE", accent:"#00D4FF", card:"rgba(10,0,30,0.7)", text:"#fff" },
  ocean:     { name:"Océan",     bg:"#001a2e", primary:"#0066CC", accent:"#00FFB2", card:"rgba(0,10,30,0.7)", text:"#fff" },
  volcano:   { name:"Volcan",    bg:"#1a0a00", primary:"#CC3300", accent:"#FF8C00", card:"rgba(30,10,0,0.7)", text:"#fff" },
  forest:    { name:"Forêt",     bg:"#0a1a0a", primary:"#2E7D32", accent:"#A5D6A7", card:"rgba(0,20,0,0.7)",  text:"#fff" },
};
