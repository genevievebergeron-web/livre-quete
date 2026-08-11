// ─── POPUPS PLEIN ÉCRAN (évolution, code PIN, récompense) ───────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : trois popups modales indépendantes,
// aucun état applicatif partagé — seulement leurs props + hooks locaux. Zéro changement
// de comportement.
import { useState, useRef, useEffect, useCallback } from "react";
import { SFX } from "./sfx.js";
import { THEMES, displayName } from "./shared.js";
import { getPlayerTheme } from "./themes.js";
import { getLevelTitle } from "./leveling.js";
import { PET_ELEMENTS, petSpriteKey, petEvoOptions } from "./pets.js";
import { PetSprite } from "./sprites.jsx";

const FUNNY_PIN_MSGS = [
  "...ou peut-être que le code, c'est pas ça non plus? 🤔",
  "Y'a quelqu'un ici qui connaît le code? Non? OK.",
  "À ce rythme-là, t'as jusqu'en 2087 pour le trouver.",
  "PSST: ton parent va finir par changer le code pour 0000.",
];

// v2.16.10 (Backlog #12) — messages sarcastiques, tirés au sort dans RewardPopup après une quête validée.
const FUNNY_MSGS = [
  "Wow. La tâche est faite. La Terre continue de tourner. 🌎",
  "T'as prouvé que tu peux faire des choses! Maintenant recommence.",
  "ALERTE: un enfant a accompli une tâche! NASA informé. 🚀",
  "Légendaire! (C'est-à-dire: ça s'est produit une fois.) 📜",
  "Félicitations! T'es officiellement moins paresseux·se qu'une plante. 🌱",
  "La famille a confirmé: t'as pas juste dit que t'allais le faire. 👀",
  "C'est tellement impressionnant... même le chat fait semblant d'être fier. 🐱",
  "Performance historique. Les archéologues en parleront dans 3000 ans.",
  "Le plancher était là depuis tout ce temps. T'as enfin remarqué. 🧹",
  "Des XP! Des pièces! Et toujours aucun médaillon d'or dans la vraie vie.",
  "INCROYABLE. Ça a pris 45 secondes. Bon, c'est mieux que jamais, disons.",
  "Voilà ce qu'on appelle un niveau de productivité tout à fait acceptable. 👑",
];

// v1.57.0 — Choix d'évolution : 2 éléments tirés au hasard, l'enfant choisit la voie de son familier
export function EvolutionModal({ petId, tier, evo, onChoose, th }) {
  const opts = petEvoOptions(petId, tier, evo);
  const acc = th?.accent || "#D9BC5C";
  const spriteKey = petSpriteKey(petId);
  const legend = tier===3;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:2700,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",padding:20,overflowY:"auto",textAlign:"center"}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(11px,1.9vw,16px)",color:acc,marginBottom:6}}>✨ ÉVOLUTION! ✨</div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#fff",marginBottom:18,maxWidth:360,lineHeight:1.35}}>{legend?"Ton familier atteint sa forme finale! Choisis sa voie Légendaire :":"Ton familier veut évoluer. Choisis sa voie élémentaire :"}</div>
      <div style={{display:"flex",gap:18,flexWrap:"wrap",justifyContent:"center"}}>
        {opts.map(el=>{ const E=PET_ELEMENTS[el]; return (
          <button key={el} onClick={()=>{ if(SFX.click)SFX.click(); onChoose(el); }}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,background:"rgba(0,0,0,0.5)",border:`3px solid ${E.pal.b}`,borderRadius:14,padding:"16px 20px",cursor:"pointer"}}>
            <PetSprite petKey={spriteKey} size={100} palOverride={E.pal} legendary={legend}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:E.pal.b}}>{E.label}</span>
          </button>
        );})}
      </div>
    </div>
  );
}

