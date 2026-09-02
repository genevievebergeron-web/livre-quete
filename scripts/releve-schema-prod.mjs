// ═══════════════════════════════════════════════════════════════════════════
// Relevé du SCHÉMA de la production — structure seule, aucune donnée de famille
// ═══════════════════════════════════════════════════════════════════════════
// v2.16.86 — pourquoi ce fichier existe : les dix étages de `check-merge-parity.mjs` ne valent que
// par leur RECENSEMENT, et ce recensement lit la fusion des FIXTURES du garde-fou. Un champ que ni
// `famA` ni `famB` ne porte est donc invisible à tous les contrôles de complétude — c'est ce qui a
// caché `feed[].likeTs`/`unlikes` pendant une nuit (v2.16.85). Le miroir coûte aussi : `house.deco`
// était une forme INVENTÉE par les fixtures, absente de la prod ET du code, et le 10e étage a crié
// dessus (v2.16.86) — la classer aurait gravé un faux durable dans le fichier.
//
// v2.16.88 — ce relevé partageait un défaut avec ce qu'il surveille : il s'arrêtait à la même
// profondeur que les recensements (un niveau sous une racine, plus les éléments des listes). Une
// comparaison ne peut RIEN reprocher à un plafond qu'elle a elle-même. Il descend maintenant sous
// ce plafond, mais sans jamais écrire une clé de plus : sous la surface recensée, chaque clé
// d'objet devient `*`. La sortie ne gagne donc que des FORMES (`gameStates.petEvo.*.*` = « des
// scalaires, deux niveaux sous un objet »), jamais un nom que la famille aurait choisi.
//
// Ce script fige la STRUCTURE de la prod dans le dépôt pour que le garde-fou puisse comparer.
// Ce qui est enregistré : des NOMS de champs (au premier niveau et dans les éléments de liste),
// des `*` en dessous, et des natures. Ce qui ne l'est JAMAIS : les valeurs, et les clés des objets
// à clés dynamiques (ids de joueur, ids de quête, dates).
//
//   node scripts/releve-schema-prod.mjs <prod.json> [> scripts/schema-prod.json]
//
// `<prod.json>` = la réponse brute de `GET /api/famille?id=…` (enveloppe `{data:…}` acceptée).
// Le fichier produit se relit à l'oeil : si une ligne ressemble à une donnée de famille, c'est un
// bug de ce script, pas une fatalité.
import fs from "node:fs";

const brut = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const d = brut.data || brut;

const estObjet = (v) => v && typeof v === "object" && !Array.isArray(v);
// Nature d'une valeur, sans jamais regarder ce qu'elle contient de nominatif.
const nature = (v) => {
  if (Array.isArray(v)) {
    if (!v.length) return "listeVide";
    return v.some(estObjet) ? "listeObjets" : "liste";
  }
  if (estObjet(v)) return Object.values(v).some(Array.isArray) ? "objetDeListes" : "objet";
  return "scalaire";
};

const schema = {};
// Un même champ n'a pas la même richesse chez les 4 enfants : `ritualCelebrated` vaut `{}` chez
// deux d'entre eux et `{day, ids}` chez les deux autres. On garde toujours la forme la PLUS riche,
// sinon le schéma décrit un enfant plutôt que l'app.
const RICHESSE = { scalaire: 0, listeVide: 1, liste: 2, objet: 2, objetDeListes: 3, listeObjets: 3 };
const pose = (chemin, nat) => {
  const avant = schema[chemin];
  if (avant === undefined || RICHESSE[nat] > RICHESSE[avant]) schema[chemin] = nat;
};

// SOUS le plafond des recensements : on continue de descendre, mais plus aucune clé n'est écrite.
// Une clé d'objet devient `*` ; on ne redescend dans une liste que si elle porte des OBJETS (la
// nature `liste` dit déjà tout d'une liste de valeurs simples, un `[]` de plus n'apprendrait rien).
const sousLePlafond = (v, chemin) => {
  if (Array.isArray(v)) {
    for (const el of v) if (estObjet(el)) {
      for (const [k, x] of Object.entries(el)) { pose(`${chemin}[].*`, nature(x)); sousLePlafond(x, `${chemin}[].*`); }
    }
    return;
  }
  if (!estObjet(v)) return;
  for (const x of Object.values(v)) { pose(`${chemin}.*`, nature(x)); sousLePlafond(x, `${chemin}.*`); }
};

