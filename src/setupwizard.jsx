// ─── ASSISTANT DE CONFIGURATION INITIALE ────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : tout son état est local (useState),
// aucun état applicatif partagé — zéro changement de comportement.
import { useState, useEffect } from "react";
import { SFX } from "./sfx.js";
import { PT_LIST } from "./themes.js";
import { TASK_CATALOG, REWARD_CATALOG, CAT_LABELS, DIFF_COLOR } from "./catalog.js";
import { uid, COLORS, THEMES, GLOBAL_CSS, isThemeUnlocked, pickStarterThemes, displayName, DAYS_SHORT } from "./shared.js";

export function SetupWizard({ existing, onDone }) {
  // En édition (« Modifier le livre »), on arrive direct sur Joueurs (le Mode global n'est plus le point d'entrée)
  const [step, setStep] = useState(existing ? 1 : 0);
  const STEPS = ["Mode","Joueurs","Tâches","Récompenses","PIN"];

  // Config state
  const [mode, setMode] = useState("routine"); // "week" | "routine"
  const [weekPersist, setWeekPersist] = useState(false);
  const [routineEnd, setRoutineEnd] = useState("08:30");
  const [players, setPlayers] = useState([
    { id:uid(), name:"", pseudo:"", color:COLORS[0]||"#C060D0", themeId:"none", starterThemes: pickStarterThemes() },
  ]);
  const [theme, setTheme] = useState("minecraft");
  const [pin, setPin] = useState("1146");

  // Task assignments: array of { instanceId, taskId, playerIds:[], days:[], time:"" }
  const [assignments, setAssignments] = useState([]);
  // Reward selection
  const [selectedRewards, setSelectedRewards] = useState(new Set(["rw01","rw02","rw03","rw04","rw05"]));
  // Custom tasks / rewards
  const [customTasks, setCustomTasks] = useState([]);
  const [customRewards, setCustomRewards] = useState([]);

  // Task catalog filter
  const [catFilter, setCatFilter] = useState("all");
  const [dragOver, setDragOver] = useState(null);
  const [dragging, setDragging] = useState(null);

  // Pre-fill if editing
  useEffect(() => {
    if (existing) {
      setMode(existing.mode || "routine");
      setWeekPersist(true); // always persist — badges depend on it
      setRoutineEnd(existing.routineEnd || "08:30");
      const pl = existing.players || [];
      setPlayers(pl.length ? pl.map(p=>({themeId:"none",pseudo:"",starterThemes:p.starterThemes||pickStarterThemes(),...p})) : players);
      setTheme(existing.theme || "minecraft");
      setPin(existing.pin || "1146");
      setAssignments(existing.assignments || []);
      setSelectedRewards(new Set(existing.selectedRewards || ["rw01","rw02","rw03"]));
      setCustomTasks(existing.customTasks || []);
      setCustomRewards(existing.customRewards || []);
    }
  }, []);

  const T = THEMES[theme];
  const activePlayers = players;
  const allTasks = [...TASK_CATALOG, ...customTasks];
  const allRewards = [...REWARD_CATALOG, ...customRewards];

  const addAssignment = (taskId) => {
    SFX.click();
    setAssignments(a => [...a, {
      instanceId: uid(), taskId,
      playerIds: activePlayers.map(p=>p.id),
      days: mode === "week" ? [0] : [],
      time: "",
    }]);
  };
  const removeAssignment = (iid) => { SFX.click(); setAssignments(a => a.filter(x=>x.instanceId!==iid)); };
  const duplicateAssignment = (iid) => { SFX.click(); setAssignments(a => { const src=a.find(x=>x.instanceId===iid); if(!src)return a; return [...a,{...src,instanceId:uid()}]; }); };
  const updateAssignment = (iid, field, val) => setAssignments(a => a.map(x=>x.instanceId===iid?{...x,[field]:val}:x));
  const toggleAssignmentPlayer = (iid, pid) => setAssignments(a => a.map(x => {
    if (x.instanceId!==iid) return x;
    const has = x.playerIds.includes(pid);
    return {...x, playerIds: has ? x.playerIds.filter(id=>id!==pid) : [...x.playerIds,pid]};
  }));
  const toggleAssignmentDay = (iid, dayIdx) => setAssignments(a => a.map(x => {
    if (x.instanceId!==iid) return x;
    const has = x.days.includes(dayIdx);
    return {...x, days: has ? x.days.filter(d=>d!==dayIdx) : [...x.days,dayIdx]};
  }));

  // Drag & drop for assignment ordering
  const onDragStart = (e, iid) => { setDragging(iid); e.dataTransfer.effectAllowed="move"; };
  const onDragOver = (e, iid) => { e.preventDefault(); setDragOver(iid); };
  const onDrop = (e, targetIid) => {
    e.preventDefault(); setDragOver(null);
    if (!dragging || dragging===targetIid) return;
    setAssignments(a => {
      const from=a.findIndex(x=>x.instanceId===dragging), to=a.findIndex(x=>x.instanceId===targetIid);
      if(from<0||to<0)return a; const n=[...a]; const [item]=n.splice(from,1); n.splice(to,0,item); return n;
    });
    setDragging(null);
  };

  const addCustomTask = () => {
    const label = prompt("Nom de la tâche:");
    if (!label?.trim()) return;
    const emoji = prompt("Emoji (ex: 🌟):") || "⭐";
    setCustomTasks(c => [...c, { id:"cust_"+uid(), emoji, label:label.trim(), xp:20, coins:10, diff:"medium", cat:"custom" }]);
  };
  const addCustomReward = () => {
    const label = prompt("Nom de la récompense:");
    if (!label?.trim()) return;
    const emoji = prompt("Emoji (ex: 🎁):") || "🎁";
    const coins = parseInt(prompt("Coût en pièces:") || "20") || 20;
    setCustomRewards(c => [...c, { id:"cr_"+uid(), emoji, label:label.trim(), coins }]);
  };

  const finish = () => {
    // Expand multi-player assignments into per-player instances
    const expandedAssignments = [];
    for (const ass of assignments) {
      if (ass.playerIds.length <= 1) {
        expandedAssignments.push(ass);
      } else {
        // One independent copy per player
        for (const pid of ass.playerIds) {
          expandedAssignments.push({ ...ass, instanceId: uid(), playerIds: [pid] });
        }
      }
    }
    const config = {
      mode, weekPersist, routineEnd,
      players: activePlayers,
      theme,
      pin,
      assignments: expandedAssignments,
      selectedRewards: [...selectedRewards],
      customTasks,
      customRewards,
      createdAt: new Date().toISOString(),
    };
    onDone(config);
  };

  // Styles
  const card = { background:T.card, border:`2px solid ${T.accent}40`, borderRadius:8, padding:"16px 18px" };
  const Btn = ({active,children,onClick,style={},...p}) => (
    <button onClick={()=>{SFX.click();onClick?.();}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(7px,0.9vw,9px)",padding:"8px 14px",background:active?T.accent:"#222",color:active?"#000":"#888",border:`2px solid ${active?T.accent:"#444"}`,borderRadius:3,cursor:"pointer",boxShadow:active?`3px 3px 0 #000,0 0 10px ${T.accent}50`:"2px 2px 0 #000",transition:"all 0.1s",...style}} {...p}>{children}</button>
  );

  const canProceed = () => {
    if (step===1) return activePlayers.every(p=>p.name.trim());
    if (step===2) return assignments.length>0;
    if (step===4) return pin.length===4;
    return true;
  };

  const xpPct = Math.round((step / (STEPS.length - 1)) * 100);

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",padding:"16px 12px",gap:12,overflowX:"hidden"}}>
      <style>{GLOBAL_CSS}</style>

      {/* ── HEADER ── */}
      <div style={{textAlign:"center",marginTop:8,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
        {/* Floating emoji flankers + title */}
        <div style={{display:"flex",alignItems:"center",gap:"clamp(8px,2vw,20px)"}}>
          <span className="float-y" style={{fontSize:"clamp(18px,3.5vw,32px)",animationDelay:"0s"}}>⚔️</span>
          <span className="glow-pulse" style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(11px,2.2vw,20px)",color:T.accent}}>LIVRE DE QUÊTES</span>
          <span className="float-y" style={{fontSize:"clamp(18px,3.5vw,32px)",animationDelay:"1.2s"}}>🛡️</span>
        </div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:"clamp(13px,1.8vw,18px)",color:"#666",letterSpacing:2}}>— CONFIGURATION —</div>
      </div>

      {/* ── STEP INDICATORS + XP BAR ── */}
      <div style={{width:"100%",maxWidth:680,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"center"}}>
          {STEPS.map((s,i)=>(
            <div key={i} onClick={()=>i<step&&setStep(i)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(5px,0.75vw,7px)",padding:"4px 8px",background:i===step?T.accent:i<step?T.primary:"#222",color:i<=step?"#000":"#444",borderRadius:2,border:`2px solid ${i===step?"#000":i<step?"#000":"#333"}`,cursor:i<step?"pointer":"default",boxShadow:i===step?"3px 3px 0 #000":i<step?"2px 2px 0 #000":"none",transition:"all 0.15s"}}>
              {i<step?"✓ ":""}{s}
            </div>
          ))}
        </div>
        {/* XP progress bar */}
        <div style={{background:"var(--xp-bg)",border:"2px solid #1a3a1a",borderRadius:3,height:10,overflow:"hidden",position:"relative"}}>
          <div className="xp-step-fill" style={{width:`${xpPct}%`,height:"100%"}}/>
          <div style={{position:"absolute",right:6,top:0,fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#4ade8099",lineHeight:"10px"}}>{xpPct}% XP</div>
        </div>
      </div>

      <div className="pixel-border-gold" style={{...card,maxWidth:680,width:"100%",animation:"slideIn 0.25s ease"}}>

        {/* ── STEP 0: Mode ── */}
        {step===0 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.4vw,13px)",color:T.accent,marginBottom:16}}>🎮 Quel mode?</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
            {[
              {k:"routine",icon:"⏰",title:"Mode Rituel",desc:"Matin, soir ou après-école. Compte à rebours proéminent jusqu'à l'heure cible."},
              {k:"week",   icon:"📅",title:"Mode Semaine", desc:"Organisation sur 7 jours. Progression hebdomadaire avec bilan."},
            ].map(({k,icon,title,desc})=>(
              <div key={k} onClick={()=>{setMode(k);SFX.click();}} style={{border:`3px solid ${mode===k?T.accent:"#444"}`,borderRadius:6,padding:16,cursor:"pointer",background:mode===k?`${T.accent}15`:"rgba(0,0,0,0.4)",boxShadow:mode===k?`0 0 16px ${T.accent}50`:"none",transition:"all 0.15s"}}>
                <div style={{fontSize:34,marginBottom:8}}>{icon}</div>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(8px,1.1vw,11px)",color:mode===k?T.accent:"#ccc",marginBottom:8}}>{title}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa",lineHeight:1.4}}>{desc}</div>
              </div>
            ))}
          </div>
          {mode==="routine" && (
            <div style={{...card,marginBottom:12}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:T.accent,marginBottom:10}}>⏱ Heure de fin de routine</div>
              <input type="time" value={routineEnd} onChange={e=>setRoutineEnd(e.target.value)}
                style={{background:"#111",border:`2px solid ${T.accent}`,color:T.accent,padding:"10px 14px",fontFamily:"'Press Start 2P',monospace",fontSize:16,borderRadius:4,outline:"none",width:"100%"}}/>
              <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#666",marginTop:8}}>Le compte à rebours sera bien visible pour motiver!</div>
            </div>
          )}
          {mode==="week" && (
            <div style={{display:"flex",gap:10,alignItems:"center",background:"rgba(0,0,0,0.15)",border:`2px solid ${T.accent}44`,borderRadius:6,padding:12}}>
              <div style={{fontSize:20}}>💾</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#aaa"}}>Progression sauvegardée automatiquement — les badges ne sont jamais perdus!</div>
            </div>
          )}
        </>}

        {/* ── STEP 1: Players ── */}
        {step===1 && <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.4vw,13px)",color:T.accent}}>👥 Joueurs</div>
            {players.length < 6 && <Btn active={false} onClick={()=>{ setPlayers(p=>[...p,{id:uid(),name:"",pseudo:"",color:COLORS[p.length]||"#888",themeId:"none",starterThemes:pickStarterThemes()}]); }}>➕ Ajouter</Btn>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {players.map((pl,i)=>{
              return (
                <div key={i} style={{...card,border:`2px solid ${pl.color}`}}>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",minWidth:50}}>JOUEUR {i+1}</span>
                    <input value={pl.name} onChange={e=>{ const arr=[...players]; arr[i]={...arr[i],name:e.target.value}; setPlayers(arr); }} placeholder={`Nom joueur ${i+1}`}
                      style={{flex:1,background:"#111",border:`2px solid ${pl.color}`,color:"#fff",padding:"8px 10px",fontFamily:"'VT323',monospace",fontSize:18,borderRadius:3}}/>
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",minWidth:50}}>PSEUDO</span>
                    <input value={pl.pseudo||""} onChange={e=>{ const arr=[...players]; arr[i]={...arr[i],pseudo:e.target.value}; setPlayers(arr); }} placeholder={`Surnom visible (optionnel)`}
                      style={{flex:1,background:"#111",border:`2px dashed ${pl.color}55`,color:"#ccc",padding:"6px 10px",fontFamily:"'VT323',monospace",fontSize:17,borderRadius:3}}/>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {COLORS.map(c=>{ const isNoir=c==="#0a0a0a"; const isBlanc=c==="#F0F0FF"; const glowColor=isNoir?"#FF0066":isBlanc?"#AACCFF":c; return (<div key={c} onClick={()=>{ const arr=[...players]; arr[i]={...arr[i],color:c}; setPlayers(arr); }} style={{width:26,height:26,borderRadius:4,background:c,border:`3px solid ${pl.color===c?"#fff":"#333"}`,cursor:"pointer",boxShadow:pl.color===c?`0 0 10px ${glowColor}`:"none",outline:isNoir?"1px solid #333":isBlanc?"1px solid #888":"none"}}/>); })}
                  </div>
                  {/* Per-player theme */}
                  <div style={{marginTop:10}}>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#888",marginBottom:7}}>🎭 THÈME PERSONNEL</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {PT_LIST.map(pt=>{
                        const sel=(pl.themeId||"none")===pt.id;
                        const unlocked = isThemeUnlocked(pt.id, 0, pl.starterThemes||[]);
                        return <div key={pt.id}
                          onClick={()=>{ if(!unlocked)return; const arr=[...players]; arr[i]={...arr[i],themeId:pt.id}; setPlayers(arr); SFX.click(); }}
                          title={!unlocked?`🔒 Déblocable à ${pt.xpUnlock} XP`:""}
                          style={{display:"flex",alignItems:"center",gap:5,padding:"5px 9px",background:sel?`${pt.accent}22`:unlocked?"rgba(0,0,0,0.4)":"rgba(0,0,0,0.2)",border:`2px solid ${sel?pt.accent:unlocked?"#333":"#222"}`,borderRadius:4,cursor:unlocked?"pointer":"not-allowed",boxShadow:sel?`0 0 10px ${pt.glow}50`:"none",opacity:unlocked?1:0.4,transition:"all 0.15s"}}>
                          <span style={{fontSize:16}}>{unlocked?pt.icon:"🔒"}</span>
                          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:sel?pt.accent:unlocked?"#666":"#444"}}>{pt.name}{!unlocked?` (${pt.xpUnlock}xp)`:""}</span>
                        </div>;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {/* ── STEP 2: Tasks ── */}
        {step===2 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:T.accent,marginBottom:12}}>📋 Tâches & Quêtes ({assignments.length})</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {/* Catalog left */}
            <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:"62vh",overflowY:"auto",paddingRight:4,WebkitOverflowScrolling:"touch"}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:4}}>CATALOGUE — cliquer pour ajouter</div>
              {/* Category filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                <Btn active={catFilter==="all"} onClick={()=>setCatFilter("all")} style={{padding:"3px 7px",fontSize:7}}>Tout</Btn>
                {Object.entries(CAT_LABELS).map(([k,l])=><Btn key={k} active={catFilter===k} onClick={()=>setCatFilter(k)} style={{padding:"3px 7px",fontSize:7}}>{l}</Btn>)}
              </div>
              {allTasks.filter(t=>catFilter==="all"||t.cat===catFilter).map(task=>(
                <div key={task.id} onClick={()=>addAssignment(task.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(0,0,0,0.5)",border:"2px solid #333",borderRadius:4,cursor:"pointer",transition:"border 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor="#333"}>
                  <span style={{fontSize:20}}>{task.emoji}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{task.label}</div>
                    <div style={{display:"flex",gap:6}}>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#5DECF5"}}>⚡{task.xp}</span>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700"}}>🪙{task.coins}</span>
                      <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:DIFF_COLOR(task.diff)}}>{task.diff}</span>
                    </div>
                  </div>
                  <span style={{color:T.accent,fontSize:16,fontWeight:"bold"}}>+</span>
                </div>
              ))}
              <button onClick={addCustomTask} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px",background:"rgba(0,0,0,0.4)",border:`2px dashed ${T.accent}60`,color:T.accent,borderRadius:4,cursor:"pointer",marginTop:4}}>+ Tâche personnalisée</button>
            </div>

            {/* Assigned right */}
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:"62vh",overflowY:"auto",paddingRight:2,WebkitOverflowScrolling:"touch"}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#888",marginBottom:4}}>TÂCHES ASSIGNÉES — glisser pour réordonner</div>
              {assignments.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#555",textAlign:"center",marginTop:20}}>Clique sur une tâche à gauche pour l'ajouter →</div>}
              {assignments.map(ass=>{
                const task=allTasks.find(t=>t.id===ass.taskId);
                if(!task)return null;
                return (
                  <div key={ass.instanceId} draggable onDragStart={e=>onDragStart(e,ass.instanceId)} onDragOver={e=>onDragOver(e,ass.instanceId)} onDrop={e=>onDrop(e,ass.instanceId)} onDragLeave={()=>setDragOver(null)}
                    style={{background:dragOver===ass.instanceId?`${T.accent}20`:"rgba(0,0,0,0.55)",border:`2px solid ${dragOver===ass.instanceId?T.accent:"#444"}`,borderRadius:5,padding:"8px 10px",cursor:"grab",transition:"all 0.15s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                      <span style={{color:"#555",fontSize:12,cursor:"grab"}}>⠿</span>
                      <span style={{fontSize:17}}>{task.emoji}</span>
                      <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.label}</span>
                      <button onClick={()=>duplicateAssignment(ass.instanceId)} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:14,padding:2}} title="Dupliquer">⧉</button>
                      <button onClick={()=>removeAssignment(ass.instanceId)} style={{background:"none",border:"none",color:"#FF4444",cursor:"pointer",fontSize:16,padding:2}}>×</button>
                    </div>
                    {/* Player assignment — each toggled player gets their own independent copy */}
                    <div style={{marginBottom:mode==="week"?6:4}}>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"#555"}}>QUI:</span>
                        {activePlayers.map(pl=>{
                          const sel=ass.playerIds.includes(pl.id);
                          return <div key={pl.id} onClick={()=>toggleAssignmentPlayer(ass.instanceId,pl.id)}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"4px 8px",
                              background:sel?pl.color:"#1a1a1a",color:sel?"#000":"#555",
                              border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer",
                              boxShadow:sel?`0 0 8px ${pl.color}60`:"none",transition:"all 0.12s",
                              display:"flex",alignItems:"center",gap:4}}>
                            <span style={{width:7,height:7,borderRadius:"50%",background:sel?"#000":pl.color,display:"inline-block"}}/>
                            {displayName(pl)}
                          </div>;
                        })}
                        <div onClick={()=>{ const allIds=activePlayers.map(p=>p.id); const allSel=allIds.every(id=>ass.playerIds.includes(id)); setAssignments(a=>a.map(x=>x.instanceId===ass.instanceId?{...x,playerIds:allSel?[]:allIds}:x)); SFX.click(); }}
                          style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"4px 7px",background:"#222",color:"#888",border:"1px solid #444",borderRadius:3,cursor:"pointer"}}>
                          {activePlayers.every(p=>ass.playerIds.includes(p.id))?"Aucun":"Tous"}
                        </div>
                      </div>
                      {ass.playerIds.length>1&&<div style={{fontFamily:"'VT323',monospace",fontSize:11,color:"#555",marginTop:3}}>→ {ass.playerIds.length} copies indépendantes</div>}
                    </div>
                    {/* Day assignment (week mode) */}
                    {mode==="week" && (
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:4}}>
                        {DAYS_SHORT.map((d,i)=>(
                          <div key={i} onClick={()=>toggleAssignmentDay(ass.instanceId,i)}
                            style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"2px 5px",background:ass.days.includes(i)?T.accent:"#222",color:ass.days.includes(i)?"#000":"#555",border:`1px solid ${ass.days.includes(i)?T.accent:"#444"}`,borderRadius:2,cursor:"pointer"}}>
                            {d}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Time (routine mode) */}
                    {mode==="routine" && (
                      <input type="time" value={ass.time||""} onChange={e=>updateAssignment(ass.instanceId,"time",e.target.value)} placeholder="Heure"
                        style={{background:"#111",border:`1px solid ${T.accent}60`,color:T.accent,padding:"3px 8px",fontFamily:"'Press Start 2P',monospace",fontSize:8,borderRadius:2,width:"100%",marginTop:4}}/>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>}

        {/* ── STEP 3: Rewards ── */}
        {step===3 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:T.accent,marginBottom:12}}>🎁 Récompenses disponibles</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:"55vh",overflowY:"auto"}}>
            {allRewards.map(r=>{
              const sel=selectedRewards.has(r.id);
              return (
                <div key={r.id} onClick={()=>{ SFX.click(); setSelectedRewards(s=>{ const n=new Set(s); if(n.has(r.id))n.delete(r.id); else n.add(r.id); return n; }); }}
                  style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:sel?"rgba(0,0,0,0.6)":"rgba(0,0,0,0.3)",border:`2px solid ${sel?T.accent:"#444"}`,borderRadius:5,cursor:"pointer",boxShadow:sel?`0 0 8px ${T.accent}40`:"none",transition:"all 0.15s"}}>
                  <span style={{fontSize:26}}>{r.emoji}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:sel?"#fff":"#aaa"}}>{r.label}</div>
                    <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#FFD700"}}>🪙 {r.coins} pièces</div>
                  </div>
                  <div style={{width:22,height:22,borderRadius:3,border:`3px solid ${sel?T.accent:"#555"}`,background:sel?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"safe center",color:"#000",fontSize:14,fontWeight:"bold"}}>{sel?"✓":""}</div>
                </div>
              );
            })}
          </div>
          <button onClick={addCustomReward} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"9px",background:"rgba(0,0,0,0.4)",border:`2px dashed ${T.accent}60`,color:T.accent,borderRadius:4,cursor:"pointer",marginTop:10,width:"100%"}}>+ Récompense personnalisée</button>
        </>}

        {/* ── STEP 4: PIN ── */}
        {step===4 && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.3vw,12px)",color:T.accent,marginBottom:14}}>🔐 Code secret parent</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:17,color:"#aaa",marginBottom:14}}>Demandé à chaque validation. Les enfants ne le voient pas!</div>
          <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="4 chiffres"
            style={{width:"100%",background:"#111",border:`3px solid ${T.accent}`,color:"#fff",padding:"14px",fontFamily:"'Press Start 2P',monospace",fontSize:20,borderRadius:4,textAlign:"center",letterSpacing:10}}/>
          <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#555",marginTop:8}}>Code choisi : {pin||"—"}</div>
        </>}

        {/* NAV */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:18}}>
          {step>0?<Btn onClick={()=>setStep(s=>s-1)}>← Retour</Btn>:<span/>}
          {step<STEPS.length-1
            ? <Btn active={canProceed()} onClick={()=>canProceed()&&setStep(s=>s+1)}>Suivant →</Btn>
            : <Btn active={canProceed()} onClick={()=>canProceed()&&finish()}>🚀 C'est parti!</Btn>}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(5px,0.7vw,7px)",color:"#444",letterSpacing:2,paddingBottom:8}}>
        ▼ PRESS START TO CONTINUE <span className="blink">_</span>
      </div>
    </div>
  );
}