export function PinPad({ pin, label, onSuccess, onCancel, th }) {
  const [buf, setBuf] = useState("");
  const [err, setErr] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const bufRef = useRef("");
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const setErrRef = useRef(setErr);
  const setFailRef = useRef(setFailCount);

  const press = useCallback(v => {
    SFX.pinKey();
    if (v === "del") {
      bufRef.current = bufRef.current.slice(0, -1);
      setBuf(bufRef.current);
      return;
    }
    if (bufRef.current.length >= 4) return;
    bufRef.current = bufRef.current + v;
    setBuf(bufRef.current);
    if (bufRef.current.length === 4) {
      const entered = bufRef.current;
      setTimeout(() => {
        if (entered === pinRef.current) { SFX.pinOk(); onSuccessRef.current(); }
        else {
          SFX.pinErr();
          setErrRef.current(true);
          setFailRef.current(f=>f+1);
          bufRef.current = "";
          setBuf("");
          setTimeout(() => setErrRef.current(false), 1500);
        }
      }, 150);
    }
  }, []);

  useEffect(() => {
    const onKey = e => {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace" || e.key === "Delete") press("del");
      else if (e.key === "Escape") onCancelRef.current();
      else if (e.key === "Enter" && bufRef.current.length === 4) {
        const entered = bufRef.current;
        if (entered === pinRef.current) { SFX.pinOk(); onSuccessRef.current(); }
        else { SFX.pinErr(); setErrRef.current(true); setFailRef.current(f=>f+1); bufRef.current=""; setBuf(""); setTimeout(()=>setErrRef.current(false),1500); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);
  const T = th || THEMES.minecraft;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:4000,display:"flex",alignItems:"center",justifyContent:"safe center",padding:16,overflowY:"auto",boxSizing:"border-box"}}>
      <div style={{background:`linear-gradient(135deg,${T.bg},#1a1a2e)`,border:`5px solid ${T.accent}`,borderRadius:10,padding:"20px 24px",textAlign:"center",maxWidth:360,width:"100%",maxHeight:"calc(100vh - 32px)",overflowY:"auto",boxSizing:"border-box",boxShadow:`0 0 50px ${T.accent}60`,animation:"bounceIn 0.35s ease"}}>
        <div style={{fontSize:36,marginBottom:6}}>👩‍💻</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:T.accent,marginBottom:6}}>VALIDATION PARENT</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"#ccc",marginBottom:14,lineHeight:1.3}}>{label}</div>
        <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:14}}>
          {[0,1,2,3].map(i=><div key={i} style={{width:20,height:20,borderRadius:"50%",border:`3px solid ${T.accent}`,background:i<buf.length?T.accent:"transparent",boxShadow:i<buf.length?`0 0 10px ${T.accent}`:"none",transition:"all 0.15s"}}/>)}
        </div>
        {err && <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D97070",marginBottom:4,animation:"shake 0.4s ease"}}>❌ Code incorrect!</div>}
        {failCount>=2&&<div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-muted,#888)",marginBottom:6,textAlign:"center"}}>{FUNNY_PIN_MSGS[Math.min(failCount-2,FUNNY_PIN_MSGS.length-1)]}</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,maxWidth:200,margin:"0 auto 14px"}}>
          {["1","2","3","4","5","6","7","8","9","⌫","0","✕"].map(k=>(
            <button key={k} className="btn-press" onClick={()=>press(k==="⌫"||k==="✕"?"del":k)}
              style={{fontFamily:"'Press Start 2P',monospace",fontSize:k==="⌫"||k==="✕"?9:14,padding:11,background:"#222",border:"3px solid #555",color:k==="⌫"||k==="✕"?"var(--txt-muted,#888)":"#fff",cursor:"pointer",borderRadius:4,boxShadow:"3px 3px 0 #0d0d0d"}}>
              {k}
            </button>
          ))}
        </div>
        <button
          onClick={()=>{
            if(bufRef.current.length!==4)return;
            const entered=bufRef.current;
            if(entered===pinRef.current){SFX.pinOk();onSuccessRef.current();}
            else{SFX.pinErr();setErr(true);setFailCount(f=>f+1);bufRef.current="";setBuf("");setTimeout(()=>setErr(false),1500);}
          }}
          disabled={buf.length!==4}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"10px 0",width:"100%",maxWidth:200,display:"block",margin:"0 auto 10px",background:buf.length===4?T.accent:"#222",color:buf.length===4?"#0d0d0d":"#444",border:`3px solid ${buf.length===4?T.accent:"#333"}`,cursor:buf.length===4?"pointer":"not-allowed",borderRadius:4,boxShadow:buf.length===4?`0 0 12px ${T.accent}80`:"none",transition:"all 0.15s"}}>
          ✅ VALIDER
        </button>
        <button onClick={onCancel} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#333",color:"var(--txt-muted,#888)",border:"2px solid #555",cursor:"pointer",borderRadius:2}}>Annuler</button>
      </div>
    </div>
  );
}