// La surface NOMMÉE : un niveau de descente sous une racine, puis les ÉLÉMENTS des listes d'objets.
// C'est très exactement la surface que les étages 1-11 recensent — et sous chacun de ses arrêts,
// `sousLePlafond` prend le relais pour que le relevé voie plus loin que ce qu'il surveille.
const releve = (racine, dans) => {
  for (const [k, v] of Object.entries(racine || {})) {
    pose(`${dans}.${k}`, nature(v));
    if (estObjet(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        if (!Array.isArray(v2)) {                 // les clés dynamiques d'objet ne sont pas relevées…
          pose(`${dans}.${k}.*`, nature(v2));     // …mais leur FORME, si (v2.16.88)
          sousLePlafond(v2, `${dans}.${k}.*`);
          continue;
        }
        pose(`${dans}.${k}.${k2}`, nature(v2));   // une LISTE posée sous un objet, nommée (10e étage)
        for (const el of v2) if (estObjet(el))
          for (const [sk, sv] of Object.entries(el)) { pose(`${dans}.${k}.${k2}[].${sk}`, nature(sv)); sousLePlafond(sv, `${dans}.${k}.${k2}[].${sk}`); }
      }
    }
    if (!Array.isArray(v)) continue;
    for (const el of v) if (estObjet(el))
      for (const [sk, sv] of Object.entries(el)) { pose(`${dans}.${k}[].${sk}`, nature(sv)); sousLePlafond(sv, `${dans}.${k}[].${sk}`); }
  }
};

// v2.17.21 — LE PREMIER NIVEAU DE LA CHARGE, qu'aucun relevé n'avait jamais écrit. Ce fichier
// commençait à `d.config` et `d.gameStates` — exactement comme les quinze recensements de
// `check-merge-parity.mjs`, qui partent tous de `fam.config` / `fam.gameStates`. La racine de la
// charge elle-même (`savedAt`, `seenVersions`, et tout ce que le `...newer` des deux `mergeFamily`
// traîne) n'était donc lue par PERSONNE : ni ici, ni dans aucun étage. C'est la même faute que le
// plafond de la v2.16.88, montée d'un cran — un recensement borné au premier niveau ne peut rien
// dire de l'étage au-dessus de lui.
// `config` et `gameStates` sont posés pour leur NATURE seulement : leur contenu est relevé sous
// son propre préfixe juste en dessous, et redescendre ici écrirait tout l'arbre une seconde fois.
const releveRacine = (charge) => {
  for (const [k, v] of Object.entries(charge || {})) {
    pose(`charge.${k}`, nature(v));
    if (k === "config" || k === "gameStates") continue;
    sousLePlafond(v, `charge.${k}`);
  }
};

releveRacine(d);
releve(d.config, "config");
for (const gs of d.gameStates || []) releve(gs, "gameStates");

// v2.17.17 — `releveLe` est la date de GÉNÉRATION, plus celle de la prod. Elle valait
// `d.savedAt.slice(0,10)`, et la v2.17.16 s'est appuyée dessus pour mesurer l'âge du relevé et
// casser le build au-delà de 14 jours. Mais `savedAt` n'est pas l'horloge de ce fichier : c'est
// celle du GAGNANT de l'arbitrage de fusion, et elle peut s'arrêter pendant que la prod bouge.
// Mesuré le 26 août : la charge a gagné 20 octets (`seenVersions` 298 → 299, `"2.17.16"` ajouté
// dans les DEUX copies) avec un `savedAt` identique au dixième de milliseconde près. Régénérer
// ce soir-là produisait un fichier identique à l'octet — `releveLe` compris : la régénération
// était indiscernable de son absence. Et dans l'autre sens, un `savedAt` figé (six nuits
// observées en v2.17.16) fait monter l'âge d'un relevé refait chaque nuit, jusqu'à casser le
// build de tout le monde en conseillant une régénération qui n'y changerait rien.
// La date de la prod reste écrite à côté, sous son vrai nom — c'est une information de
// diagnostic, pas la mesure.
const sortie = {
  _lisezMoi: "Structure de la prod, sans aucune donnée de famille. `*` = une clé d'objet sous la surface recensée, jamais écrite. Régénérer avec scripts/releve-schema-prod.mjs.",
  releveLe: new Date().toISOString().slice(0, 10),
  prodSavedAt: d.savedAt || null,
  champs: Object.fromEntries(Object.keys(schema).sort().map((k) => [k, schema[k]])),
};
process.stdout.write(JSON.stringify(sortie, null, 2) + "\n");
