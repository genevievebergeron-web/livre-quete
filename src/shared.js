// ─── PETITS UTILITAIRES PARTAGÉS ────────────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : constantes/fonctions pures
// utilisées à la fois par App.jsx (44+ appels) et par des composants extraits (ex. WeekView,
// SetupWizard) — vivent ici pour éviter tout import circulaire entre App.jsx et les modules extraits.
import { PLAYER_THEMES } from "./themes.js";

export const DAYS_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

export const uid = () => Math.random().toString(36).slice(2,9);

export const todayStamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export const COLORS = ["#4A90D9","#C060D0","#5CAD68","#FF6B35","#D9BC5C","#D97070","#00BCD4","#9C27B0","#FF69B4","#0a0a0a","#F0F0FF"];

export const weekKey = (dd=new Date()) => { const d=new Date(dd); const day=d.getDay(); const mon=new Date(d); mon.setDate(d.getDate()-((day+6)%7)); return mon.toISOString().slice(0,10); };

// Returns 2 random non-secret theme IDs for a brand-new player
export const pickStarterThemes = () => {
  const pool = Object.keys(PLAYER_THEMES).filter(k => k !== "none" && !PLAYER_THEMES[k].secret);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
};

// v1.93.0 (Lot 4 #20) — thème hebdomadaire gratuit : chaque semaine (lundi→dimanche, via
// weekKey), un thème non-secret est débloqué pour TOUT LE MONDE sans XP, en plus des
// déblocages XP/starter existants.
export const getWeeklyFreeTheme = () => {
  const pool = Object.keys(PLAYER_THEMES).filter(k => k !== "none" && !PLAYER_THEMES[k].secret);
  const wk = weekKey();
  const seed = wk.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  return pool[seed % pool.length];
};

export const isThemeUnlocked = (themeId, playerXp, starterThemes = []) => {
  if (themeId === "none") return true; // always free
  const t = PLAYER_THEMES[themeId];
  if (!t) return false;
  if (t.secret) return false; // secret only via random
  if (starterThemes.includes(themeId)) return true; // starter pick
  if (themeId === getWeeklyFreeTheme()) return true; // thème gratuit de la semaine
  return (playerXp || 0) >= (t.xpUnlock ?? 0);
};

