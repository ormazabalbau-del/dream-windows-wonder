import { useEffect, useState } from "react";

// ================= BUSCAMINAS =================
type Cell = { mine: boolean; open: boolean; flag: boolean; n: number };
const LEVELS = { facil: { r: 9, c: 9, m: 10 }, medio: { r: 16, c: 16, m: 40 } } as const;

function emptyBoard(r: number, c: number): Cell[] {
  return Array.from({ length: r * c }, () => ({ mine: false, open: false, flag: false, n: 0 }));
}

export function Minesweeper() {
  const [level, setLevel] = useState<keyof typeof LEVELS>("facil");
  const { r, c, m } = LEVELS[level];
  const [board, setBoard] = useState<Cell[]>(() => emptyBoard(r, c));
  const [state, setState] = useState<"ready" | "play" | "lost" | "won">("ready");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (state !== "play") return;
    const t = window.setInterval(() => setSeconds((s) => Math.min(s + 1, 999)), 1000);
    return () => window.clearInterval(t);
  }, [state]);

  const reset = (lv = level) => {
    const L = LEVELS[lv];
    setLevel(lv);
    setBoard(emptyBoard(L.r, L.c));
    setState("ready");
    setSeconds(0);
  };

  const neighbors = (i: number) => {
    const y = Math.floor(i / c);
    const x = i % c;
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < c && ny < r) out.push(ny * c + nx);
    }
    return out;
  };

  const open = (i: number) => {
    if (state === "lost" || state === "won") return;
    let b = board.map((cell) => ({ ...cell }));
    if (state === "ready") {
      const safe = new Set([i, ...neighbors(i)]);
      let placed = 0;
      while (placed < m) {
        const k = Math.floor(Math.random() * r * c);
        if (safe.has(k) || b[k]!.mine) continue;
        b[k]!.mine = true;
        placed += 1;
      }
      b = b.map((cell, k) => ({ ...cell, n: neighbors(k).filter((nb) => b[nb]!.mine).length }));
      setState("play");
    }
    const cell = b[i]!;
    if (cell.flag || cell.open) return;
    if (cell.mine) {
      b.forEach((x) => { if (x.mine) x.open = true; });
      setBoard(b);
      setState("lost");
      return;
    }
    const stack = [i];
    while (stack.length) {
      const k = stack.pop()!;
      const cur = b[k]!;
      if (cur.open || cur.flag) continue;
      cur.open = true;
      if (cur.n === 0) stack.push(...neighbors(k));
    }
    setBoard(b);
    if (b.filter((x) => !x.open).length === m) setState("won");
  };

  const chord = (i: number) => {
    const cell = board[i]!;
    if (!cell.open || !cell.n) return;
    const nb = neighbors(i);
    if (nb.filter((k) => board[k]!.flag).length === cell.n) nb.forEach((k) => { if (!board[k]!.open && !board[k]!.flag) open(k); });
  };

  const flag = (i: number) => {
    if (state === "lost" || state === "won" || board[i]!.open) return;
    setBoard(board.map((cell, k) => (k === i ? { ...cell, flag: !cell.flag } : cell)));
  };

  const flags = board.filter((x) => x.flag).length;
  const face = state === "lost" ? "X(" : state === "won" ? "B)" : ":)";

  return (
    <div className="mines">
      <div className="mines-bar">
        <select value={level} onChange={(e) => reset(e.target.value as keyof typeof LEVELS)} aria-label="Dificultad">
          <option value="facil">Principiante</option>
          <option value="medio">Intermedio</option>
        </select>
      </div>
      <div className="mines-head">
        <span className="led">{String(m - flags).padStart(3, "0")}</span>
        <button type="button" className="win-button mines-face" onClick={() => reset()} aria-label="Reiniciar">{face}</button>
        <span className="led">{String(seconds).padStart(3, "0")}</span>
      </div>
      <div className="mines-grid" style={{ gridTemplateColumns: `repeat(${c}, 1.35rem)` }} onContextMenu={(e) => e.preventDefault()}>
        {board.map((cell, i) => (
          <button
            type="button"
            key={i}
            className={`mine-cell ${cell.open ? "open" : ""} ${cell.open && cell.mine ? "boom" : ""} n${cell.n}`}
            onClick={() => (cell.open ? chord(i) : open(i))}
            onContextMenu={(e) => { e.preventDefault(); flag(i); }}
            aria-label={`casilla ${i}`}
          >
            {cell.open ? (cell.mine ? "✹" : cell.n || "") : cell.flag ? "⚑" : ""}
          </button>
        ))}
      </div>
      <p className="mines-msg">{state === "won" ? "¡Ganaste! Recordaste algo." : state === "lost" ? "BOOM. Ese recuerdo explotó." : "Clic: abrir · clic derecho: bandera"}</p>
    </div>
  );
}

