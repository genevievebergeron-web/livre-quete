import { useState, useEffect, useRef, useCallback } from "react";
import { SFX } from "./sfx.js";
import { getPlayerTheme } from "./themes.js";

// ═══════════════════════════════════════════════════════════════
// MINI-GAME RUNNER — dino-style endless runner
// ═══════════════════════════════════════════════════════════════
// v1.90.0 (Lot 4 #18) — paliers de récompense centralisés ici, réutilisés par
// chaque mini-jeu ET par l'écran de choix/intro (pour les afficher avant de jouer).
const MINIGAME_TIERS = {
  runner: { xp:[0, 5, 12, 22, 35], coins:[0, 2,  6, 12, 20] },
  pacman: { xp:[0, 5, 12, 24, 40], coins:[0, 2,  7, 14, 22] },
  whack:  { xp:[0, 8, 18, 30],     coins:[0, 4, 10, 18] },
};

function MiniGameRunner({ pt, level, onFinish }) {
  const canvasRef = useRef(null);
  const stRef = useRef(null);
  const [phase, setPhase] = useState("intro");
  const phaseRef = useRef("intro");

  const BONUS_XP    = MINIGAME_TIERS.runner.xp;
  const BONUS_COINS = MINIGAME_TIERS.runner.coins;
  const W = 320, H = 160, GROUND = 120;
  const GRAVITY = 0.6, JUMP_VY = -11;
  const DURATION = 16000;

  const initState = () => ({
    px: 50, py: GROUND, vy: 0, onGround: true,
    obstacles: [], coins: [], score: 0,
    startTime: performance.now(), lastObs: 0, lastCoin: 0,
    rafId: null,
  });

  const startGame = () => {
    stRef.current = initState();
    phaseRef.current = "play";
    setPhase("play");
  };

  // Démarre tout seul (le wrapper a déjà fait l'intro + le décompte GO)
  useEffect(() => { startGame(); }, []);

  useEffect(() => {
    if (phase !== "play") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const st = stRef.current;

    const jump = () => { if (st.onGround) { st.vy = JUMP_VY; st.onGround = false; SFX.click(); } };
    const onKey = e => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); } };
    // « Appuie n'importe où pour sauter » → on écoute sur TOUTE la fenêtre (pas juste le canvas)
    const onTap = (e) => { if(e&&e.cancelable) e.preventDefault(); jump(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onTap);
    window.addEventListener("touchstart", onTap, { passive:false });

    const loop = (now) => {
      if (phaseRef.current !== "play") return;
      const elapsed = now - st.startTime;

      // Physics
      st.vy += GRAVITY;
      st.py += st.vy;
      if (st.py >= GROUND) { st.py = GROUND; st.vy = 0; st.onGround = true; }

      // Speed ramps up over time (plus lent qu'avant)
      const speed = 2 + elapsed / 9000;

      // Spawn obstacles (espacés, avec un plancher pour ne jamais devenir trop rapide)
      if (now - st.lastObs > 1700 - Math.min(800, elapsed / 120)) {
        const h = 16 + Math.random() * 16;
        st.obstacles.push({ x: W + 10, h });
        st.lastObs = now;
      }
      // Spawn coins
      if (now - st.lastCoin > 1800) {
        st.coins.push({ x: W + 10, y: GROUND - 30 - Math.random() * 30, collected: false });
        st.lastCoin = now;
      }

      // Move & collide obstacles
      st.obstacles = st.obstacles.filter(o => {
        o.x -= speed;
        // collision with player (rect 20×28)
        if (o.x < st.px + 18 && o.x + 12 > st.px && GROUND - o.h < st.py + 4) {
          // hit — end game
          phaseRef.current = "done";
          setPhase("done");
        }
        return o.x > -20;
      });

      // Move & collect coins
      st.coins = st.coins.filter(c => {
        c.x -= speed;
        if (!c.collected && Math.abs(c.x - st.px) < 22 && Math.abs(c.y - st.py) < 22) {
          c.collected = true; st.score++; SFX.coin();
        }
        return c.x > -20 && !c.collected;
      });

      // End by time
      if (elapsed >= DURATION && phaseRef.current === "play") {
        phaseRef.current = "done";
        setPhase("done");
      }

      // Draw
      ctx.clearRect(0, 0, W, H);
      // Sky gradient
      ctx.fillStyle = "#0d0d1a";
      ctx.fillRect(0, 0, W, H);
      // Ground
      ctx.fillStyle = pt.primary + "99";
      ctx.fillRect(0, GROUND + 28, W, H - GROUND - 28);
      ctx.fillStyle = pt.accent;
      ctx.fillRect(0, GROUND + 27, W, 2);

      // Player (character body)
      ctx.fillStyle = pt.charBodyColor || "#4A90D9";
      ctx.fillRect(st.px - 10, st.py - 24, 20, 28);
      // Eyes
      ctx.fillStyle = "#fff";
      ctx.fillRect(st.px + 2, st.py - 20, 5, 5);
      ctx.fillStyle = "#0d0d0d";
      ctx.fillRect(st.px + 4, st.py - 19, 3, 3);

      // Obstacles (themed cacti/blocks)
      ctx.fillStyle = pt.accent;
      st.obstacles.forEach(o => {
        ctx.fillRect(o.x - 6, GROUND + 28 - o.h, 12, o.h);
        ctx.fillRect(o.x - 10, GROUND + 28 - o.h * 0.6, 20, o.h * 0.3);
      });

      // Coins
      ctx.fillStyle = "#D9BC5C";
      st.coins.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff9";
        ctx.beginPath();
        ctx.arc(c.x - 2, c.y - 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#D9BC5C";
      });

      // Score & timer
      ctx.fillStyle = pt.accent;
      ctx.font = "bold 10px 'Press Start 2P', monospace";
      ctx.fillText(`🪙 ${st.score}`, 10, 18);
      const tLeft = Math.max(0, Math.ceil((DURATION - elapsed) / 1000));
      ctx.fillText(`${tLeft}s`, W - 30, 18);

      st.rafId = requestAnimationFrame(loop);
    };

    st.rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(st.rafId);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onTap);
      window.removeEventListener("touchstart", onTap);
    };
  }, [phase]);

  const score = stRef.current?.score ?? 0;
  const tier = Math.min(4, score);
  const bonusXp = BONUS_XP[tier];
  const bonusCoins = BONUS_COINS[tier];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:12,padding:16,overflowY:"auto",boxSizing:"border-box"}}>
      {phase === "intro" && (<>
        <div style={{fontSize:36}}>🏃</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent,textShadow:`0 0 12px ${pt.accent}`}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-pale,#aaa)",textAlign:"center",lineHeight:2.2}}>RUNNER!{"\n"}Saute les obstacles, ramasse les pièces!{"\n"}ESPACE ou TAP pour sauter</div>
        <button onClick={startGame} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",boxShadow:`0 0 16px ${pt.primary}80`}}>COURIR! 🏃</button>
      </>)}

      {phase === "play" && (
        <canvas ref={canvasRef} width={W} height={H}
          style={{border:`3px solid ${pt.accent}`,borderRadius:8,imageRendering:"pixelated",boxShadow:`0 0 20px ${pt.glow||pt.accent}60`,cursor:"pointer"}}/>
      )}

      {phase === "done" && (<>
        <div style={{fontSize:36}}>{tier>=4?"🏆":tier>=3?"🥇":tier>=2?"🥈":tier>=1?"🥉":"😅"}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#fff",marginTop:4}}>PIÈCES: {score} 🪙</div>
        {bonusXp>0&&<div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#D9BC5C"}}>+{bonusXp} XP  +{bonusCoins} 🪙</div>}
        <button onClick={()=>onFinish(bonusXp,bonusCoins)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",marginTop:8}}>CONTINUER ▶</button>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MINI-GAME PACMAN — pac-man style maze
// ═══════════════════════════════════════════════════════════════
function MiniGamePacman({ pt, level, onFinish }) {
  const canvasRef = useRef(null);
  const stRef = useRef(null);
  const [phase, setPhase] = useState("intro");
  const phaseRef = useRef("intro");

  const BONUS_XP    = MINIGAME_TIERS.pacman.xp;
  const BONUS_COINS = MINIGAME_TIERS.pacman.coins;
  const CS = 22; // cell size
  const MOVE_INTERVAL = 200;
  const GHOST_INTERVAL = 380; // fantômes plus lents (moins stressant)
  const DURATION = 30000;

  const MAZE_TEMPLATE = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,0,2,0,2,0,2,0,2,0,2,1],
    [1,0,1,1,0,1,1,1,0,1,1,0,1],
    [1,2,1,0,2,0,0,0,2,0,1,2,1],
    [1,0,0,2,1,1,0,1,1,2,0,0,1],
    [1,2,0,0,0,2,0,2,0,0,0,2,1],
    [1,0,0,2,1,1,0,1,1,2,0,0,1],
    [1,2,1,0,2,0,0,0,2,0,1,2,1],
    [1,0,1,1,0,1,1,1,0,1,1,0,1],
    [1,2,0,2,0,2,0,2,0,2,0,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];
  const COLS = 13, ROWS = 11;
  const CW = COLS * CS, CH = ROWS * CS;

  const initState = () => {
    const maze = MAZE_TEMPLATE.map(r => [...r]);
    const total = maze.reduce((s,r) => s + r.filter(c=>c===2).length, 0);
    return {
      maze, total,
      px: 6, py: 5, pdir: {dx:1,dy:0}, pNextDir: {dx:1,dy:0},
      pMoveTimer: 0,
      gx: 1, gy: 1, gdir: {dx:1,dy:0},
      gMoveTimer: 0,
      score: 0, eaten: 0,
      startTime: performance.now(),
      rafId: null, lastTime: performance.now(),
    };
  };

  const canMove = (maze, col, row) =>
    col >= 0 && col < COLS && row >= 0 && row < ROWS && maze[row][col] !== 1;

  const ghostAI = (st) => {
    const { gx, gy, px, py, gdir, maze } = st;
    const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const reverse = {dx:-gdir.dx,dy:-gdir.dy};
    // prefer moving toward player, avoid reversing
    const valid = dirs.filter(d =>
      !(d.dx===reverse.dx && d.dy===reverse.dy) &&
      canMove(maze, gx+d.dx, gy+d.dy)
    );
    if (valid.length === 0) return gdir;
    return valid.reduce((best, d) => {
      const nx = gx+d.dx, ny = gy+d.dy;
      const nb = gx+best.dx, nb2 = gy+best.dy;
      return (Math.abs(nx-px)+Math.abs(ny-py)) < (Math.abs(nb-px)+Math.abs(nb2-py)) ? d : best;
    }, valid[0]);
  };

  const startGame = () => {
    stRef.current = initState();
    phaseRef.current = "play";
    setPhase("play");
  };

  // Démarre tout seul (le wrapper a déjà fait l'intro + le décompte GO)
  useEffect(() => { startGame(); }, []);

  useEffect(() => {
    if (phase !== "play") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const st = stRef.current;

    const DIRS = { ArrowLeft:{dx:-1,dy:0}, ArrowRight:{dx:1,dy:0}, ArrowUp:{dx:0,dy:-1}, ArrowDown:{dx:0,dy:1},
                   a:{dx:-1,dy:0}, d:{dx:1,dy:0}, w:{dx:0,dy:-1}, s:{dx:0,dy:1} };
    const onKey = e => {
      const d = DIRS[e.key];
      if (d) { e.preventDefault(); st.pNextDir = d; }
    };
    window.addEventListener("keydown", onKey);

    const loop = (now) => {
      if (phaseRef.current !== "play") return;
      const dt = now - st.lastTime;
      st.lastTime = now;
      const elapsed = now - st.startTime;

      // Move player
      st.pMoveTimer += dt;
      if (st.pMoveTimer >= MOVE_INTERVAL) {
        st.pMoveTimer -= MOVE_INTERVAL;
        const nd = st.pNextDir;
        const nx = st.px + nd.dx, ny = st.py + nd.dy;
        if (canMove(st.maze, nx, ny)) { st.pdir = nd; st.px = nx; st.py = ny; }
        else {
          const nx2 = st.px + st.pdir.dx, ny2 = st.py + st.pdir.dy;
          if (canMove(st.maze, nx2, ny2)) { st.px = nx2; st.py = ny2; }
        }
        // Eat pellet
        if (st.maze[st.py][st.px] === 2) {
          st.maze[st.py][st.px] = 0;
          st.score++; st.eaten++;
          SFX.coin();
        }
      }

      // Move ghost
      st.gMoveTimer += dt;
      if (st.gMoveTimer >= GHOST_INTERVAL) {
        st.gMoveTimer -= GHOST_INTERVAL;
        const gd = ghostAI(st);
        st.gdir = gd;
        st.gx += gd.dx; st.gy += gd.dy;
      }

      // Ghost catches player
      if (st.gx === st.px && st.gy === st.py) {
        phaseRef.current = "done";
        setPhase("done");
      }

      // All pellets eaten or time up
      if (st.eaten >= st.total || elapsed >= DURATION) {
        phaseRef.current = "done";
        setPhase("done");
      }

      // Draw
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = "#0d0d1a";
      ctx.fillRect(0, 0, CW, CH);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = c*CS, y = r*CS;
          if (st.maze[r][c] === 1) {
            ctx.fillStyle = pt.primary;
            ctx.fillRect(x+1, y+1, CS-2, CS-2);
            ctx.strokeStyle = pt.accent;
            ctx.lineWidth = 1;
            ctx.strokeRect(x+1.5, y+1.5, CS-3, CS-3);
          } else if (st.maze[r][c] === 2) {
            ctx.fillStyle = "#D9BC5C";
            ctx.beginPath();
            ctx.arc(x+CS/2, y+CS/2, 3, 0, Math.PI*2);
            ctx.fill();
          }
        }
      }

      // Pac-man (mouth opens/closes)
      const mouthAngle = (Math.floor(now/80) % 2 === 0) ? 0.3 : 0.05;
      const angle = st.pdir.dx===1 ? 0 : st.pdir.dx===-1 ? Math.PI : st.pdir.dy===1 ? Math.PI/2 : -Math.PI/2;
      ctx.fillStyle = pt.charBodyColor || "#D9BC5C";
      ctx.beginPath();
      ctx.moveTo(st.px*CS+CS/2, st.py*CS+CS/2);
      ctx.arc(st.px*CS+CS/2, st.py*CS+CS/2, CS/2-2, angle+mouthAngle, angle+Math.PI*2-mouthAngle);
      ctx.closePath();
      ctx.fill();

      // Ghost
      const gx2 = st.gx*CS, gy2 = st.gy*CS;
      ctx.fillStyle = pt.accent;
      ctx.beginPath();
      ctx.arc(gx2+CS/2, gy2+CS/2-2, CS/2-2, Math.PI, 0);
      ctx.lineTo(gx2+CS-2, gy2+CS-2);
      for (let i=0;i<3;i++) {
        ctx.arc(gx2+CS-2-(i*(CS-4)/3)-(CS-4)/6, gy2+CS-2, (CS-4)/6, 0, Math.PI, true);
      }
      ctx.lineTo(gx2+2, gy2+CS-2);
      ctx.closePath();
      ctx.fill();
      // Ghost eyes
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(gx2+CS/2-4, gy2+CS/2-3, 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx2+CS/2+4, gy2+CS/2-3, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#00f";
      ctx.beginPath(); ctx.arc(gx2+CS/2-3, gy2+CS/2-2, 1.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx2+CS/2+5, gy2+CS/2-2, 1.5, 0, Math.PI*2); ctx.fill();

      // HUD
      ctx.fillStyle = pt.accent;
      ctx.font = "bold 9px 'Press Start 2P', monospace";
      const tLeft = Math.max(0, Math.ceil((DURATION - elapsed)/1000));
      ctx.fillText(`${st.score}/${st.total} 🪙  ${tLeft}s`, 6, CH - 5);

      st.rafId = requestAnimationFrame(loop);
    };

    st.rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(st.rafId);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);

  const score = stRef.current?.score ?? 0;
  const total = stRef.current?.total ?? 1;
  const tier = Math.min(4, Math.floor(score/total * 4 * 1.6));
  const bonusXp = BONUS_XP[tier];
  const bonusCoins = BONUS_COINS[tier];

  const dpad = (dx, dy) => { if (stRef.current) stRef.current.pNextDir = {dx,dy}; };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:8,padding:12,overflowY:"auto",boxSizing:"border-box"}}>
      {phase === "intro" && (<>
        <div style={{fontSize:36}}>👻</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent,textShadow:`0 0 12px ${pt.accent}`}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-pale,#aaa)",textAlign:"center",lineHeight:2.2}}>PAC-QUEST!{"\n"}Mange les pellets, évite le fantôme!{"\n"}Flèches ou WASD</div>
        <button onClick={startGame} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",boxShadow:`0 0 16px ${pt.primary}80`}}>JOUER! 👾</button>
      </>)}

      {phase === "play" && (<>
        <canvas ref={canvasRef} width={CW} height={CH}
          style={{border:`3px solid ${pt.accent}`,borderRadius:4,imageRendering:"pixelated",boxShadow:`0 0 20px ${pt.glow||pt.accent}60`,maxWidth:"95vw",maxHeight:"50vh"}}/>
        {/* Touch D-pad */}
        <div style={{display:"grid",gridTemplateColumns:"44px 44px 44px",gridTemplateRows:"44px 44px",gap:4,marginTop:4}}>
          {[null,{dx:0,dy:-1,"l":"▲"},null,{dx:-1,dy:0,"l":"◀"},{dx:0,dy:1,"l":"▼"},{dx:1,dy:0,"l":"▶"}].map((d,i)=>
            d ? <button key={i} onPointerDown={()=>dpad(d.dx,d.dy)}
              style={{fontFamily:"monospace",fontSize:18,background:"#222",border:`2px solid ${pt.accent}`,color:pt.accent,borderRadius:6,cursor:"pointer",userSelect:"none"}}>{d.l}</button>
              : <div key={i}/>
          )}
        </div>
      </>)}

      {phase === "done" && (<>
        <div style={{fontSize:36}}>{tier>=4?"🏆":tier>=3?"🥇":tier>=2?"🥈":tier>=1?"🥉":"😅"}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:pt.accent}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#fff"}}>PELLETS: {score}/{total}</div>
        {bonusXp>0&&<div style={{fontFamily:"'VT323',monospace",fontSize:18,color:"#D9BC5C"}}>+{bonusXp} XP  +{bonusCoins} 🪙</div>}
        <button onClick={()=>onFinish(bonusXp,bonusCoins)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",marginTop:8}}>CONTINUER ▶</button>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MINI-GAME WHACK — mini-jeu whack-a-mole thématique au level-up
// ═══════════════════════════════════════════════════════════════
function MiniGameWhack({ pt, level, onFinish }) {
  const ROUNDS = 3;
  const ROUND_MS = 2300; // plus lent (était 1400)
  const BONUS_XP = MINIGAME_TIERS.whack.xp;
  const BONUS_COINS = MINIGAME_TIERS.whack.coins;
  const TARGET = pt.platformItems?.[0] || "⭐";

  const [phase, setPhase] = useState("intro"); // intro|play|done
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [active, setActive] = useState(-1);
  const roundRef = useRef(0);
  const scoreRef = useRef(0);
  const timerRef = useRef(null);

  const showNext = useCallback(() => {
    const cell = Math.floor(Math.random() * 9);
    setActive(cell);
    timerRef.current = setTimeout(() => {
      setActive(-1);
      roundRef.current++;
      setRound(roundRef.current);
      if (roundRef.current >= ROUNDS) { setTimeout(() => setPhase("done"), 400); }
      else { setTimeout(showNext, 600); }
    }, ROUND_MS);
  }, []);

  const handleHit = (i) => {
    if (phase !== "play" || active !== i) return;
    clearTimeout(timerRef.current);
    scoreRef.current++; setScore(scoreRef.current);
    setActive(-1); SFX.coin();
    roundRef.current++; setRound(roundRef.current);
    if (roundRef.current >= ROUNDS) { setTimeout(() => setPhase("done"), 350); }
    else { setTimeout(showNext, 500); }
  };

  const start = () => {
    roundRef.current = 0; scoreRef.current = 0;
    setRound(0); setScore(0); setPhase("play");
    setTimeout(showNext, 700);
  };

  // Démarre tout seul (le wrapper a déjà fait l'intro + le décompte GO)
  useEffect(() => { start(); }, []);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const bonusXp = BONUS_XP[score] ?? 0;
  const bonusCoins = BONUS_COINS[score] ?? 0;
  const stars = Array.from({length:3}, (_,i) => i < score ? "⭐" : "⬛").join(" ");
  const medal = score === 3 ? "🏆" : score >= 2 ? "🥈" : score === 1 ? "🥉" : "😅";
  const msg = score === 3 ? "PARFAIT! 🔥" : score >= 2 ? "Bien joué!" : score === 1 ? "Pas mal!" : "La prochaine fois!";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:14,padding:20,overflowY:"auto",boxSizing:"border-box"}}>
      {phase === "intro" && (<>
        <div style={{fontSize:40}}>{TARGET}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,color:pt.accent,textAlign:"center",textShadow:`0 0 12px ${pt.accent}`}}>NIVEAU {level}!</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-pale,#aaa)",textAlign:"center",lineHeight:2.2}}>Mini-jeu!{"\n"}Tape les {TARGET} le plus vite possible!</div>
        <button onClick={start} style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",marginTop:8,boxShadow:`0 0 16px ${pt.primary}80`}}>JOUER! 🎮</button>
      </>)}

      {phase === "play" && (<>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-muted,#888)",letterSpacing:2}}>TOUR {round+1}/{ROUNDS} · SCORE {score}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,width:240}}>
          {Array.from({length:9}, (_,i) => (
            <button key={i} onClick={()=>handleHit(i)}
              style={{height:72,fontSize:active===i?32:0,background:active===i?pt.primary:"#181818",border:`2px solid ${active===i?pt.accent:"#2a2a2a"}`,borderRadius:10,cursor:active===i?"pointer":"default",transition:"all 0.07s",transform:active===i?"scale(1.1)":"scale(1)",boxShadow:active===i?`0 0 18px ${pt.glow}60`:"none"}}>
              {active===i ? TARGET : ""}
            </button>
          ))}
        </div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:"var(--txt-faint,#555)"}}>Réflexes de champion!</div>
      </>)}

      {phase === "done" && (<>
        <div style={{fontSize:48}}>{medal}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:14,color:pt.accent,letterSpacing:3}}>{stars}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:"#ddd"}}>{msg}</div>
        {bonusXp > 0 && <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:"#D9BC5C",textShadow:"0 0 8px #D9BC5C"}}>+{bonusXp} XP · +{bonusCoins} 🪙</div>}
        {bonusXp === 0 && <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:"var(--txt-faint,#555)"}}>Pas de bonus cette fois...</div>}
        <button onClick={()=>onFinish(bonusXp,bonusCoins)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,padding:"12px 24px",background:pt.primary,color:"#0d0d0d",border:"none",borderRadius:6,cursor:"pointer",marginTop:8}}>CONTINUER ▶</button>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MINI-GAME ROUTER — choisi aléatoirement au level-up
