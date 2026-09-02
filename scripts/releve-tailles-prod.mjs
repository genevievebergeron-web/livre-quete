// ═══════════════════════════════════════════════════════════════════════════
// Relevé des TAILLES de la production — des octets par sous-arbre, aucune donnée de famille
// ═══════════════════════════════════════════════════════════════════════════
// v2.17.22 — pourquoi ce fichier existe. Deux nuits d'affilée, la charge de prod a bougé sans que
// personne puisse dire OÙ : le 1er septembre elle maigrit de 242 octets pendant que `seenVersions`
// en gagne 10, le 2 septembre `config` grossit de 1 300 pendant que « le reste » maigrit de 1 730.
// Les deux fois, le constat a été écrit comme OUVERT, et les deux fois pour la même raison : les
// tailles de la veille avaient été prises À LA MAIN, par une commande écrite nulle part. Une
// référence qu'on ne peut pas régénérer ne peut ni confirmer ni infirmer — elle n'est pas une
// référence, c'est un souvenir. `releve-schema-prod.mjs` avait réglé exactement ce problème pour la
// FORME ; ce fichier le règle pour la TAILLE, et il est écrit sur le même moule.
//
// Ce qui est enregistré : des NOMS de champs (ceux de l'app, jamais ceux que la famille a choisis),
// des `*` en dessous, et des COMPTES — octets, occurrences, nombre d'enfants, longueur cumulée des
// clés. Ce qui ne l'est JAMAIS : une valeur, et les clés des objets à clés dynamiques (ids de
// joueur, ids de quête, dates). Un nombre d'octets ne se relit pas en donnée.
//
//   node scripts/releve-tailles-prod.mjs <prod.json> > scripts/tailles-prod.json
//   node scripts/releve-tailles-prod.mjs <prod.json> --contre scripts/tailles-prod.json
//
// Le second mode est la SOUSTRACTION, et c'est lui qui répond à la question des deux nuits
// précédentes : il descend l'arbre depuis la racine et attribue chaque octet gagné ou perdu à un
// chemin, jusqu'à une ligne `(ponctuation)` pour ce qui revient aux accolades et aux virgules.
// Rien ne reste « ailleurs ».
//
// ── L'ATTRIBUTION EST EXACTE, ET C'EST CE QUI REND LE FICHIER VÉRIFIABLE ──────────────────────
// Pour tout conteneur, JSON impose une identité à l'octet près :
//   objet   : `{"a":1,"b":2}` = 2 accolades + (nb clés − 1) virgules + Σ ( "clé": + valeur )
//   liste   : `[x,y]`         = 2 crochets + (nb éléments − 1) virgules + Σ élément
// Agrégée sur les `n` occurrences d'un chemin :
//   octets = 2·n + (enfants − n + vides) + Σ_enfants (cles + octets)
// Cette identité ne tient QUE si tous les enfants ont été relevés. Un sous-arbre oublié par le
// parcours la casse — donc le fichier porte lui-même la preuve que son recensement est complet, et
// le garde-fou n'a qu'à la rejouer. C'est la leçon des v2.17.20/21 appliquée d'avance : ce n'est pas
// le détecteur qu'il faut mesurer, c'est le RECENSEMENT.
// `enfants` est compté à la source (`Object.keys(v).length`), jamais dérivé de la somme des enfants
// relevés : les deux nombres sont obtenus par des chemins indépendants, sinon la comparaison serait
// vraie par construction et ne mesurerait rien.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const estObjet = (v) => v && typeof v === "object" && !Array.isArray(v);
// De vrais octets UTF-8, pas des unités de chaîne JS : `JSON.stringify(x).length` compte « é » pour
// 1 alors que la charge en transporte 2, et l'écart n'est pas petit (1 710 octets sur la charge du
// 2 septembre, soit à peu près la taille du mystère qu'on cherchait à attribuer). L'identité JSON
// tient telle quelle en UTF-8 : accolades, crochets, virgules et deux-points sont tous à un octet,
// et la longueur en octets est additive sur la concaténation.
const octetsDe = (v) => Buffer.byteLength(JSON.stringify(v), "utf8");
// Ce qu'une clé coûte dans son parent : `"clé"` plus le `:`. On écrit la LONGUEUR, jamais la clé.
const coutCle = (k) => Buffer.byteLength(JSON.stringify(k), "utf8") + 1;

