import { useState, useRef } from "react";
import { SFX } from "./sfx.js";
import { getPlayerTheme } from "./themes.js";
import { AVATAR_PARTS, DEFAULT_AVATAR, AvatarCanvas } from "./avatar.jsx";
import { PinDots, PinKeypad } from "./ui.jsx";
import { GLOBAL_CSS, displayName } from "./shared.js";

export function LoginScreen({ config, gameStates, onSelectPlayer, onParentLogin, onSetPlayerPin, onCompleteOnboarding, onNewSetup, appVersion }) {
  // mode: "who" | "child-select" | "onboarding" | "pin" | "parent" | "info"
  const [mode, setMode] = useState("who");
  const [selIdx, setSelIdx] = useState(null);

  // Onboarding steps: "theme" | "avatar" | "pseudo" | "pin-create" | "pin-confirm"
  const [obStep, setObStep] = useState("theme");
  const [draftTheme, setDraftTheme] = useState(null);
  const [draftAvatar, setDraftAvatar] = useState({skin:"sk1",eyes:"ey1",mouth:"mo1",hair:"ha1"});
  const [avatarTab, setAvatarTab] = useState("hair");
  const [draftPseudo, setDraftPseudo] = useState("");
  const [obFirstPin, setObFirstPin] = useState("");
  const [obPin, setObPin] = useState("");

  // Returning player PIN
  const [pPin, setPPin] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [firstPin, setFirstPin] = useState("");
  const pPinRef = useRef("");
  const firstPinRef = useRef("");
  const confirmStepRef = useRef(false);

  // Parent PIN
  const [ppPin, setPpPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const ppPinRef = useRef("");

  const reset = () => {
    setMode("who"); setSelIdx(null);
    setObStep("theme"); setDraftTheme(null); setDraftAvatar({skin:"sk1",eyes:"ey1",mouth:"mo1",hair:"ha1"});
    setDraftPseudo(""); setObFirstPin(""); setObPin("");
    setPPin(""); pPinRef.current = ""; setConfirmStep(false); confirmStepRef.current = false; setFirstPin(""); firstPinRef.current = "";
    setPpPin(""); ppPinRef.current = ""; setPinError(false);
  };
  const triggerError = (resetFn) => { setPinError(true); SFX.error?.(); setTimeout(()=>{ resetFn(); setPinError(false); }, 700); };

  const handleChildSelect = (i) => {
    SFX.click(); setSelIdx(i);
    const ps = gameStates[i] || {};
    const isFirstLogin = !ps.avatar?.configured && !ps.pin;
    if (isFirstLogin) {
      const pl = config.players[i];
      const starters = pl.starterThemes || [];
      setDraftTheme(starters[0] || pl.themeId || "none");
      setDraftAvatar({skin:"sk1",eyes:"ey1",mouth:"mo1",hair:"ha1"});
      setDraftPseudo(pl.pseudo || "");
      setObStep("theme"); setObPin(""); setObFirstPin("");
      setMode("onboarding");
    } else {
      pPinRef.current = ""; setPPin(""); confirmStepRef.current = false; setConfirmStep(false); firstPinRef.current = ""; setFirstPin(""); setPinError(false);
      setMode("pin");
    }
  };

  // Returning player PIN — ref-based (no useCallback needed: deps change every render anyway)
  const gameStatesRef = useRef(gameStates);
  gameStatesRef.current = gameStates;
  const selIdxRef = useRef(selIdx);
  selIdxRef.current = selIdx;

  // Core submit logic — reads from refs, safe to call anytime
  const doPlayerSubmit = () => {
    const entered = pPinRef.current;
    if (entered.length !== 4) return;
    const ps = gameStatesRef.current[selIdxRef.current] || {};
    if (!ps.pin) {
      if (!confirmStepRef.current) {
        firstPinRef.current = entered; setFirstPin(entered);
        pPinRef.current = ""; setPPin("");
        confirmStepRef.current = true; setConfirmStep(true);
      } else if (entered === firstPinRef.current) {
        onSetPlayerPin(selIdxRef.current, entered);
        onSelectPlayer(selIdxRef.current);
      } else {
        triggerError(()=>{ pPinRef.current=""; setPPin(""); confirmStepRef.current=false; setConfirmStep(false); firstPinRef.current=""; setFirstPin(""); });
      }
    } else {
      if (entered === String(ps.pin)) { onSelectPlayer(selIdxRef.current); }
      else triggerError(()=>{ pPinRef.current=""; setPPin(""); });
    }
  };

  const handlePlayerDigit = (d) => {
    if (pPinRef.current.length >= 4) return;
    pPinRef.current = pPinRef.current + d;
    setPPin(pPinRef.current);
    setPinError(false);
    // Auto-submit au 4e chiffre (régression v1.10.1 — le bouton VALIDER reste en filet de sécurité)
    if (pPinRef.current.length === 4) setTimeout(doPlayerSubmit, 120);
  };

  // Parent PIN — ref-based
  const configPinRef = useRef(config?.pin);
  configPinRef.current = config?.pin;

  const doParentSubmit = () => {
    const entered = ppPinRef.current;
    if (entered.length !== 4) return;
    const storedPin = configPinRef.current != null ? String(configPinRef.current) : "1146";
    if (entered === storedPin) { ppPinRef.current = ""; onParentLogin(); }
    else triggerError(()=>{ ppPinRef.current=""; setPpPin(""); });
  };

  const handleParentDigit = (d) => {
    if (ppPinRef.current.length >= 4) return;
    ppPinRef.current = ppPinRef.current + d;
    setPpPin(ppPinRef.current);
    setPinError(false);
    // Auto-submit au 4e chiffre (régression v1.10.1 — le bouton VALIDER reste en filet de sécurité)
    if (ppPinRef.current.length === 4) setTimeout(doParentSubmit, 120);
  };

  // Onboarding PIN
  const handleObPinDigit = (d) => {
    const next = (obPin + d).slice(0, 4);
    setObPin(next); setPinError(false);
    if (next.length < 4) return;
    if (obStep === "pin-create") { setObFirstPin(next); setObPin(""); setObStep("pin-confirm"); }
    else {
      if (next === obFirstPin) {
        const pl = config.players[selIdx];
        onCompleteOnboarding(selIdx, {
          themeId: draftTheme || (pl.starterThemes||[])[0] || "none",
          avatar: {...draftAvatar, configured: true},
          pseudo: draftPseudo.trim() || pl.name,
          pin: next,
        });
        onSelectPlayer(selIdx);
      } else {
        triggerError(()=>{ setObPin(""); setObStep("pin-create"); setObFirstPin(""); });
      }
    }
  };

  const player = selIdx !== null ? config.players[selIdx] : null;
  const ps = selIdx !== null ? (gameStates[selIdx] || {}) : {};
  const accentColor = player?.color || "#D9BC5C";

  const BtnBack = ({onClick, label="← Retour"}) => (
    <button onClick={()=>{SFX.click();onClick();}} style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#444",background:"none",border:"none",cursor:"pointer",marginTop:8}}>{label}</button>
  );

  return (
    <div style={{minHeight:"100vh",background:"#0d0d0d",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",padding:"20px 16px",position:"relative",overflow:"hidden"}}>
      <style>{GLOBAL_CSS}</style>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 0%,#85CDD120 0%,transparent 60%)",pointerEvents:"none"}}/>

      {/* ── Écran 1 : Tu es...? ── */}
      {mode === "who" && (
        <div style={{textAlign:"center",width:"100%",maxWidth:380}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,2.5vw,15px)",color:"#D9BC5C",textShadow:"3px 3px 0 #0d0d0d,0 0 20px #D9BC5C80",marginBottom:10}}>⚔️ MON LIVRE DE QUÊTES</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:24,color:"var(--txt-dim,#666)",marginBottom:36}}>Tu es...?</div>
          <div style={{display:"flex",gap:16,justifyContent:"center"}}>
            {[["🧒","Enfant","#85CDD1",()=>{SFX.click();setMode("child-select");}],
              ["👨‍👩","Parent","#D99248",()=>{SFX.click();setMode("parent");setPpPin("");setPinError(false);}]
            ].map(([icon,label,color,fn])=>(
              <button key={label} onClick={fn}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"20px 22px",background:"rgba(0,0,0,0.7)",color,border:`3px solid ${color}`,borderRadius:10,cursor:"pointer",lineHeight:2.2,minWidth:120,transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 0 22px ${color}55`;e.currentTarget.style.transform="translateY(-3px)";}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="none";}}>
                <span style={{fontSize:28,display:"block"}}>{icon}</span>{label}
              </button>
            ))}
          </div>
          <button onClick={()=>{SFX.click();setMode("info");}}
            style={{marginTop:28,fontFamily:"'VT323',monospace",fontSize:16,color:"#444",background:"none",border:"none",cursor:"pointer",letterSpacing:1,transition:"color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.color="#888"}
            onMouseLeave={e=>e.currentTarget.style.color="#444"}>
            ℹ️ C'est quoi cette appli?
          </button>
        </div>
      )}

      {/* ── Écran info : Présentation pour enfants ── */}
      {mode === "info" && (
        <div style={{width:"100%",maxWidth:400,display:"flex",flexDirection:"column",gap:0}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,2.2vw,13px)",color:"#D9BC5C",textShadow:"3px 3px 0 #0d0d0d,0 0 20px #D9BC5C80",marginBottom:6}}>⚔️ MON LIVRE DE QUÊTES</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"var(--txt-muted,#888)"}}>Ton guide d'aventurier·ère</div>
          </div>

          <div style={{background:"rgba(0,0,0,0.5)",border:"2px solid #333",borderRadius:12,padding:"16px 18px",marginBottom:12}}>
            <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"#85CDD1",marginBottom:8}}>💡 C'est quoi cette appli?</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"#ccc",lineHeight:1.5}}>
              Tu fais des tâches dans la vraie vie, et ici tu gagnes des XP et des pièces! Monte de niveau, choisis ton thème, débloque des badges et échange tes pièces contre de vraies récompenses. C'est comme un jeu vidéo, mais les points sont vrais. 🎮
            </div>
          </div>

          {[
            ["📋","Tes Quêtes","C'est ici que tu vois ce que tu dois faire (ranger ta chambre, la vaisselle…). Une fois que tu l'as fait, clique «J'AI FAIT ÇA!» et attends que ton parent valide!"],
            ["⚡","XP & Niveaux","Chaque quête validée te donne de l'XP. Plus tu en accumules, plus tu montes de niveau et débloques un titre cool selon ton thème. Il y a 5 niveaux!"],
            ["🪙","Pièces & Boutique","Les quêtes donnent aussi des pièces. Dans la boutique, tu peux acheter des accessoires pour ton perso ET les récompenses créées par tes parents."],
            ["🎨","13 Thèmes","Minecraft, Harry Potter, Marvel, Ghibli, Roblox… Chaque thème change les couleurs et les titres de toute la page. Tu choisis le tien à ta première connexion!"],
            ["🏅","Badges","Des badges secrets à débloquer en faisant des tâches. Streaks, premières fois, défis épiques… survole un badge pour voir comment le gagner!"],
            ["📅","Calendrier","Note tes devoirs et examens ici! Un rappel va apparaître automatiquement quand la date approche, avec de l'XP bonus pour compléter."],
            ["🎮","Mini-jeux","Quand tu montes de niveau, choisis TOI-MÊME ton mini-jeu! 🎮 Trois jeux possibles: Whack-a-Mole (tape les monstres!), Runner (saute les obstacles!) ou Pac-Quest (mange les pellets, évite le fantôme!). Les paliers de récompense sont affichés avant de jouer — fais un score parfait pour gagner le max de XP et de pièces bonus. 🏆"],
            ["🔒","Portail parent","La section Parent est réservée aux adultes (protégée par un code secret). C'est là qu'ils valident tes quêtes et créent des récompenses. Tu peux aussi avoir ton propre code PIN pour protéger ton profil!"],
          ].map(([icon,title,desc])=>(
            <div key={title} style={{display:"flex",gap:12,background:"rgba(0,0,0,0.35)",border:"1px solid #222",borderRadius:8,padding:"10px 14px",marginBottom:8}}>
              <span style={{fontSize:22,flexShrink:0,marginTop:2}}>{icon}</span>
              <div>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",marginBottom:4}}>{title}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"var(--txt-pale,#aaa)",lineHeight:1.45}}>{desc}</div>
              </div>
            </div>
          ))}

          <div style={{background:"rgba(93,236,245,0.07)",border:"2px solid #85CDD144",borderRadius:10,padding:"12px 16px",marginTop:4,marginBottom:4}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1",marginBottom:8}}>⚡ COMMENT GAGNER PLUS D'XP?</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ccc",lineHeight:1.7}}>
              📋 Faire tes quêtes du jour (surtout les épiques!)<br/>
              🔥 Garder un <span style={{color:"#D9BC5C"}}>streak</span> — plusieurs jours de suite<br/>
              📅 Valider tes devoirs et examens dans le calendrier<br/>
              🎮 Faire un score parfait au mini-jeu de niveau<br/>
              🏅 Débloquer de nouveaux badges
            </div>
          </div>

          <div style={{textAlign:"center",marginTop:4,marginBottom:8}}>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#333",marginBottom:12}}>v{appVersion}</div>
            <button onClick={()=>{SFX.click();setMode("who");}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"10px 24px",background:"rgba(0,0,0,0.7)",color:"#D9BC5C",border:"3px solid #D9BC5C",borderRadius:8,cursor:"pointer",transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 0 16px #D9BC5C55";}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";}}>
              ← RETOUR
            </button>
          </div>
        </div>
      )}

      {/* ── Écran 2 : Qui es-tu? ── */}
      {mode === "child-select" && (
        <div style={{textAlign:"center",width:"100%",maxWidth:380}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,2.5vw,15px)",color:"#D9BC5C",textShadow:"3px 3px 0 #0d0d0d,0 0 20px #D9BC5C80",marginBottom:10}}>⚔️ MON LIVRE DE QUÊTES</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:22,color:"var(--txt-dim,#666)",marginBottom:20}}>Qui es-tu?</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            {(config?.players||[]).map((pl, i) => {
              const psi = gameStates[i] || {};
              const isNew = !psi.avatar?.configured && !psi.pin;
              return (
                <button key={pl.id} onClick={()=>handleChildSelect(i)}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"10px 16px 10px 10px",background:"rgba(0,0,0,0.7)",color:pl.color,border:`3px solid ${pl.color}`,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"all 0.15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 0 16px ${pl.color}55`;e.currentTarget.style.transform="translateX(4px)";}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="none";}}>
                  {/* v2.5.12 — portrait avatar bien visible (avant: 36px noyé dans la ligne) : même cadre
                      carré à coins arrondis que les avatars de la Vue Famille (FamilySpace) et du profil. */}
                  <AvatarCanvas avatarDef={psi.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(pl.themeId).charBodyColor||pl.color} size={56}
                    style={{flexShrink:0,border:`2px solid ${pl.color}`,borderRadius:8,background:`${pl.color}15`}}/>
                  <span style={{flex:1,textAlign:"left"}}>{pl.name}</span>
                  {isNew && <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#5CAD68",fontWeight:"bold"}}>NOUVEAU ✨</span>}
                  {!isNew && psi.pin && <span style={{color:"#444",fontSize:12}}>🔑</span>}
                </button>
              );
            })}
            <button onClick={()=>{SFX.click();onNewSetup?.();}}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"14px 16px",background:"rgba(0,0,0,0.5)",color:"#4ade80",border:"3px dashed #4ade8066",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"safe center",gap:10,transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#4ade80";e.currentTarget.style.boxShadow="0 0 16px #4ade8033";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#4ade8066";e.currentTarget.style.boxShadow="none";}}>
              📖 Nouveau livre de quêtes
            </button>
          </div>
          <BtnBack onClick={()=>setMode("who")}/>
        </div>
      )}

      {/* ── Onboarding 1er login ── */}
      {mode === "onboarding" && player && (
        <div style={{width:"100%",maxWidth:400,textAlign:"center"}}>

          {/* Étape 1 : Thème */}
          {obStep === "theme" && (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:6}}>🎨 TON THÈME · ÉTAPE 1/4</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"var(--txt-muted,#888)",marginBottom:4}}>Touche l'univers que tu préfères</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-dim,#666)",marginBottom:20}}>⏳ Ce thème dure toute la semaine — choisis bien!</div>
              <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
                {(player.starterThemes||[player.themeId||"none"]).map(tid=>{
                  const t = getPlayerTheme(tid);
                  const sel = draftTheme === tid;
                  return (
                    <button key={tid} onClick={()=>{SFX.click();setDraftTheme(tid);}}
                      style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"14px 16px",background:sel?`${t.primary}30`:"rgba(0,0,0,0.7)",color:sel?t.accent:"var(--txt-muted,#888)",border:`3px solid ${sel?t.accent:"#333"}`,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",transition:"all 0.15s",boxShadow:sel?`0 0 16px ${t.accent}40`:"none"}}>
                      <span style={{fontSize:28}}>{t.icon}</span>
                      <span style={{flex:1}}>{t.name}</span>
                      {sel&&<span style={{fontSize:16}}>✓</span>}
                    </button>
                  );
                })}
              </div>
              {draftTheme && (
                <button onClick={()=>{SFX.click();setObStep("avatar");}}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 28px",background:accentColor,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer"}}>
                  Continuer →
                </button>
              )}
              <div><BtnBack onClick={()=>{setMode("child-select");setSelIdx(null);}}/></div>
            </div>
          )}

          {/* Étape 2 : Avatar */}
          {obStep === "avatar" && (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:6}}>👾 TON AVATAR · ÉTAPE 2/4</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"var(--txt-muted,#888)",marginBottom:4}}>Crée ton personnage 8-bit</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-dim,#666)",marginBottom:12}}>Touche un onglet (Cheveux, Peau…) puis touche ce que tu aimes.</div>
              <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
                <AvatarCanvas avatarDef={draftAvatar} bodyColor={getPlayerTheme(draftTheme||"none").charBodyColor||accentColor} size={80}
                  style={{border:`3px solid ${accentColor}`,borderRadius:8}}/>
              </div>
              {/* Silhouette (demande Gen 2026-07-27) — choix à la création de compte. Pas d'effet
                  visuel sur le rendu procédural : sélectionnera le personnage détaillé (chantier E). */}
              <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:10}}>
                {AVATAR_PARTS.build.map(b=>(
                  <button key={b.id} onClick={()=>{setDraftAvatar(d=>({...d,build:b.id}));SFX.click();}}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:(draftAvatar.build||"bd_ado")===b.id?accentColor:"#1a1a1a",color:(draftAvatar.build||"bd_ado")===b.id?"#0d0d0d":"var(--txt-muted,#888)",border:`2px solid ${(draftAvatar.build||"bd_ado")===b.id?accentColor:"#333"}`,borderRadius:4,cursor:"pointer"}}>
                    {b.emoji} {b.label}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:10,flexWrap:"wrap"}}>
                {[["hair","Cheveux"],["skin","Peau"],["eyes","Yeux"],["mouth","Bouche"]].map(([k,l])=>(
                  <button key={k} onClick={()=>{setAvatarTab(k);SFX.click();}}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"5px 8px",background:avatarTab===k?accentColor:"#1a1a1a",color:avatarTab===k?"#0d0d0d":"var(--txt-dim,#666)",border:`2px solid ${avatarTab===k?accentColor:"#333"}`,borderRadius:3,cursor:"pointer"}}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={{maxHeight:150,overflowY:"auto",marginBottom:14}}>
                {avatarTab === "hair" && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                    {AVATAR_PARTS.hair.map(h=>(
                      <div key={h.id} onClick={()=>{setDraftAvatar(a=>({...a,hair:h.id}));SFX.click();}}
                        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 4px",background:draftAvatar.hair===h.id?`${h.color}30`:"rgba(0,0,0,0.5)",border:`2px solid ${draftAvatar.hair===h.id?h.color:"#333"}`,borderRadius:4,cursor:"pointer"}}>
                        <div style={{width:24,height:12,background:h.color,borderRadius:"3px 3px 0 0",border:"1px solid #0d0d0d"}}/>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:10,color:"#ccc"}}>{h.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {avatarTab === "skin" && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                    {AVATAR_PARTS.skin.map(s=>(
                      <div key={s.id} onClick={()=>{setDraftAvatar(a=>({...a,skin:s.id}));SFX.click();}}
                        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 4px",background:draftAvatar.skin===s.id?`${s.color}30`:"rgba(0,0,0,0.5)",border:`2px solid ${draftAvatar.skin===s.id?s.color:"#333"}`,borderRadius:4,cursor:"pointer"}}>
                        <div style={{width:24,height:24,background:s.color,borderRadius:3,border:"1px solid #0d0d0d"}}/>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:10,color:"#ccc"}}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {avatarTab === "eyes" && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                    {AVATAR_PARTS.eyes.map(e=>(
                      <div key={e.id} onClick={()=>{setDraftAvatar(a=>({...a,eyes:e.id}));SFX.click();}}
                        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px",background:draftAvatar.eyes===e.id?`${e.eyeColor}20`:"rgba(0,0,0,0.5)",border:`2px solid ${draftAvatar.eyes===e.id?e.eyeColor:"#333"}`,borderRadius:4,cursor:"pointer"}}>
                        <span style={{fontSize:22}}>{e.emoji}</span>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:10,color:"#ccc"}}>{e.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {avatarTab === "mouth" && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                    {AVATAR_PARTS.mouth.map(m=>(
                      <div key={m.id} onClick={()=>{setDraftAvatar(a=>({...a,mouth:m.id}));SFX.click();}}
                        style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px",background:draftAvatar.mouth===m.id?`${m.color}20`:"rgba(0,0,0,0.5)",border:`2px solid ${draftAvatar.mouth===m.id?m.color:"#333"}`,borderRadius:4,cursor:"pointer"}}>
                        <span style={{fontSize:22}}>{m.emoji}</span>
                        <span style={{fontFamily:"'VT323',monospace",fontSize:10,color:"#ccc"}}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={()=>{SFX.click();setObStep("pseudo");}}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 28px",background:accentColor,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer"}}>
                Continuer →
              </button>
              <div><BtnBack onClick={()=>setObStep("theme")}/></div>
            </div>
          )}

          {/* Étape 3 : Surnom */}
          {obStep === "pseudo" && (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:6}}>✏️ TON SURNOM · ÉTAPE 3/4</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"var(--txt-muted,#888)",marginBottom:6}}>Comment veux-tu t'appeler?</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-faint,#555)",marginBottom:20}}>Ton vrai nom reste privé pour tes parents.</div>
              <input
                value={draftPseudo}
                onChange={e=>setDraftPseudo(e.target.value.slice(0,16))}
                placeholder={player.name}
                maxLength={16}
                autoFocus
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"12px 16px",background:"rgba(0,0,0,0.7)",color:accentColor,border:`3px solid ${accentColor}`,borderRadius:6,width:"100%",textAlign:"center",outline:"none",marginBottom:20,boxSizing:"border-box"}}
              />
              <button onClick={()=>{SFX.click();setObStep("pin-create");setObPin("");setObFirstPin("");}}
                style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 28px",background:accentColor,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer"}}>
                Continuer →
              </button>
              <div><BtnBack onClick={()=>setObStep("avatar")}/></div>
            </div>
          )}

          {/* Étape 4 : PIN création/confirmation */}
          {(obStep === "pin-create" || obStep === "pin-confirm") && (
            <div style={{background:`linear-gradient(160deg,rgba(0,0,0,0.9),${accentColor}10)`,border:`3px solid ${accentColor}`,borderRadius:12,padding:"24px 28px"}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
                <AvatarCanvas avatarDef={draftAvatar} bodyColor={getPlayerTheme(draftTheme||"none").charBodyColor||accentColor} size={52}
                  style={{border:`3px solid ${accentColor}`,borderRadius:8}}/>
              </div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:accentColor,marginBottom:4}}>
                {obStep==="pin-create" ? "CRÉE TON CODE SECRET · ÉTAPE 4/4" : "CONFIRME TON CODE · ÉTAPE 4/4"}
              </div>
              {obStep==="pin-create"&&<div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-faint,#555)",marginBottom:12}}>Choisis 4 chiffres faciles à retenir pour TOI. C'est ton code pour entrer dans ton compte.</div>}
              <PinDots value={obPin} error={pinError} color={accentColor}/>
              <PinKeypad
                onDigit={handleObPinDigit}
                onBack={()=>setObPin(p=>p.slice(0,-1))}
                onClose={()=>{ obStep==="pin-confirm"?( setObStep("pin-create"),setObFirstPin(""),setObPin("") ):(setObStep("pseudo")); }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── PIN joueur retour ── */}
      {mode === "pin" && player && (
        <div style={{background:`linear-gradient(160deg,rgba(0,0,0,0.9),${accentColor}10)`,border:`3px solid ${accentColor}`,borderRadius:12,padding:"24px 28px",textAlign:"center",maxWidth:300,width:"100%"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
            <AvatarCanvas avatarDef={ps.avatar||DEFAULT_AVATAR} bodyColor={getPlayerTheme(player.themeId).charBodyColor||accentColor} size={52}
              style={{border:`3px solid ${accentColor}`,borderRadius:8}}/>
          </div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:accentColor,marginBottom:4}}>{displayName(player)}</div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",marginBottom:16,lineHeight:1.8}}>
            {!ps.pin ? (confirmStep ? "CONFIRME TON CODE" : "CRÉE TON CODE SECRET") : "TON CODE SECRET"}
          </div>
          {!ps.pin&&!confirmStep&&<div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-faint,#555)",marginBottom:12}}>Choisis 4 chiffres que tu n'oublies pas...</div>}
          <PinDots value={pPin} error={pinError} color={accentColor}/>
          <PinKeypad
            onDigit={handlePlayerDigit}
            onBack={()=>{ pPinRef.current=pPinRef.current.slice(0,-1); setPPin(pPinRef.current); }}
            onClose={()=>{ if(confirmStepRef.current){confirmStepRef.current=false;setConfirmStep(false);firstPinRef.current="";setFirstPin("");pPinRef.current="";setPPin("");}else{setMode("child-select");setSelIdx(null);} }}
            onSubmit={pPin.length===4?doPlayerSubmit:undefined}
          />
          {pPin.length===4&&<button onClick={doPlayerSubmit} style={{marginTop:10,width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"10px 0",background:accentColor,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer"}}>✅ VALIDER</button>}
        </div>
      )}

      {/* ── PIN parent ── */}
      {mode === "parent" && (
        <div style={{background:"rgba(0,0,0,0.85)",border:"3px solid #D99248",borderRadius:12,padding:"24px 28px",textAlign:"center",maxWidth:300,width:"100%"}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#D99248",marginBottom:16}}>🔐 PIN PARENT</div>
          <PinDots value={ppPin} error={pinError} color="#D99248"/>
          <PinKeypad
            onDigit={handleParentDigit}
            onBack={()=>{ ppPinRef.current=ppPinRef.current.slice(0,-1); setPpPin(ppPinRef.current); }}
            onClose={()=>{setMode("who");setPpPin("");setPinError(false);}}
            onSubmit={ppPin.length===4?doParentSubmit:undefined}
          />
          {ppPin.length===4&&<button onClick={doParentSubmit} style={{marginTop:10,width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"10px 0",background:"#D99248",color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer"}}>✅ VALIDER</button>}
        </div>
      )}

      <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#2a2a2a",marginTop:24}}>v{appVersion}</div>
    </div>
  );
}
