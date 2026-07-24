// ─── FAMILIERS qui ÉVOLUENT + SPRITES PIXEL-ART ────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : module purement de données
// + fonctions pures (rendu canvas, calculs de niveau) — aucune dépendance sur le
// reste de App.jsx (todayStamp etc. restent utilisés seulement par gainPet/
// migratePetXpV2, volontairement laissés dans App.jsx), zéro changement de comportement.

// Chaque familier a sa propre XP (gameState.petXp[petId]), conservée même déséquipé.
// Le familier équipé gagne de l'XP quand l'enfant accomplit une quête.
export const PET_LEVELS = [0, 50, 130, 250, 410, 610, 860, 1160, 1520, 1940, 2240, 2600]; // v1.57.0 — 12 niveaux; évolutions aux niveaux 4 / 8 / 12 (Légendaire)
export const PET_STAGES = ["Bébé","Bébé","Petit","Jeune","Jeune","Ado","Ado","Adulte","Adulte","Vétéran","Champion","Légendaire"];
export const PET_DAILY_CAP = 50;                                             // v1.52.0 — XP max gagné PAR JOUR par le familier (anti-grind : il grandit en prenant soin de lui chaque jour, pas en farmant d'un coup)
export const petLevel = (xp) => { let lv=1; for (let i=0;i<PET_LEVELS.length;i++) if ((xp||0) >= PET_LEVELS[i]) lv=i+1; return lv; };
export const petStage = (xp) => PET_STAGES[Math.min(petLevel(xp)-1, PET_STAGES.length-1)];
export const petBar   = (xp) => { const lv=petLevel(xp); if (lv >= PET_LEVELS.length) return {cur:1,needed:1,max:true}; const base=PET_LEVELS[lv-1], next=PET_LEVELS[lv]; return { cur:(xp||0)-base, needed:next-base, max:false }; };
export const mergePetXp = (a, b) => { const out={...(a||{})}; for (const k in (b||{})) out[k]=Math.max(out[k]||0, b[k]||0); return out; };

