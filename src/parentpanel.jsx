// ═══════════════════════════════════════════════════════════════
// PARENT PANEL — portail parent (4 catégories, 8 onglets)
// ═══════════════════════════════════════════════════════════════
// Extrait d'`App.jsx` le 2026-08-05 (Lot 5/#24, vingtième incrément) — déplacement mécanique
// à l'octet près, aucun changement de comportement. `PARENT_CATS` vient avec le composant (son
// seul consommateur) ; `SHOP_UNLOCK_DEFAULT` a migré dans `shared.js` (partagé avec `App.jsx`).

import { useState, memo } from "react";
import { SFX } from "./sfx.js";
import { REPAIR_PRESETS } from "./catalog.js";
import { Countdown } from "./timers.jsx";
import { UIIcon, Coin, Xp } from "./sprites.jsx";
import { DAYS_SHORT, fmtDateShort, displayName, todayStamp, SHOP_UNLOCK_DEFAULT } from "./shared.js";
import { TaskChooser, CustomTaskModal } from "./taskpickers.jsx";
import { isCustodyWeek, custodyWeekKey } from "./recurring.js";

// v2.16.24 — Backlog #8/9 : 8 onglets à plat regroupés en 4 catégories.
const PARENT_CATS = [
  { k:"suivi",   l:"Suivi",         icon:"parent_validate", em:"📋", color:"#D99248", tabs:["valid","tasks","defis"] },
  { k:"comm",    l:"Communication", icon:"parent_annonces", em:"📣", color:"#85CDD1", tabs:["annonces","log"] },
  { k:"actions", l:"Actions",       icon:"parent_actions",  em:"⚡", color:"#D9BC5C", tabs:["actions"] },
  { k:"compte",  l:"Compte",        icon:"parent_code",     em:"⚙️", color:"var(--txt-muted,#888)",    tabs:["pin","export"] },
];
const ParentPanel = memo(function ParentPanel({ config, gameStates, parentMode, actionLog, undoStack,
  allTasks, onApprovePending, onRefusePending, onAddAssignment, onAssignRoutine, onLaunchBoss, bossActive, onRemoveAssignment, onApproveRemoval, onRefuseRemoval, onClearChildTasks, onAddCustomTask,
  onApproveProposal, onRefuseProposal,
  onClose, onExitParent, onUndo, onReset, onResetPlayer, onAdjustXP, onAdjustCoins, onSetMorningLock, onSetDailyLimit, onSetShopUnlockCount, onChangePin,
  onExport, onImport, onSetup, players, th, onUpdateChallenge,
  onCreateAnnouncement, onDeleteAnnouncement, onResendAnnouncement, onCreateRepairQuest, onPlanMoment, onMarkMomentDone }) {
  const nbPending = gameStates.reduce((s,gs)=>s+(gs.pending||[]).length,0);
  const removalReqs = config.removalRequests||[]; // v1.83.0 (Lot 1 #B6)
  const proposals = config.childTaskProposals||[]; // v2.5.10 (Correctif 2C)
  const nbValid = nbPending + removalReqs.length + proposals.length;
  const [tab, setTab] = useState(nbValid>0?"valid":"actions"); // valid | tasks | actions | cal | log | pin | export
  // v2.16.24 — Backlog #8/9 : les 8 onglets à plat regroupés en 4 catégories (moins de bruit visuel,
  // patron à 2 niveaux catégorie→sous-onglet, réutilise TabBtn tel quel). PARENT_CATS défini plus bas.
  const [cat, setCat] = useState(()=> nbValid>0 ? "suivi" : "actions");
  const [xpPlayer, setXpPlayer] = useState(0);
  const [xpDelta, setXpDelta] = useState(10);
  const [pinVal, setPinVal] = useState("");
  const [addTaskId, setAddTaskId] = useState("");
  const [addPlayerIds, setAddPlayerIds] = useState(players.map(p=>p.id));
  // v2.6.0 — quête de réparation 🕊️ : sélection d'enfants (min 2) + modèle (ou texte libre = -1)
  const [repPlayerIds, setRepPlayerIds] = useState([]);
  const [repPresetIdx, setRepPresetIdx] = useState(0);
  const [repCustomText, setRepCustomText] = useState("");
  const [momentDates, setMomentDates] = useState({}); // v2.6.2 — {momentId: "YYYY-MM-DD"} brouillon de date avant "Prévu pour…"
  const [addType, setAddType] = useState("routine"); // "routine" | "week"
  const [addDays, setAddDays] = useState([0,1,2,3,4]); // v1.71.0 — jours choisis pour la récurrence (mode planifié)
  const [addTime, setAddTime] = useState(""); // v2.11.2 — moment de la journée (sectionnement "Ma journée")
  const [tasksShowAllDays, setTasksShowAllDays] = useState(false); // v2.13.1 — "TÂCHES ACTUELLES" filtrée à aujourd'hui par défaut (Gen : la liste complète donnait l'impression que tout était dû le jour même)
  const todayDayIdx = (new Date().getDay()+6)%7; // Mon=0 — recalculé à chaque rendu, comme partout ailleurs dans l'app
  const [customOpen, setCustomOpen] = useState(false); // modale création tâche perso
  const [chooserOpen, setChooserOpen] = useState(false); // v1.82.0 (Lot 1 #3/B7) — grille TaskChooser au lieu du <select> plat
  const [errLogsOpen, setErrLogsOpen] = useState(false); // v1.90.0 — section logs techniques repliée par défaut
  const [newsOpen, setNewsOpen] = useState(false); // v2.16.24 — Backlog #10 : nouveautés repliées par défaut
  const [actionsLogOpen, setActionsLogOpen] = useState(true); // v2.16.24 — actions parent dépliées par défaut (le plus consulté)
  const [defiDraft, setDefiDraft] = useState({}); // Lot 7C — {[playerId]: {text, emoji}} pour l'édition des défis
  // v2.6.0 — formulaire création d'annonce parent
  const [annDraft, setAnnDraft] = useState({ emoji:"📣", title:"", text:"", secret:false, targetAll:true, targetPlayerIds:[], countdownTo:"", countdownLabel:"", countdownDoneText:"", dismissLabel:"", sharedTasksDraft:"", sharedTasksLabel:"", expiresAt:"", playerTasksDraft:{} });
  const [rChildIdx, setRChildIdx] = useState(0); // assignation de routine: enfant ciblé
  const [rName, setRName] = useState("");
  const [rTaskIds, setRTaskIds] = useState([]);
  const T = th;

  const TabBtn = ({k,l,icon,em}) => (
    <button onClick={()=>setTab(k)} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",
      padding:"8px 4px",background:tab===k?"#D99248":"#222",color:tab===k?"#0d0d0d":"var(--txt-muted,#888)",
      border:`2px solid ${tab===k?"#D99248":"#444"}`,borderRadius:3,cursor:"pointer"}}>
      {icon&&<><UIIcon name={icon} emoji={em} size={11}/> </>}{l}
    </button>
  );
  const Row = ({children,style={}}) => <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,...style}}>{children}</div>;
  const PBtn = ({onClick,color="#333",textColor="#fff",children,style={}}) => (
    <button className="btn-press" onClick={onClick} style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.9vw,8px)",
      padding:"8px 12px",background:color,color:textColor,border:"2px solid #0d0d0d",borderRadius:3,
      cursor:"pointer",boxShadow:"2px 2px 0 #0d0d0d",flexShrink:0,...style}}>
      {children}
    </button>
  );

  return (
    <div style={{position:"fixed",top:0,right:0,bottom:0,width:"min(340px,90vw)",
      background:"#0d0d0d",borderLeft:"4px solid #D99248",zIndex:500,
      display:"flex",flexDirection:"column",boxShadow:"-4px 0 30px rgba(255,140,0,0.3)",
      animation:"slideInRight 0.25s ease"}}>
      <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

      {/* Header */}
      <div style={{background:"#D99248",padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.2vw,11px)",color:"#0d0d0d"}}>🔓 MODE PARENT</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={onExitParent} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,
            padding:"6px 9px",background:"#0d0d0d",color:"#D99248",border:"none",cursor:"pointer",borderRadius:2}}>🔒 Quitter</button>
          <button onClick={onClose} style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,
            padding:"5px 10px",background:"#0d0d0d",color:"#D99248",border:"none",cursor:"pointer",borderRadius:2}}>✕</button>
        </div>
      </div>

      {/* Catégories (Backlog #8/9) — 4 groupes au lieu de 8 onglets à plat */}
      <div style={{display:"flex",gap:4,padding:"8px 10px 0",flexShrink:0,background:"#111",flexWrap:"wrap"}}>
        {PARENT_CATS.map(c=>(
          <button key={c.k} onClick={()=>{ setCat(c.k); if(!c.tabs.includes(tab)) setTab(c.tabs[0]); }}
            style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(6px,0.8vw,8px)",
              padding:"9px 4px",background:cat===c.k?c.color:"#1a1a1a",color:cat===c.k?"#0d0d0d":"var(--txt-muted,#888)",
              border:`2px solid ${cat===c.k?c.color:"#333"}`,borderRadius:4,cursor:"pointer"}}>
            <UIIcon name={c.icon} emoji={c.em} size={11}/> {c.l}{c.k==="suivi"&&nbValid>0?` (${nbValid})`:""}
          </button>
        ))}
      </div>
      {/* Sous-onglets de la catégorie active */}
      <div style={{display:"flex",gap:4,padding:"8px 10px",flexShrink:0,background:"#111",flexWrap:"wrap"}}>
        {PARENT_CATS.find(c=>c.k===cat).tabs.map(k=>{
          const meta={valid:["parent_validate","✅",`À valider${nbValid>0?` (${nbValid})`:""}`],tasks:["parent_tasks","📋","Tâches"],defis:["parent_defis","🌟","Défis"],actions:["parent_actions","⚡","Actions"],annonces:["parent_annonces","📣","Annonces"],log:["parent_journal","🕐","Journal"],pin:["parent_code","🔐","Code"],export:["parent_save","💾","Sauvegarde"]}[k];
          return <TabBtn key={k} k={k} icon={meta[0]} em={meta[1]} l={meta[2]}/>;
        })}
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px"}}>

        {/* À VALIDER TAB */}
        {tab==="valid" && (()=>{
          const items=[];
          gameStates.forEach((gs,i)=>{
            const pl=players[i];
            (gs.pending||[]).forEach(k=>{
              const instanceId=k.slice(0,k.lastIndexOf("_"));
              let emoji="📋", label="Tâche", xp=null, coins=null, orphaned=false, taskId=null;
              if(instanceId.startsWith("cal_")){
                const entry=(gs.calendar||[]).find(e=>"cal_"+e.id===instanceId);
                const exam=entry?.type==="examen";
                emoji=exam?"📝":"📚";
                label=entry?(exam?"Étudier: ":"Devoir: ")+entry.label:"Devoir/examen";
                xp=exam?20:10; coins=exam?5:3;
              } else {
                const _allAss=[...(config.assignments||[]),...(config.weeklyQuests?.assignments||[])];
                const ass=_allAss.find(a=>a.instanceId===instanceId);
                const task=ass?allTasks.find(t=>t.id===ass.taskId):null;
                // Backlog #17 — même arrondi que approvePending : la file de validation parent doit annoncer
                // le montant RÉELLEMENT accordé (moitié partagée sur une tâche teamSplit), pas le plein montant.
                if(task){emoji=task.emoji;label=task.label;xp=ass?.teamSplit?Math.round((task.xp||0)/2):task.xp;coins=ass?.teamSplit?Math.round((task.coins||0)/2):task.coins;taskId=task.id;}
                // Bug signalé par Gen (25 juillet) : assignation ou tâche personnalisée supprimée
                // ENTRE le moment où l'enfant a demandé la validation et maintenant (ex: tâche perso
                // effacée, ou semaine de garde régénérée entretemps) — le contenu original est
                // irrécupérable (tombstone = juste un id). Marqué distinctement : valider ceci ne
                // donne AUCUNE récompense (voir approvePending), donc le parent doit le savoir avant
                // de cliquer, pas après.
                else orphaned=true;
              }
              items.push({playerIdx:i,doneKey:k,pl,emoji,label,xp,coins,orphaned,taskId});
            });
          });
          // Regrouper les demandes PAR ENFANT
          const byChild=[]; players.forEach((pl,i)=>{ const its=items.filter(x=>x.playerIdx===i); if(its.length) byChild.push({pl,i,its}); });
          return (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",marginBottom:10}}>DEMANDES DES ENFANTS{items.length>0?` (${items.length})`:""}</div>
              {items.length===0&&removalReqs.length===0&&proposals.length===0&&<div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"var(--txt-faint,#555)",textAlign:"center",padding:20}}>Rien à valider — tout est à jour! 🎉</div>}
              {byChild.map(({pl,i,its})=>(
                <div key={pl.id} style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,paddingBottom:4,borderBottom:`2px solid ${pl.color}55`}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:pl.color}}>{displayName(pl)}</span>
                    <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-muted,#888)"}}>{its.length} à valider</span>
                    <button onClick={()=>its.forEach(it=>onApprovePending(it.playerIdx,it.doneKey))}
                      style={{marginLeft:"auto",fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"5px 8px",background:"#1a3a1a",color:"#5CAD68",border:"1px solid #5CAD6855",borderRadius:3,cursor:"pointer"}}>✅ Tout valider</button>
                  </div>
                  {its.map(it=>(
                <div key={it.doneKey} style={{background:it.orphaned?"rgba(180,120,0,0.12)":"rgba(0,0,0,0.4)",border:`2px solid ${it.orphaned?"#C8942A":(it.pl?.color||"#444")}50`,borderRadius:5,padding:"10px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontSize:18,lineHeight:0}}>{it.orphaned?"⚠️":<UIIcon name={it.taskId?"task_"+it.taskId:null} emoji={it.emoji} size={18}/>}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:it.orphaned?"#FFB300":"#ddd",lineHeight:1.2}}>{it.orphaned?"Tâche supprimée entretemps":it.label}</div>
                      <div style={{display:"flex",gap:8,marginTop:2}}>
                        {it.xp!=null&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#85CDD1"}}><Xp size={9}/>{it.xp}</span>}
                        {it.coins!=null&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"#D9BC5C"}}><Coin size={9}/>{it.coins}</span>}
                      </div>
                    </div>
                  </div>
                  {it.orphaned && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#C8942A",lineHeight:1.4,marginBottom:8}}>Le contenu original est perdu (tâche ou assignation supprimée depuis la demande). « Valider » ne donnera AUCUN XP/pièce — si tu sais que {it.pl?displayName(it.pl):"l'enfant"} a vraiment fait quelque chose, ajoute une récompense manuelle depuis son profil avant de nettoyer cette demande.</div>}
                  <div style={{display:"flex",gap:6}}>
                    <PBtn onClick={()=>onApprovePending(it.playerIdx,it.doneKey)} color="#1a3a1a" textColor="#5CAD68" style={{flex:1}}>{it.orphaned?"🧹 Nettoyer (0 récompense)":"✅ Valider"}</PBtn>
                    <PBtn onClick={()=>onRefusePending(it.playerIdx,it.doneKey)} color="#3a1a1a" textColor="#FF6464" style={{flex:1}}>✗ Refuser</PBtn>
                  </div>
                </div>
                  ))}
                </div>
              ))}
              {/* v1.83.0 (Lot 1 #B6) — demandes de retrait de tâche envoyées par les enfants */}
              {removalReqs.length>0 && (
                <div style={{marginTop:18,paddingTop:14,borderTop:"2px solid #333"}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#FFA94D",marginBottom:8}}>🗑️ DEMANDES DE RETRAIT ({removalReqs.length})</div>
                  {removalReqs.map(req=>{
                    const pl=players.find(p=>p.id===req.playerId);
                    const ass=(config.assignments||[]).find(a=>a.instanceId===req.instanceId);
                    const task=ass?allTasks.find(t=>t.id===ass.taskId):null;
                    if(!task) return null;
                    return (
                      <div key={req.id} style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${pl?.color||"#444"}50`,borderRadius:5,padding:"10px",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <UIIcon name={"task_"+task.id} emoji={task.emoji} size={18}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ddd",lineHeight:1.2}}>{task.label}</div>
                            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:pl?.color||"var(--txt-muted,#888)"}}>{pl?displayName(pl):""}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <PBtn onClick={()=>onApproveRemoval(req.id)} color="#1a3a1a" textColor="#5CAD68" style={{flex:1}}>✅ Retirer la tâche</PBtn>
                          <PBtn onClick={()=>onRefuseRemoval(req.id)} color="#3a1a1a" textColor="#FF6464" style={{flex:1}}>✗ Garder la tâche</PBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* v2.5.10 (Correctif 2C) — tâches personnalisées proposées par les enfants ("proposer à toute
                  la famille"), séparée de l'onglet "Tâches" (qui sert à AJOUTER, pas à approuver). */}
              {proposals.length>0 && (
                <div style={{marginTop:18,paddingTop:14,borderTop:"2px solid #333"}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#8FCCE8",marginBottom:8}}>🧑‍🤝‍🧑 TÂCHES PERSONNALISÉES DES ENFANTS ({proposals.length})</div>
                  {proposals.map(prop=>{
                    const pl=players.find(p=>p.id===prop.playerId);
                    return (
                      <div key={prop.id} style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${pl?.color||"#444"}50`,borderRadius:5,padding:"10px",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <span style={{fontSize:18}}>{prop.emoji}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ddd",lineHeight:1.2}}>{prop.label}</div>
                            <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:pl?.color||"var(--txt-muted,#888)"}}>Proposée par {pl?displayName(pl):"?"}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <PBtn onClick={()=>onApproveProposal(prop.id)} color="#1a3a1a" textColor="#5CAD68" style={{flex:1}}>✅ Approuver</PBtn>
                          <PBtn onClick={()=>onRefuseProposal(prop.id)} color="#3a1a1a" textColor="#FF6464" style={{flex:1}}>✗ Refuser</PBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* TÂCHES TAB */}
        {tab==="tasks" && (
          <div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",marginBottom:10}}>AJOUTER UNE TÂCHE</div>
            {/* v1.82.0 (Lot 1 #3/B7) — grille catégorisée (TaskChooser), même composant que côté enfant,
                au lieu d'un <select> plat qui devenait long à parcourir à mesure que le catalogue grossit. */}
            <button onClick={()=>{SFX.click();setChooserOpen(true);}}
              style={{width:"100%",textAlign:"left",background:"#111",border:"2px solid #D99248",color:addTaskId?"#fff":"var(--txt-muted,#888)",padding:"10px",fontFamily:"'VT323',monospace",fontSize:16,borderRadius:3,marginBottom:8,cursor:"pointer"}}>
              {(()=>{ const t=allTasks.find(x=>x.id===addTaskId); return t ? `${t.emoji} ${t.label} (⚡${t.xp} 🪙${t.coins})` : "— Choisir une tâche —"; })()}
            </button>
            {chooserOpen && <TaskChooser allTasks={allTasks} th={{accent:"#D99248"}}
              onPick={(id)=>{setAddTaskId(id);setChooserOpen(false);}}
              onCreateOwn={()=>{setChooserOpen(false);setCustomOpen(true);}}
              onClose={()=>setChooserOpen(false)}/>}
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
              {players.map(pl=>{
                const sel=addPlayerIds.includes(pl.id);
                return <div key={pl.id} onClick={()=>setAddPlayerIds(ids=>sel?ids.filter(x=>x!==pl.id):[...ids,pl.id])}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:sel?pl.color:"#1a1a1a",color:sel?"#0d0d0d":"var(--txt-faint,#555)",border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>
                  {displayName(pl)}
                </div>;
              })}
            </div>
            {/* v1.71.0 — Quand : rituel (chaque jour, sans planif) OU planifié (jours choisis = récurrence) */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)",margin:"2px 0 5px"}}>QUAND?</div>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[["routine","⏰ Rituel"],["week","📅 Planifié"]].map(([k,l])=>(
                <button key={k} onClick={()=>{setAddType(k);SFX.click();}}
                  style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px",background:addType===k?"#D99248":"#1a1a1a",color:addType===k?"#0d0d0d":"var(--txt-muted,#888)",border:`2px solid ${addType===k?"#D99248":"#333"}`,borderRadius:3,cursor:"pointer"}}>
                  {l}
                </button>
              ))}
            </div>
            {addType==="week" && (()=>{ const eq=(dd)=>JSON.stringify([...addDays].sort((a,b)=>a-b))===JSON.stringify([...dd].sort((a,b)=>a-b)); return (
              <div style={{marginBottom:8}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)",marginBottom:5}}>RÉCURRENCE — QUELS JOURS?</div>
                <div style={{display:"flex",gap:5,marginBottom:6,flexWrap:"wrap"}}>
                  {[["Chaque jour",[0,1,2,3,4,5,6]],["Lun–Ven",[0,1,2,3,4]],["Fin de sem.",[5,6]]].map(([lbl,dd])=>(
                    <button key={lbl} onClick={()=>{SFX.click();setAddDays(dd);}} style={{fontFamily:"'VT323',monospace",fontSize:14,padding:"4px 10px",background:eq(dd)?"#D99248":"#1a1a1a",color:eq(dd)?"#0d0d0d":"#bbb",border:"2px solid #444",borderRadius:14,cursor:"pointer"}}>{lbl}</button>
                  ))}
                </div>
                <div style={{display:"flex",gap:3}}>
                  {DAYS_SHORT.map((d,i)=>{ const on=addDays.includes(i); return (
                    <button key={i} onClick={()=>{SFX.click();setAddDays(a=>on?a.filter(x=>x!==i):[...a,i]);}} style={{flex:1,fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"8px 0",background:on?"#D99248":"#1a1a1a",color:on?"#0d0d0d":"var(--txt-dim,#666)",border:`2px solid ${on?"#D99248":"#333"}`,borderRadius:3,cursor:"pointer"}}>{d[0]}</button>
                  );})}
                </div>
              </div>
            ); })()}
            {/* v2.11.2 — moment de la journée (sectionnement "Ma journée" côté enfant) */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)",margin:"2px 0 5px"}}>MOMENT DE LA JOURNÉE?</div>
            <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
              {[["","🕐 N'importe quand"],["matin","🌅 Matin"],["après-midi","☀️ Après-midi"],["soir","🌙 Soir"]].map(([k,l])=>(
                <button key={k||"any"} onClick={()=>{SFX.click();setAddTime(k);}}
                  style={{flex:"1 1 auto",fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"7px 5px",background:addTime===k?"#D99248":"#1a1a1a",color:addTime===k?"#0d0d0d":"var(--txt-muted,#888)",border:`2px solid ${addTime===k?"#D99248":"#333"}`,borderRadius:3,cursor:"pointer"}}>
                  {l}
                </button>
              ))}
            </div>
            <PBtn onClick={()=>{ if(addTaskId&&addPlayerIds.length&&(addType!=="week"||addDays.length)){ onAddAssignment(addTaskId,addPlayerIds,addType,addDays,addTime); setAddTaskId(""); } }}
              color={addTaskId&&addPlayerIds.length&&(addType!=="week"||addDays.length)?"#D99248":"#333"} textColor="#0d0d0d" style={{width:"100%",opacity:addTaskId&&addPlayerIds.length&&(addType!=="week"||addDays.length)?1:0.5,marginBottom:8}}>
              ➕ Ajouter {addType==="week"?`(${addDays.length} jour${addDays.length>1?"s":""}/sem.)`:"(rituel)"}
            </PBtn>
            <button onClick={()=>{ SFX.click(); setCustomOpen(true); }}
              style={{width:"100%",fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"9px",background:"rgba(0,0,0,0.4)",border:"2px dashed #D9924860",color:"#D99248",borderRadius:4,cursor:"pointer",marginBottom:14}}>
              + Créer une tâche personnalisée
            </button>
            {customOpen && <CustomTaskModal title="Nouvelle tâche personnalisée" confirmLabel="Créer la tâche" th={{accent:"#D99248"}}
              onClose={()=>setCustomOpen(false)}
              onCreate={(data)=>{ const id=onAddCustomTask(data); if(id)setAddTaskId(id); setCustomOpen(false); }}/>}

            {/* v2.13.1 — filtrée à AUJOURD'HUI par défaut (Gen : la liste complète, sans indication de
                jour, donnait l'impression que toutes les tâches de la semaine étaient dues aujourd'hui).
                todayDayIdx est recalculé à chaque rendu (comme partout ailleurs dans l'app) — le
                filtre bascule donc tout seul à minuit, sans mécanisme de déclenchement séparé.
                Les tâches "routine" (rituel quotidien, days:[]) restent toujours visibles. Un lien
                permet de voir la semaine complète pour gérer les autres jours. */}
            {(()=>{
              const all=config.assignments||[];
              const isToday=ass=>!(Array.isArray(ass.days)&&ass.days.length>0) || ass.days.includes(todayDayIdx);
              const visible=tasksShowAllDays?all:all.filter(isToday);
              const hiddenCount=all.length-visible.length;
              return (<>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",margin:"6px 0 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>TÂCHES {tasksShowAllDays?"— TOUTE LA SEMAINE":"D'AUJOURD'HUI"} ({visible.length})</span>
                </div>
                {visible.map(ass=>{
                  const task=allTasks.find(t=>t.id===ass.taskId);
                  const assignees=players.filter(p=>ass.playerIds.includes(p.id));
                  if(!task)return null;
                  return (
                    <div key={ass.instanceId} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",background:"rgba(0,0,0,0.4)",border:"1px solid #333",borderRadius:4,marginBottom:5}}>
                      <UIIcon name={"task_"+task.id} emoji={task.emoji} size={16}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.label}</div>
                        <div style={{display:"flex",gap:6}}>
                          {assignees.map(p=><span key={p.id} style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:p.color}}>{displayName(p)}</span>)}
                          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:(Array.isArray(ass.days)&&ass.days.length>0)?"#85CDD1":"#FFA94D"}}>{(Array.isArray(ass.days)&&ass.days.length>0)?`📅 ${ass.days.map(d=>DAYS_SHORT[d]).join(" ")}`:"⏰ routine"}</span>
                          {ass.time&&<span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-muted,#888)"}}>⏰{ass.time}</span>}
                        </div>
                      </div>
                      <button onClick={()=>onRemoveAssignment(ass.instanceId)} style={{background:"none",border:"none",color:"#D97070",cursor:"pointer",fontSize:16,padding:4}}>×</button>
                    </div>
                  );
                })}
                <button onClick={()=>setTasksShowAllDays(s=>!s)} style={{width:"100%",fontFamily:"'VT323',monospace",fontSize:13,padding:"6px",marginTop:2,background:"transparent",border:"1px dashed #444",color:"var(--txt-muted,#888)",borderRadius:4,cursor:"pointer"}}>
                  {tasksShowAllDays ? "▲ Revenir à aujourd'hui seulement" : `▼ Voir toute la semaine${hiddenCount?` (+${hiddenCount})`:""}`}
                </button>
              </>);
            })()}
            <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#444",marginTop:8,lineHeight:1.4}}>
              Pour les horaires et les jours de la semaine, passe par ⚙️ Modifier le livre (onglet Actions).
            </div>
            {/* 🧹 Ménage : supprimer les tâches qu'un enfant s'est créées */}
            {(config.customTasks||[]).some(t=>t.child) && (
              <div style={{marginTop:14,paddingTop:12,borderTop:"2px solid #333"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D99248",marginBottom:6}}>🧹 MÉNAGE — TÂCHES PERSO DES ENFANTS</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-muted,#888)",marginBottom:8}}>Supprime d'un coup les tâches qu'un enfant s'est inventées (les vraies tâches du catalogue ne sont pas touchées).</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {players.map((pl,i)=>{ const childTaskIds=new Set((config.customTasks||[]).filter(t=>t.child).map(t=>t.id)); const n=(config.assignments||[]).filter(a=>a.playerIds?.includes(pl.id)&&childTaskIds.has(a.taskId)).length; if(!n) return null;
                    return <button key={pl.id} onClick={()=>{ if(window.confirm(`Supprimer les ${n} tâche(s) perso de ${displayName(pl)}?`)){ onClearChildTasks&&onClearChildTasks(i); } }}
                      style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"7px 9px",background:"#3a1a1a",color:"#FF6464",border:"2px solid #FF646455",borderRadius:4,cursor:"pointer"}}>🗑️ {displayName(pl)} ({n})</button>;
                  })}
                </div>
              </div>
            )}

            {/* ── Assigner une routine à un enfant ───────────────── */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",margin:"16px 0 8px",borderTop:"2px solid #333",paddingTop:12}}>🧩 ASSIGNER UN RITUEL</div>
            {(()=>{
              const child=players[rChildIdx];
              const childRoutineTasks=child?(config.assignments||[]).filter(a=>a.playerIds.includes(child.id)&&!(Array.isArray(a.days)&&a.days.length>0)):[];
              return (
                <div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-muted,#888)",marginBottom:6}}>Crée un rituel prêt pour un enfant (il pourra le lancer sans le refaire).</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                    {players.map((pl,i)=>(
                      <div key={pl.id} onClick={()=>{setRChildIdx(i);setRTaskIds([]);SFX.click();}}
                        style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:rChildIdx===i?pl.color:"#1a1a1a",color:rChildIdx===i?"#0d0d0d":"var(--txt-dim,#666)",border:`2px solid ${rChildIdx===i?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>{displayName(pl)}</div>
                    ))}
                  </div>
                  <input value={rName} onChange={e=>setRName(e.target.value.slice(0,16))} placeholder="Nom du rituel (ex: Matin)"
                    style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,marginBottom:8,outline:"none"}}/>
                  {childRoutineTasks.length===0 && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-dim,#666)",marginBottom:8}}>Cet enfant n'a pas encore de tâche de type ⏰ Rituel. Ajoute-lui-en en haut (type Routine).</div>}
                  <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8,maxHeight:"26vh",overflowY:"auto"}}>
                    {childRoutineTasks.map(a=>{ const t=allTasks.find(x=>x.id===a.taskId); if(!t)return null; const sel=rTaskIds.includes(a.instanceId);
                      return (
                        <div key={a.instanceId} onClick={()=>{SFX.click();setRTaskIds(ids=>sel?ids.filter(x=>x!==a.instanceId):[...ids,a.instanceId]);}}
                          style={{display:"flex",alignItems:"center",gap:8,padding:"6px 9px",background:sel?"#1a3a1a":"rgba(0,0,0,0.4)",border:`2px solid ${sel?"#5CAD68":"#333"}`,borderRadius:4,cursor:"pointer"}}>
                          <span style={{fontSize:15,lineHeight:0}}>{sel?<UIIcon name="check" emoji="✅" size={15}/>:<UIIcon name={"task_"+t.id} emoji={t.emoji} size={15}/>}</span>
                          <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",flex:1}}>{t.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <PBtn onClick={()=>{ if(rName.trim()&&rTaskIds.length){ onAssignRoutine&&onAssignRoutine(rChildIdx,{name:rName.trim(),emoji:"🌅",taskIds:rTaskIds}); setRName("");setRTaskIds([]); } }}
                    color={rName.trim()&&rTaskIds.length?"#5CAD68":"#333"} textColor="#0d0d0d" style={{width:"100%",opacity:rName.trim()&&rTaskIds.length?1:0.5}}>
                    🧩 Assigner ce rituel à {child?displayName(child):"…"}
                  </PBtn>
                </div>
              );
            })()}
          </div>
        )}

        {/* DÉFIS TAB — Lot 7C : gestion des défis perso hebdomadaires */}
        {tab==="defis" && (()=>{
          const cwk = custodyWeekKey();
          const inCustody = isCustodyWeek();
          const challenges = config.weeklyChallenge?.challenges || [];
          const checkinCount = (ch) => Object.values(ch.checkins||{}).filter(Boolean).length;
          return (
            <div>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",marginBottom:10}}>🌟 DÉFIS PERSONNELS DE LA SEMAINE</div>
              {!inCustody && <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"var(--txt-muted,#888)",marginBottom:10}}>📍 Semaine de pause — les défis reprennent vendredi.</div>}
              {players.map(pl=>{
                const ch = challenges.find(c=>c.playerId===pl.id);
                const n = checkinCount(ch||{});
                const draft = defiDraft[pl.id] || { text: ch?.text||"", emoji: ch?.emoji||"⭐" };
                const saved = draft.text===(ch?.text||"") && draft.emoji===(ch?.emoji||"⭐");
                return (
                  <div key={pl.id} style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${pl.color}50`,borderRadius:5,padding:"10px",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:pl.color,flexShrink:0}}/>
                      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:pl.color}}>{displayName(pl)}</div>
                      <div style={{marginLeft:"auto",fontFamily:"'VT323',monospace",fontSize:15,color:"#D9BC5C"}}>{n}/7 jours ⭐</div>
                    </div>
                    <div style={{display:"flex",gap:5,marginBottom:6}}>
                      <input value={draft.emoji} maxLength={2}
                        style={{width:34,boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:18,padding:"4px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,textAlign:"center"}}
                        onChange={e=>setDefiDraft(d=>({...d,[pl.id]:{...draft,emoji:e.target.value||"⭐"}}))}/>
                      <input value={draft.text} placeholder="Décris le défi…" maxLength={80}
                        style={{flex:1,boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:15,padding:"6px 8px",background:"#111",color:"#fff",border:`2px solid ${saved?"#333":"#D99248"}`,borderRadius:4,outline:"none"}}
                        onChange={e=>setDefiDraft(d=>({...d,[pl.id]:{...draft,text:e.target.value}}))}/>
                    </div>
                    {!saved && onUpdateChallenge && (
                      <button onClick={()=>{ onUpdateChallenge(pl.id, draft.text, draft.emoji); setDefiDraft(d=>{const n2={...d}; delete n2[pl.id]; return n2;}); }}
                        style={{width:"100%",padding:"7px",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#0d0d0d",background:"#D99248",border:"2px solid #0d0d0d",borderRadius:3,cursor:"pointer",marginBottom:6}}>
                        💾 Enregistrer le défi
                      </button>
                    )}
                    {ch && <div style={{display:"flex",gap:2,flexWrap:"wrap",marginTop:4}}>
                      {Array.from({length:7},(_,i)=>{
                        const d = new Date(cwk+"T12:00:00"); d.setDate(d.getDate()+i);
                        const stamp=d.toISOString().slice(0,10);
                        const done=ch.checkins?.[stamp];
                        return <div key={stamp} style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,padding:"3px 4px",background:done?"#1a3a1a":"#111",color:done?"#5CAD68":"var(--txt-faint,#555)",border:`1px solid ${done?"#5CAD68":"#333"}`,borderRadius:3}}>J{i+1}{done?" ✓":""}</div>;
                      })}
                    </div>}
                  </div>
                );
              })}
              {inCustody && (
                <div style={{marginTop:8,borderTop:"2px solid #333",paddingTop:12}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",marginBottom:8}}>📅 QUÊTES RÉCURRENTES</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-dim,#666)"}}>
                    {(config.weeklyQuests?.assignments||[]).length} tâches auto-générées pour la semaine de garde (rotation déterministe).
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ACTIONS TAB */}
        {tab==="actions" && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",marginBottom:10}}>ACTIONS GLOBALES</div>
          {/* Boss de famille surprise */}
          <div style={{background:"rgba(50,18,35,0.4)",border:"2px solid #8F72CC",borderRadius:6,padding:"10px",marginBottom:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#C9B3F7",marginBottom:5}}>🐉 BOSS DE FAMILLE</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-mild,#999)",marginBottom:8}}>Lance un boss : chaque quête faite donne un jeton d'attaque. La famille l'attaque dans l'onglet ⚔️ BOSS. Choisis sa difficulté (ses PV).</div>
            {bossActive
              ? <PBtn onClick={()=>{}} color="#333" textColor="#fff" style={{width:"100%",opacity:0.6}}>⚔️ Un boss est déjà en cours…</PBtn>
              : <div style={{display:"flex",gap:6}}>
                  {[["facile","Facile"],["moyen","Moyen"],["costaud","Costaud"]].map(([k,l])=>(
                    <PBtn key={k} onClick={()=>{ onLaunchBoss&&onLaunchBoss(k); }} color="#8F72CC" textColor="#fff" style={{flex:1}}>{l}</PBtn>
                  ))}
                </div>}
          </div>
          {/* v2.6.0 — Quête de réparation 🕊️ : après un moment difficile entre enfants, une quête
              commune; quand TOUS l'ont faite et que c'est validé, effet collectif (boss −50 PV, ou
              +10 🪙 chacun sans boss). Texte volontairement sans « conflit/dispute/faute ». */}
          <div style={{background:"rgba(18,45,50,0.4)",border:"2px solid #7FD6E0",borderRadius:6,padding:"10px",marginBottom:12}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#7FD6E0",marginBottom:5}}>🕊️ QUÊTE DE RÉPARATION</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-mild,#999)",marginBottom:8}}>Après un moment difficile, propose une quête commune. Quand chacun l'a complétée et que tu as validé, la famille retrouve son équilibre : le boss recule de 50 PV (ou +10 🪙 chacun s'il n'y a pas de boss).</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
              {players.map(pl=>{
                const sel=repPlayerIds.includes(pl.id);
                return <div key={pl.id} onClick={()=>setRepPlayerIds(ids=>sel?ids.filter(x=>x!==pl.id):[...ids,pl.id])}
                  style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,padding:"6px 9px",background:sel?pl.color:"#1a1a1a",color:sel?"#0d0d0d":"var(--txt-faint,#555)",border:`2px solid ${sel?pl.color:"#333"}`,borderRadius:3,cursor:"pointer"}}>
                  {displayName(pl)}
                </div>;
              })}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
              {REPAIR_PRESETS.map((pr,i)=>(
                <div key={i} onClick={()=>{setRepPresetIdx(i);SFX.click();}}
                  style={{padding:"7px 10px",background:repPresetIdx===i?"rgba(127,214,224,0.15)":"rgba(0,0,0,0.3)",border:`2px solid ${repPresetIdx===i?"#7FD6E0":"#333"}`,borderRadius:4,cursor:"pointer"}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:repPresetIdx===i?"#7FD6E0":"var(--txt-mild,#999)"}}>{pr.emoji} {pr.label}</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-soft,#777)",marginTop:2}}>{pr.steps.join(" · ")}</div>
                </div>
              ))}
              <div onClick={()=>{setRepPresetIdx(-1);SFX.click();}}
                style={{padding:"7px 10px",background:repPresetIdx===-1?"rgba(127,214,224,0.15)":"rgba(0,0,0,0.3)",border:`2px solid ${repPresetIdx===-1?"#7FD6E0":"#333"}`,borderRadius:4,cursor:"pointer"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:repPresetIdx===-1?"#7FD6E0":"var(--txt-mild,#999)"}}>✏️ Autre chose…</div>
                {repPresetIdx===-1 && <input value={repCustomText} onChange={e=>setRepCustomText(e.target.value)} placeholder="Ex: Refaire la tour de blocs ensemble"
                  style={{width:"100%",marginTop:6,fontFamily:"'VT323',monospace",fontSize:16,padding:"7px 9px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:4,outline:"none",boxSizing:"border-box"}}/>}
              </div>
            </div>
            {(()=>{ const ok = repPlayerIds.length>=2 && (repPresetIdx>=0 || repCustomText.trim().length>=3);
              return <PBtn onClick={()=>{ if(!ok) return;
                  const preset = repPresetIdx>=0 ? REPAIR_PRESETS[repPresetIdx] : {emoji:"🕊️", label:repCustomText.trim(), steps:[]};
                  onCreateRepairQuest&&onCreateRepairQuest(preset, repPlayerIds);
                  setRepCustomText(""); setRepPresetIdx(0); }}
                color={ok?"#7FD6E0":"#333"} textColor="#0d0d0d" style={{width:"100%",opacity:ok?1:0.5}}>
                🕊️ Créer la quête ({repPlayerIds.length>=2?repPlayerIds.length+" enfants":"choisis au moins 2 enfants"})
              </PBtn>; })()}
          </div>
          {/* v2.6.2 — Récompenses "moment" à planifier ensemble (décision Gen). Aucune expiration :
              une entrée reste ici jusqu'à "✔ Fait", peu importe le délai. */}
          {(()=>{ const toPlan=(config.momentRequests||[]).filter(m=>m.status!=="fait");
            if(!toPlan.length) return null;
            return <div style={{background:"rgba(50,40,10,0.4)",border:"2px solid #D9BC5C",borderRadius:6,padding:"10px",marginBottom:12}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D9BC5C",marginBottom:5}}>🗓️ À PLANIFIER ENSEMBLE ({toPlan.length})</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {toPlan.map(m=>{
                  const pl=players.find(p=>p.id===m.playerId);
                  return <div key={m.id} style={{padding:"8px 10px",background:"rgba(0,0,0,0.3)",border:"1px solid #4a3a10",borderRadius:4}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>{m.emoji}</span>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#ddd"}}>{m.label}</div>
                        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:pl?.color||"var(--txt-muted,#888)"}}>{displayName(pl||{})}{m.plannedDate?` · prévu ${fmtDateShort(m.plannedDate)}`:""}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:7}}>
                      <input type="date" value={momentDates[m.id]||m.plannedDate||""} onChange={e=>setMomentDates(d=>({...d,[m.id]:e.target.value}))}
                        style={{flex:1,fontFamily:"'VT323',monospace",fontSize:14,padding:"5px 7px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3,outline:"none"}}/>
                      <PBtn onClick={()=>{ const d=momentDates[m.id]||m.plannedDate; if(d) onPlanMoment&&onPlanMoment(m.id,d); }}
                        color="#D9BC5C" textColor="#0d0d0d" style={{fontSize:11,padding:"5px 9px"}}>📅 Prévu</PBtn>
                      <PBtn onClick={()=>onMarkMomentDone&&onMarkMomentDone(m.id)} color="#1a3a1a" textColor="#5CAD68" style={{fontSize:11,padding:"5px 9px"}}>✔ Fait</PBtn>
                    </div>
                  </div>;
                })}
              </div>
            </div>; })()}
          <Row>
            {undoStack.length>0
              ? <PBtn onClick={onUndo} color="#FF6464" textColor="#0d0d0d" style={{flex:1}}>↩️ Annuler dernière</PBtn>
              : <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#444"}}>Rien à annuler</div>}
          </Row>
          <Row>
            <PBtn onClick={()=>onSetup()} color="#333" textColor="var(--txt-muted,#888)" style={{flex:1}}>⚙️ Modifier le livre (joueurs, tâches…)</PBtn>
          </Row>

          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",margin:"14px 0 8px"}}>PAR JOUEUR</div>
          {players.map((pl,i)=>(
            <div key={pl.id} style={{background:"rgba(0,0,0,0.4)",border:`2px solid ${pl.color}30`,borderRadius:5,padding:"10px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:pl.color,flexShrink:0}}/>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:pl.color}}>{displayName(pl)}</span>
                <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-dim,#666)",marginLeft:"auto"}}>
                  ⚡{gameStates[i]?.xp||0} 🪙{gameStates[i]?.coins||0}
                </span>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <PBtn onClick={()=>onAdjustXP(i,10)} color="#1a3a1a" textColor="#5CAD68" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+10 XP</PBtn>
                <PBtn onClick={()=>onAdjustXP(i,25)} color="#1a3a1a" textColor="#5CAD68" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+25 XP</PBtn>
                <PBtn onClick={()=>onAdjustXP(i,-10)} color="#3a1a1a" textColor="#FF6464" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>-10 XP</PBtn>
                <PBtn onClick={()=>onResetPlayer(i)} color="#2a0a0a" textColor="#D97070" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>🔄 À zéro</PBtn>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                <PBtn onClick={()=>onAdjustCoins&&onAdjustCoins(i,10)} color="#3a3000" textColor="#D9BC5C" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+10 🪙</PBtn>
                <PBtn onClick={()=>onAdjustCoins&&onAdjustCoins(i,50)} color="#3a3000" textColor="#D9BC5C" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>+50 🪙</PBtn>
                <PBtn onClick={()=>{const v=parseInt(prompt("Combien de pièces ajouter (ou négatif pour retirer)?","50")||"0",10); if(v)onAdjustCoins&&onAdjustCoins(i,v);}} color="#3a3000" textColor="#D9BC5C" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>🪙 Montant…</PBtn>
                <PBtn onClick={()=>onAdjustCoins&&onAdjustCoins(i,-10)} color="#3a1a1a" textColor="#FF6464" style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>-10 🪙</PBtn>
              </div>
              {/* v2.16.7 — Chantier 6.6 (demande de Gen) : verrou du matin, plage horaire fixe.
                  Bloque boutique + popup avatar pendant la fenêtre ; calendrier/tâches intacts. */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6,alignItems:"center"}}>
                <PBtn onClick={()=>onSetMorningLock&&onSetMorningLock(i,{enabled:!pl.morningLock?.enabled})}
                  color={pl.morningLock?.enabled?"#3a3000":"#1a1a1a"} textColor={pl.morningLock?.enabled?"#D9BC5C":"var(--txt-muted,#888)"}
                  style={{fontSize:"clamp(5px,0.8vw,7px)",padding:"5px 8px"}}>
                  🚪 Verrou du matin {pl.morningLock?.enabled?"ON":"OFF"}
                </PBtn>
                {pl.morningLock?.enabled && (<>
                  <input type="time" value={pl.morningLock?.start||"06:00"} onChange={e=>onSetMorningLock&&onSetMorningLock(i,{start:e.target.value})}
                    style={{fontFamily:"'VT323',monospace",fontSize:14,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3}}/>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-muted,#888)"}}>à</span>
                  <input type="time" value={pl.morningLock?.end||"09:00"} onChange={e=>onSetMorningLock&&onSetMorningLock(i,{end:e.target.value})}
                    style={{fontFamily:"'VT323',monospace",fontSize:14,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3}}/>
                </>)}
              </div>
              {/* Backlog #13 — budget-temps quotidien : frein sur la session globale (l'énergie ne
                  freine que les loisirs, pas le temps total passé connecté). */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6,alignItems:"center"}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-muted,#888)"}}>⏳ Budget-temps</span>
                <select value={pl.dailyMinutesLimit||""} onChange={e=>onSetDailyLimit&&onSetDailyLimit(i, e.target.value?parseInt(e.target.value,10):null)}
                  style={{fontFamily:"'VT323',monospace",fontSize:14,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3}}>
                  <option value="">Illimité</option>
                  {[15,20,30,45,60,90].map(m=><option key={m} value={m}>{m} min/jour</option>)}
                </select>
                {pl.dailyMinutesLimit ? (()=>{ const sm=gameStates[i]?.sessionMinutes; const used=sm?.day===todayStamp()?(sm.minutes||0):0;
                  return <span style={{fontFamily:"'VT323',monospace",fontSize:13,color:used>=pl.dailyMinutesLimit?"#D97070":"var(--txt-muted,#888)"}}>{used}/{pl.dailyMinutesLimit} min aujourd'hui</span>; })() : null}
              </div>
            </div>
          ))}
          {/* v2.16.26 — Backlog #15 : réglage global (tous les enfants), pas par enfant — plus
              simple, et les tâches rotatives sont déjà partagées entre eux par la rotation. */}
          <div style={{background:"rgba(0,0,0,0.3)",border:"2px solid #333",borderRadius:6,padding:"10px 12px",marginTop:10}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",marginBottom:6}}>🔒 DÉBLOCAGE BOUTIQUE/AVATAR</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-soft,#777)",marginBottom:6}}>Nombre de tâches rotatives à faire avant que la boutique et le personnalisateur se débloquent (0 = toujours ouvert).</div>
            <select value={config.shopUnlockCount??SHOP_UNLOCK_DEFAULT} onChange={e=>onSetShopUnlockCount&&onSetShopUnlockCount(parseInt(e.target.value,10))}
              style={{fontFamily:"'VT323',monospace",fontSize:14,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #333",borderRadius:3}}>
              <option value={0}>Toujours débloqué</option>
              {[1,2,3,4,5].map(n=><option key={n} value={n}>{n} tâche{n>1?"s":""} rotative{n>1?"s":""}</option>)}
            </select>
          </div>
        </>}

        {/* LOG TAB */}
        {/* v2.15.0 — l'onglet "➕ Ajouter au calendrier" a été retiré : une seule section calendrier
            reste dans l'app (demande de Gen), celle accessible via le pied de page collant côté
            enfant / le bouton "📅 Calendriers" de la barre parent — voir view==="calendars". */}

        {/* ── v2.6.0 ANNONCES PARENT ──────────────────────────── */}
        {tab==="annonces" && <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* Annonces existantes */}
          {(config.announcements||[]).length===0
            ? <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"var(--txt-dim,#666)",textAlign:"center",padding:"20px 0"}}>Aucune annonce active.</div>
            : (config.announcements||[]).map(a=>{
              // v2.15.1 — enfants ciblés qui ont fermé cette annonce (candidats au renvoi)
              const closedBy=(players||[]).filter((p,i)=>{
                const gs=gameStates[i];
                if(!gs||!(gs.dismissedAnnouncements||[]).includes(a.id)) return false;
                return a.targetAll || (a.targetPlayerIds||[]).includes(p.id);
              });
              return (
              <div key={a.id} style={{background:"rgba(180,120,0,0.12)",border:"2px solid #C8942A55",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#FFD54F",marginBottom:4}}>{a.emoji} {a.title||a.text.slice(0,40)}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-pale,#aaa)",marginBottom:6}}>{a.text.slice(0,80)}{a.text.length>80?"…":""}</div>
                {closedBy.length>0 && <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#C8942A",marginBottom:6}}>Fermée par : {closedBy.map(p=>p.name).join(", ")}</div>}
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:13,color:"var(--txt-dim,#666)"}}>Expire : {a.expiresAt||"—"}</span>
                  {closedBy.length>0 && <button onClick={()=>onResendAnnouncement&&onResendAnnouncement(a.id)}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"5px 8px",background:"#1a3a5a",color:"#6bb8ff",border:"2px solid #6bb8ff44",borderRadius:4,cursor:"pointer"}}>🔄 Renvoyer ({closedBy.length})</button>}
                  <button onClick={()=>onDeleteAnnouncement&&onDeleteAnnouncement(a.id)}
                    style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"5px 8px",background:"#5a1a1a",color:"#ff6b6b",border:"2px solid #ff6b6b44",borderRadius:4,cursor:"pointer"}}>🗑 Supprimer</button>
                </div>
              </div>
            );})
          }
          {/* Formulaire nouvelle annonce */}
          <div style={{background:"rgba(0,0,0,0.4)",border:"2px solid #444",borderRadius:8,padding:"12px 14px",marginTop:4}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#D99248",marginBottom:10}}>➕ Nouvelle annonce</div>
            <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
              <input value={annDraft.emoji} onChange={e=>setAnnDraft(d=>({...d,emoji:e.target.value.slice(0,4)}))}
                style={{width:48,fontFamily:"'VT323',monospace",fontSize:20,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,textAlign:"center"}}/>
              <input placeholder="Grand titre (ex: LIS CECI SANS RÉACTION)" value={annDraft.title}
                onChange={e=>setAnnDraft(d=>({...d,title:e.target.value}))}
                style={{flex:1,fontFamily:"'VT323',monospace",fontSize:14,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4}}/>
            </div>
            <textarea placeholder="Message…" value={annDraft.text} onChange={e=>setAnnDraft(d=>({...d,text:e.target.value}))}
              style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:15,padding:"8px 10px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,minHeight:80,resize:"vertical",marginBottom:8}}/>
            <label style={{display:"flex",gap:8,alignItems:"center",fontFamily:"'VT323',monospace",fontSize:15,color:"#eee",marginBottom:8,cursor:"pointer"}}>
              <input type="checkbox" checked={annDraft.secret} onChange={e=>setAnnDraft(d=>({...d,secret:e.target.checked}))} style={{width:16,height:16}}/>
              🤫 Message secret (ne pas réagir)
            </label>
            <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
              <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-pale,#aaa)"}}>Countdown :</span>
              <input type="datetime-local" value={annDraft.countdownTo} onChange={e=>setAnnDraft(d=>({...d,countdownTo:e.target.value}))}
                style={{flex:1,fontFamily:"'VT323',monospace",fontSize:13,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4}}/>
            </div>
            {annDraft.countdownTo && <>
              <input placeholder='Texte pendant le compte (ex: "avant le départ !") — suit le temps affiché' value={annDraft.countdownLabel}
                onChange={e=>setAnnDraft(d=>({...d,countdownLabel:e.target.value}))}
                style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:13,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,marginBottom:8}}/>
              <input placeholder='Texte à zéro (ex: "C&#39;est l&#39;heure ! 🎉")' value={annDraft.countdownDoneText}
                onChange={e=>setAnnDraft(d=>({...d,countdownDoneText:e.target.value}))}
                style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:13,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,marginBottom:8}}/>
            </>}
            <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
              <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-pale,#aaa)"}}>Bouton :</span>
              <input placeholder='Texte du bouton (défaut : "🤐 Compris, je reste discret·e !")' value={annDraft.dismissLabel}
                onChange={e=>setAnnDraft(d=>({...d,dismissLabel:e.target.value}))}
                style={{flex:1,fontFamily:"'VT323',monospace",fontSize:13,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4}}/>
            </div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"var(--txt-pale,#aaa)",marginBottom:6}}>TÂCHES COMMUNES (pour tous) :</div>
            <input placeholder='Titre de la section (défaut : "À FAIRE :")' value={annDraft.sharedTasksLabel}
              onChange={e=>setAnnDraft(d=>({...d,sharedTasksLabel:e.target.value}))}
              style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:13,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,marginBottom:6}}/>
            <textarea placeholder="Une tâche par ligne…" value={annDraft.sharedTasksDraft}
              onChange={e=>setAnnDraft(d=>({...d,sharedTasksDraft:e.target.value}))}
              style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:13,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,minHeight:50,resize:"vertical",marginBottom:8}}/>
            <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
              <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-pale,#aaa)"}}>Expiration :</span>
              <input type="date" value={annDraft.expiresAt} onChange={e=>setAnnDraft(d=>({...d,expiresAt:e.target.value}))}
                style={{flex:1,fontFamily:"'VT323',monospace",fontSize:13,padding:"4px 6px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4}}/>
            </div>
            <label style={{display:"flex",gap:8,alignItems:"center",fontFamily:"'VT323',monospace",fontSize:15,color:"#eee",marginBottom:8,cursor:"pointer"}}>
              <input type="checkbox" checked={annDraft.targetAll} onChange={e=>setAnnDraft(d=>({...d,targetAll:e.target.checked}))} style={{width:16,height:16}}/>
              Pour tous les enfants
            </label>
            {!annDraft.targetAll && <div style={{marginBottom:8}}>{players.map(p=>(
              <label key={p.id} style={{display:"flex",gap:8,alignItems:"center",fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",cursor:"pointer",marginBottom:4}}>
                <input type="checkbox" checked={(annDraft.targetPlayerIds||[]).includes(p.id)}
                  onChange={e=>setAnnDraft(d=>({...d,targetPlayerIds:e.target.checked?[...(d.targetPlayerIds||[]),p.id]:(d.targetPlayerIds||[]).filter(x=>x!==p.id)}))} style={{width:14,height:14}}/>
                {p.name}
              </label>
            ))}</div>}
            {/* Tâches chouchoutage par enfant */}
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"var(--txt-pale,#aaa)",marginBottom:6}}>TÂCHES CHOUCHOUTAGE (par enfant) :</div>
            {players.map(p=>(
              <div key={p.id} style={{marginBottom:6}}>
                <div style={{fontFamily:"'VT323',monospace",fontSize:13,color:"#D99248",marginBottom:3}}>{p.name} :</div>
                <textarea placeholder={`Ex: Demander à Carl s'il veut un café…`}
                  value={((annDraft.playerTasksDraft||{})[p.id]||"")}
                  onChange={e=>setAnnDraft(d=>({...d,playerTasksDraft:{...(d.playerTasksDraft||{}),[p.id]:e.target.value}}))}
                  style={{width:"100%",boxSizing:"border-box",fontFamily:"'VT323',monospace",fontSize:13,padding:"5px 8px",background:"#111",color:"#fff",border:"2px solid #555",borderRadius:4,minHeight:50,resize:"vertical"}}/>
                <div style={{fontFamily:"'VT323',monospace",fontSize:11,color:"var(--txt-faint,#555)"}}>Une tâche par ligne</div>
              </div>
            ))}
            <button disabled={!annDraft.text.trim()} onClick={()=>{
              if(!annDraft.text.trim())return;
              const playerTasks={};
              for(const p of players){
                const raw=(annDraft.playerTasksDraft||{})[p.id]||"";
                const tasks=raw.split("\n").map(s=>s.trim()).filter(Boolean);
                if(tasks.length) playerTasks[p.id]=tasks;
              }
              const sharedTasks=(annDraft.sharedTasksDraft||"").split("\n").map(s=>s.trim()).filter(Boolean);
              onCreateAnnouncement&&onCreateAnnouncement({
                emoji:annDraft.emoji||"📣",
                title:annDraft.title.trim()||undefined,
                text:annDraft.text.trim(),
                secret:annDraft.secret,
                targetAll:annDraft.targetAll,
                targetPlayerIds:annDraft.targetAll?[]:annDraft.targetPlayerIds,
                countdownTo:annDraft.countdownTo||undefined,
                countdownLabel:annDraft.countdownLabel.trim()||undefined,
                countdownDoneText:annDraft.countdownDoneText.trim()||undefined,
                dismissLabel:annDraft.dismissLabel.trim()||undefined,
                sharedTasks:sharedTasks.length?sharedTasks:undefined,
                sharedTasksLabel:annDraft.sharedTasksLabel.trim()||undefined,
                expiresAt:annDraft.expiresAt||undefined,
                playerTasks:Object.keys(playerTasks).length?playerTasks:undefined,
              });
              setAnnDraft({emoji:"📣",title:"",text:"",secret:false,targetAll:true,targetPlayerIds:[],countdownTo:"",countdownLabel:"",countdownDoneText:"",dismissLabel:"",sharedTasksDraft:"",sharedTasksLabel:"",expiresAt:"",playerTasksDraft:{}});
            }} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"10px",background:annDraft.text.trim()?"#D99248":"#333",
              color:"#0d0d0d",border:"3px solid #0d0d0d",borderRadius:6,cursor:annDraft.text.trim()?"pointer":"not-allowed",
              width:"100%",opacity:annDraft.text.trim()?1:0.5,boxShadow:"2px 2px 0 #0d0d0d",marginTop:4}}>
              📣 Envoyer l'annonce
            </button>
          </div>
        </div>}

        {tab==="log" && <>
          {/* 🐛 Bugs signalés par les enfants */}
          {(config.bugs||[]).length>0 && (
            <div style={{background:"rgba(255,140,0,0.08)",border:"2px solid #D9924855",borderRadius:6,padding:"10px 12px",marginBottom:12}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#D99248",marginBottom:8}}>🐛 BUGS SIGNALÉS ({(config.bugs||[]).length})</div>
              {(config.bugs||[]).map(b=>(
                <div key={b.id} style={{marginBottom:8,paddingBottom:6,borderBottom:"1px solid #D9924822"}}>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#eee",lineHeight:1.3}}>{b.text}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:3}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-muted,#888)"}}>{b.who}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-dim,#666)"}}>{new Date(b.ts).toLocaleString("fr-CA",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* v1.90.0 — logs techniques (erreurs JS capturées automatiquement) : repliable, discret,
              pour ne pas noyer les vrais bugs signalés par les enfants juste au-dessus */}
          {(config.errorLogs||[]).length>0 && (
            <div style={{background:"rgba(255,255,255,0.04)",border:"2px solid #444",borderRadius:6,padding:"10px 12px",marginBottom:12}}>
              <div onClick={()=>setErrLogsOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-mild,#999)"}}>🔧 LOGS TECHNIQUES ({(config.errorLogs||[]).length})</div>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-dim,#666)"}}>{errLogsOpen?"▲":"▼"}</span>
              </div>
              {errLogsOpen && (config.errorLogs||[]).map(e=>(
                <div key={e.id} style={{marginTop:8,paddingBottom:6,borderBottom:"1px solid #333"}}>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ccc",lineHeight:1.3,wordBreak:"break-word"}}>{e.message}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:3}}>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-soft,#777)"}}>{e.who} · v{e.appVersion}</span>
                    <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-dim,#666)"}}>{new Date(e.ts).toLocaleString("fr-CA",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* v2.16.24 — Backlog #10 : "HISTORIQUE" mélangeait à plat le changelog et les actions
              parent brutes — séparé en 2 sections distinctes et repliables (même patron visuel
              que 🔧 LOGS TECHNIQUES ci-dessus). */}
          {(config.updateFeedEntries||[]).length>0 && (
            <div style={{background:"rgba(94,222,245,0.05)",border:"2px solid #85CDD155",borderRadius:6,padding:"10px 12px",marginBottom:12}}>
              <div onClick={()=>setNewsOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1"}}>📖 NOUVEAUTÉS ({(config.updateFeedEntries||[]).length})</div>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-dim,#666)"}}>{newsOpen?"▲":"▼"}</span>
              </div>
              {newsOpen && (config.updateFeedEntries||[]).map((entry,i)=>(
                <div key={`update-${i}`} style={{background:"rgba(94,222,245,0.07)",border:"2px solid #85CDD155",borderRadius:6,padding:"10px 12px",marginTop:8}}>
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"#85CDD1",marginBottom:6}}>📖 LIVRE DE QUÊTES v{entry.version} — NOUVELLES PAGES!</div>
                  {entry.features.map((f,j)=>(
                    <div key={j} style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#ccc",lineHeight:1.4,paddingLeft:8}}>• {f}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div style={{background:"rgba(255,255,255,0.03)",border:"2px solid #333",borderRadius:6,padding:"10px 12px"}}>
            <div onClick={()=>setActionsLogOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)"}}>🕐 ACTIONS ({actionLog.length})</div>
              <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-dim,#666)"}}>{actionsLogOpen?"▲":"▼"}</span>
            </div>
            {actionsLogOpen && (actionLog.length===0
              ? <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"#444",marginTop:8}}>Aucune action encore.</div>
              : actionLog.map((entry,i)=>(
                <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"1px solid #1a1a1a",marginTop:i===0?8:0}}>
                  <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:5,color:"var(--txt-faint,#555)",flexShrink:0,marginTop:2}}>{entry.time}</span>
                  <span style={{fontFamily:"'VT323',monospace",fontSize:14,color:entry.color||"var(--txt-pale,#aaa)",lineHeight:1.3}}>{entry.msg}</span>
                </div>
              )))}
          </div>
        </>}

        {/* PIN TAB */}
        {tab==="pin" && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",marginBottom:14}}>CHANGER LE CODE PARENT</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-dim,#666)",marginBottom:10}}>Code actuel : {config.pin}</div>
          <input type="password" inputMode="numeric" maxLength={4} value={pinVal}
            onChange={e=>setPinVal(e.target.value.replace(/\D/g,"").slice(0,4))}
            placeholder="Nouveau PIN (4 chiffres)"
            style={{width:"100%",background:"#111",border:"2px solid #D99248",color:"#fff",
              padding:"12px",fontFamily:"'Press Start 2P',monospace",fontSize:18,
              borderRadius:3,textAlign:"center",letterSpacing:8,marginBottom:10}}/>
          <PBtn onClick={()=>{if(pinVal.length===4){onChangePin(pinVal);setPinVal("");}}}
            color={pinVal.length===4?"#D99248":"#333"} textColor="#0d0d0d" style={{width:"100%",opacity:pinVal.length===4?1:0.5}}>
            ✓ Confirmer
          </PBtn>
        </>}

        {/* EXPORT TAB */}
        {tab==="export" && <>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",marginBottom:14}}>SAUVEGARDE</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:15,color:"var(--txt-dim,#666)",marginBottom:12,lineHeight:1.4}}>
            Télécharge une copie du livre de quêtes pour le transférer sur un autre appareil ou garder une sauvegarde.
          </div>
          <PBtn onClick={onExport} color="#1a3a1a" textColor="#5CAD68" style={{width:"100%",marginBottom:10}}>
            📤 Télécharger la sauvegarde
          </PBtn>
          <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:"var(--txt-faint,#555)",marginBottom:8}}>Restaurer une sauvegarde :</div>
          <label style={{display:"block",padding:"10px",background:"#111",border:"2px dashed #444",
            borderRadius:3,cursor:"pointer",fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",textAlign:"center"}}>
            📥 Choisir le fichier de sauvegarde
            <input type="file" accept=".json" onChange={e=>e.target.files[0]&&onImport(e.target.files[0])} style={{display:"none"}}/>
          </label>
        </>}
      </div>
    </div>
  );
});

export { ParentPanel };
