// ─── AUDIO ────────────────────────────────────────────────────
// Extrait de App.jsx (Lot 5 #24, découpage progressif) : module autonome,
// aucun état partagé avec App() au-delà du flag mute ci-dessous — zéro changement de comportement.
let SFX_MUTED = false; // couper le son (réglage enfant)
export const setSfxMuted = (muted) => { SFX_MUTED = muted; };

let _ac = null;
const ac = () => { try { if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)(); _ac.resume(); return _ac; } catch { return null; } };
const tone = (f, type, dur, vol, delay = 0) => {
  if (SFX_MUTED) return; // son coupé (réglage enfant)
  try { const ctx = ac(); if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.type = type; o.frequency.setValueAtTime(f, ctx.currentTime + delay); g.gain.setValueAtTime(0, ctx.currentTime + delay); g.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.01); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur); o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + dur + 0.05); } catch {}
};
export const SFX = {
  click:   () => tone(440, "square", 0.04, 0.1),
  task:    () => { [523,659,784,1047].forEach((f,i) => tone(f,"square",0.13,0.17,i*0.1)); },
  epic:    () => { [262,330,392,523,659,784].forEach((f,i) => tone(f,"square",0.16,0.2,i*0.09)); },
  buy:     () => { [880,1100,1320].forEach((f,i) => tone(f,"sine",0.07,0.25,i*0.08)); },
  pinOk:   () => { [523,659,784,1047].forEach((f,i) => tone(f,"sine",0.1,0.2,i*0.07)); },
  pinErr:  () => { [440,415,392].forEach((f,i) => tone(f,"sawtooth",0.13,0.17,i*0.09)); },
  pinKey:  () => tone(660, "sine", 0.04, 0.15),
  welcome: () => { [262,330,392,523].forEach((f,i) => tone(f,"square",0.16,0.17,i*0.12)); setTimeout(() => SFX.epic(), 600); },
  coin:    () => tone(1320, "sine", 0.07, 0.2),
  alert:   () => { [440,440,440].forEach((f,i) => tone(f,"square",0.1,0.2,i*0.2)); },
};