export function RewardPopup({ task, player, newBadges, onClose, th, humor }) {
  const T = th || THEMES.minecraft;
  // 1 fois sur 3, un message sarcastique — tiré au sort une seule fois par ouverture du popup,
  // pas à chaque re-render (sinon il changerait sous les yeux de l'enfant).
  // v2.16.48 — respecte le réglage « 😄 Messages rigolos » de l'enfant. `humor` non fourni = actif
  // (défaut historique du champ `settings.humor`), donc aucun appelant existant ne change de comportement.
  const [funnyMsg] = useState(()=> (humor!==false && Math.random()<0.33) ? FUNNY_MSGS[Math.floor(Math.random()*FUNNY_MSGS.length)] : null);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"safe center",padding:16,overflowY:"auto"}}>
      <div style={{background:`radial-gradient(circle at 50% 28%, ${T.accent}22, ${T.bg} 70%)`,border:`6px solid ${T.accent}`,borderRadius:10,padding:"clamp(18px,4vw,30px) clamp(20px,5vw,40px)",textAlign:"center",maxWidth:440,width:"90%",maxHeight:"90vh",overflowY:"auto",boxShadow:`0 0 50px ${T.accent}80`,animation:"bounceIn 0.45s cubic-bezier(0.34,1.56,0.64,1)"}}>
        {/* Refonte visuelle Phase 6 — rayons tournants derrière l'emoji (wow-moment), zéro bruit
            ajouté : pur CSS, .rays-bg est tué gratuitement par .calm-mode/prefers-reduced-motion. */}
        <div style={{position:"relative",width:80,height:80,margin:"0 auto 10px",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div className="rays-bg" style={{color:T.accent}}/>
          <div style={{fontSize:60,position:"relative",zIndex:1}}>{task.emoji}</div>
        </div>
        <div className="glow-pulse" style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.5vw,14px)",color:T.accent,marginBottom:8}}>⚡ QUÊTE {(getPlayerTheme(player?.themeId)?.taskVerb||"validée").toUpperCase()}!</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:"clamp(16px,2.5vw,20px)",color:"#fff",marginBottom:16,lineHeight:1.4}}>{task.label}</div>
        <div style={{display:"flex",gap:20,justifyContent:"center",marginBottom:18}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,20px)",color:"#85CDD1"}}>+{task.xp} ⚡</div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,20px)",color:"#D9BC5C"}}>+{task.coins} 🪙</div>
        </div>
        {player && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:player.color,marginBottom:14}}>Bravo {displayName(player)}! 🎉</div>}
        {funnyMsg && <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-muted,#888)",fontStyle:"italic",marginBottom:14,maxWidth:340,marginLeft:"auto",marginRight:"auto",lineHeight:1.35}}>{funnyMsg}</div>}
        {newBadges&&newBadges.length>0&&(
          <div style={{background:"rgba(0,0,0,0.4)",borderRadius:6,padding:"10px 14px",marginBottom:14}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#D9BC5C",marginBottom:8}}>🏅 BADGE{newBadges.length>1?"S":""} DÉBLOQUÉ{newBadges.length>1?"S":""}!</div>
            {newBadges.map(b=>(
              <div key={b.id} style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#fff",display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
                <span style={{fontSize:22}}>{b.emoji}</span> <strong>{b.name}</strong>
              </div>
            ))}
          </div>
        )}
        <button className="btn-press" onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"11px 22px",background:"#5CAD68",color:"#0d0d0d",border:"4px solid #0d0d0d",borderRadius:3,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>→ CONTINUER ←</button>
      </div>
    </div>
  );
}