// ── LE RELEVÉ ────────────────────────────────────────────────────────────────────────────────
// La surface NOMMÉE est celle de `releve-schema-prod.mjs`, aux mêmes endroits et pour la même
// raison : un niveau sous `config` et sous un état de joueur, plus les champs des éléments de
// liste. En dessous, chaque clé devient `*`. Une seule différence, imposée par l'attribution : les
// ÉLÉMENTS d'une liste reçoivent leur propre chemin `[]`, sinon les champs d'élément seraient les
// enfants directs de la liste et l'identité ci-dessus ne se poserait pas.
export function relever(charge) {
  const chemins = new Map();
  const pose = (chemin, v, cles) => {
    let e = chemins.get(chemin);
    if (!e) e = { octets: 0, n: 0, cles: 0, enfants: 0, vides: 0, formes: new Set() };
    e.octets += octetsDe(v);
    e.n += 1;
    e.cles += cles;
    if (Array.isArray(v)) { e.formes.add("liste"); e.enfants += v.length; if (!v.length) e.vides += 1; }
    else if (estObjet(v)) { const k = Object.keys(v); e.formes.add("objet"); e.enfants += k.length; if (!k.length) e.vides += 1; }
    else e.formes.add("scalaire");
    chemins.set(chemin, e);
    return e;
  };

  // SOUS le plafond des recensements : on continue de descendre, mais plus aucune clé n'est écrite.
  const sousLePlafond = (v, chemin) => {
    if (Array.isArray(v)) {
      for (const el of v) {
        pose(`${chemin}[]`, el, 0);
        if (estObjet(el)) for (const [k, x] of Object.entries(el)) { pose(`${chemin}[].*`, x, coutCle(k)); sousLePlafond(x, `${chemin}[].*`); }
      }
      return;
    }
    if (!estObjet(v)) return;
    for (const [k, x] of Object.entries(v)) { pose(`${chemin}.*`, x, coutCle(k)); sousLePlafond(x, `${chemin}.*`); }
  };

  // Les éléments d'une liste, et leurs champs NOMMÉS (c'est la surface que les étages recensent).
  const elements = (liste, chemin) => {
    for (const el of liste) {
      pose(`${chemin}[]`, el, 0);
      if (!estObjet(el)) continue;
      for (const [sk, sv] of Object.entries(el)) { pose(`${chemin}[].${sk}`, sv, coutCle(sk)); sousLePlafond(sv, `${chemin}[].${sk}`); }
    }
  };

  const releve = (racine, dans) => {
    for (const [k, v] of Object.entries(racine || {})) {
      pose(`${dans}.${k}`, v, coutCle(k));
      if (estObjet(v)) {
        for (const [k2, v2] of Object.entries(v)) {
          if (!Array.isArray(v2)) {                                  // clés dynamiques : la forme, pas le nom
            pose(`${dans}.${k}.*`, v2, coutCle(k2));
            sousLePlafond(v2, `${dans}.${k}.*`);
            continue;
          }
          pose(`${dans}.${k}.${k2}`, v2, coutCle(k2));               // une LISTE posée sous un objet, nommée
          elements(v2, `${dans}.${k}.${k2}`);
        }
      }
      if (Array.isArray(v)) elements(v, `${dans}.${k}`);
    }
  };

  // LE PREMIER NIVEAU DE LA CHARGE (v2.17.21) : l'arbre part de la racine, pas de `config`.
  // `config` et `gameStates` sont posés ici pour leur taille ; leur contenu est relevé juste en
  // dessous, sous leur propre chemin, et l'identité les recolle.
  pose("charge", charge, 0);
  for (const [k, v] of Object.entries(charge || {})) {
    pose(`charge.${k}`, v, coutCle(k));
    if (k === "gameStates" && Array.isArray(v)) { for (const gs of v) pose("charge.gameStates[]", gs, 0); continue; }
    if (k === "config") continue;
    sousLePlafond(v, `charge.${k}`);
  }
  releve(charge?.config, "charge.config");
  for (const gs of charge?.gameStates || []) releve(gs, "charge.gameStates[]");

  const sortie = {};
  for (const c of [...chemins.keys()].sort()) {
    const e = chemins.get(c);
    sortie[c] = { octets: e.octets, n: e.n, cles: e.cles, enfants: e.enfants, vides: e.vides, forme: [...e.formes].sort().join("+") };
  }
  return sortie;
}