// ═══════════════════════════════════════════════════════════════
const MINIGAME_LIST = ["whack", "runner", "pacman"];
const MINIGAME_INFO = {
  whack:  { icon:"🔨", name:"Tape vite!",   how:"👆 Touche les cibles avec ton doigt (ou clique avec la souris) le plus vite possible avant qu'elles disparaissent!" },
  runner: { icon:"🏃", name:"Cours et saute!", how:"👆 Appuie N'IMPORTE OÙ sur l'écran — ou la barre d'espace ⎵ / flèche du haut ⬆️ — pour SAUTER par-dessus les obstacles. Ramasse les pièces!" },
  pacman: { icon:"😋", name:"Mange tout!",  how:"👆 Glisse ton doigt dans une direction — ou utilise les flèches du clavier ⬆️⬇️⬅️➡️ — pour te déplacer. Mange toutes les pastilles en évitant les fantômes!" },
};
// v1.90.0 (Lot 4 #18) — paliers d'un jeu, du meilleur score au moins bon, pour affichage AVANT de jouer.
function minigameTierRow(type) {
  const tiers = MINIGAME_TIERS[type];
  const rows = tiers.xp.map((xp,i)=>({tier:i,xp,coins:tiers.coins[i]})).filter(r=>r.tier>0).reverse();
  return (
    <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",maxWidth:360}}>
      {rows.map(r=>(
        <div key={r.tier} style={{fontFamily:"'VT323',monospace",fontSize:14,color:"#ddd",background:"rgba(0,0,0,0.35)",borderRadius:6,padding:"4px 9px"}}>
          {"⭐".repeat(r.tier)} +{r.xp} XP · +{r.coins}🪙
        </div>
      ))}
    </div>
  );
}

