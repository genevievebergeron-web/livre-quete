// ─── FILE D'ERREURS DURABLE (v2.16.42) ────────────────────────────────────────
// Écrite directement dans localStorage, hors de tout composant React.
//
// POURQUOI CE MODULE EXISTE. La capture d'erreurs techniques (v1.90.0, chantier
// « logs techniques » du 21 juillet) vivait entièrement dans un `useEffect` d'`App()` :
// les handlers `error`/`unhandledrejection` appelaient `setConfig`/`persist` pour
// écrire dans `config.errorLogs`. Ça marche pour une erreur bénigne, mais pas pour
// celle qui compte : une erreur de RENDU démonte tout l'arbre React (page blanche),
// donc l'effet est nettoyé, les handlers retirés, et l'écriture d'état n'aboutit
// jamais. Autrement dit, la seule catégorie d'erreurs qui casse réellement l'app
// était justement celle qui ne se journalisait pas — et `config.errorLogs` est resté
// VIDE en prod pendant plus d'un mois pendant que des enfants signalaient « rien ne
// se passe » / « ça ne marche pas » (voir les 14 `config.bugs` et chaque passage de
// `MAINTENANCE.md` depuis le 31 juillet, qui relèvent tous « errorLogs vide »).
//
// Ici, tout est synchrone et sans React : `queueError` peut être appelée depuis un
// `componentDidCatch` juste avant que l'arbre disparaisse, ou depuis un handler
// global. `App()` vide la file dans `config.errorLogs` au prochain rendu sain, d'où
// elle se synchronise vers le portail parent (onglet Journal) exactement comme
// `config.bugs`.

export const ERR_QUEUE_KEY = "livre-quete-errq-v1";
const MAX_QUEUED = 20;      // plafond dur : une erreur qui boucle ne doit pas remplir le localStorage
const DEDUPE_MS = 60000;    // même erreur < 1 min → ignorée (même règle que la capture v1.90.0)
const MAX_AGE_MS = 864e5;   // 24 h — une entrée jamais confirmée finit par être abandonnée (anti-boucle)

const sig = (e) => (e?.message || "") + "|" + (e?.stack || "").slice(0, 200);

function readQueue() {
  try {
    const raw = localStorage.getItem(ERR_QUEUE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// Met une entrée en file. Renvoie l'entrée écrite, ou null si doublon/échec —
// jamais d'exception : journaliser une erreur ne doit jamais en provoquer une autre.
export function queueError(entry) {
  try {
    if (!entry || !entry.message) return null;
    const q = readQueue();
    const k = sig(entry);
    if (q.some(e => sig(e) === k && Math.abs((entry.ts || 0) - (e.ts || 0)) < DEDUPE_MS)) return null;
    localStorage.setItem(ERR_QUEUE_KEY, JSON.stringify([entry, ...q].slice(0, MAX_QUEUED)));
    return entry;
  } catch { return null; }
}

// Lit la file SANS la vider (le plus récent d'abord), en écartant au passage les entrées
// périmées. La lecture est volontairement non destructive : `App()` ne retire une entrée
// (`dropQueuedErrors`) qu'une fois qu'il l'a VUE dans `config.errorLogs`. Sans ce
// deux-temps, une entrée sortie de la file mais dont l'écriture de config est ensuite
// écrasée (course au démarrage, second plantage immédiat…) serait perdue pour de bon —
// exactement ce qui rendait le journal vide au départ, on ne recrée pas ce trou ici.
export function peekErrorQueue() {
  const q = readQueue();
  const cut = Date.now() - MAX_AGE_MS;
  const kept = q.filter(e => e && e.id && (e.ts || 0) > cut);
  if (kept.length !== q.length) { try { localStorage.setItem(ERR_QUEUE_KEY, JSON.stringify(kept)); } catch { /* quota/private mode */ } }
  return kept;
}

// Retire de la file les entrées confirmées (déjà présentes dans config.errorLogs).
export function dropQueuedErrors(ids) {
  try {
    const drop = new Set(ids || []);
    if (!drop.size) return;
    const kept = readQueue().filter(e => !drop.has(e && e.id));
    if (kept.length) localStorage.setItem(ERR_QUEUE_KEY, JSON.stringify(kept));
    else localStorage.removeItem(ERR_QUEUE_KEY);
  } catch { /* quota/private mode */ }
}