// ── LE PARENT D'UN CHEMIN ────────────────────────────────────────────────────────────────────
// `a.b[].c` → `a.b[]` ; `a.b[]` → `a.b` ; `charge.config` → `charge` ; `charge` → null.
// C'est de la LECTURE de chaîne : elle doit rendre le même arbre que le parcours, et le contrôle
// de complétude ci-dessous le vérifie dans les deux sens (aucun orphelin, aucun enfant manquant).
export function parentDe(chemin) {
  if (chemin.endsWith("[]")) return chemin.slice(0, -2);
  const i = chemin.lastIndexOf(".");
  return i < 0 ? null : chemin.slice(0, i);
}

// ── LES CONSTATS ─────────────────────────────────────────────────────────────────────────────
// Fonction PURE, partagée par la génération, par le garde-fou et par ses témoins. Elle ne crie
// pas : elle rend ce qu'elle a vu. (Leçon v2.17.20 : un témoin qui appelle la mesure directement
// ne prouve rien de la boucle qui est censée la lui demander.)
// `charge` est FACULTATIVE : le garde-fou du build relit le fichier committé sans avoir la prod
// sous la main, la génération l'a. Elle sert un seul axe, `[unité]`, et cet axe ne peut pas être
// mesuré sans elle — l'identité ci-dessus est invariante d'échelle : si TOUT est compté en unités
// de chaîne JS au lieu d'octets UTF-8, elle tient quand même, à l'octet près, et ne dit rien.
// Mesuré : c'est la seule falsification du parcours que les autres axes ne voient pas. Elle se
// tranche en confrontant le total à un encodeur INDÉPENDANT — deux mécanismes qui doivent tomber
// sur le même nombre, plutôt qu'une formule confrontée à elle-même.
export function constats(chemins, charge) {
  const out = [];
  if (charge !== undefined) {
    const parAilleurs = new TextEncoder().encode(JSON.stringify(charge)).length;
    const releve = chemins["charge"] ? chemins["charge"].octets : 0;
    if (releve !== parAilleurs)
      out.push(`[unité] la racine est relevée à ${releve} et un encodeur indépendant la mesure à `
             + `${parAilleurs} : ce fichier ne compte pas des octets`);
  }
  const noms = Object.keys(chemins);
  const enfantsDe = new Map(noms.map((c) => [c, []]));
  // [donnée] — la règle qui justifie l'existence de ce fichier dans le dépôt, MESURÉE plutôt que
  // promise. Un chemin n'a le droit d'être fait que de noms de champs de l'app, de `*`, de `[]` et
  // de points. Un tiret, un espace, un accent, une majuscule inattendue : c'est une clé que la
  // FAMILLE a choisie (une date `2026-08-14`, un id de joueur), donc une donnée personnelle écrite
  // dans un fichier suivi par git. Le trait d'union n'est pas toléré exprès : c'est la signature
  // d'une date.
  for (const c of noms)
    if (!/^[A-Za-z0-9_.*[\]]+$/.test(c))
      out.push(`[donnée] le chemin « ${c} » n'est pas fait que de noms de champs de l'app : ce relevé `
             + `a écrit une clé choisie par la famille`);
  for (const c of noms) {
    const p = parentDe(c);
    if (p === null) continue;
    if (!enfantsDe.has(p)) { out.push(`[orphelin] « ${c} » n'a pas de parent relevé (« ${p} » manque)`); continue; }
    enfantsDe.get(p).push(c);
  }
  for (const c of noms) {
    const e = chemins[c];
    const enf = enfantsDe.get(c) || [];
    // [compte] — le nombre d'enfants compté À LA SOURCE contre le nombre d'occurrences relevées.
    const releves = enf.reduce((s, x) => s + chemins[x].n, 0);
    if (e.enfants !== releves)
      out.push(`[compte] « ${c} » porte ${e.enfants} enfant(s) dans la prod et ${releves} relevé(s) : `
             + `le parcours en a sauté ${e.enfants - releves}`);
    // [octets] — l'identité JSON. Elle ne se pose que sur un conteneur de forme homogène : un
    // chemin qui agrège des objets ET des scalaires n'a pas de ponctuation commune.
    if (e.forme !== "objet" && e.forme !== "liste") continue;
    const attendu = 2 * e.n + (e.enfants - e.n + e.vides) + enf.reduce((s, x) => s + chemins[x].cles + chemins[x].octets, 0);
    if (attendu !== e.octets)
      out.push(`[octets] « ${c} » pèse ${e.octets} octet(s) et ses enfants relevés en expliquent `
             + `${attendu} : ${e.octets - attendu} octet(s) ne sont attribués à rien`);
  }
  return out;
}