export function MiniGame({ player, playerThemeId, level, onFinish, forcedType, isGift }) {
  const pt = getPlayerTheme(playerThemeId || "none");
  const forced = forcedType && MINIGAME_LIST.includes(forcedType) ? forcedType : null;
  // v1.90.0 (Lot 4 #18) — l'enfant choisit son jeu (sauf cadeau imposé, ex Pac-Man) : nouvelle
  // phase "choice" avant l'intro, qui affiche aussi les paliers de récompense de chaque jeu.
  const [type, setType] = useState(forced);
  const [phase, setPhase] = useState(forced ? "intro" : "choice"); // choice | intro | countdown | play
  const [count, setCount] = useState(3);
  const INFO = type ? MINIGAME_INFO[type] : null;

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count < 0) { setPhase("play"); return; }
    if (count === 0 && SFX.epic) SFX.epic();
    const t = setTimeout(() => setCount(c => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, count]);

  if (phase === "choice") {
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.96)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:14,padding:24,textAlign:"center",overflowY:"auto"}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.4vw,12px)",color:"#D9BC5C"}}>{isGift ? "🎁 CADEAU SURPRISE!" : `🎉 NIVEAU ${level} ATTEINT!`}</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:"clamp(17px,2.4vw,20px)",color:"#fff"}}>Choisis ton mini-jeu! 🎮</div>
        {MINIGAME_LIST.map(g => (
          <button key={g} onClick={()=>{SFX.click&&SFX.click();setType(g);setPhase("intro");}}
            style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:6,alignItems:"center",fontFamily:"'Press Start 2P',monospace",padding:"14px 12px",background:"#1a1a1a",color:"#fff",border:`3px solid ${pt.accent}`,borderRadius:8,cursor:"pointer"}}>
            <div style={{fontSize:32}}>{MINIGAME_INFO[g].icon}</div>
            <div style={{fontSize:"clamp(9px,1.4vw,12px)",color:pt.accent}}>{MINIGAME_INFO[g].name}</div>
            {minigameTierRow(g)}
          </button>
        ))}
        <button onClick={()=>onFinish(0)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#333",color:"var(--txt-dim,#666)",border:"2px solid #444",cursor:"pointer",borderRadius:3}}>Passer</button>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.96)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:18,padding:24,textAlign:"center",overflowY:"auto"}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(9px,1.4vw,12px)",color:"#D9BC5C"}}>{isGift ? "🎁 CADEAU SURPRISE!" : `🎉 NIVEAU ${level} ATTEINT!`}</div>
        <div style={{fontSize:64,lineHeight:1}}>{INFO.icon}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(12px,2vw,18px)",color:pt.accent,textShadow:`0 0 14px ${pt.glow}80`}}>{INFO.name}</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:"clamp(17px,2.6vw,21px)",color:"#fff",maxWidth:380,lineHeight:1.35}}>{INFO.how}</div>
        <div style={{fontFamily:"'VT323',monospace",fontSize:16,color:"#D9BC5C"}}>🏆 Paliers de récompense :</div>
        {minigameTierRow(type)}
        <button className="btn-press" onClick={()=>{SFX.click&&SFX.click();setCount(3);setPhase("countdown");}}
          style={{fontFamily:"'Press Start 2P',monospace",fontSize:"clamp(10px,1.6vw,14px)",padding:"16px 30px",background:pt.accent,color:"#0d0d0d",border:"4px solid #0d0d0d",borderRadius:6,cursor:"pointer",boxShadow:"5px 5px 0 #0d0d0d",marginTop:6}}>
          ✅ JE SUIS PRÊT!
        </button>
        {!forced && <button onClick={()=>{SFX.click&&SFX.click();setPhase("choice");}} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#1a1a1a",color:pt.accent,border:`2px solid ${pt.accent}`,cursor:"pointer",borderRadius:3}}>🔀 Changer de jeu</button>}
        <button onClick={()=>onFinish(0)} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,padding:"7px 14px",background:"#333",color:"var(--txt-dim,#666)",border:"2px solid #444",cursor:"pointer",borderRadius:3}}>Passer</button>
      </div>
    );
  }
  if (phase === "countdown") {
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.96)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"safe center",gap:12,padding:16,overflowY:"auto",boxSizing:"border-box"}}>
        <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:"var(--txt-pale,#aaa)"}}>{INFO.icon} {INFO.name}</div>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:count>0?"clamp(44px,12vw,90px)":"clamp(30px,9vw,64px)",color:count>0?"#fff":"#5CAD68",textShadow:`0 0 30px ${pt.glow}`,animation:"bounceIn 0.3s ease"}}>
          {count>0 ? count : "GO!"}
        </div>
      </div>
    );
  }
  if (type === "runner") return <MiniGameRunner pt={pt} level={level} onFinish={onFinish}/>;
  if (type === "pacman") return <MiniGamePacman pt={pt} level={level} onFinish={onFinish}/>;
  return <MiniGameWhack pt={pt} level={level} onFinish={onFinish}/>;
}
