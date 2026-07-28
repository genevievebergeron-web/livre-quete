// ─── PETITS UTILITAIRES PARTAGÉS ────────────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : constantes/fonctions pures
// utilisées à la fois par App.jsx (44+ appels) et par des composants extraits (ex. WeekView,
// SetupWizard) — vivent ici pour éviter tout import circulaire entre App.jsx et les modules extraits.
import { PLAYER_THEMES } from "./themes.js";
import { custodyWeekKey } from "./recurring.js";

export const DAYS_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
export const MONTHS_SHORT = ["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];

// Backlog UX #8 — date lisible ("Mar 21 juil") plutôt qu'un ISO brut ("2026-07-21") dans
// les écrans de calendrier destinés aux enfants.
export const fmtDateShort = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return `${DAYS_SHORT[(d.getDay()+6)%7]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

export const uid = () => Math.random().toString(36).slice(2,9);

export const todayStamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export const COLORS = ["#5F87B3","#A874B0","#5CAD68","#C77B54","#D9BC5C","#D97070","#4FA8B3","#8A5A96","#C4789E","#0a0a0a","#F0F0FF"];

// Lot 6 #26 — mapping ancien→nouveau pour la migration ponctuelle des couleurs de joueurs déjà
// choisies (voir migrateSavedData, App.jsx) : la couleur d'un enfant est enregistrée une fois
// dans son profil et ne se recalcule plus jamais depuis COLORS — sans cette migration, le
// changement de palette ci-dessus n'aurait aucun effet sur les enfants déjà configurés.
export const COLOR_DESATURATE_MAP = {
  "#4A90D9":"#5F87B3", "#C060D0":"#A874B0", "#2ECC40":"#5CAD68", "#FF6B35":"#C77B54",
  "#FFD700":"#D9BC5C", "#FF4444":"#D97070", "#00BCD4":"#4FA8B3", "#9C27B0":"#8A5A96",
  "#FF69B4":"#C4789E",
};

export const weekKey = (dd=new Date()) => { const d=new Date(dd); const day=d.getDay(); const mon=new Date(d); mon.setDate(d.getDate()-((day+6)%7)); return `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,"0")}-${String(mon.getDate()).padStart(2,"0")}`; }; // date LOCALE (toISOString/UTC basculait après 20h, même bug que custodyWeekKey)

// Returns 2 random non-secret theme IDs for a brand-new player
export const pickStarterThemes = () => {
  const pool = Object.keys(PLAYER_THEMES).filter(k => k !== "none" && !PLAYER_THEMES[k].secret);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
};

// v1.93.0 (Lot 4 #20) — thème hebdomadaire gratuit : chaque semaine, un thème non-secret est
// débloqué pour TOUT LE MONDE sans XP, en plus des déblocages XP/starter existants.
// v2.5.0 (Correctif 1) — aligné sur custodyWeekKey (vendredi→vendredi) plutôt que weekKey
// (lundi→dimanche), pour cohérence avec le reset hebdomadaire des pièces.
export const getWeeklyFreeTheme = () => {
  const pool = Object.keys(PLAYER_THEMES).filter(k => k !== "none" && !PLAYER_THEMES[k].secret);
  const wk = custodyWeekKey();
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
  /* Refonte visuelle Phase 6 (27-07) — wow-moments : pur CSS, tués gratuitement par .calm-mode et
     prefers-reduced-motion (règles déjà en place ci-dessus). raysSpin = rotation lente d'un
     conic-gradient de rayons derrière un élément ; popIn = léger dépassement à l'arrivée. */
  @keyframes raysSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes popIn{0%{transform:scale(0.6);opacity:0}70%{transform:scale(1.08);opacity:1}100%{transform:scale(1);opacity:1}}
  @keyframes blink{0%,100%{opacity:1}49%{opacity:1}50%,99%{opacity:0}}
  @keyframes xpFill{from{width:0}to{width:var(--xp-target)}}
  :root{--hp:#ff4444;--mp:#4488ff;--gold:#D9BC5C;--xp-clr:#4ade80;--xp-bg:#0d2010;
    --b-soft:#3a3a48; --b-mid:#565668;
    --elev1:0 2px 0 #0d0d0d, inset 0 1px 0 rgba(255,255,255,0.06);
    --elev2:0 4px 0 #0d0d0d, 0 6px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08);
    /* Refonte Phase 7 (28-07) — profondeur "maquette" : fond très sombre, tuiles en dégradé,
       ombre portée profonde + liseré clair en haut (relief), cf. maquette de référence Gen. */
    --bg-deep:#0b0b12;
    --tile-bg:linear-gradient(160deg,#232330,#15151d);
    --elev3:0 6px 0 #0d0d0d, 0 12px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10);
  }
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
  /* Refonte visuelle Phase 1 (26-07) — fondations : tokens + classes utilitaires, patron
     ".readable-font" (classe + !important bat l'inline). NO-OP tant qu'aucun className n'est
     posé sur un élément — les phases 2-4 migrent les bordures dorées vers ces classes. */
  .card-n1{border:2px solid var(--b-soft)!important;background:linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.35))!important;box-shadow:var(--elev1)!important;border-radius:5px!important}
  .card-n2{border:2px solid var(--b-mid)!important;box-shadow:var(--elev2)!important;border-radius:5px!important}
  .card-gold{border:4px solid var(--gold)!important;box-shadow:0 0 0 2px #0d0d0d,0 0 28px #D9BC5C45,4px 4px 0 #0d0d0d!important;border-radius:5px!important}
  /* Raretés cosmétiques factorisées — mêmes couleurs que RARITIES (catalog.js), pour dédupliquer
     le style inline déjà utilisé pour les items de boutique (rarityOf). */
  .rarity-commun{border:2px solid #9AA0A644!important;background:linear-gradient(180deg,#9AA0A614,rgba(0,0,0,0.45))!important}
  .rarity-rare{border:2px solid #4FA3FF!important;background:linear-gradient(180deg,#4FA3FF14,rgba(0,0,0,0.45))!important}
  .rarity-ultra{border:2px solid #B06BFF!important;background:linear-gradient(180deg,#B06BFF14,rgba(0,0,0,0.45))!important}
  .rarity-legendaire{border:2px solid #FFB02E!important;background:linear-gradient(180deg,#FFB02E14,rgba(0,0,0,0.45))!important;box-shadow:0 0 10px #FFB02E55!important}
  .rarity-unique{border:2px solid #FF5BAE!important;background:linear-gradient(180deg,#FF5BAE14,rgba(0,0,0,0.45))!important;box-shadow:0 0 10px #FF5BAE55!important}
  /* Plancher de lisibilité (Phase 1) : VT323 jamais <15px, Press Start 2P jamais <7px pour du
     texte porteur de sens (pas les micro-libellés décoratifs). */
  .body-txt{font-family:'VT323',monospace!important;font-size:17px!important;line-height:1.35!important}
  /* Refonte visuelle Phase 6 — rayons décoratifs derrière un élément "wow" (RewardPopup, coffre,
     victoire boss). currentColor = hérite la couleur posée par le composant appelant (rar.color,
     accent du thème…). animation seule = tuée gratuitement par .calm-mode/prefers-reduced-motion,
     le halo statique (box-shadow posé par l'appelant) reste visible même figé. */
  .rays-bg{position:absolute;width:180%;height:180%;left:-40%;top:-40%;border-radius:50%;
    background:conic-gradient(currentColor 0deg,transparent 8deg 32deg,currentColor 40deg,transparent 48deg 72deg,currentColor 80deg,transparent 88deg 112deg,currentColor 120deg,transparent 128deg 152deg,currentColor 160deg,transparent 168deg 192deg,currentColor 200deg,transparent 208deg 232deg,currentColor 240deg,transparent 248deg 272deg,currentColor 280deg,transparent 288deg 312deg,currentColor 320deg,transparent 328deg 352deg,currentColor 360deg);
    opacity:0.18;animation:raysSpin 14s linear infinite;pointer-events:none;z-index:0}
  /* ── Refonte Phase 7 (28-07) — "léché, assumé, moins IA" : composants du look maquette ── */
  /* Tuile carrée arrondie pour le sprite à gauche des cartes (cœur visuel de la maquette). */
  .icon-tile{display:flex!important;align-items:center!important;justify-content:center!important;
    width:44px;height:44px;flex:0 0 44px;background:var(--tile-bg)!important;
    border:2px solid var(--b-soft)!important;border-radius:8px!important;
    box-shadow:inset 0 2px 6px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.05)!important}
  /* Pastille de coût dorée compacte, à droite des cartes (ex. <Coin/> 40). */
  .chip-cost{display:inline-flex!important;align-items:center!important;gap:4px!important;
    font-family:'Press Start 2P',monospace!important;font-size:7px!important;color:var(--gold);
    background:rgba(217,188,92,0.10);border:1px solid rgba(217,188,92,0.55);
    border-radius:999px!important;padding:4px 8px!important;white-space:nowrap!important}
  /* Fond d'ambiance : dégradé radial chaud + vignette (remplace les fonds plats). Statique. */
  .vignette-bg{background:
    radial-gradient(120% 90% at 50% 0%, #1a1626 0%, var(--bg-deep) 55%) fixed,
    var(--bg-deep)!important;
    box-shadow:inset 0 0 120px rgba(0,0,0,0.65)!important}
  /* Grain statique très léger (data-URI 64px) — texture, zéro animation (calm-mode safe). */
  .texture-grain{position:relative}
  .texture-grain::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0.05;border-radius:inherit;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='64' height='64' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E")}
  /* Carte de quête en relief : évolution de .card-n2 avec --elev3 + liseré haut clair. */
  .card-quest{border:2px solid var(--b-soft)!important;border-top:2px solid rgba(255,255,255,0.14)!important;
    background:var(--tile-bg)!important;box-shadow:var(--elev3)!important;border-radius:8px!important}
  /* Barres de progression réutilisables (XP, boss, défi) — visibles, arrondies, liseré sombre. */
  .progress-track{height:10px!important;background:#0a0a10!important;border:2px solid #0d0d0d!important;
    border-radius:999px!important;overflow:hidden!important;box-shadow:inset 0 2px 4px rgba(0,0,0,0.6)!important}
  .progress-fill{height:100%!important;border-radius:999px!important;transition:width 0.5s ease!important;
    background:linear-gradient(180deg,rgba(255,255,255,0.25),rgba(255,255,255,0) 45%),currentColor!important}
  /* Halo épique statique multi-couches (récompenses épiques, victoires). Seul .rays-bg anime —
     déjà couvert par .calm-mode/prefers-reduced-motion. currentColor = couleur du wow. */
  .epic-halo{box-shadow:0 0 0 2px #0d0d0d, 0 0 18px currentColor, 0 0 48px rgba(255,176,46,0.35), inset 0 0 14px rgba(255,255,255,0.12)!important}
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