// ─── CSS GLOBAL ──────────────────────────────────────────────
export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323:wght@400&family=Nunito:wght@700;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Nunito',sans-serif;-webkit-tap-highlight-color:transparent;}
  /* v1.87.0 (Lot 3 #12) — "police plus lisible" : bascule les polices pixel-art (Press Start 2P /
     VT323) vers Nunito (déjà chargée, poids 700/900) — !important pour l'emporter sur les centaines
     de styles inline, seule façon réaliste de couvrir toute l'app sans réécrire chaque composant. */
  .readable-font, .readable-font *{font-family:'Nunito',sans-serif!important;letter-spacing:0.01em!important;}
  ::-webkit-scrollbar{width:4px;height:4px;} ::-webkit-scrollbar-track{background:#111;} ::-webkit-scrollbar-thumb{background:#444;border-radius:2px;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
  @keyframes clkPulse{from{opacity:1}to{opacity:0.65}}
  @keyframes bounceIn{from{transform:scale(0.2);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes floatUp{from{transform:translateY(0) scale(1);opacity:1}to{transform:translateY(-180px) scale(0.4);opacity:0}}
  @keyframes confettiFall{from{transform:translateY(0) rotate(0deg);opacity:1}to{transform:translateY(100vh) rotate(720deg);opacity:0}}
  @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(14px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
  @keyframes shimmer{from{left:-50%}to{left:150%}}
  @keyframes mixedBg{0%{background:#0a0a14}20%{background:#140a0a}40%{background:#0a140a}60%{background:#0a0a14}80%{background:#14140a}100%{background:#0a0a14}}
  @keyframes redPulse{from{box-shadow:0 0 8px #D9707040}to{box-shadow:0 0 20px #D97070AA}}
  @keyframes slideIn{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}
  @keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
  @keyframes glowPulse{0%,100%{text-shadow:3px 3px 0 #0d0d0d,0 0 12px currentColor}60%{text-shadow:3px 3px 0 #0d0d0d,0 0 32px currentColor,0 0 54px currentColor}}
  @keyframes blink{0%,100%{opacity:1}49%{opacity:1}50%,99%{opacity:0}}
  @keyframes xpFill{from{width:0}to{width:var(--xp-target)}}
  :root{--hp:#ff4444;--mp:#4488ff;--gold:#D9BC5C;--xp-clr:#4ade80;--xp-bg:#0d2010;}
  .float-y{animation:floatY 2.4s ease-in-out infinite}
  .float-y-slow{animation:floatY 3.2s ease-in-out infinite}
  .glow-pulse{animation:glowPulse 2.8s ease-in-out infinite}
  .blink{animation:blink 1.1s step-end infinite}
  /* Accessibilité : respecte le réglage système "moins d'animations" */
  @media (prefers-reduced-motion: reduce){ *{animation-duration:0.001ms!important;animation-iteration-count:1!important;transition-duration:0.001ms!important} }
  /* Mode calme (réglage enfant) : coupe animations, clignotements et lueurs pulsées */
  .calm-mode *{animation:none!important;transition:none!important}
  .calm-mode .blink{opacity:1!important}
  .pixel-border-gold{border:4px solid var(--gold)!important;box-shadow:0 0 0 2px #0d0d0d,0 0 28px #D9BC5C45,4px 4px 0 #0d0d0d!important;border-radius:4px!important}
  .btn-pixel-primary{font-family:'Press Start 2P',monospace;background:var(--gold);color:#0d0d0d;border:3px solid #0d0d0d;box-shadow:4px 4px 0 #0d0d0d;cursor:pointer;transition:box-shadow 0.08s,transform 0.08s}
  .btn-pixel-primary:hover{box-shadow:2px 2px 0 #0d0d0d;transform:translate(2px,2px)}
  /* Lot 6 #26 — retour tactile "bouton pixel enfoncé" générique, indépendant de la couleur du
     bouton (contrairement à .btn-pixel-primary qui suppose le fond doré). :active plutôt que
     :hover pour bien réagir au toucher sur tablette/téléphone, pas seulement à la souris. */
  .btn-press{transition:transform 0.08s,box-shadow 0.08s}
  .btn-press:active{transform:translate(2px,2px);box-shadow:0 0 0 #0d0d0d!important}
  .hp-bar-fill{background:var(--hp);height:100%;border-radius:2px;transition:width 0.4s}
  .mp-bar-fill{background:var(--mp);height:100%;border-radius:2px;transition:width 0.4s}
  .xp-step-fill{background:var(--xp-clr);height:100%;border-radius:2px;transition:width 0.5s ease}
  input:focus{outline:none;}
  button:focus{outline:none;}
  @media(min-width:768px){
    .game-root{font-size:108%;}
    .fo-grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))!important;}
  }
  @media(min-width:1024px){
    .game-root{font-size:114%;}
    .fo-grid{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))!important;}
  }
`;

export const displayName = (player) => (player?.pseudo?.trim()) || player?.name || "";

// Thèmes visuels d'ACCENT/UI (Minecraft/Galaxie/Océan/Volcan/Forêt) — distinct de PLAYER_THEMES
// (themes.js, thèmes cosmétiques choisis par le joueur). Utilisé par App.jsx (thème hebdo) et
// par des composants extraits (PinPad, RewardPopup).
export const THEMES = {
  minecraft: { name:"Minecraft", bg:"#1a1a2e", primary:"#5D9E34", accent:"#D9BC5C", card:"rgba(0,0,0,0.5)", text:"#fff" },
  galaxy:    { name:"Galaxie",   bg:"#0a0a1a", primary:"#7A5FA8", accent:"#6BC4D9", card:"rgba(10,0,30,0.7)", text:"#fff" },
  ocean:     { name:"Océan",     bg:"#001a2e", primary:"#3D75A8", accent:"#5CCCA0", card:"rgba(0,10,30,0.7)", text:"#fff" },
  volcano:   { name:"Volcan",    bg:"#1a0a00", primary:"#B8543A", accent:"#D99248", card:"rgba(30,10,0,0.7)", text:"#fff" },
  forest:    { name:"Forêt",     bg:"#0a1a0a", primary:"#2E7D32", accent:"#A5D6A7", card:"rgba(0,20,0,0.7)",  text:"#fff" },
};
