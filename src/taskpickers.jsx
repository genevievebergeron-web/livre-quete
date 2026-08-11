// ─── SÉLECTEUR ET CRÉATEUR DE TÂCHE (popups plein écran) ────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : les deux popups n'ont que leur état
// local (useState) — aucun état applicatif partagé, zéro changement de comportement.
import { useState } from "react";
import { SFX } from "./sfx.js";
import { catMeta, dedupeTasksByLabel } from "./catalog.js";
import { UIIcon } from "./sprites.jsx";

// v1.53.0 — Sélecteur de tâches en GRILLE groupée + code couleur par étiquette.
// L'enfant CHOISIT une tâche existante (réutilise son taskId → zéro doublon). Repli: créer la sienne.
export function TaskChooser({ allTasks, onPick, onCreateOwn, onClose, th }){
  const acc=th?.accent||"#D9BC5C";
  // v2.16.44 — même liste curée qu'avant (catalogue + parent, pas le bric-à-brac), mais une seule
  // entrée par libellé : les copies héritées d'avant les garde-fous anti-doublon encombraient la
  // catégorie « Perso » (26 boutons redondants sur 73 en prod, dont 20 « Tâche de rituel (à renommer) »).
  const tasks=dedupeTasksByLabel((allTasks||[]).filter(t=>t && t.label && !t.child));
  const order=["routine","cuisine","menage","outdoor","defi","custom"];
  const groups={}; tasks.forEach(t=>{ const c=t.cat||"custom"; (groups[c]=groups[c]||[]).push(t); });
  const cats=Object.keys(groups).sort((a,b)=>{const ia=order.indexOf(a),ib=order.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
  return (
    // v2.15.7 (bug signalé par Gen, 2026-07-28) : `viewport-fit=cover` (index.html) laisse ce popup
    // plein écran s'étendre sous l'encoche/la barre de geste du bas des iPhone à écran sans bouton —
    // un `padding` plat n'en tenait pas compte, rendant le bas du popup (donc son bouton d'action)
    // partiellement caché derrière la zone système, inaccessible même en défilant. Fix : compenser
    // avec `env(safe-area-inset-*)`, sans effet sur les appareils sans encoche (valeur 0 par défaut).
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",zIndex:2600,display:"flex",flexDirection:"column",padding:"calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))",overflowY:"auto",maxWidth:720,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:acc}}>➕ Choisis une quête</div>
        <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"var(--txt-muted,#888)",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
      </div>
      {/* Backlog UX #9 — dupliqué en haut : évite de faire défiler toutes les catégories juste pour créer sa propre tâche */}
      <button onClick={onCreateOwn} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"10px",marginBottom:14,background:"rgba(0,0,0,0.4)",border:`2px dashed ${acc}`,color:acc,borderRadius:6,cursor:"pointer"}}>✏️ Je ne trouve pas — créer ma propre tâche</button>
      {cats.map(c=>{ const m=catMeta(c); return (
        <div key={c} style={{marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
            <span style={{width:12,height:12,background:m.color,borderRadius:3,display:"inline-block"}}/>
            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:m.color}}>{m.label}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
            {groups[c].map(t=>(
              <button key={t.id} onClick={()=>{SFX.click&&SFX.click();onPick(t.id);}}
                style={{display:"flex",alignItems:"center",gap:8,textAlign:"left",padding:"9px 10px",background:"rgba(0,0,0,0.45)",border:`2px solid ${m.color}55`,borderLeft:`5px solid ${m.color}`,borderRadius:8,cursor:"pointer"}}>
                <UIIcon name={"task_"+t.id} emoji={t.emoji||"⭐"} size={20}/>
                <span style={{display:"flex",flexDirection:"column",minWidth:0}}>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#fff",lineHeight:1.1}}>{t.label}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:13,color:m.color}}>+{t.xp||0} XP · {t.coins||0} 🪙</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      );})}
      <button onClick={onCreateOwn} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",padding:"12px",marginTop:4,background:"rgba(0,0,0,0.4)",border:`2px dashed ${acc}`,color:acc,borderRadius:6,cursor:"pointer"}}>✏️ Je ne trouve pas — créer ma propre tâche</button>
    </div>
  );
}

const EMOJI_CHOICES = ["⭐","✅","🎯","🧹","🧺","🛏️","🍽️","🥣","🚿","🛁","🪥","🦷","👕","🎒","📚","✏️","📝","🧮","🐕","🐈","🌱","🗑️","♻️","🧴","🧽","🚽","🪣","👟","🧦","🍳","🥪","💊","💧","🪟","🛋️","🧸","🎮","⚽","🎨","🎵","🚲","🏃","💪","🌙","☀️","🍎"];

// v2.5.10 (Correctif 2C) — portée de la tâche, seulement affichée quand `scopeOptions` est vrai
// (l'enfant crée depuis sa propre journée). Les autres appelants (rituel, parent) ignorent ce champ.
const SCOPES=[
  ["once","1️⃣ Juste pour aujourd'hui","Elle disparaît après aujourd'hui"],
  ["reusable","🔁 Juste pour moi, à chaque fois","Elle reste dispo pour toi seulement"],
  ["propose","🧑‍🤝‍🧑 Proposer à toute la famille","Un parent doit l'approuver d'abord"],
];
const TIMES_OF_DAY=[["","🕐 N'importe quand"],["matin","🌅 Matin"],["après-midi","☀️ Après-midi"],["soir","🌙 Soir"]];
export function CustomTaskModal({ title="Nouvelle quête", confirmLabel="Créer", onCreate, onClose, th, scopeOptions=false }){
  const [label,setLabel]=useState(""); const [emoji,setEmoji]=useState("⭐"); const [diff,setDiff]=useState("medium"); const [scope,setScope]=useState("once"); const [timeOfDay,setTimeOfDay]=useState("");
  const acc=th?.accent||"#D9BC5C";
  const DIFFS=[["easy","🟢 Facile","+10 XP · 5 🪙"],["medium","🟡 Moyen","+20 XP · 10 🪙"],["hard","🔴 Difficile","+40 XP · 20 🪙"]];
  return (
    // v2.15.7 (bug signalé par Gen, 2026-07-28) : même correctif que TaskChooser ci-dessus — sans
    // compensation `env(safe-area-inset-*)`, le bouton "Créer la tâche" tout en bas pouvait finir
    // partiellement sous la zone système (encoche/geste) d'un iPhone sans bouton, inatteignable.
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:2600,display:"flex",flexDirection:"column",padding:"calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))",overflowY:"auto",maxWidth:640,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.2vw,11px)",color:acc}}>{title}</div>
        <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,padding:"6px 12px",background:"#222",color:"var(--txt-muted,#888)",border:"2px solid #444",borderRadius:4,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:4}}>Nom de la quête :</div>
      <input value={label} autoFocus onChange={e=>setLabel(e.target.value.slice(0,40))} placeholder="ex: Ranger ma chambre"
        style={{fontFamily:"'VT323',monospace",fontSize:16,padding:"9px 11px",background:"#111",color:"#fff",border:`2px solid ${acc}`,borderRadius:5,outline:"none",marginBottom:10}}/>
      <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:4}}>Choisis une image : <span style={{fontSize:22}}>{emoji}</span></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4,marginBottom:14}}>
        {EMOJI_CHOICES.map(em=>(
          <button key={em} onClick={()=>{SFX.click();setEmoji(em);}}
            style={{fontSize:20,padding:"6px 0",background:emoji===em?`${acc}33`:"#1a1a1a",border:`2px solid ${emoji===em?acc:"#333"}`,borderRadius:5,cursor:"pointer"}}>{em}</button>
        ))}
      </div>
      <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:4}}>C'est difficile à quel point? (plus c'est dur, plus ça rapporte!)</div>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {DIFFS.map(([k,l,sub])=>(
          <button key={k} onClick={()=>{SFX.click();setDiff(k);}}
            style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"9px 4px",lineHeight:1.5,background:diff===k?acc:"#1a1a1a",color:diff===k?"#0d0d0d":"var(--txt-mild,#999)",border:`2px solid ${diff===k?acc:"#333"}`,borderRadius:5,cursor:"pointer"}}>
            {l}<br/><span style={{fontFamily:"'VT323',monospace",fontSize:11}}>{sub}</span>
          </button>
        ))}
      </div>
      {scopeOptions && (<>
        {/* v2.11.2 — moment de la journée, seulement affiché côté enfant (les définitions créées
            côté parent n'ont pas encore d'assignation, donc pas de moment pertinent à ce stade). */}
        <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:4}}>À quel moment?</div>
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {TIMES_OF_DAY.map(([k,l])=>(
            <button key={k||"any"} onClick={()=>{SFX.click();setTimeOfDay(k);}}
              style={{flex:"1 1 auto",fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"9px 6px",background:timeOfDay===k?acc:"#1a1a1a",color:timeOfDay===k?"#0d0d0d":"var(--txt-mild,#999)",border:`2px solid ${timeOfDay===k?acc:"#333"}`,borderRadius:5,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb",marginBottom:4}}>C'est pour qui?</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
          {SCOPES.map(([k,l,sub])=>(
            <button key={k} onClick={()=>{SFX.click();setScope(k);}}
              style={{display:"flex",flexDirection:"column",alignItems:"flex-start",fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"9px 11px",background:scope===k?acc:"#1a1a1a",color:scope===k?"#0d0d0d":"var(--txt-mild,#999)",border:`2px solid ${scope===k?acc:"#333"}`,borderRadius:5,cursor:"pointer",textAlign:"left"}}>
              {l}<span style={{fontFamily:"'VT323',monospace",fontSize:12,marginTop:3,fontWeight:"normal"}}>{sub}</span>
            </button>
          ))}
        </div>
      </>)}
      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"14px",background:"#1a1a1a",color:"var(--txt-muted,#888)",border:"2px solid #333",borderRadius:6,cursor:"pointer"}}>← Retour</button>
        <button className="btn-press" disabled={!label.trim()} onClick={()=>{ if(label.trim()){ onCreate({label:label.trim(),emoji,diff,...(scopeOptions?{scope,timeOfDay}:{})}); } }}
          style={{flex:2,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,10px)",padding:"14px",background:label.trim()?acc:"#333",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:"pointer",opacity:label.trim()?1:0.5,boxShadow:"2px 2px 0 #0d0d0d"}}>
          ✅ {confirmLabel}
        </button>
      </div>
    </div>
  );
}
