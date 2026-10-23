
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

const WIDTH = 360;
const HEIGHT = 520;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function createGame() {
  return {
    player: {
      x: WIDTH / 2,
      y: HEIGHT - 65,
      hp: 100,
      cooldown: 0,
    },
    bullets: [],
    enemyBullets: [],
    enemies: [],
    stars: Array.from({ length: 65 }, () => ({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      speed: 15 + Math.random() * 45,
    })),
    score: 0,
    wave: 1,
    spawnTimer: 0,
    elapsed: 0,
    over: false,
    aiState: "PATROL",
    message: "Scanning for the player",
  };
}

function chooseAI(enemy, player, difficulty) {
  const distance = Math.hypot(
    player.x - enemy.x,
    player.y - enemy.y
  );

  const healthRatio = enemy.hp / enemy.maxHp;

  if (healthRatio < 0.3 && distance < 190) {
    return "EVADE";
  }

  if (distance < (difficulty === "Hard" ? 245 : 175)) {
    return "ATTACK";
  }

  return "PATROL";
}

function drawShip(ctx, x, y, color, enemy = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();

  if (enemy) {
    ctx.moveTo(0, 17);
    ctx.lineTo(-15, -10);
    ctx.lineTo(0, -4);
    ctx.lineTo(15, -10);
  } else {
    ctx.moveTo(0, -18);
    ctx.lineTo(-15, 13);
    ctx.lineTo(0, 7);
    ctx.lineTo(15, 13);
  }

  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-3, -3, 6, 7);
  ctx.restore();
}