// ─── SPRITES PIXEL-ART DES FAMILIERS (v1.56.0) ───────────────
// Chaque familier = grille 16×16 (chaîne par ligne) + palette de base. Le caractère mappe une couleur.
// '.' = transparent. Recoloré par élément à l'évolution (voir PET_ELEMENTS).
export const PET_SPRITES = {
  cat:{rows:["....o....o......","...oao..oao.....","...obo..obo.....","...obboooobo....","...obbbbbbbo....","...obeobbeobo...","...obbbwwbbbo...","...obbbbbbbbo...","....obbbbbbo....","....obbbbbbo..o.","....obbbbbbo.oao",".....obbbbbooao.",".....obbbbbbbao.",".....oobaabaooo.","......oooooo...."],
    pal:{o:"#5A3A1E",b:"#C9A06A",a:"#F0DCC0",e:"#2B2B2B",w:"#FF8FA3"}},
  dog:{rows:["...obboooobbo...","..oabbbbbbbbao..",".oaabbbbbbbbaao.",".oaabeobboebaao.",".oabbbbwwbbbbao.",".oabbbbbbbbbbao.","..obbbbbbbbbbo..","..obbbbbbbbbbo..","...obbbbbbbbo...","...obbbbbbbbo.o.","...obbbbbbbboao.","...oobaabaaooo..","....oooooooo...."],
    pal:{o:"#4A3220",b:"#D9A066",a:"#A6692F",e:"#2B2B2B",w:"#3A2A1A"}},
  wolf:{rows:["..............o.","..d..........oao",".dao........obbo",".daaoooooooobbbn",".daaaaaaaaabbben",".daaaaaaaaabbbbn",".obaaaaaaaabbbbo","..obbbbbbbbbbbo.","..o..oo..oo..o..","..o..oo..oo..o..","..ooo.oo..oo.oo."],
    pal:{o:"#2E3440",b:"#8A93A0",a:"#9AA3B0",d:"#D8DEE9",e:"#FFD24D",n:"#1A1A1A"}},
  fox:{rows:["..o........o....",".oao......oao...",".obbo....obbo...",".obbboooobbbo...",".obbbbbbbbbbbo..",".obeobbbbbbeobo.",".obbcccccccbbo..","..occcnnnccco...","..obcccccccbo...","..obbbbbbbbbo...","...obbbbbo..ddd.","...obbbbbo.dcccd","...obbbbbo.ddddo","...oobaabaooo...","....ooooooo....."],
    pal:{o:"#7A2E00",b:"#E8742E",a:"#FFF6EC",c:"#FFFFFF",e:"#2B2B2B",n:"#1A1A1A",d:"#FFFFFF"}},
  dragon:{rows:["...d......d.....","..dod....dod....","...obboooobbo...","w..obbbbbbbbo..w","ww.obeobbeobo.ww","wwwobbbnnbbbowww","wwwobbbbbbbbowww",".w.obbbbbbbbo.w.","...obbbbbbbbo..d","...obbbbbbbbo.dd","...oobaabbaoboo.","....oooooooooo.."],
    pal:{o:"#1E5E2A",b:"#4FB05A",a:"#BFF0A0",e:"#FFD24D",n:"#2B2B2B",d:"#FFD24D",w:"#2E8B40"}},
  parrot:{rows:["....obbo........","...obbbbo.......","...obbbbo.......","...obeobboooo...","...obbbobkk.....","...obbbobkk.....","..owbbbbbo......",".owwbbbbbbo.....",".owwbbbbbbo.....",".owwbbbbbbo.....","..owbbbbbbo.....","...obbbbbbo.....","...obtttbbo.....","...otttttto.....","....ot..to......"],
    pal:{o:"#145A24",b:"#2ECC55",w:"#1E8B3A",e:"#2B2B2B",k:"#FFB02E",t:"#FF3B3B"}},
  owl:{rows:["....o......o....","...obo....obo...","..oobboooobboo..",".obbbbbbbbbbbbo.",".obbbbbbbbbbbbo.",".obeeebbbbeeebo.",".obepebbbbepebo.",".obeeebkkbeeebo.",".obbbbbkkbbbbbo.",".obwbbbbbbbbwbo.",".obwbbbbbbbbwbo.","..obbbbbbbbbbo..","..obbbbbbbbbbo..","...obbttttbbo...","....oobbbboo....",".....obbbbo....."],
    pal:{o:"#4A2E12",b:"#A9763E",w:"#7E5424",e:"#FFFFFF",p:"#2B2B2B",k:"#FFB02E",t:"#FFB02E"}},
  duck:{rows:["................","....oooo........","...obbbbo.......","...obeobo.......","...obbboKK......","..obbbbboK......",".obbbbbbbo......",".obbbbbbbbo.....",".obbbbbbbbo.....",".obbbbbbbbo.....","..obbbbbbo......","...oooooo.......","....t..t........"],
    pal:{o:"#B8860B",b:"#FFD21E",e:"#2B2B2B",K:"#FF8C1A",t:"#FF8C1A"}},
  worm:{rows:["................",".....ooooo......","....obbbbbo.....","....obeobeo.....","....ossssso.....",".....obbbo......","....obbbbbo.....","...obbsssbbo....","..obbbbbbbbbo...","..obsssbsssbo...",".obbbbbbbbbbbo..","..obsssbsssbo...","...obbbbbbbo....","....ooooooo....."],
    pal:{o:"#A85A6A",b:"#F2A8B2",s:"#C97888",e:"#2B2B2B"}},
  capybara:{rows:["................","...oo.......oo..","..obboooooobbo..",".obbbbbbbbbbbbo.",".obbbbbbbbbbbbo.",".obebbbbbbbbebo.",".obbbbbbbbbbbbo.",".obbbbbbbbbbbbo.",".obbbbnnnnbbbbo.",".obbbbbbbbbbbbo.",".obbbbbbbbbbbbo.","..ooo.oo.oo.ooo.","..o.....o....o.."],
    pal:{o:"#5A3A1E",b:"#9A6B3A",e:"#2B2B2B",n:"#6A4A28"}},
  bee:{rows:["...d......d.....","....o....o......","...ooooooooo....","..obeobbbeobo...",".woooooooooooow.","wwoyyyyyyyyyyoww",".woobbbbbbbboow.","wwoyyyyyyyyyyoww",".wooobbbbbbooww.","...oyyyyyyyyo...","....obbbbbbo....",".....oyyyyo.....","......osso......",".......oo......."],
    pal:{o:"#3A2A00",y:"#FFD21E",b:"#2B2B2B",w:"#CFE8FF",d:"#2B2B2B",s:"#2B2B2B",e:"#FFFFFF"}},
  spider:{rows:["l.l........l.l..",".ll........ll...","..ll......ll....","...loooooool....","..llobbbbboll...",".l.obeoobeobo.l.","..lobbbbbbbol...","...obbbbbbbo....","..llobbbbboll...",".l..looooool..l.","..ll......ll....",".ll........ll...","l.l........l.l.."],
    pal:{o:"#0F0F18",b:"#4A4A5A",l:"#2A2A3A",e:"#FF3B3B"}},
  // ── Familiers de thème (v1.13.0) ──
  unicorn:{rows:[".......gg",".......gg","...oo..gg..oo","..obboooooobbo",".obbbbbbbbbbbbo",".obebbbbbbbbebo",".obbbbbbbbbbbbo",".obbbbnnnnbbbbo",".obbbbbbbbbbbbo",".obbbbbbbbbbbbo","..ooo.oo.oo.ooo","..o.....o....o"],
    pal:{o:"#9A6BB0",b:"#FFFFFF",e:"#2B2B2B",n:"#FF8FD0",g:"#FFD24D"}},
  dino:{rows:["....s..s..s","..obboooooobbo",".obbbbbbbbbbbbo",".obebbbbbbbbebo",".obbbbbbbbbbbbo",".obbbbhbhbbbbbo",".obbbbhhhbbbbbo",".obbbbbhbbbbbbo",".obbbbbbbbbbbbo","..ooo.oo.oo.ooo","..o.....o....o"],
    pal:{o:"#B0559A",b:"#FFB3E6",e:"#2B2B2B",h:"#FF2E6B",s:"#C77DFF"}},
  totoro:{rows:["...o.......o","..oboooooooobo",".obbbbbbbbbbbbo",".obbebbnnbbebbo",".obbwwwwwwwwbbo",".obbwwwwwwwwbbo",".obbwwwwwwwwbbo",".obbbwwwwwwbbbo",".obbbbbbbbbbbbo","..ooo......ooo","..o..........o"],
    pal:{o:"#3A3F47",b:"#8A929C",w:"#EDF1F5",e:"#2B2B2B",n:"#2B2B2B"}},
  gorilla:{rows:["..obboooooobbo",".obbbbbbbbbbbbo",".obbffffffffbbo",".obbfeffffefbbo",".obbffffffffbbo",".obbbffnnffbbbo",".obbbbffffbbbbo",".obbbbbbbbbbbbo",".obbbbbbbbbbbbo","..obb......bbo","..ooo......ooo"],
    pal:{o:"#15151A",b:"#3A3A42",f:"#6E5E52",e:"#1A1A1A",n:"#1A1A1A"}},
  goldduck:{rows:["....c.c.c","....ccccc","...obbbbbo","...obeobbo","...obbboKK","..obbbbboK",".obbbbbbbo",".obbbbbbbbo",".obbbbbbbbo",".obbbbbbbbo","..obbbbbbo","...oooooo","....t..t"],
    pal:{o:"#9A6E00",b:"#FFD21E",e:"#2B2B2B",K:"#FF8C1A",t:"#FF8C1A",c:"#FFE680"}},
  chick:{rows:["",".....oooo","....obbbbo","...obbbbbbo","...obebbebo","...obbkkbbo","...obbbbbbo","...obbbbbbo","....obbbbo",".....oooo","....k..k"],
    pal:{o:"#C98A00",b:"#FFE24D",e:"#2B2B2B",k:"#FF8C1A"}},
  ufo:{rows:["",".....oooo","....oddddo","...oddddddo","..obbbbbbbbbbo",".obllllllllllbo",".oygbygbygbygbo","..oobbbbbbbboo","...oo....oo"],
    pal:{o:"#2A3340",b:"#7C8A99",l:"#AEC2D6",d:"#9CC0FF",g:"#3AE0C0",y:"#FFE24D"}},
  invader:{rows:["....b.....b",".....b...b","....bbbbbbb","...bbbbbbbbb","...bbebbbebb","...bbbbbbbbb","..bbb.bbb.bbb","..b.b.....b.b"],
    pal:{o:"#2A0F3A",b:"#9B4DFF",e:"#FFFFFF"}},
  pirateparrot:{rows:["...hhhhhh","....hhhh","...obbbo","...obbbbo","...oppobbkk","...obbbobkk","..owbbbbbo",".owwbbbbbbo",".owwbbbbbbo",".owwbbbbbbo","..owbbbbbbo","...obbbbbbo","...obtttbbo","...otttttto","....ot..to"],
    pal:{o:"#3A1A1A",b:"#E23B3B",w:"#2E6BE2",k:"#FFB02E",t:"#FFD24D",p:"#1A1A1A",h:"#1A1A1A"}},
  fugu:{rows:[".....s.s.s","...obbbbbbbo","..sobbbbbbbbos",".oobbbbbbbbbboo",".obbeobbbboebbo",".obbbbbbbbbbbbo",".obbbbmmmmbbbbo",".oobbbbbbbbbboo","..sobbbbbbbbos","...os.s.s.s.so"],
    pal:{o:"#7A5A2A",b:"#FFD98A",e:"#2B2B2B",m:"#C0392B",s:"#B5822E"}},
  fairy:{rows:[".......y","......yyy","......kkk","......kekek",".w....kkk....w",".ww...bbb...ww",".www.bbbbb.www",".ww.bbbbbbb.ww",".w..bbbbbbb..w","....bbbbbbb","....bb...bb",".........s"],
    pal:{o:"#2A5A2A",b:"#5FC24B",e:"#2B2B2B",k:"#FFCC88",y:"#FFE24D",w:"#CFF6E0",s:"#FFE680"}},
  walle:{rows:["..oooo.oooo","..oeeo.oeeo","..oooo.oooo","....oooooo","...obbbbbbo","..obbllllbbo","..obbllllbbo","..obbbbbbbbo","..obbbbbbbbo",".obbbbbbbbbbo",".otttttttttto",".ototototototo"],
    pal:{o:"#4A3A1A",b:"#C8922E",l:"#7CC0E0",e:"#2B2B2B",t:"#5A5A62"}},
  nemo:{rows:["","....o.....ooo","...obbbbbbbboo",".obewwbbwwbbbbo",".obbwwbbwwbbbbo",".obbbbbbbbbbbbo","..obbbbbbbbbbo","...o.....ooo"],
    pal:{o:"#A33A00",b:"#FF7A1E",w:"#FFFFFF",e:"#1A1A1A"}},
};
// Quel sprite pour un id d'item familier (sinon null → repli emoji)
export const PET_SPRITE_KEY = { p1:"cat", p2:"dog", p3:"wolf", p4:"fox", p5:"dragon", p6:"parrot", hp4:"owl", pet_worm:"worm", pet_capy:"capybara", pet_bee:"bee", pet_spider:"spider", pet_duck:"duck",
  // familiers de thème (v1.13.0)
  bs5:"unicorn", mx3:"dino", gh4:"totoro", si6:"gorilla", dk1:"goldduck", dk5:"chick", al1:"ufo", al5:"invader", pi1:"pirateparrot", su6:"fugu", di2:"fairy", px1:"walle", px2:"nemo" };
