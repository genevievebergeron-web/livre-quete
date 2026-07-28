#!/usr/bin/env node
// Refonte Phase 7 — construit les jobs.json PixelLab pour toutes les vagues d'icônes/sprites.
// Usage : node scripts/build-icon-jobs.mjs <wave1|wave2|wave3|wave4|wave5|wave6|all> [outDir]
// Source unique : UI_ICONS (catalog.js) + TASK_CATALOG + REWARD_CATALOG + BADGES + thèmes/items.
// Le PRÉFIXE DE STYLE est figé ici après la vague 0 de calibration — ne pas le modifier
// sans re-passer par une vague de probes, sinon les 400+ sprites divergent.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { UI_ICONS, TASK_CATALOG, REWARD_CATALOG, BADGES } from "../src/catalog.js";
import { PT_LIST, ALL_SHOP_ITEMS } from "../src/themes.js";
import { PET_SPRITES } from "../src/pets.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[3] || path.join(ROOT, "scripts", "jobs");
fs.mkdirSync(OUT, { recursive: true });

// ── Préfixe figé (vague 0, 2026-07-28) ──
const PREFIX = "16-bit pixel art game icon, dark fantasy RPG UI style, warm gold and deep charcoal palette, crisp readable silhouette, centered, transparent background — ";

const UI  = (name, desc) => ({ out: `public/sprites/ui/${name}.png`,  description: PREFIX + desc, width: 32, height: 32, detail: "low detail",    shading: "flat shading" });
const MID = (name, desc) => ({ out: `public/sprites/ui/${name}.png`,  description: PREFIX + desc, width: 48, height: 48, detail: "medium detail", shading: "basic shading" });
const ITEM= (id, desc, dir="items") => ({ out: `public/sprites/${dir}/${id}.png`, description: PREFIX + desc, width: 64, height: 64, detail: "medium detail", shading: "basic shading" });

// Les items qui ont DÉJÀ un PNG sur disque ne sont pas régénérés.
const hasPng = (dir, id) => fs.existsSync(path.join(ROOT, "public", "sprites", dir, `${id}.png`));

// ── Vague 1 : UI cœur (nav, monnaies/états, onglets boutique, catégories) ──
const wave1 = Object.entries(UI_ICONS)
  .filter(([n]) => /^(nav_|shop_|cat_)/.test(n) || ["coin","xp","heart","lock","check","checkbox_empty","hourglass","gift","star","gem"].includes(n))
  .map(([n, v]) => UI(n, v.desc));

// ── Vague 2 : portail parent, calendrier, boss + récompenses ──
const wave2 = [
  ...Object.entries(UI_ICONS).filter(([n]) => /^(parent_|cal_|boss_mod_)/.test(n)).map(([n, v]) => UI(n, v.desc)),
  ...REWARD_CATALOG.map(r => MID(r.id, rewardDesc(r))),
];
function rewardDesc(r){
  const map = {
    rw_ecran:"handheld game console glowing screen", rw_parent:"two hands forming a heart",
    rw_dessert:"slice of layered cake with cherry", rw_dejsoup:"stack of pancakes with syrup",
    rw_epicerie:"grocery basket with fresh goods", rw_depanneur:"corner store snack bag and drink",
    rw_jeu:"board game with dice and meeples", rw_souper:"covered dinner plate, silver cloche",
    rw_bonbon:"wrapped candy", rw_ricochet:"curved bouncing arrow ricochet",
    rw_debarrasse:"sparkling clean empty plate", rw_servi:"served plate with fork and knife",
    rw_pasdetache:"hammock between two posts, day off", rw_dejlit:"breakfast tray on a bed",
    rw_musique:"music note with sound waves", rw_esclave:"magic lamp with genie smoke",
    rw_bain:"bathtub with bubbles and candles",
  };
  return map[r.id] || r.label;
}

