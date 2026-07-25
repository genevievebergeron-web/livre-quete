// ─── PETITS COMPOSANTS D'HORLOGE SANS ÉTAT PARTAGÉ ─────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : chacun gère son propre tick
// via un état + interval LOCAL (pattern déjà en place depuis v1.94.0), donc leur re-render
// n'affecte jamais App() — zéro dépendance externe au-delà de React, zéro changement de
// comportement. InlineRitualTimer reste dans App.jsx : il dépend de CALM (flag mutable
// partagé) et spawnParticles (état applicatif plus large), pas un candidat aussi sûr.
import { useState, useEffect } from "react";

export function Countdown({ endTime, th, calm }) {
  const [now, setNow] = useState(new Date());
  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(i); },[]);
  const [eh,em]=endTime.split(":").map(Number);
  const target=new Date(); target.setHours(eh,em,0,0);
  const diff=target-now;
  const isLate=diff<0;
  const abs=Math.abs(diff);
  const h=Math.floor(abs/3600000), m=Math.floor((abs%3600000)/60000), s=Math.floor((abs%60000)/1000);
  const pct=isLate?100:Math.max(0,100-(diff/(3600000*2))*100); // 2h window
  const urgent=!calm && diff>0&&diff<900000; // <15min (jamais en mode calme)
  // Mode calme : pas de rouge, pas d'urgence, pas de pulsation — juste l'heure et une barre neutre
  const danger = !calm && isLate;
  return (
    <div style={{padding:"10px 14px",background:danger?"rgba(255,50,50,0.2)":urgent?"rgba(255,180,0,0.15)":"rgba(0,0,0,0.4)",border:`3px solid ${danger?"#D97070":urgent?"#D9BC5C":th.accent}60`,borderRadius:6,animation:(urgent||danger)?"redPulse 1s ease-in-out infinite":"none"}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,1vw,9px)",color:danger?"#D97070":urgent?"#D9BC5C":th.accent,marginBottom:6,textAlign:"center"}}>
        {calm ? "⏱ Rituel jusqu'à "+endTime : (isLate?"⚠️ EN RETARD!":urgent?"🏃 DÉPÊCHE-TOI!":"⏱ RITUEL TERMINE À "+endTime)}
      </div>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(22px,4vw,44px)",color:danger?"#D97070":urgent?"#D9BC5C":"#fff",textAlign:"center",textShadow:calm?"none":`0 0 20px ${danger?"#D97070":urgent?"#D9BC5C":th.accent}`,letterSpacing:2,marginBottom:8}}>
        {isLate?(calm?"":"+"):""}{h>0?h+"h ":""}{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}
      </div>
      <div style={{height:10,background:"#111",border:"2px solid #333",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:pct+"%",background:`linear-gradient(90deg,${th.primary},${danger?"#D97070":th.accent})`,transition:"width 1s ease"}}/>
      </div>
    </div>
  );
}

// v1.94.0 (Lot 5 #22) — horloge du header isolée dans son propre petit composant (comme
// Countdown/InlineRitualTimer) : son tick de 1s ne fait re-render QUE ce composant, plus
// jamais tout l'arbre App() en cascade. La logique métier qui a vraiment besoin de "now"
// (barre de progression, compte à rebours, indicateur de synchro) reste dans App(), mais
// son propre tick a été ralenti de 1s à 30s (aucune de ces valeurs n'a besoin d'une
// précision à la seconde près) — App() ne re-render donc plus que 2x/min au lieu de 60x/min.
export function HeaderClock({ style }) {
  const [now, setNow] = useState(new Date());
  useEffect(()=>{ const i=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(i); },[]);
  const H=String(now.getHours()).padStart(2,"0"), M=String(now.getMinutes()).padStart(2,"0");
  return <div style={style}>{H}:{M}</div>;
}

// Backlog UX #11 — minuteur pour UNE tâche précise, lancé depuis sa carte (dashboard "Aujourd'hui").
// Outil de concentration seulement : ne complète PAS la tâche (contrairement à TimerView/onComplete
// qui accorde de l'XP pour un rituel) — la validation reste le bouton "✔ J'AI FAIT ÇA!" de la carte,
// donc zéro nouveau chemin d'XP/approbation parent à maintenir.
export function TaskTimerModal({ task, accent, onClose }) {
  const [targetMin, setTargetMin] = useState(10);
  const [startTs, setStartTs] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(()=>{ if(!startTs) return; const i=setInterval(()=>setNow(Date.now()),250); return()=>clearInterval(i); },[startTs]);
  const elapsed = startTs ? now-startTs : 0;
  const totalMs = targetMin*60000;
  const remaining = Math.max(0, totalMs-elapsed);
  const timeUp = !!startTs && remaining<=0;
  const mm=Math.floor(remaining/60000), ss=Math.floor((remaining%60000)/1000);
  const lowTime = !!startTs && !timeUp && remaining<=60000;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:2700,display:"flex",alignItems:"center",justifyContent:"safe center",padding:12}}>
      <div style={{background:"#1a1a2e",border:`3px solid ${accent}`,borderRadius:10,padding:20,width:"min(360px,92vw)",display:"flex",flexDirection:"column",gap:12,alignItems:"center"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%"}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:accent}}>⏱ {task.emoji} {task.label}</div>
          <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"5px 9px",background:"#333",color:"#888",border:"2px solid #555",borderRadius:3,cursor:"pointer"}}>✕</button>
        </div>
        {!startTs && (<>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#bbb"}}>Combien de minutes? <b style={{color:accent}}>{targetMin} min</b></div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
            {[5,10,15,20].map(v=>(
              <button key={v} onClick={()=>setTargetMin(v)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"8px 11px",background:targetMin===v?accent:"#1a1a1a",color:targetMin===v?"#0d0d0d":accent,border:`2px solid ${accent}`,borderRadius:5,cursor:"pointer"}}>{v}</button>
            ))}
          </div>
          <button onClick={()=>setStartTs(Date.now())} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:11,padding:14,background:"#5CAD68",color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:8,cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d"}}>▶️ Partir ({targetMin} min)</button>
        </>)}
        {startTs && (<>
          <TimeTimerDisc progress={remaining/totalMs} color={accent} urgent={lowTime}/>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(30px,7vw,48px)",color:lowTime?"#D98C8C":"#fff",letterSpacing:2,animation:lowTime?"pulse 0.6s infinite":"none"}}>{timeUp?"⏰":`${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`}</div>
          {timeUp && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:accent,textAlign:"center",lineHeight:1.4}}>Temps écoulé! Appuie sur « ✔ J'AI FAIT ÇA! » sur ta carte quand c'est prêt.</div>}
          <button onClick={onClose} style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:12,background:"#1a1a1a",color:"#888",border:"2px solid #333",borderRadius:6,cursor:"pointer"}}>✕ Fermer</button>
        </>)}
      </div>
    </div>
  );
}

// Disque Time Timer (anneau qui rétrécit) — SVG pur, aucune dépendance au-delà de ses props.
export function TimeTimerDisc({ progress, size=110, color="#85CDD1", urgentColor="#D98C8C", urgent=false }) {
  const r = size/2 - 8;
  const c = 2*Math.PI*r;
  const p = Math.max(0, Math.min(1, progress||0));
  const offset = c * (1-p);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{display:"block",margin:"0 auto"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#222" strokeWidth="10"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={urgent?urgentColor:color} strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 0.9s linear, stroke 0.3s"}}/>
    </svg>
  );
}