// ================= AJEDREZ =================
type Piece = { t: "p" | "n" | "b" | "r" | "q" | "k"; w: boolean } | null;
type Move = { from: number; to: number; promo?: boolean; ep?: boolean; castle?: "k" | "q" };
type Game = { b: Piece[]; white: boolean; ep: number; castle: { K: boolean; Q: boolean; k: boolean; q: boolean } };
const GLYPH: Record<string, string> = { pw: "♙", nw: "♘", bw: "♗", rw: "♖", qw: "♕", kw: "♔", pb: "♟", nb: "♞", bb: "♝", rb: "♜", qb: "♛", kb: "♚" };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function initial(): Game {
  const back: Array<NonNullable<Piece>["t"]> = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const b: Piece[] = Array(64).fill(null);
  for (let x = 0; x < 8; x += 1) {
    b[x] = { t: back[x]!, w: false };
    b[8 + x] = { t: "p", w: false };
    b[48 + x] = { t: "p", w: true };
    b[56 + x] = { t: back[x]!, w: true };
  }
  return { b, white: true, ep: -1, castle: { K: true, Q: true, k: true, q: true } };
}

function attacked(b: Piece[], sq: number, byWhite: boolean): boolean {
  const x = sq % 8;
  const y = Math.floor(sq / 8);
  const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx > 7 || yy > 7 ? undefined : b[yy * 8 + xx]);
  const pd = byWhite ? 1 : -1;
  for (const dx of [-1, 1]) { const p = at(x + dx, y + pd); if (p && p.w === byWhite && p.t === "p") return true; }
  for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) { const p = at(x + dx!, y + dy!); if (p && p.w === byWhite && p.t === "n") return true; }
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) { if (!dx && !dy) continue; const p = at(x + dx, y + dy); if (p && p.w === byWhite && p.t === "k") return true; }
  const rays: Array<[number, number, string]> = [[1, 0, "rq"], [-1, 0, "rq"], [0, 1, "rq"], [0, -1, "rq"], [1, 1, "bq"], [1, -1, "bq"], [-1, 1, "bq"], [-1, -1, "bq"]];
  for (const [dx, dy, ts] of rays) {
    let xx = x + dx; let yy = y + dy;
    while (xx >= 0 && yy >= 0 && xx < 8 && yy < 8) {
      const p = b[yy * 8 + xx];
      if (p) { if (p.w === byWhite && ts.includes(p.t)) return true; break; }
      xx += dx; yy += dy;
    }
  }
  return false;
}

function pseudo(g: Game): Move[] {
  const out: Move[] = [];
  const { b, white } = g;
  b.forEach((p, i) => {
    if (!p || p.w !== white) return;
    const x = i % 8; const y = Math.floor(i / 8);
    const add = (xx: number, yy: number, quiet = true, capture = true) => {
      if (xx < 0 || yy < 0 || xx > 7 || yy > 7) return false;
      const to = yy * 8 + xx; const t = b[to];
      if (t && t.w === white) return false;
      if (t && !capture) return false;
      if (!t && !quiet) return false;
      out.push({ from: i, to, promo: p.t === "p" && (yy === 0 || yy === 7) });
      return !t;
    };
    if (p.t === "p") {
      const d = white ? -1 : 1;
      if (add(x, y + d, true, false) && ((white && y === 6) || (!white && y === 1))) add(x, y + 2 * d, true, false);
      add(x - 1, y + d, false, true); add(x + 1, y + d, false, true);
      [-1, 1].forEach((dx) => { if ((y + d) * 8 + x + dx === g.ep && x + dx >= 0 && x + dx < 8) out.push({ from: i, to: g.ep, ep: true }); });
    } else if (p.t === "n") {
      [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([dx, dy]) => add(x + dx!, y + dy!));
    } else if (p.t === "k") {
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) if (dx || dy) add(x + dx, y + dy);
      const row = white ? 56 : 0;
      if (i === row + 4 && !attacked(b, i, !white)) {
        if ((white ? g.castle.K : g.castle.k) && !b[row + 5] && !b[row + 6] && !attacked(b, row + 5, !white)) out.push({ from: i, to: row + 6, castle: "k" });
        if ((white ? g.castle.Q : g.castle.q) && !b[row + 3] && !b[row + 2] && !b[row + 1] && !attacked(b, row + 3, !white)) out.push({ from: i, to: row + 2, castle: "q" });
      }
    } else {
      const dirs = p.t === "r" ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : p.t === "b" ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      dirs.forEach(([dx, dy]) => { let xx = x + dx!; let yy = y + dy!; while (add(xx, yy)) { xx += dx!; yy += dy!; } });
    }
  });
  return out;
}

