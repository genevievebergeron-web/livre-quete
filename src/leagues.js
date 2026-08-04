// ─── LIGUES INDIVIDUELLES (Backlog #13, décision actée dans le plan §#13) ───
// Volontairement NON comparatives entre frères/sœurs — PHILOSOPHIE.md interdit toute mécanique
// de classement/FOMO entre enfants, et l'écart de revenus documenté (jusqu'à 2,1×) rendrait un
// classement direct structurellement injuste. Chaque enfant progresse dans SES PROPRES paliers,
// basés sur SA propre activité récente (jours actifs glissants sur 7 jours) — jamais de
// rétrogradation punitive : le palier stocké (`gs.leagueTier`) ne peut que monter (ratchet),
// recalculé et fusionné comme `xp`/`coinsLifetime` (Math.max, jamais décrémenté).
export const LEAGUES = [
  { id: "bronze",  name: "Bronze",  emoji: "🥉", color: "#C77B54", minActiveDays: 0 },
  { id: "argent",  name: "Argent",  emoji: "🥈", color: "#B8BEC7", minActiveDays: 3 },
  { id: "or",      name: "Or",      emoji: "🥇", color: "#D9BC5C", minActiveDays: 5 },
  { id: "diamant", name: "Diamant", emoji: "💎", color: "#5FD3E0", minActiveDays: 7 },
];

const _key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Jours actifs dans les 7 derniers jours (fenêtre glissante, aujourd'hui inclus).
export const activeDaysThisWeek = (activeDays) => {
  const set = new Set(activeDays || []);
  const d = new Date(); d.setHours(12, 0, 0, 0);
  let n = 0;
  for (let i = 0; i < 7; i++) { if (set.has(_key(d))) n++; d.setDate(d.getDate() - 1); }
  return n;
};

export const leagueRank = (id) => Math.max(0, LEAGUES.findIndex(l => l.id === id));

export const leagueOf = (id) => LEAGUES.find(l => l.id === id) || LEAGUES[0];

// Palier "mérité" par l'activité de la semaine glissante — PAS forcément le palier affiché
// (voir ratchet dans migrateGameState : le stocké ne descend jamais sous ce qui a déjà été atteint).
export const computeLeagueTier = (activeDays) => {
  const n = activeDaysThisWeek(activeDays);
  let tier = LEAGUES[0].id;
  for (const l of LEAGUES) if (n >= l.minActiveDays) tier = l.id;
  return tier;
};