// ── LA SOUSTRACTION ──────────────────────────────────────────────────────────────────────────
// Descente depuis la racine : chaque écart est attribué à un enfant, ou à la ponctuation du
// conteneur. On n'affiche que ce qui a bougé, et on s'arrête de descendre quand un sous-arbre est
// identique — c'est le sous-arbre qui répond, pas la liste de tous les chemins.
function soustraire(avant, apres) {
  const lignes = [];
  const enf = (chemins, c) => Object.keys(chemins).filter((x) => parentDe(x) === c);
  const oct = (chemins, c) => (chemins[c] ? chemins[c].octets : 0);
  const descendre = (c, prof) => {
    const d = oct(apres, c) - oct(avant, c);
    const ind = "  ".repeat(prof);
    const marque = !avant[c] ? " ← NOUVEAU" : !apres[c] ? " ← DISPARU" : "";
    lignes.push(`${ind}${d >= 0 ? "+" : ""}${d}\t${c}${marque}`);
    const enfants = [...new Set([...enf(avant, c), ...enf(apres, c)])].sort();
    if (!enfants.length) return;
    let explique = 0;
    const bouge = [];
    for (const x of enfants) {
      const dx = oct(apres, x) - oct(avant, x) + ((apres[x]?.cles || 0) - (avant[x]?.cles || 0));
      explique += dx;
      if (dx !== 0) bouge.push(x);
    }
    for (const x of bouge) descendre(x, prof + 1);
    if (d - explique !== 0)
      lignes.push(`${ind}  ${d - explique >= 0 ? "+" : ""}${d - explique}\t(ponctuation de ${c})`);
  };
  descendre("charge", 0);
  return lignes;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
// Importé par `scripts/check-merge-parity.mjs`, ce fichier ne doit RIEN exécuter : la garde compare
// des chemins résolus, pas des noms de fichier.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const brut = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const d = brut.data || brut;
  const chemins = relever(d);
  const soucis = constats(chemins, d);
  const iContre = process.argv.indexOf("--contre");

  if (iContre > 0) {
    const ancien = JSON.parse(fs.readFileSync(process.argv[iContre + 1], "utf8"));
    const dTotal = chemins["charge"].octets - ancien.chemins["charge"].octets;
    console.log(`Relevé du ${ancien.releveLe} (charge datée du ${ancien.prodSavedAt || "?"}) → maintenant `
              + `(charge datée du ${d.savedAt || "?"})`);
    console.log(`Total : ${ancien.chemins["charge"].octets} → ${chemins["charge"].octets} `
              + `(${dTotal >= 0 ? "+" : ""}${dTotal} octets)\n`);
    for (const l of soustraire(ancien.chemins, chemins)) console.log(l);
    if (soucis.length) { console.error(`\n⚠ relevé incohérent, la soustraction ci-dessus est douteuse :`); for (const s of soucis) console.error("  " + s); }
    process.exit(0);
  }

  // La génération refuse d'écrire un relevé qui ne s'explique pas lui-même : un fichier committé
  // avec un trou ferait crier le garde-fou de tout le monde, et pour une faute de CE script.
  if (soucis.length) {
    console.error("✗ Le parcours de ce script n'explique pas la charge à l'octet :");
    for (const s of soucis) console.error("  " + s);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({
    _lisezMoi: "Tailles de la prod par sous-arbre, sans aucune donnée de famille : des noms de champs de l'app, des `*` pour les clés dynamiques, et des octets. Régénérer avec scripts/releve-tailles-prod.mjs ; soustraire avec --contre.",
    releveLe: new Date().toISOString().slice(0, 10),
    prodSavedAt: d.savedAt || null,
    chemins,
  }, null, 2) + "\n");
}
