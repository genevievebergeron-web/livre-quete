// ─── VUE SEMAINE (GRILLE TÂCHES × JOURS) ────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : composant purement présentationnel,
// aucun état applicatif partagé, seulement ses props — zéro changement de comportement.
import { TASK_CATALOG } from "./catalog.js";
import { DAYS_SHORT, displayName } from "./shared.js";

export function WeekView({ config, gameState, onCompleteTask, th, todayDayIdx }) {
  const allTasks = [...TASK_CATALOG, ...(config.customTasks||[])];
  return (
    <div style={{overflowX:"auto",paddingBottom:8}}>
      <div style={{display:"grid",gridTemplateColumns:`120px repeat(7,1fr)`,gap:2,minWidth:700}}>
        {/* Header */}
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-faint,#555)",display:"flex",alignItems:"center",justifyContent:"safe center"}}>TÂCHE</div>
        {DAYS_SHORT.map((d,i)=>(
          <div key={i} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",color:i===todayDayIdx?th.accent:"#888",padding:"6px 4px",textAlign:"center",background:i===todayDayIdx?`${th.accent}20`:"transparent",borderRadius:3,border:i===todayDayIdx?`2px solid ${th.accent}60`:"none"}}>
            {d}{i===todayDayIdx&&<div style={{fontSize:5,color:th.accent,marginTop:2}}>▲</div>}
          </div>
        ))}
        {/* Rows per assignment */}
        {config.assignments.map(ass=>{
          const task=allTasks.find(t=>t.id===ass.taskId);
          if(!task)return null;
          const assignedPlayers=config.players.filter(p=>ass.playerIds.includes(p.id));
          return [
            <div key={ass.instanceId+"_label"} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 6px",background:"rgba(0,0,0,0.4)",borderRadius:3}}>
              <span style={{fontSize:16}}>{task.emoji}</span>
              <div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:12,color:"#ddd",lineHeight:1.2}}>{task.label}</div>
                <div style={{display:"flex",gap:3}}>
                  {assignedPlayers.map(pl=><div key={pl.id} style={{width:8,height:8,borderRadius:"50%",background:pl.color}}/>)}
                </div>
              </div>
            </div>,
            ...DAYS_SHORT.map((_,dayIdx)=>{
              const inDay=ass.days.includes(dayIdx)||(ass.days.length===0);
              if(!inDay)return <div key={ass.instanceId+"_d"+dayIdx} style={{background:"rgba(0,0,0,0.2)",borderRadius:3}}/>;
              return (
                <div key={ass.instanceId+"_d"+dayIdx} style={{padding:3}}>
                  {ass.playerIds.map(pid=>{
                    const pl=config.players.find(p=>p.id===pid);
                    if(!pl)return null;
                    const doneKey=`${ass.instanceId}_${pid}_${dayIdx}`;
                    const done=gameState.completed?.includes(doneKey);
                    return (
                      <div key={pid} onClick={()=>!done&&onCompleteTask(ass,pid,dayIdx)}
                        style={{background:done?`${pl.color}30`:"rgba(0,0,0,0.5)",border:`2px solid ${done?pl.color:"#333"}`,borderRadius:3,padding:"3px 4px",cursor:done?"default":"pointer",marginBottom:2,textAlign:"center",transition:"all 0.15s"}} title={displayName(pl)}>
                        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:done?pl.color:"var(--txt-faint,#555)"}}>{done?"✓":displayName(pl).slice(0,3)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          ];
        })}
      </div>
    </div>
  );
}