function apply(g: Game, m: Move): Game {
  const b = [...g.b];
  const p = b[m.from]!;
  b[m.to] = m.promo ? { t: "q", w: p.w } : p;
  b[m.from] = null;
  if (m.ep) b[m.to + (p.w ? 8 : -8)] = null;
  if (m.castle) {
    const row = p.w ? 56 : 0;
    if (m.castle === "k") { b[row + 5] = b[row + 7]!; b[row + 7] = null; } else { b[row + 3] = b[row]!; b[row] = null; }
  }
  const castle = { ...g.castle };
  if (p.t === "k") { if (p.w) { castle.K = false; castle.Q = false; } else { castle.k = false; castle.q = false; } }
  [[63, "K"], [56, "Q"], [7, "k"], [0, "q"]].forEach(([sq, key]) => { if (m.from === sq || m.to === sq) castle[key as "K"] = false; });
  const ep = p.t === "p" && Math.abs(m.to - m.from) === 16 ? (m.to + m.from) / 2 : -1;
  return { b, white: !g.white, ep, castle };
}

function legal(g: Game): Move[] {
  return pseudo(g).filter((m) => {
    const n = apply(g, m);
    const k = n.b.findIndex((p) => p && p.t === "k" && p.w === g.white);
    return !attacked(n.b, k, !g.white);
  });
}

function evaluate(b: Piece[]) {
  return b.reduce((s, p, i) => (p ? s + (p.w ? -1 : 1) * (VAL[p.t] + (p.t === "p" ? (p.w ? 6 - Math.floor(i / 8) : Math.floor(i / 8) - 1) * 0.05 : 0)) : s), 0);
}

function aiMove(g: Game): Move | null {
  const moves = legal(g);
  if (!moves.length) return null;
  let best: Move[] = [];
  let bestScore = -Infinity;
  for (const m of moves) {
    const n = apply(g, m);
    const replies = legal(n);
    let worst = Infinity;
    if (!replies.length) worst = attacked(n.b, n.b.findIndex((p) => p && p.t === "k" && p.w), false) ? 1000 : 0;
    for (const r of replies) worst = Math.min(worst, evaluate(apply(n, r).b));
    if (worst > bestScore + 0.01) { bestScore = worst; best = [m]; } else if (Math.abs(worst - bestScore) <= 0.01) best.push(m);
  }
  return best[Math.floor(Math.random() * best.length)] ?? null;
}

export function Chess() {
  const [game, setGame] = useState<Game>(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [vsAi, setVsAi] = useState(true);
  const [last, setLast] = useState<Move | null>(null);
  const moves = legal(game);
  const kingSq = game.b.findIndex((p) => p && p.t === "k" && p.w === game.white);
  const inCheck = attacked(game.b, kingSq, !game.white);
  const over = moves.length === 0;

  useEffect(() => {
    if (!vsAi || game.white || over) return;
    const t = window.setTimeout(() => {
      const m = aiMove(game);
      if (m) { setGame(apply(game, m)); setLast(m); }
    }, 350);
    return () => window.clearTimeout(t);
  }, [game, vsAi, over]);

  const click = (i: number) => {
    if (over || (vsAi && !game.white)) return;
    if (sel !== null) {
      const m = moves.find((mv) => mv.from === sel && mv.to === i);
      if (m) { setGame(apply(game, m)); setLast(m); setSel(null); return; }
    }
    const p = game.b[i];
    setSel(p && p.w === game.white ? i : null);
  };

  const targets = new Set(sel !== null ? moves.filter((m) => m.from === sel).map((m) => m.to) : []);
  const status = over ? (inCheck ? `Jaque mate — ganan ${game.white ? "negras" : "blancas"}` : "Tablas por ahogado") : `${inCheck ? "¡JAQUE! " : ""}Turno: ${game.white ? "blancas" : "negras"}`;

  return (
    <div className="chess">
      <div className="chess-bar">
        <button type="button" className="win-button" onClick={() => { setGame(initial()); setSel(null); setLast(null); }}>Nueva partida</button>
        <label><input type="checkbox" checked={vsAi} onChange={(e) => setVsAi(e.target.checked)} /> vs CPU</label>
      </div>
      <div className="chess-board">
        {game.b.map((p, i) => {
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          return (
            <button type="button" key={i} onClick={() => click(i)} aria-label={`casilla ${"abcdefgh"[i % 8]}${8 - Math.floor(i / 8)}`}
              className={`chess-sq ${dark ? "dark" : ""} ${sel === i ? "sel" : ""} ${targets.has(i) ? "target" : ""} ${last && (last.from === i || last.to === i) ? "last" : ""} ${inCheck && i === kingSq ? "check" : ""}`}>
              {p ? GLYPH[p.t + (p.w ? "w" : "b")] : ""}
            </button>
          );
        })}
      </div>
      <div className="win-status"><span>{status}</span><span>{moves.length} jugadas</span></div>
    </div>
  );
}
