// ─── NIVEAUX / XP ───────────────────────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : données pures + petites
// fonctions dérivées, zéro état partagé. Seule dépendance externe : getPlayerTheme
// (déjà son propre module, src/themes.js) pour le titre du thème par niveau.
import { getPlayerTheme } from "./themes.js";

// Courbe plus exigeante + 10 niveaux (les enfants trouvaient ça trop facile).
// Les paliers 1→4 restent proches pour ne RÉTROGRADER personne; ça devient dur après.
export const LEVELS = [
  { level:1,  xpNeeded:0,    title:"Débutant",   titleF:"Débutante"   },
  { level:2,  xpNeeded:70,   title:"Aventurier", titleF:"Aventurière" },
  { level:3,  xpNeeded:150,  title:"Héros",      titleF:"Héroïne"     },
  { level:4,  xpNeeded:300,  title:"Champion",   titleF:"Championne"  },
  { level:5,  xpNeeded:500,  title:"LÉGENDE",    titleF:"LÉGENDE"     },
  { level:6,  xpNeeded:760,  title:"MYTHIQUE",   titleF:"MYTHIQUE"    },
  { level:7,  xpNeeded:1080, title:"MYTHIQUE",   titleF:"MYTHIQUE"    },
  { level:8,  xpNeeded:1480, title:"DIVIN",      titleF:"DIVIN"       },
  { level:9,  xpNeeded:1980, title:"DIVIN",      titleF:"DIVIN"       },
  { level:10, xpNeeded:2600, title:"SUPRÊME",    titleF:"SUPRÊME"     },
];
export const getLevel = xp => { let c = LEVELS[0]; for (const l of LEVELS) if (xp >= l.xpNeeded) c = l; return c; };
export const getLevelTitle = (xp, themeId, fem = false) => {
  const lv = getLevel(xp);
  const pt = getPlayerTheme(themeId);
  // Niv. 1–5 : titre du thème. Niv. 6+ (prestige) : titre générique MYTHIQUE/DIVIN/SUPRÊME.
  // v2.5.27 — `fem` (réglage par enfant `settings.femTitles`) branche enfin titleF/levelsF.
  const themeLevels = (fem && pt.levelsF) ? pt.levelsF : pt.levels;
  const title = lv.level <= 5
    ? (themeLevels[Math.min(lv.level - 1, 4)] || themeLevels[0])
    : (fem ? (lv.titleF || lv.title) : lv.title);
  return { level: lv.level, title };
};
export const xpBar = xp => { for (let i=0;i<LEVELS.length-1;i++) if (xp<LEVELS[i+1].xpNeeded) return { cur: xp-LEVELS[i].xpNeeded, needed: LEVELS[i+1].xpNeeded-LEVELS[i].xpNeeded }; return {cur:1,needed:1}; };