// ── Vague 3 : 69 tâches ──
const TASK_DESC = {
  tc01:"open dishwasher rack with clean dishes", tc02:"open dishwasher lower rack with plates",
  tc03:"dishes going into dishwasher", tc04:"soapy sponge washing a big pot",
  tc05:"frying pan and spatula cooking", tc06:"open lunch box with containers",
  tc07:"cloth wiping a wooden table", tc08:"sponge wiping kitchen counter",
  tm01:"tied garbage bag", tm02:"garbage bin at the curb", tm03:"recycling bin with bottles",
  tm04:"blue recycling bin at curb", tm05:"compost pail with peels", tm06:"compost bin outdoors",
  tm07:"mop and bucket with suds", tm08:"neatly made bed with pillow", tm09:"tidy cozy bedroom",
  tm10:"tidy desk with lamp and books", tm11:"folded clothes pile", tm12:"clean bathroom sink sparkling",
  tm13:"tidy sunroom with cushions",
  tr01:"bowl of cereal with spoon", tr02:"pill organizer with vitamins", tr03:"packed school backpack",
  tr04:"shower head with steam", tr05:"bathtub with duck", tr06:"open homework notebook and pencil",
  tr07:"crescent moon and toothbrush", tr08:"soap bar and toothbrush", tr09:"morning pill with sun",
  tr10:"evening pill with moon", tr11:"opened lunch box being emptied", tr12:"sandwich going into lunch box",
  td01:"sleeping family under moon, quiet", td02:"calm bowl of soup with steam", td03:"speech bubble with heart",
  td04:"two speech bubbles shaking hands", td05:"bed with clock showing evening", td06:"toothbrush and cup solo",
  td07:"open book with small reading lamp", td08:"sleeping child with stars", td09:"rabbit with fresh greens",
  td10:"two kids playing blocks peacefully",
  rc_brassee:"laundry basket with clothes", rc_lavabo_cuisine:"clean kitchen sink faucet",
  rc_contour_bain:"sponge cleaning bathtub rim", rc_chaises:"wooden chair being wiped",
  rc_veranda:"watering can over potted plant", rc_balcon:"balcony flower box being watered",
  to01:"soccer ball on grass with sun", to02:"bicycle", to03:"watering can over garden row",
  to04:"pink flowers being watered",
};
const wave3 = TASK_CATALOG.map(t => MID(`task_${t.id}`, TASK_DESC[t.id] || t.label));

// ── Vague 4 : 50 glyphes de badges (glyphe central du médaillon, pas la médaille entière) ──
const BADGE_DESC = {
  b_first:"single star glyph", b_5tasks:"flame glyph", b_20tasks:"flexed arm glyph", b_50tasks:"trophy cup glyph",
  b_xp100:"lightning bolt glyph", b_xp300:"storm cloud with bolt glyph", b_xp500:"supernova starburst glyph",
  b_coins50:"money pouch glyph", b_coins150:"coins stack glyph", b_buy1:"shopping cart glyph", b_buy5:"shopping bags glyph",
  b_streak3:"calendar page glyph", b_level2:"arrow up glyph", b_level3:"rocket glyph", b_level4:"crown glyph", b_level5:"rainbow arc glyph",
  bt_mc1:"pickaxe glyph", bt_mc2:"blue diamond glyph", bt_rb1:"game controller glyph", bt_rb2:"construction crane glyph",
  bt_hp1:"magic wand with sparks glyph", bt_hp2:"owl glyph", bt_gh1:"leaf sprout glyph", bt_hor1:"skull glyph",
  bt_hor2:"blood drop glyph", bt_mon1:"friendly monster eye glyph", bt_lic1:"unicorn horn glyph", bt_bf1:"boomerang glyph",
  bt_mar1:"hero mask glyph", bt_jap1:"ramen bowl glyph", bt_sci1:"microscope glyph", bt_dis1:"magic castle glyph", bt_pix1:"desk lamp glyph",
  b_cat_menage10:"broom glyph", b_cat_menage30:"sparkling soap glyph", b_cat_cuisine10:"frying pan glyph",
  b_cat_cuisine30:"chef hat glyph", b_cat_routine20:"alarm clock glyph", b_cat_defi10:"target glyph", b_cat_outdoor10:"tree glyph",
  b_100tasks:"laurel wreath 100 glyph", b_300tasks:"tower shield glyph", b_xp2500:"comet glyph", b_day10:"radiant star glyph",
  b_boss:"dragon head glyph", b_maitre:"meditation lotus glyph",
};
const wave4 = BADGES.map(b => ({ ...MID(`badge_${b.id}`, (BADGE_DESC[b.id] || b.name) + ", simple bold glyph on transparent background, no medal frame"), width:48, height:48 }));