export const petSpriteKey = (itemId) => PET_SPRITE_KEY[itemId] || null;
// Dessine un familier pixel sur un canvas (key = clé PET_SPRITES, ou null)
export const renderPetToCtx = (ctx, key, size=64, palOverride=null, halo=false) => {
  const sp = PET_SPRITES[key]; if (!ctx) return;
  ctx.clearRect(0,0,size,size);
  if (!sp) return;
  if (halo){ // halo doré du Légendaire
    ctx.strokeStyle="#FFD45A"; ctx.lineWidth=Math.max(2,size*0.035);
    ctx.beginPath(); ctx.ellipse(size*0.5, size*0.10, size*0.27, size*0.075, 0, 0, Math.PI*2); ctx.stroke();
  }
  const pal = palOverride ? { ...sp.pal, ...palOverride } : sp.pal;
  const S = size/16;
  for (let y=0; y<16; y++){ const row=(sp.rows[y]||"")+"................"; for (let x=0; x<16; x++){ const c=row[x]; const col=pal[c]; if(col){ ctx.fillStyle=col; ctx.fillRect(Math.round(x*S),Math.round(y*S),Math.ceil(S),Math.ceil(S)); } } }
};
// ─── SPRITES PIXEL-ART DES ITEMS (v1.13.0) ───────────────────
// Même format 16×16 que PET_SPRITES (clé = id de l'item boutique). Repli emoji si absent.
export const ITEM_SPRITES = {
  // Armures (boutique de base)
  a1:{rows:["..gggggggggg","..gbbbbbbbbg","..gbllllllbg","..gblleellbg","..gbleeeelbg","..gblleellbg","..gbllllllbg","...gbllllbg","....gblllbg",".....gbllbg","......gbbg",".......gg"],
    pal:{g:"#FFD24D",b:"#5B7C99",l:"#9CC0D6",e:"#E0392B"}},
  a2:{rows:[".......l","......lbb","......lbb","......lbb","......lbb","......lbb","......lbb","......lbb","....gggggg","......hhh","......hhh","......hhh","......ggg"],
    pal:{b:"#8FA3B5",l:"#E8F0F6",g:"#FFD24D",h:"#7A4A20"}},
  a3:{rows:["","",".....gs","....g.s","...g..s","...g..s","..g...s......t","..g.ffsaaaaaatt","..g...s......t","...g..s","...g..s","....g.s",".....gs"],
    pal:{g:"#FFD24D",s:"#EDEDED",a:"#9A6A2E",t:"#D03B2B",f:"#E0E0E0"}},
  a4:{rows:["","....dddddd","...dbbbbbbd","..dblwbbwlbd","..dblwbbwlbd","...dbllllbd","....dbllbd",".....dbbd","......dd"],
    pal:{d:"#1E8FB0",b:"#3FC4E8",l:"#BFF0FF",w:"#FFFFFF"}},
  a5:{rows:[".......s","......sss",".....sswss.w","......sss",".......hd",".......hd","...w...hd",".......hd",".......hd",".......hd",".......hd",".......hd",".......hd"],
    pal:{h:"#9A6A3A",d:"#5A340F",s:"#FFD24D",w:"#FFF6C0"}},
  // Visage
  lg6:{rows:["","...oooooooo","..oyyyyyyyyo","..oyyyyyyyyo","..oyyoyyyoyo","..oyyoyyyoyo","..oyyyyyyyyo","..oyyoyyyoyo","..oyyyoooyyo","..oyyyyyyyyo","...oooooooo"],
    pal:{o:"#1A1A1A",y:"#FFD21E"}},
  // ── Chapeaux (v1.13.0) ──
  h1:{rows:["....oooooo","...yobbbbo","....obbbbo","....oaaaao",".oooooooooo",".obbbbbbbbo"],pal:{o:"#1A1A1A",b:"#3A3A55",a:"#8A3FD0",y:"#FFD24D"}},
  h2:{rows:["..b.b.b.b.b","..bgbgbgbgb","..bbbbbbbbb","..obbbbbbbo","...oooooooo"],pal:{o:"#9A6E00",b:"#FFD24D",g:"#FF3B6B"}},
  h3:{rows:["..oooooooo",".orrrwwrrro",".orwwwwwwro",".orrrwwrrro",".oooooooooo"],pal:{o:"#7A1500",r:"#E0392B",w:"#FFFFFF"}},
  h4:{rows:["..oooooo",".obbbbbbo",".oblwwlbo",".obbbbbbo",".oooooooo"],pal:{o:"#1A6B8A",b:"#3FC4E8",l:"#BFF0FF",w:"#FFFFFF"}},
  h5:{rows:["oooooooooooo","......y.....","..oooooooo.y","..oooooooo..","...oooooo..."],pal:{o:"#1A1A1A",y:"#3AC0E0"}},
  h6:{rows:["...oooooo","..obbbbbbo","..obyybbbo","..obbbbbbo","..ooooooooooo"],pal:{o:"#10325A",b:"#2E6BE2",y:"#FFD24D"}},
  pi2:{rows:["...oooooooo","..obbbbbbbbo","..obbggbbbbo","..oooooooooo",".oooooooooooo"],pal:{o:"#10172A",b:"#22386A",g:"#FFD24D"}},
  dk3:{rows:["..y.y.y.y.y","..yyyyyyyyy","..yyyyyyyyy","..oyyyyyyyo","...ooooooo"],pal:{o:"#C79A00",y:"#FFE24D"}},
  lc6:{rows:[".f.f.f.f.f.",".fpfpfpfpf.","..ggggggg.."],pal:{f:"#FF8FD0",p:"#FFE24D",g:"#4FB05A"}},
  si4:{rows:[".g.g.g.g.g.",".ggggggggg.","..ggggggg.."],pal:{g:"#3E9B4A",o:"#2A6E32"}},
  gi6:{rows:["..oooooo",".obbbbbbo",".oblwwlbo",".obbbbbbo",".oooooooo"],pal:{o:"#3A3F47",b:"#8A929C",l:"#C8D0D8",w:"#EDF1F5"}},
  mc6:{rows:["..oooooo",".obbbbbbo",".obppppbo",".obbbbbbo",".oo.oo.oo"],pal:{o:"#15151A",b:"#3A2F3A",p:"#5A4A6A"}},
  cf1:{rows:["..llllll",".lhhhhhhl",".lhccchl.",".lhhhhhhl",".llllllll"],pal:{l:"#7FE8FF",h:"#3AC0E0",c:"#FFFFFF"}},
  mv4:{rows:["..rrrrrr",".orrrrrro",".oggggggo",".oggwwggo",".oggggggo",".oooooooo"],pal:{o:"#7A1500",r:"#D11A1A",g:"#FFC83A",w:"#BFEFFF"}},
  px6:{rows:["....gg","..orrrrro",".orrrrrrro",".orrggrrro","oooooooooooo"],pal:{o:"#5A0E00",r:"#E0392B",g:"#FFD24D"}},
  jp6:{rows:["..g....g",".gg....gg",".ogg..ggo",".obbbbbbo",".obbbbbbo",".oooooooo"],pal:{o:"#15151A",b:"#2A2A3A",g:"#FFD24D"}},
  ro1:{rows:["....o","....c","..oooooo",".obbbbbbo",".obwbbwbo",".obbbbbbo",".oooooooo"],pal:{o:"#2A2A30",b:"#7C8A99",w:"#3AE0C0",c:"#FF5A5A"}},
  sc6:{rows:["oooooooooooo","......y.....","..oooooooo.y","..oooooooo..","...oooooo..."],pal:{o:"#1A1A1A",y:"#FFD24D"}},
  hp3:{rows:["......oo",".....obo","....obbo","...obbbo","..obbbbo",".obbbbbo",".obbbbbbo","obbbbbbbbo","oooooooooo"],pal:{o:"#3A2A12",b:"#8A6534"}},
  rb1:{rows:["...oooooo","..obbbbbbo","..obwwbbbo","..obbbbbbo","..ooooooooooo"],pal:{o:"#8A6A2E",b:"#E0C45A",w:"#FFFFFF"}},
  cu1:{rows:["..ww.ww.ww",".wwwwwwwwww",".wwwwwwwwww","..oooooooo","..obbbbbbo"],pal:{o:"#C8C8C8",w:"#FFFFFF",b:"#F0F0F0"}},
  su4:{rows:["","","oooooooooooo","owwwrrwwwwwo","oooooooooooo"],pal:{o:"#7A1500",w:"#FFFFFF",r:"#E0392B"}},
  bf3:{rows:["","","oooooooooooo","obbbbbbbbbbo","oooooooooooo","oo......oo"],pal:{o:"#1A1A1A",b:"#C0392B"}},
  mo1:{rows:["..r....r",".rrrrrrrr",".oeorroeo",".orrrrrro",".owrrrrwo",".oooooooo"],pal:{o:"#5A0E00",r:"#E0392B",e:"#1A1A1A",w:"#FFFFFF"}},
  ho2:{rows:["..oooooo",".owwwwwwo",".owowwowo",".owwwwwwo",".owowwowo",".oooooooo"],pal:{o:"#3A3A3A",w:"#F0F0F0"}},
  al2:{rows:["..oooooo",".obbbbbbo",".oeebbeeo",".obbbbbbo","..obbbbo.","...oooo.."],pal:{o:"#1E5C2A",b:"#5FC24B",e:"#1A1A1A"}},
  gh6:{rows:["...oooooo","..obbbbbbo","..oaaaaaao","oooooooooooo","obbbbbbbbbbo","oooooooooooo"],pal:{o:"#8A6A2E",b:"#E0C45A",a:"#B58A3E"}},
  in3:{rows:["y........y",".g......g.","..g....g..","...g..g...","...obbo..."],pal:{g:"#4FB05A",b:"#2A6E32",y:"#FFD24D",o:"#2A6E32"}},
  bs6:{rows:["oo......oo","opppkkpppo","oppkkkkppo","opppkkpppo","oo......oo"],pal:{o:"#B0357A",p:"#FF8FD0",k:"#FF2E6B"}},
  mx6:{rows:["..oooooo",".obwbwbo.",".owbwbwo.",".obwbwbo.","..oooooo."],pal:{o:"#2A2A3A",b:"#8A3FD0",w:"#3AE0C0"}},
  tr1:{rows:["..p.p.p","..ppppp.",".ppyypp.","..ppppp.","..p.p.p"],pal:{p:"#FF5A8A",y:"#FFD24D"}},
  jb6:{rows:["","","ooooooooooo","owbbooowbbo","obbbooobbbo","ooooooooooo"],pal:{o:"#1A1A1A",b:"#2A2A3A",w:"#7FE8FF"}},
  ro5:{rows:[".....ddd","...dddddd","..ddwdddd","...ddddd","....o","....o","...ooooo"],pal:{d:"#AEC2D6",o:"#5A5A62",w:"#FFFFFF"}},
  lc1:{rows:["....g","...gyg","...gyg","..gyyg","..gyyg",".mmmmm."],pal:{g:"#C79A00",y:"#FFE680",m:"#FF8FD0"}},
  pr5:{rows:["r.w.r.w.r","rrwwrrwwr",".rwrwrwr.","..oooooo.","..obbbbo."],pal:{o:"#5A3A1E",b:"#C77D3A",r:"#E0392B",w:"#FFFFFF"}},
  di4:{rows:["ooo....ooo","oooo..oooo","oooo..oooo",".oooooooo.","..oooooo.."],pal:{o:"#1A1A1A"}},
};
export const renderItemToCtx = (ctx, id, size=64) => {
  const sp = ITEM_SPRITES[id]; if (!ctx) return;
  ctx.clearRect(0,0,size,size);
  if (!sp) return;
  const S = size/16;
  for (let y=0; y<16; y++){ const row=(sp.rows[y]||"")+"................"; for (let x=0; x<16; x++){ const c=row[x]; const col=sp.pal[c]; if(col){ ctx.fillStyle=col; ctx.fillRect(Math.round(x*S),Math.round(y*S),Math.ceil(S),Math.ceil(S)); } } }
};
// ─── ÉLÉMENTS D'ÉVOLUTION (v1.57.0) — recolorent le sprite ────
export const PET_ELEMENTS = {
  feu:{label:"Feu", pal:{o:"#7A1E00",b:"#FF5A1E",a:"#FFD89A",w:"#B23400"}},
  glace:{label:"Glace", pal:{o:"#1E5C86",b:"#8FD8F0",a:"#E6FAFF",w:"#5FB6DC"}},
  nature:{label:"Nature", pal:{o:"#245E26",b:"#5FC24B",a:"#BFF09A",w:"#3E8B30"}},
  eau:{label:"Eau", pal:{o:"#134E8C",b:"#36A6F0",a:"#B6E6FF",w:"#1E6FB0"}},
  ouragan:{label:"Ouragan", pal:{o:"#4C6075",b:"#AEC2D6",a:"#E2EEF8",w:"#7E94A8"}},
  ombre:{label:"Ombre", pal:{o:"#140A24",b:"#5A4A7A",a:"#9B7AD0",w:"#3A2A5A"}},
  foudre:{label:"Foudre", pal:{o:"#7A5A00",b:"#FFD21E",a:"#FFF3A0",w:"#C79A00"}},
  lave:{label:"Lave", pal:{o:"#5A0E00",b:"#FF3B1E",a:"#FFB02E",w:"#9E2200"}},
};
export const PET_ELEMENT_KEYS = Object.keys(PET_ELEMENTS);
export const petTierForLevel = (lv) => (lv>=12?3:lv>=8?2:lv>=4?1:0);            // tier débloqué selon le niveau
export const petActiveElement = (evo) => evo ? (evo[3]||evo[2]||evo[1]||null) : null;
export const petIsLegendary = (evo, lv) => lv>=12 && !!(evo&&evo[3]);
export const petFormLabel = (evo, lv) => { const el=petActiveElement(evo); if(petIsLegendary(evo,lv)) return `Légendaire${el?` · ${PET_ELEMENTS[el].label}`:""}`; return el?PET_ELEMENTS[el].label:"Bébé"; };
export const petPalOverride = (evo) => { const el=petActiveElement(evo); return el?PET_ELEMENTS[el].pal:null; };
export const petPendingTier = (evo, lv) => { const t=petTierForLevel(lv); for(let i=1;i<=t;i++){ if(!(evo&&evo[i])) return i; } return 0; };
// 2 options élémentaires tirées de façon DÉTERMINISTE (par petId+tier → mêmes options sur tous les appareils), hors déjà choisis
export const petEvoOptions = (petId, tier, evo) => {
  const taken=new Set([evo&&evo[1],evo&&evo[2],evo&&evo[3]].filter(Boolean));
  const avail=PET_ELEMENT_KEYS.filter(k=>!taken.has(k));
  let seed=0; const s=(petId||"x")+"#"+tier; for(let i=0;i<s.length;i++) seed=(seed*31+s.charCodeAt(i))>>>0;
  return avail.map((k,i)=>({k,r:((seed+i*2654435761)>>>0)})).sort((a,b)=>a.r-b.r).slice(0,2).map(x=>x.k);
};
