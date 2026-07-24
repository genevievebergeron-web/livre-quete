// ─── EFFETS DE PARTICULES (confettis / emoji flottants) ─────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif). Manipulation DOM directe (pas d'état
// React), seule dépendance externe : CALM (calm.js, lecture seule). Zéro changement de
// comportement.
import { CALM } from "./calm.js";

// v1.88.0 (Lot 3 #11) — `big` (défaut true, rétrocompatible) contrôle l'intensité : les VRAIS
// jalons (level-up, victoire de boss, coffre, etc.) gardent l'intensité complète (7 emoji + 18
// confettis), mais une tâche ordinaire validée (le déclencheur le plus fréquent — des dizaines
// de fois par jour) passe en version réduite (3 + 6) — moins de densité sur les actions courantes
// sans retirer la fête pour les vrais accomplissements.
export function spawnParticles(emoji, big=true) {
  if (CALM) return; // mode calme : pas de particules/flash
  const emojis = [emoji,"⭐","✨","💫"];
  const nEmoji = big ? 7 : 3, nConfetti = big ? 18 : 6;
  for(let i=0;i<nEmoji;i++) setTimeout(()=>{
    const p=document.createElement("div");
    p.style.cssText=`position:fixed;left:${Math.random()*70+15}vw;top:${Math.random()*50+25}vh;font-size:22px;pointer-events:none;z-index:2999;animation:floatUp 1.4s ease-out forwards;`;
    p.textContent=emojis[Math.floor(Math.random()*emojis.length)]; document.body.appendChild(p); setTimeout(()=>p.remove(),1500);
  },i*90);
  const cols=["#FFD700","#4A90D9","#C060D0","#2ECC40","#FF6464"];
  for(let i=0;i<nConfetti;i++) setTimeout(()=>{
    const c=document.createElement("div");
    c.style.cssText=`position:fixed;left:${Math.random()*100}vw;top:-10px;width:${Math.random()*8+4}px;height:${Math.random()*8+4}px;background:${cols[Math.floor(Math.random()*5)]};z-index:2998;border-radius:2px;animation:confettiFall ${Math.random()*1+1.5}s ease-in ${Math.random()*0.4}s forwards;`;
    document.body.appendChild(c); setTimeout(()=>c.remove(),2200);
  },i*35);
}