// ── Vague 5 : items boutique sans PNG (base + 35 thèmes × 6) ──
// Les familiers (slot "pet") sont EXCLUS : la boutique les rend via PetSprite
// (/sprites/pets/<clé>.png), pas via /sprites/items/<id>.png. Voir segment pets plus bas.
const universeById = new Map();
for (const t of PT_LIST) for (const i of (t.shopCategory?.items || []))
  universeById.set(i.id, t.shopCategory?.label || t.name || "");
const seen = new Set();
const wave5items = ALL_SHOP_ITEMS
  .filter(i => { if (seen.has(i.id) || i.slot === "pet") return false; seen.add(i.id); return true; })
  .filter(i => !hasPng("items", i.id))
  .map(i => {
    const u = universeById.get(i.id);
    return ITEM(i.id, `${i.name}${u ? `, ${u} style` : ""}, game inventory item`);
  });
// Familiers sans PNG (14 clés canvas) — descriptions génériques, pas de noms de franchises.
const PET_DESC = {
  unicorn:"white unicorn with rainbow mane, standing", dino:"small green dinosaur, standing",
  totoro:"round grey forest spirit creature with big belly, standing", gorilla:"friendly gorilla, standing",
  goldduck:"golden duck", chick:"yellow baby chick", ufo:"small flying saucer with dome",
  invader:"retro arcade alien invader creature", pirateparrot:"parrot with pirate hat and eye patch",
  fugu:"round pufferfish with spikes", fairy:"tiny fairy with glowing wings",
  walle:"small boxy rusty robot with binocular eyes", nemo:"orange clownfish with white stripes",
  owl:"brown owl with big eyes, perched",
};
const wave5pets = Object.keys(PET_SPRITES)
  .filter(k => !hasPng("pets", k))
  .map(k => ({ out: `public/sprites/pets/${k}.png`, description: PREFIX + `${PET_DESC[k] || k}, cute game pet companion`, width: 64, height: 64, detail: "medium detail", shading: "basic shading" }));
const wave5 = [...wave5items, ...wave5pets];

// ── Vague 6 : 35 trophées de thème ──
const wave6 = PT_LIST
  .filter(t => t.id && t.id !== "none" && !hasPng("deco", `deco_${t.id}`))
  .map(t => ITEM(`deco_${t.id}`, `ornate gold trophy representing ${t.name}, on small pedestal`, "deco"));

const waves = { wave1, wave2, wave3, wave4, wave5, wave6 };
const which = process.argv[2] || "all";
for (const [name, jobs] of Object.entries(waves)) {
  if (which !== "all" && which !== name) continue;
  // vague 5 découpée en sous-lots de ~54 (revue qualité par lot)
  if (name === "wave5" && jobs.length > 60) {
    const chunk = Math.ceil(jobs.length / 4);
    ["a","b","c","d"].forEach((sfx, k) => {
      const part = jobs.slice(k*chunk, (k+1)*chunk);
      if (part.length) fs.writeFileSync(path.join(OUT, `wave5${sfx}.json`), JSON.stringify(part, null, 1));
    });
    console.log(`${name}: ${jobs.length} jobs → 4 sous-lots`);
  } else {
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(jobs, null, 1));
    console.log(`${name}: ${jobs.length} jobs → ${path.join(OUT, name + ".json")}`);
  }
}