export default function App() {
  const canvasRef = useRef(null);
  const gameRef = useRef(createGame());
  const keysRef = useRef({});
  const dragRef = useRef(false);
  const lastDragShotRef = useRef(0);

  const [running, setRunning] = useState(false);
  const [difficulty, setDifficulty] = useState("Normal");
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [wave, setWave] = useState(1);
  const [ai, setAI] = useState("PATROL");
  const [message, setMessage] = useState("Ready for launch");
  const [showTheory, setShowTheory] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const startGame = useCallback(() => {
    gameRef.current = createGame();
    keysRef.current = {};
    dragRef.current = false;
    lastDragShotRef.current = 0;

    setScore(0);
    setHealth(100);
    setWave(1);
    setAI("PATROL");
    setMessage("Scanning for the player");
    setGameOver(false);
    setRunning(true);
  }, []);

  // Fire one bullet when the fire button is tapped.
  const fireBullet = useCallback(() => {
    const g = gameRef.current;

    if (!running || g.over || g.player.cooldown > 0) {
      return;
    }

    g.bullets.push({
      x: g.player.x,
      y: g.player.y - 18,
      speed: 370,
    });

    g.player.cooldown = 0.24;
  }, [running]);

  // Convert finger or mouse position to game coordinates.
  const movePlayerToPointer = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    const x = (event.clientX - rect.left) * (WIDTH / rect.width);
    const y = (event.clientY - rect.top) * (HEIGHT / rect.height);

    const player = gameRef.current.player;

    player.x = clamp(x, 18, WIDTH - 18);
    player.y = clamp(y, 28, HEIGHT - 25);
  }, []);

  // Desktop keyboard controls.
  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();

      if (
        ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(
          key
        )
      ) {
        event.preventDefault();
      }

      keysRef.current[key] = true;
    };

    const onKeyUp = (event) => {
      keysRef.current[event.key.toLowerCase()] = false;
    };

    const onBlur = () => {
      keysRef.current = {};
      dragRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Main game loop.
  useEffect(() => {
    if (!running) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf;
    let previous = performance.now();
    let lastUI = 0;

    function frame(now) {
      const dt = Math.min((now - previous) / 1000, 0.04);
      previous = now;

      const g = gameRef.current;

      if (!g.over) {
        g.elapsed += dt;

        g.player.cooldown = Math.max(
          0,
          g.player.cooldown - dt
        );

        const keys = keysRef.current;

        let dx = 0;
        let dy = 0;

        if (keys.arrowleft || keys.a) dx--;
        if (keys.arrowright || keys.d) dx++;
        if (keys.arrowup || keys.w) dy--;
        if (keys.arrowdown || keys.s) dy++;

        g.player.x = clamp(
          g.player.x + dx * 210 * dt,
          18,
          WIDTH - 18
        );

        g.player.y = clamp(
          g.player.y + dy * 210 * dt,
          28,
          HEIGHT - 25
        );

        // Hold Space or Enter to fire continuously on desktop.
        if (
          (keys[" "] || keys.enter) &&
          g.player.cooldown <= 0
        ) {
          g.bullets.push({
            x: g.player.x,
            y: g.player.y - 18,
            speed: 370,
          });

          g.player.cooldown = 0.24;
        }

        // Spawn enemies.
        g.spawnTimer -= dt;

        if (g.spawnTimer <= 0) {
          const count = Math.min(
            1 + Math.floor(g.wave / 3),
            4
          );

          for (let i = 0; i < count; i++) {
            const maxHp =
              difficulty === "Hard"
                ? 3
                : difficulty === "Easy"
                  ? 1
                  : 2;

            g.enemies.push({
              x: 28 + Math.random() * (WIDTH - 56),
              y: -20 - i * 24,
              hp: maxHp,
              maxHp,
              cooldown: 0.4 + Math.random(),
              speed: 35 + g.wave * 2,
            });
          }

          g.spawnTimer = Math.max(
            0.6,
            1.7 - g.wave * 0.07
          );
        }

        // Enemy AI: PATROL, ATTACK, or EVADE.
        for (const e of g.enemies) {
          e.cooldown -= dt;

          const state = chooseAI(e, g.player, difficulty);

          if (state === "PATROL") {
            e.y += e.speed * dt;
          } else if (state === "ATTACK") {
            e.x += Math.sign(g.player.x - e.x) * 55 * dt;
            e.y += e.speed * 0.45 * dt;

            if (e.cooldown <= 0) {
              g.enemyBullets.push({
                x: e.x,
                y: e.y + 12,
                speed: 190,
              });

              e.cooldown =
                difficulty === "Hard" ? 0.65 : 1.1;
            }
          } else {
            e.x +=
              (e.x < g.player.x ? -1 : 1) * 100 * dt;

            e.y += e.speed * 0.3 * dt;
          }

          e.x = clamp(e.x, 18, WIDTH - 18);

          if (
            Math.hypot(
              e.x - g.player.x,
              e.y - g.player.y
            ) < 24
          ) {
            g.player.hp = Math.max(
              0,
              g.player.hp - 20 * dt
            );
          }
        }

        // Move projectiles.
        for (const b of g.bullets) {
          b.y -= b.speed * dt;
        }

        for (const b of g.enemyBullets) {
          b.y += b.speed * dt;
        }

        g.bullets = g.bullets.filter((b) => b.y > -10);

        g.enemyBullets = g.enemyBullets.filter(
          (b) => b.y < HEIGHT + 10
        );

        // Player projectile collisions.
        for (const b of g.bullets) {
          for (const e of g.enemies) {
            if (
              !e.dead &&
              Math.hypot(b.x - e.x, b.y - e.y) < 20
            ) {
              e.hp--;
              b.y = -100;

              if (e.hp <= 0) {
                e.dead = true;
                g.score += 10;
              }

              break;
            }
          }
        }

        // Enemy projectile collisions.
        for (const b of g.enemyBullets) {
          if (
            Math.hypot(
              b.x - g.player.x,
              b.y - g.player.y
            ) < 18
          ) {
            g.player.hp = Math.max(
              0,
              g.player.hp - 12
            );

            b.y = HEIGHT + 100;
          }
        }

        g.enemies = g.enemies.filter(
          (e) => !e.dead && e.y < HEIGHT + 25
        );

        g.wave = 1 + Math.floor(g.score / 100);

        // Monitor the nearest enemy's AI state.
        const nearest = g.enemies.reduce(
          (best, e) => {
            const d = Math.hypot(
              e.x - g.player.x,
              e.y - g.player.y
            );

            return d < best.d
              ? {
                  d,
                  state: chooseAI(
                    e,
                    g.player,
                    difficulty
                  ),
                }
              : best;
          },
          { d: Infinity, state: "PATROL" }
        );

        g.aiState = nearest.state;

        g.message = {
          PATROL: "No immediate threat: moving into position.",
          ATTACK: "Player detected: aligning and firing.",
          EVADE: "Critical enemy health: evasive maneuver.",
        }[g.aiState];

        if (g.player.hp <= 0) {
          g.over = true;
          setGameOver(true);
          setRunning(false);
        }
      }

      // Draw background.
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#070d20";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Draw stars.
      for (const s of g.stars) {
        s.y += s.speed * dt;

        if (s.y > HEIGHT) {
          s.y = 0;
          s.x = Math.random() * WIDTH;
        }

        ctx.fillStyle = "#8297c9";
        ctx.fillRect(s.x, s.y, 2, 2);
      }

      // Draw player projectiles.
      for (const b of g.bullets) {
        ctx.fillStyle = "#65f4ff";
        ctx.fillRect(b.x - 2, b.y - 7, 4, 12);
      }

      // Draw enemy projectiles.
      for (const b of g.enemyBullets) {
        ctx.fillStyle = "#ff647c";
        ctx.fillRect(b.x - 3, b.y - 4, 6, 9);
      }

      // Draw enemies and health bars.
      for (const e of g.enemies) {
        drawShip(ctx, e.x, e.y, "#ff527c", true);

        ctx.fillStyle = "#27334d";
        ctx.fillRect(e.x - 14, e.y - 20, 28, 3);

        ctx.fillStyle = "#ff647c";
        ctx.fillRect(
          e.x - 14,
          e.y - 20,
          28 * (e.hp / e.maxHp),
          3
        );
      }

      // Draw player.
      drawShip(ctx, g.player.x, g.player.y, "#60f0d0");

      // Game-over overlay.
      if (g.over) {
        ctx.fillStyle = "rgba(3, 8, 23, 0.78)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 28px system-ui";
        ctx.fillText(
          "GAME OVER",
          WIDTH / 2,
          HEIGHT / 2
        );

        ctx.font = "15px system-ui";
        ctx.fillText(
          "Restart to play again",
          WIDTH / 2,
          HEIGHT / 2 + 28
        );
      }

      // Update React statistics.
      if (now - lastUI > 100) {
        setScore(g.score);
        setHealth(Math.ceil(g.player.hp));
        setWave(g.wave);
        setAI(g.aiState);
        setMessage(g.message);
        lastUI = now;
      }

      if (!g.over) {
        raf = requestAnimationFrame(frame);
      }
    }

    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [running, difficulty]);

  // Start dragging and immediately fire.
  const handleCanvasPointerDown = (event) => {
    event.preventDefault();

    if (!running || gameRef.current.over) return;

    dragRef.current = true;
    lastDragShotRef.current = 0;

    try {
      event.currentTarget.setPointerCapture(
        event.pointerId
      );
    } catch {
      // Pointer capture is optional.
    }

    movePlayerToPointer(event);

    // Fire immediately when the drag begins.
    const g = gameRef.current;

    if (!g.over && g.player.cooldown <= 0) {
      g.bullets.push({
        x: g.player.x,
        y: g.player.y - 18,
        speed: 370,
      });

      g.player.cooldown = 0.24;
      lastDragShotRef.current = performance.now();
    }
  };

  // While dragging, move and continuously fire.
  const handleCanvasPointerMove = (event) => {
    if (!dragRef.current || !running) return;

    event.preventDefault();
    movePlayerToPointer(event);

    const g = gameRef.current;
    const now = performance.now();

    // Match the firing interval to the projectile cooldown.
    if (
      !g.over &&
      now - lastDragShotRef.current >= 240
    ) {
      g.bullets.push({
        x: g.player.x,
        y: g.player.y - 18,
        speed: 370,
      });

      lastDragShotRef.current = now;
      g.player.cooldown = 0.24;
    }
  };

  const stopDragging = () => {
    dragRef.current = false;
  };

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand-icon">✦</div>

        <div className="brand-copy">
          <p className="eyebrow">AISC EXPERIMENT 11</p>
          <h1>AI SPACE BATTLE</h1>
        </div>

        <span className="live-pill">
          <span className="live-dot" />
          LIVE AI
        </span>
      </header>

      <section className="intro">
        <p className="intro-label">DEFEND THE GALAXY</p>
        <h2>Outsmart the enemy.</h2>
        <span>
          Survive the attack. Observe how the AI decides.
        </span>
      </section>

      <section className="stats" aria-label="Game statistics">
        <div className="stat">
          <span>SCORE</span>
          <strong>{score}</strong>
        </div>

        <div className="stat">
          <span>HULL</span>
          <strong className={health <= 30 ? "danger-text" : ""}>
            {health}%
          </strong>
        </div>

        <div className="stat">
          <span>WAVE</span>
          <strong>{wave}</strong>
        </div>
      </section>

      <section className="game-card">
        <div className="game-heading">
          <span>COMBAT ZONE</span>

          <span className={`ai-state ${ai.toLowerCase()}`}>
            {ai}
          </span>
        </div>

        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            className="game-canvas"
            aria-label="Touch and drag to move your spaceship and fire."
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onLostPointerCapture={stopDragging}
          />

          {!running && !gameOver && (
            <div className="canvas-overlay">
              <div className="overlay-icon">✦</div>
              <strong>Ready for launch?</strong>
              <span>Start the game to enter combat.</span>
            </div>
          )}
        </div>

        <p className="touch-hint">
          ☝ Touch and drag to move your ship and fire automatically!
        </p>

        <div className="control-row">
          <button
            type="button"
            className="fire-btn"
            onClick={fireBullet}
            aria-label="Tap to fire one bullet"
            disabled={!running || gameOver}
          >
            ⚡ TAP TO FIRE
          </button>
        </div>

        <p className="desktop-hint">
          Desktop: WASD / arrow keys to move · Hold Space to fire
        </p>

        <div className="game-actions">
          <label className="difficulty-control">
            <span>AI difficulty</span>

            <select
              value={difficulty}
              onChange={(event) =>
                setDifficulty(event.target.value)
              }
            >
              <option>Easy</option>
              <option>Normal</option>
              <option>Hard</option>
            </select>
          </label>

          <button
            type="button"
            className="primary-btn"
            onClick={startGame}
          >
            {running
              ? "Restart Game"
              : gameOver
                ? "Play Again"
                : "Start Game"}
          </button>
        </div>
      </section>

      <section className="ai-card">
        <div className="section-label">
          AI DECISION MONITOR
        </div>

        <div className="decision">
          <div className={`state-orb ${ai.toLowerCase()}`} />

          <div className="decision-copy">
            <strong>{ai}</strong>
            <p>{message}</p>
          </div>
        </div>

        <div className="decision-rules">
          <p>
            <b>ATTACK</b> — player is within detection range.
          </p>

          <p>
            <b>EVADE</b> — enemy health is low and the player is nearby.
          </p>

          <p>
            <b>PATROL</b> — player is outside the attack range.
          </p>
        </div>
      </section>

      <section className="theory-card">
        <button
          type="button"
          className="theory-toggle"
          onClick={() =>
            setShowTheory((current) => !current)
          }
          aria-expanded={showTheory}
        >
          <span>🧠 How the AI works</span>
          <span>{showTheory ? "−" : "+"}</span>
        </button>

        {showTheory && (
          <div className="theory-content">
            <h3>Finite-State Machine (FSM)</h3>

            <p>
              The enemy agent observes the player's position and
              its own health, then selects one of three states.
            </p>

            <ol>
              <li>
                <b>PATROL:</b> move forward while searching for the player.
              </li>

              <li>
                <b>ATTACK:</b> align with the player and launch projectiles.
              </li>

              <li>
                <b>EVADE:</b> move away when health is low and danger is close.
              </li>
            </ol>

            <p>
              <b>Perception:</b> distance and enemy health.
            </p>

            <p>
              <b>Action:</b> movement and firing.
            </p>

            <p>
              <b>Objective:</b> survive and engage the player using
              condition-based decisions.
            </p>
          </div>
        )}
      </section>

      <footer className="app-footer">
        AISC · Experiment 11 · Intelligent Game Agent
      </footer>
    </main>
  );
}


