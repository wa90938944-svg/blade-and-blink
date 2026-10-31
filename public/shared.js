// Game rules shared by the server (authoritative online matches) and the
// browser (local bot / 2-player / endless modes), so every mode plays identically.
(function (root) {
  var W = 640, H = 400, R = 13, PAR = 0.35, A0 = 0.08, A1 = 0.22;
  var FFA_SCALE = 3;  // arena is this many times wider and taller than the original 1800x1200
  var FFA_W = 1800 * FFA_SCALE, FFA_H = 1200 * FFA_SCALE;
  var REACH = 56, BLINK_D = 120, BLINK_REC = 0.3, CHARGE_T = 3.5, SPAWN_T = 5, SWING_CD = 0.2, BLINK_WIND = 0.1;
  var SHRINE_R = 36, EXTRACT_TIME = 1.5;

  // ---------- MASTERTETANUS boss: every number you might want to tune lives here ----------
  var MT = {
    HEARTS: 50,                    // boss hearts (one life)
    SPEED: 330,                    // "superspeed" (normal player = 200)
    REACH: REACH + 10,
    CHARGE_T: 1.2,                 // seconds to regain one blink charge (players: 3.5)
    MAP_SCALE: 1.5,                // arena size compared with the normal 640x400
    PLAYER_HEARTS: { 1: 25, 2: 35, 3: 20, 4: 12 }, // hearts per player, by party size (1 = owner solo test only)
    MIN_PLAYERS: 2,                // a party needs at least this many players to challenge the boss
    CHEAT_HEARTS: 12,              // hearts an admin (not the owner) loses for opening the admin panel mid-fight
    GUARD_EVERY: 5,                // seconds between bodyguard waves
    GUARD_COUNT: 3,                // veteran bodyguards per wave
    GUARD_MAX: 15,                 // safety valve: most guards alive at once (keeps the server fast)
    SPLIT_MIN: 25, SPLIT_MAX: 50,  // seconds between splits (timer restarts when the clone ends)
    SPLIT_LIFE: 10,                // seconds the clone lasts
    REACT: 0.06,                   // boss reaction delay in seconds (0 = perfect, unfair)
    PARRY_CHANCE: 0.82,            // chance the boss parries a swing it sees coming
    INTRO_READY: 2.2               // countdown after pressing Challenge
  };

  var TIERS_EXTRA = {
    mtboss: { lives: 1, maxHearts: MT.HEARTS, spd: MT.SPEED, reach: MT.REACH, scale: 1.0, chargeT: MT.CHARGE_T }
  };

  var TIERS = {
    player:  { lives: 1, maxHearts: 1, spd: 200, reach: REACH, scale: 1.0 },
    novice:  { lives: 4, maxHearts: 1, spd: 185, reach: REACH, scale: 1.0 },
    veteran: { lives: 5, maxHearts: 1, spd: 196, reach: REACH, scale: 1.0 },
    apex:    { lives: 5, maxHearts: 2, spd: 204, reach: REACH + 5, scale: 1.0 },
    tetanus: { lives: 3, maxHearts: 5, spd: 175, reach: REACH + 36, scale: 2.2 }
  };
  TIERS.mtboss = TIERS_EXTRA.mtboss;

  function mk(i, x, fa, y, team, tier) {
    tier = tier || 'player';
    var cfg = TIERS[tier] || TIERS.player;
    var scale = cfg.scale || 1.0;
    return {
      i: i, x: x, y: y === undefined ? H / 2 : y, fa: fa, ch: 3, rc: 0, st: 0, sw: -1, hs: [],
      pa: -1, bc: 0, sc: 0, bw: 0, bdx: 0, bdy: 0, dead: false, ix: 0, iy: 0,
      spd: cfg.spd, team: team !== undefined ? team : i, extract: 0, points: 0,
      kills: 0, parries: 0, blinks: 0, god: false, noCd: false, fast: false, isMinion: false,
      shield: false, combatTimer: 0, isLeader: false, extracted: false,
      ownerIdx: -1, at: 0, ax: 0, ay: 0,
      tier: tier, lives: cfg.lives, maxLives: cfg.lives, hearts: cfg.maxHearts, maxHearts: cfg.maxHearts,
      reach: cfg.reach, scale: scale, r: R * scale, unparryable: false,
      bossTelegraph: 0, bossAction: null, whiffedParry: false,
      chargeT: cfg.chargeT || CHARGE_T, isClone: false, cloneOf: -1, life: 0, isBoss: false
    };
  }

  function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function norm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function segd(ax, ay, bx, by, px, py) {
    var vx = bx - ax, vy = by - ay, l = vx * vx + vy * vy;
    var t = l ? cl(((px - ax) * vx + (py - ay) * vy) / l, 0, 1) : 0;
    return Math.hypot(ax + vx * t - px, ay + vy * t - py);
  }
  // A stunned fighter cannot parry
  function parrying(p) { return p.st <= 0 && p.pa >= 0 && p.pa < PAR; }

  function reset(m) {
    if (m.mode === '2v2') {
      m.p = [
        mk(0, 90, 0, H / 3, 0, 'player'),
        mk(1, 90, 0, (2 * H) / 3, 0, 'player'),
        mk(2, W - 90, Math.PI, H / 3, 1, 'player'),
        mk(3, W - 90, Math.PI, (2 * H) / 3, 1, 'player')
      ];
    } else {
      var p0 = mk(0, 90, 0, H / 2, 0, 'player');
      if (m.botTier === 'apex' || m.botTier === 'tetanus') {
        p0.lives = 5;
        p0.maxLives = 5;
      }
      var p1 = mk(1, W - 90, Math.PI, H / 2, 1, m.botTier || 'player');
      m.p = [p0, p1];
    }
    m.phase = 'ready'; m.t = 1.3; m.winner = -1;
  }

  function create(win, mode, botTier) {
    var isBotMatch = botTier && botTier !== 'player';
    var m = {
      win: isBotMatch ? 1 : (win || 4),
      score: [0, 0],
      round: 1,
      mode: mode || '1v1',
      boundW: W,
      boundH: H,
      botTier: botTier || 'player'
    };
    reset(m);
    return m;
  }

  function create2v2(win) {
    return create(win || 5, '2v2', 'player');
  }

  function createEndless() {
    var m = { endless: true, win: 999, score: [0, 0], round: 1, kills: 0, time: 0, sp: 0, spawned: 0, boundW: W, boundH: H };
    m.p = [mk(0, W / 2, 0, H / 2, 0, 'player')];
    m.phase = 'ready'; m.t = 1.3; m.winner = -1;
    return m;
  }

  function createFFA() {
    return {
      ffa: true, mode: 'ffa', p: [], shrines: [],
      phase: 'fight', round: 1, score: [0, 0], win: 9999,
      boundW: FFA_W, boundH: FFA_H, shrineTimer: 10, leaderIdx: -1
    };
  }

  function spawnBodyguard(m, ownerIdx, ev) {
    var owner = m.p[ownerIdx];
    if (!owner) return null;
    var bW = m.boundW || W, bH = m.boundH || H;
    var idx = m.p.length;
    var a = Math.random() * 6.283;
    var x = cl(owner.x + Math.cos(a) * 40, R + 5, bW - R - 5);
    var y = cl(owner.y + Math.sin(a) * 40, R + 5, bH - R - 5);
    var bg = mk(idx, x, owner.fa, y, owner.team, 'player');
    bg.isMinion = true;
    bg.ownerIdx = ownerIdx;
    bg.spd = 195;
    m.p.push(bg);
    if (ev) ev.push({ t: 'spawn_minion', i: idx, x: x, y: y, owner: ownerIdx });
    return bg;
  }

  function foes(m, i) {
    var self = m.p[i];
    if (!self) return [];
    if (m.boss) {
      return m.p.filter(function (q) { return q && !q.dead && q.team !== self.team; });
    }
    if (self.isMinion) {
      return m.p.filter(function (q) {
        return q && !q.dead && q.i !== self.ownerIdx && !q.isMinion;
      });
    }
    if (m.endless) {
      if (i === 0) return m.p.filter(function (q, j) { return q && j > 0 && !q.dead && !q.isMinion; });
      return (m.p[0] && !m.p[0].dead) ? [m.p[0]] : [];
    }
    if (m.ffa) {
      return m.p.filter(function (q) {
        if (!q || q.i === i || q.dead) return false;
        if (q.isMinion && q.ownerIdx === i) return false;
        return true;
      });
    }
    if (m.mode === '2v2') {
      return m.p.filter(function (q) {
        if (!q || q.dead) return false;
        if (q.isMinion && q.ownerIdx === i) return false;
        return q.team !== self.team;
      });
    }
    return m.p.filter(function (q) {
      if (!q || q.dead) return false;
      if (q.isMinion && q.ownerIdx === i) return false;
      return q.i !== i;
    });
  }

  function applyDamage(target, ev, m) {
    if (target.isClone && m && m.p[target.cloneOf] && !m.p[target.cloneOf].dead) {
      var real = m.p[target.cloneOf];
      real.hearts--;
      target.hearts = real.hearts;
      ev.push({ t: 'hurt', i: target.i, x: target.x, y: target.y, hearts: real.hearts, lives: real.lives });
      target.st = Math.max(target.st, 0.35);
      target.sw = -1; target.pa = -1; target.bw = 0;
      if (real.hearts <= 0) { real.lives = 0; real.dead = true; }
      return;
    }
    target.hearts--;
    ev.push({ t: 'hurt', i: target.i, x: target.x, y: target.y, hearts: target.hearts, lives: target.lives });
    if (target.hearts <= 0) {
      target.lives--;
      if (target.lives <= 0) {
        target.dead = true;
      } else {
        target.hearts = target.maxHearts;
        target.st = Math.max(target.st, 0.45);
        target.sw = -1;
        target.pa = -1;
        target.bw = 0;
        ev.push({ t: 'lose_life', i: target.i, x: target.x, y: target.y, lives: target.lives });
      }
    } else {
      target.st = Math.max(target.st, 0.35);
      target.sw = -1;
      target.pa = -1;
      target.bw = 0;
    }
  }

  function resolve(a, d, ev, blink, m) {
    if (d.god) {
      ev.push({ t: 'god_block', x: d.x, y: d.y });
      return;
    }

    d.combatTimer = 10;
    a.combatTimer = 10;

    if (d.shield && !a.unparryable) {
      d.shield = false;
      a.st = 1.25;
      a.sw = -1; a.pa = -1; a.bw = 0;
      
      var nx = a.x - d.x, ny = a.y - d.y;
      var nd = Math.hypot(nx, ny) || 1;
      a.x = cl(a.x + (nx/nd)*90, a.r, FFA_W); 
      a.y = cl(a.y + (ny/nd)*90, a.r, FFA_H);
      ev.push({ t: 'shield_break', i: d.i, x: d.x, y: d.y });
      return;
    }

    if (parrying(d) && !a.unparryable) {
      d.whiffedParry = false;
      d.pa = -1;
      d.sc = 0;
      d.bc = 0;
      d.st = 0;
      if (blink) {
        if (!a.god) applyDamage(a, ev, m);
        d.points = (d.points || 0) + 25;
        d.blinks = (d.blinks || 0) + 1;
        ev.push({ t: 'intercept', by: d.i, victim: a.i, x: d.x, y: d.y });
      } else {
        if (!a.god) {
          a.st = 1.35;
          a.sw = -1;
          a.pa = -1;
          a.bw = 0;
        }
        d.points = (d.points || 0) + 15;
        d.parries = (d.parries || 0) + 1;
      }
      ev.push({ t: 'parry', x: d.x, y: d.y, b: !!blink, by: d.i });
    } else {
      applyDamage(d, ev, m);
      a.points = (a.points || 0) + 35;
      if (d.dead) {
        a.kills = (a.kills || 0) + 1;
        a.combatTimer = 0; 
        ev.push({ t: 'slain', killer: a.i, victim: d.i });
      }
    }
  }

  function act(m, i, k, ev) {
    var p = m.p[i];
    if (!p || p.dead || (!p.noCd && p.st > 0)) return;
    var canCancelParry = p.pa < 0 || p.pa < PAR;
    if (k === 'sw' && (p.noCd || (p.sw < 0 && canCancelParry && p.bc <= 0 && p.sc <= 0 && p.bw <= 0))) {
      p.pa = -1; p.whiffedParry = false;
      p.sw = 0; p.hs = []; p.extract = 0;
      ev.push({ t: 'swing', i: i, x: p.x, y: p.y, scale: p.scale });
    }
    else if (k === 'pa' && (p.noCd || (p.sw < 0 && p.pa < 0 && p.bc <= 0 && p.bw <= 0))) {
      p.pa = 0; p.extract = 0; p.whiffedParry = true;
      ev.push({ t: 'raise', i: i, x: p.x, y: p.y });
    }
    else if (k === 'bl' && (p.noCd || (p.ch > 0 && p.bc <= 0 && canCancelParry && p.sw < 0 && p.bw <= 0))) {
      p.pa = -1; p.whiffedParry = false;
      var dx = p.ix, dy = p.iy;
      if (!dx && !dy) { dx = Math.cos(p.fa); dy = Math.sin(p.fa); }
      var l = Math.hypot(dx, dy) || 1;
      p.bdx = dx / l; p.bdy = dy / l; p.fa = Math.atan2(p.bdy, p.bdx);
      p.bw = BLINK_WIND;
      if (!p.noCd) p.ch--;
      p.extract = 0;
      ev.push({ t: 'shine', i: i, x: p.x, y: p.y });
    }
  }

  function dash(m, i, ev) {
    var p = m.p[i];
    if (!p) return;
    var bW = m.boundW || W, bH = m.boundH || H;
    var dist = p.tier === 'tetanus' ? BLINK_D * 1.45 : (p.tier === 'mtboss' ? BLINK_D * 1.25 : BLINK_D);
    var nx = cl(p.x + p.bdx * dist, p.r, bW - p.r), ny = cl(p.y + p.bdy * dist, p.r, bH - p.r);
    ev.push({ t: 'blink', i: i, x1: p.x, y1: p.y, x2: nx, y2: ny, unparryable: !!p.unparryable });
    var fs = foes(m, i);
    for (var j = 0; j < fs.length && !p.dead; j++) {
      var f = fs[j];
      if (!f.dead && segd(p.x, p.y, nx, ny, f.x, f.y) < p.r + f.r - 5) {
        resolve(p, f, ev, true, m);
      }
    }
    p.x = nx; p.y = ny; p.bc = p.noCd ? 0 : BLINK_REC; p.sw = -1;
    p.unparryable = false;
  }

  // --- AI ROUTINES ---

  function bodyguardAI(m, b, dt) {
    b.at -= dt;
    var enemies = foes(m, b.i);
    var o = {};
    if (!enemies.length) return { x: 0, y: 0 };

    var target = null, minDist = 999999;
    for (var k = 0; k < enemies.length; k++) {
      var d = Math.hypot(enemies[k].x - b.x, enemies[k].y - b.y);
      if (d < minDist) { minDist = d; target = enemies[k]; }
    }
    if (!target) return { x: 0, y: 0 };

    if (b.at <= 0) {
      b.at = 0.08 + Math.random() * 0.1;
      var dx = target.x - b.x, dy = target.y - b.y, dist = Math.hypot(dx, dy) || 1;
      var ux = dx / dist, uy = dy / dist;
      var face = Math.cos(b.fa) * ux + Math.sin(b.fa) * uy;
      b.ax = ux; b.ay = uy;

      if (dist > 150 && b.ch > 0 && Math.random() < 0.25) {
        o.bl = true;
      } else if (dist < b.r + b.reach - 2) {
        if (target.sw >= 0 && target.sw < 0.2 && Math.random() < 0.4) o.pa = true;
        else if (face > 0.65 || target.st > 0) o.sw = true;
      }
    }
    o.x = b.ax; o.y = b.ay;
    return o;
  }

  function botAI(m, b, dt) {
    var a = m.p[0];
    b.at -= dt;
    var o = {};
    if (b.at <= 0 && a && !a.dead) {
      b.at = 0.12 + Math.random() * 0.12;
      var dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      var face = Math.cos(b.fa) * ux + Math.sin(b.fa) * uy;
      b.ax = ux; b.ay = uy;
      if (a.sw >= 0 && a.sw < 0.2 && d < R + REACH + 14 && Math.random() < 0.35) o.pa = true;
      else if (d < R + REACH - 4) { if ((face > 0.7 && Math.random() < 0.45) || a.st > 0) o.sw = true; }
      else if (d < R + REACH + 60) {
        var s = Math.random() < 0.5 ? 1 : -1;
        b.ax = ux * 0.75 - uy * 0.6 * s; b.ay = uy * 0.75 + ux * 0.6 * s;
      }
    }
    o.x = b.ax; o.y = b.ay;
    return o;
  }

  function spawnBot(m, ev) {
    var a = m.p[0], x, y, k = 0;
    var bW = m.boundW || W, bH = m.boundH || H;
    do {
      var s = Math.floor(Math.random() * 4);
      x = s === 0 ? R : s === 1 ? bW - R : R + Math.random() * (bW - 2 * R);
      y = s === 2 ? R : s === 3 ? bH - R : R + Math.random() * (bH - 2 * R);
    } while (a && Math.hypot(x - a.x, y - a.y) < 220 && ++k < 12);
    var b = mk(m.p.length, x, a ? Math.atan2(a.y - y, a.x - x) : 0, y, 1, 'player');
    b.ch = 0; b.st = 0.7; b.at = 0; b.ax = 0; b.ay = 0;
    b.spd = Math.min(185, 125 + m.spawned * 2);
    m.spawned++; m.p.push(b);
    ev.push({ t: 'spawn', x: x, y: y });
  }

  function endlessStep(m, inp, dt, ev) {
    m.time += dt; m.sp -= dt;
    if (m.sp <= 0) { spawnBot(m, ev); m.sp = SPAWN_T; }
    for (var j = 1; j < m.p.length; j++) {
      if (m.p[j] && !m.p[j].dead) {
        if (m.p[j].isMinion) inp[j] = bodyguardAI(m, m.p[j], dt);
        else inp[j] = botAI(m, m.p[j], dt);
      }
    }
  }

  function aiNovice(m, b, dt) {
    var a = m.p[0], o = {};
    b.at -= dt;
    if (b.at <= 0 && a && !a.dead) {
      b.at = 0.2 + Math.random() * 0.22;
      var dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      var face = Math.cos(b.fa) * ux + Math.sin(b.fa) * uy;
      b.ax = ux; b.ay = uy;
      if (a.sw >= 0 && a.sw < 0.2 && d < b.r + REACH + 18 && Math.random() < 0.18) {
        o.pa = true;
      } else if (d < b.r + REACH - 2) {
        if (face > 0.65 && Math.random() < 0.35) o.sw = true;
      } else if (d < b.r + REACH + 65) {
        var s = Math.random() < 0.5 ? 1 : -1;
        b.ax = ux * 0.65 - uy * 0.65 * s; b.ay = uy * 0.65 + ux * 0.65 * s;
      } else if (d > 175 && b.ch > 1 && Math.random() < 0.1) {
        o.bl = true;
      }
    }
    o.x = b.ax; o.y = b.ay;
    return o;
  }

  function aiVeteran(m, b, dt) {
    var a = m.p[0], o = {};
    b.at -= dt;
    if (a && !a.dead && b.at <= 0) {
      b.at = 0.11 + Math.random() * 0.1;
      var dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      var face = Math.cos(b.fa) * ux + Math.sin(b.fa) * uy;
      b.ax = ux; b.ay = uy;

      if (a.sw >= 0 && a.sw < 0.2 && d < a.reach + b.r + 14 && b.pa < 0 && Math.random() < 0.38) {
        o.pa = true;
      } else if (b.ch > 0 && b.bc <= 0 && d > 60 && d <= BLINK_D + 6) {
        var fx2 = b.x + ux * BLINK_D, fy2 = b.y + uy * BLINK_D;
        if (segd(b.x, b.y, fx2, fy2, a.x, a.y) < b.r + a.r - 4 && !parrying(a) && Math.random() < 0.25) {
          o.bl = true;
        }
      }

      if (!o.pa && !o.bl) {
        if (d < b.reach + a.r - 4 && (face > 0.65 || a.st > 0) && Math.random() < 0.55) {
          o.sw = true;
        } else if (d < b.reach + 45) {
          var s = Math.random() < 0.5 ? 1 : -1;
          b.ax = ux * 0.75 - uy * 0.6 * s; b.ay = uy * 0.75 + ux * 0.6 * s;
        }
      }
    }
    o.x = b.ax; o.y = b.ay;
    return o;
  }

  function aiApex(m, b, dt) {
    var a = m.p[0], o = {};
    b.at -= dt;
    if (a && !a.dead && b.at <= 0) {
      b.at = 0.085 + Math.random() * 0.075;
      var dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      var face = Math.cos(b.fa) * ux + Math.sin(b.fa) * uy;
      b.ax = ux; b.ay = uy;

      if (a.sw >= 0 && a.sw < 0.22 && d < a.reach + b.r + 14 && b.pa < 0 && b.sw < 0 && b.bw <= 0 && Math.random() < 0.48) {
        o.pa = true;
      }
      else if (b.ch > 0 && b.bc <= 0 && b.sw < 0 && b.pa < 0 && d > 55 && d <= BLINK_D + 8 && Math.random() < 0.35) {
        var fx2 = b.x + ux * BLINK_D, fy2 = b.y + uy * BLINK_D;
        if (segd(b.x, b.y, fx2, fy2, a.x, a.y) < b.r + a.r - 3 && !parrying(a)) {
          o.bl = true;
        }
      }

      if (!o.pa && !o.bl) {
        if (d < b.reach + a.r - 2 && (face > 0.6 || a.st > 0) && Math.random() < 0.65) {
          o.sw = true;
        } else if (d < b.reach + 42) {
          var s = Math.random() < 0.5 ? 1 : -1;
          b.ax = ux * 0.72 - uy * 0.68 * s; b.ay = uy * 0.72 + ux * 0.68 * s;
        }
      }
    }
    o.x = b.ax; o.y = b.ay;
    return o;
  }

  function aiTetanus(m, b, dt) {
    var a = m.p[0], o = {};
    if (!a || a.dead) return { x: 0, y: 0 };
    var dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;

    if (b.bossTelegraph > 0) {
      b.bossTelegraph -= dt;
      b.ax = 0; b.ay = 0;
      b.fa = Math.atan2(dy, dx);
      if (b.bossTelegraph <= 0) {
        if (b.bossAction === 'crush') {
          b.unparryable = true;
          o.x = ux; o.y = uy;
          o.bl = true;
        } else if (b.bossAction === 'slash') {
          o.sw = true;
        }
        b.bossAction = null;
      }
      return o;
    }

    b.at -= dt;
    if (b.at <= 0) {
      b.at = 0.1 + Math.random() * 0.09;
      b.ax = ux; b.ay = uy;

      if (d > 110 && d < BLINK_D * 1.55 && b.ch > 0 && b.bc <= 0 && Math.random() < 0.45) {
        b.bossTelegraph = 0.48;
        b.bossAction = 'crush';
        return { x: 0, y: 0 };
      }
      if (d < b.reach + a.r + 16 && b.sc <= 0 && Math.random() < 0.55) {
        b.bossTelegraph = 0.36;
        b.bossAction = 'slash';
        return { x: 0, y: 0 };
      }
      if (a.sw >= 0 && a.sw < 0.18 && d < a.reach + b.r + 12 && b.pa < 0 && Math.random() < 0.42) {
        o.pa = true;
      }
    }
    o.x = b.ax; o.y = b.ay;
    return o;
  }

  // ================= MASTERTETANUS BOSS =================
  var aiScratch = new WeakMap();   // AI memory lives here so it is never sent over the network
  function aiMem(b) { var o = aiScratch.get(b); if (!o) { o = { seen: {}, roll: {}, wait: {}, tgt: -1, tgtT: 0, sgn: 1, sgnT: 0 }; aiScratch.set(b, o); } return o; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function createBoss(nPlayers) {
    var n = cl(nPlayers | 0, 1, 4);
    var bW = W * MT.MAP_SCALE, bH = H * MT.MAP_SCALE, hearts = MT.PLAYER_HEARTS[n];
    var m = {
      boss: true, mode: 'boss', nPlayers: n, win: 1, score: [0, 0], round: 1, winner: -1,
      boundW: bW, boundH: bH, bossIdx: n, cloneIdx: -1, cloneSlot: -1, guardT: MT.GUARD_EVERY,
      splitT: rnd(MT.SPLIT_MIN, MT.SPLIT_MAX), time: 0, guardGen: 0, phase: 'intro', t: 0, p: []
    };
    for (var i = 0; i < n; i++) {
      var pl = mk(i, 90, 0, (bH * (i + 1)) / (n + 1), 0, 'player');
      pl.lives = 1; pl.maxLives = 1; pl.hearts = hearts; pl.maxHearts = hearts;
      m.p.push(pl);
    }
    var b = mk(n, bW - 110, Math.PI, bH / 2, 1, 'mtboss');
    b.isBoss = true;
    m.p.push(b);
    return m;
  }
  // the dialogue is over and the host pressed Challenge
  function startBoss(m) { if (m && m.boss && m.phase === 'intro') { m.phase = 'ready'; m.t = MT.INTRO_READY; } }

  function nearestFoe(m, b) {
    var fs = foes(m, b.i), best = null, bd = 1e9;
    for (var k = 0; k < fs.length; k++) {
      var d = Math.hypot(fs[k].x - b.x, fs[k].y - b.y);
      if (d < bd) { bd = d; best = fs[k]; }
    }
    return best;
  }

  // A veteran duelist that hunts the closest enemy (used by the boss's bodyguards)
  var GUARD_AI = { tickMin: 0.11, tickRange: 0.1, parry: 0.38, blink: 0.25, swing: 0.55 };
  function aiDuelist(m, b, dt, cfg) {
    var a = nearestFoe(m, b), o = {};
    b.at -= dt;
    if (a && b.at <= 0) {
      b.at = cfg.tickMin + Math.random() * cfg.tickRange;
      var dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      var face = Math.cos(b.fa) * ux + Math.sin(b.fa) * uy;
      b.ax = ux; b.ay = uy;
      if (a.sw >= 0 && a.sw < 0.2 && d < a.reach + b.r + 14 && b.pa < 0 && Math.random() < cfg.parry) {
        o.pa = true;
      } else if (b.ch > 0 && b.bc <= 0 && d > 60 && d <= BLINK_D + 6) {
        var fx2 = b.x + ux * BLINK_D, fy2 = b.y + uy * BLINK_D;
        if (segd(b.x, b.y, fx2, fy2, a.x, a.y) < b.r + a.r - 4 && !parrying(a) && Math.random() < cfg.blink) o.bl = true;
      }
      if (!o.pa && !o.bl) {
        if (d < b.reach + a.r - 4 && (face > 0.65 || a.st > 0) && Math.random() < cfg.swing) {
          o.sw = true;
        } else if (d < b.reach + 45) {
          var sg = Math.random() < 0.5 ? 1 : -1;
          b.ax = ux * 0.75 - uy * 0.6 * sg; b.ay = uy * 0.75 + ux * 0.6 * sg;
        }
      }
    }
    o.x = b.ax; o.y = b.ay;
    return o;
  }

  // The boss: picks whoever it can kill fastest, punishes parries, blinks only when the line is clean.
  function aiBoss(m, b, dt) {
    var fs = foes(m, b.i);
    if (!fs.length) return { x: 0, y: 0 };
    var mem = aiMem(b), o = {}, k, f, key;

    // 1) Seeing a swing or dash coming: react after a short delay, and sometimes fail to.
    var parryNow = false;
    for (k = 0; k < fs.length; k++) {
      f = fs[k];
      var swingThreat = f.sw >= 0 && f.sw < 0.2 && Math.hypot(f.x - b.x, f.y - b.y) < f.reach + b.r + 18 &&
        Math.abs(norm(Math.atan2(b.y - f.y, b.x - f.x) - f.fa)) < 1.3;
      var dashThreat = f.bw > 0 && segd(f.x, f.y, f.x + f.bdx * BLINK_D, f.y + f.bdy * BLINK_D, b.x, b.y) < f.r + b.r - 4;
      key = f.i;
      if (swingThreat || dashThreat) {
        if (!mem.seen[key]) { mem.seen[key] = true; mem.wait[key] = MT.REACT; mem.roll[key] = Math.random() < MT.PARRY_CHANCE; }
        mem.wait[key] -= dt;
        if (mem.wait[key] <= 0 && mem.roll[key]) parryNow = true;
      } else if (f.sw < 0 && !(f.bw > 0)) {
        delete mem.seen[key];
      }
    }
    if (parryNow && b.sw < 0 && b.pa < 0 && b.bw <= 0) o.pa = true;

    // 2) Choose the target that dies fastest: close, low on hearts, stunned, not guarding.
    mem.tgtT -= dt;
    var tgt = mem.tgt >= 0 ? m.p[mem.tgt] : null;
    if (!tgt || tgt.dead || mem.tgtT <= 0) {
      var best = 1e9; tgt = null;
      for (k = 0; k < fs.length; k++) {
        f = fs[k];
        var sc = Math.hypot(f.x - b.x, f.y - b.y) / b.spd + f.hearts * 0.12 + (f.st > 0 ? -0.35 : 0) + (parrying(f) ? 0.45 : 0);
        if (sc < best) { best = sc; tgt = f; }
      }
      mem.tgt = tgt ? tgt.i : -1; mem.tgtT = 0.4;
    }
    if (!tgt) return { x: 0, y: 0 };

    // 3) Attack
    var dx = tgt.x - b.x, dy = tgt.y - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    var face = Math.cos(b.fa) * ux + Math.sin(b.fa) * uy;
    var inReach = d < b.reach + tgt.r - 4, guarding = parrying(tgt);
    b.ax = ux; b.ay = uy;
    mem.sgnT -= dt; if (mem.sgnT <= 0) { mem.sgn = Math.random() < 0.5 ? 1 : -1; mem.sgnT = 0.5; }
    if (!o.pa) {
      if (inReach && !guarding && (face > 0.7 || tgt.st > 0) && b.sw < 0 && b.sc <= 0) {
        o.sw = true;
      } else if (b.ch > 0 && b.bc <= 0 && b.sw < 0 && b.pa < 0 && d > 70 && d <= BLINK_D * 1.25 + 6 && !guarding && tgt.pa < 0) {
        var bd = BLINK_D * 1.25;
        if (segd(b.x, b.y, b.x + ux * bd, b.y + uy * bd, tgt.x, tgt.y) < b.r + tgt.r - 4) o.bl = true;
      }
      if (guarding && d < b.reach + 50) {      // do not walk into a raised parry: step around it and wait
        b.ax = ux * 0.2 - uy * 0.9 * mem.sgn; b.ay = uy * 0.2 + ux * 0.9 * mem.sgn;
      }
    }
    o.x = b.ax; o.y = b.ay;
    return o;
  }

  function spawnGuard(m, ev) {
    var boss = m.p[m.bossIdx];
    if (!boss || boss.dead) return null;
    var bW = m.boundW, bH = m.boundH, idx = -1, k;
    for (k = 0; k < m.p.length; k++) {          // reuse a finished guard's slot so the list never grows forever
      var q = m.p[k];
      if (q && q.isMinion && q.dead && q.rip) { idx = k; break; }
    }
    if (idx < 0) idx = m.p.length;
    var a = Math.random() * 6.283;
    var x = cl(boss.x + Math.cos(a) * 48, R + 5, bW - R - 5), y = cl(boss.y + Math.sin(a) * 48, R + 5, bH - R - 5);
    var g = mk(idx, x, boss.fa, y, 1, 'veteran');
    g.isMinion = true; g.ownerIdx = m.bossIdx;
    g.lives = 1; g.maxLives = 1; g.hearts = 1; g.maxHearts = 1;
    g.st = 0.35; g.gen = ++m.guardGen;
    m.p[idx] = g;
    ev.push({ t: 'spawn_minion', i: idx, x: x, y: y, owner: m.bossIdx });
    return g;
  }

  function spawnClone(m, ev) {
    var boss = m.p[m.bossIdx];
    if (!boss || boss.dead) return;
    var bW = m.boundW, bH = m.boundH, a = Math.random() * 6.283;
    var idx = m.cloneSlot >= 0 ? m.cloneSlot : m.p.length;
    var c = mk(idx, cl(boss.x + Math.cos(a) * 50, R + 5, bW - R - 5), boss.fa, cl(boss.y + Math.sin(a) * 50, R + 5, bH - R - 5), 1, 'mtboss');
    c.isClone = true; c.cloneOf = m.bossIdx; c.life = MT.SPLIT_LIFE;
    c.hearts = boss.hearts; c.maxHearts = boss.maxHearts; c.ch = boss.ch; c.st = 0.3;
    m.p[idx] = c; m.cloneSlot = idx; m.cloneIdx = idx;
    ev.push({ t: 'clone_spawn', i: idx, x: c.x, y: c.y });
  }

  function bossStep(m, dt, ev) {
    m.time += dt;
    var boss = m.p[m.bossIdx];
    if (!boss || boss.dead) return;
    m.guardT -= dt;
    if (m.guardT <= 0) {
      m.guardT = MT.GUARD_EVERY;
      var alive = 0, k;
      for (k = 0; k < m.p.length; k++) if (m.p[k] && m.p[k].isMinion && !m.p[k].dead) alive++;
      for (k = 0; k < MT.GUARD_COUNT && alive < MT.GUARD_MAX; k++) { if (spawnGuard(m, ev)) alive++; }
    }
    var clone = m.cloneIdx >= 0 ? m.p[m.cloneIdx] : null;
    if (clone && !clone.dead) {
      clone.life -= dt; clone.hearts = boss.hearts;
      if (clone.life <= 0) {
        clone.dead = true; clone.rip = true;
        ev.push({ t: 'clone_end', i: clone.i, x: clone.x, y: clone.y });
        m.cloneIdx = -1; m.splitT = rnd(MT.SPLIT_MIN, MT.SPLIT_MAX);   // the timer restarts when the ability ends
      }
    } else {
      if (clone) { m.cloneIdx = -1; m.splitT = rnd(MT.SPLIT_MIN, MT.SPLIT_MAX); }
      m.splitT -= dt;
      if (m.splitT <= 0) spawnClone(m, ev);
    }
  }

  function updateShrines(m, dt, ev) {
    m.shrines = m.shrines || [];
    for (var i = m.shrines.length - 1; i >= 0; i--) {
      m.shrines[i].life -= dt;
      if (m.shrines[i].life <= 0) {
        ev.push({ t: 'shrine_expired', x: m.shrines[i].x, y: m.shrines[i].y });
        m.shrines.splice(i, 1);
      }
    }
    m.shrineTimer = (m.shrineTimer || 0) - dt;
    if (m.shrineTimer <= 0) {
      if (m.shrines.length < 5) {
        var sx = 120 + Math.random() * (m.boundW - 240);
        var sy = 120 + Math.random() * (m.boundH - 240);
        m.shrines.push({ id: Math.random(), x: sx, y: sy, r: SHRINE_R, life: 60 });
        ev.push({ t: 'shrine_spawn', x: sx, y: sy });
      }
      m.shrineTimer = 12;
    }
  }

  function simulate(m, inp, dt, ev) {
    var n = m.p.length, i, j, p, o, q, u, l, fs;
    var bW = m.boundW || W, bH = m.boundH || H;

    if (m.ffa) {
      updateShrines(m, dt, ev);
      
      var maxKills = 0, leaderIdx = -1;
      for (i = 0; i < n; i++) {
        p = m.p[i]; if (!p || p.dead || p.isMinion) continue;
        if (p.kills > maxKills) { maxKills = p.kills; leaderIdx = i; }
      }
      m.leaderIdx = leaderIdx;

      for (i = 0; i < n; i++) {
        p = m.p[i]; if (!p || p.dead) continue;
        p.isLeader = (i === m.leaderIdx && p.kills > 0);
        if (p.combatTimer > 0) p.combatTimer -= dt;
        if (p.isLeader && p.combatTimer <= 0 && !p.shield) p.shield = true;
        else if (!p.isLeader) p.shield = false;
      }
    }

    for (i = 0; i < n; i++) {
      p = m.p[i];
      if (!p || p.dead) continue;
      if (p.isMinion) {
        inp[i] = m.boss ? aiDuelist(m, p, dt, GUARD_AI) : bodyguardAI(m, p, dt);
      } else if (m.boss && p.tier === 'mtboss') {
        inp[i] = aiBoss(m, p, dt);
      } else if (i === 1 && m.mode === '1v1' && m.botTier && m.botTier !== 'player') {
        if (p.tier === 'novice') inp[i] = aiNovice(m, p, dt);
        else if (p.tier === 'veteran') inp[i] = aiVeteran(m, p, dt);
        else if (p.tier === 'apex') inp[i] = aiApex(m, p, dt);
        else if (p.tier === 'tetanus') inp[i] = aiTetanus(m, p, dt);
      }
    }

    for (i = 0; i < n; i++) {
      p = m.p[i]; if (!p || p.dead) continue;
      if (p.noCd) {
        p.ch = 3; p.rc = CHARGE_T; p.st = 0; p.bc = 0; p.sc = 0;
      } else {
        if (p.ch < 3) { p.rc += dt; if (p.rc >= (p.chargeT || CHARGE_T)) { p.ch++; p.rc = 0; } }
        if (p.st > 0) p.st -= dt;
        if (p.bc > 0) p.bc -= dt;
        if (p.sc > 0) p.sc -= dt;
      }
      if (p.bw > 0) { p.bw -= dt; if (p.bw <= 0) { p.bw = 0; dash(m, i, ev); } }
      if (p.sw >= 0) { p.sw += dt; if (p.sw > 0.34) { p.sw = -1; p.sc = p.noCd ? 0 : SWING_CD; } }
      if (p.pa >= 0) {
        p.pa += dt;
        if (p.pa >= PAR && p.whiffedParry && p.tier === 'tetanus') {
          p.st = 1.05;
          p.whiffedParry = false;
          ev.push({ t: 'whiff_parry', i: p.i, x: p.x, y: p.y });
        }
        if (p.pa > 0.72) p.pa = -1;
      }
    }

    for (i = 0; i < n; i++) {
      p = m.p[i]; if (!p || p.dead) continue;
      u = inp[i] || {};
      var x = +u.x || 0, y = +u.y || 0; l = Math.hypot(x, y);
      if (l > 0) { x /= l; y /= l; }
      p.ix = x; p.iy = y;
      if (u.sw) act(m, i, 'sw', ev);
      if (u.pa) act(m, i, 'pa', ev);
      if (u.bl) act(m, i, 'bl', ev);
    }

    for (i = 0; i < n; i++) {
      p = m.p[i]; u = inp[i] || {};
      if (!p || p.dead || (!p.noCd && p.st > 0) || p.bossTelegraph > 0) continue;
      l = Math.hypot(p.ix, p.iy);
      if (p.sw < 0 && p.bw <= 0) {
        if (typeof u.aim === 'number' && isFinite(u.aim)) p.fa = u.aim;
        else if (l > 0) p.fa = Math.atan2(p.iy, p.ix);
      }
      if (l > 0) {
        var parrySlow = (parrying(p) && p.tier !== 'apex') ? 0.5 : 1;
        var sp = p.spd * (p.sw >= 0 ? 0.6 : 1) * parrySlow * (p.bw > 0 ? 0.3 : 1) * (p.fast ? 2.5 : 1);
        p.x = cl(p.x + p.ix * sp * dt, p.r, bW - p.r);
        p.y = cl(p.y + p.iy * sp * dt, p.r, bH - p.r);
        p.extract = 0;
      } else if (m.ffa && m.shrines && p.sw < 0 && p.pa < 0 && p.bw <= 0 && !p.isMinion) {
        var near = false;
        for (var sIdx = 0; sIdx < m.shrines.length; sIdx++) {
          var sh = m.shrines[sIdx];
          if (Math.hypot(p.x - sh.x, p.y - sh.y) <= sh.r) { near = true; break; }
        }
        if (near) {
          p.extract += dt;
          if (p.extract >= EXTRACT_TIME) {
            p.dead = true;
            p.extracted = true;
            ev.push({ t: 'extract', i: p.i, points: p.points || 0, kills: p.kills || 0 });
          }
        } else {
          p.extract = 0;
        }
      } else {
        p.extract = 0;
      }
    }

    for (i = 0; i < n; i++) {
      p = m.p[i]; if (!p || p.dead) continue;
      for (j = i + 1; j < n; j++) {
        q = m.p[j]; if (!q || q.dead) continue;
        var sx = q.x - p.x, sy = q.y - p.y, sd = Math.hypot(sx, sy), minD = p.r + q.r;
        if (sd > 0 && sd < minD) {
          var ps = (minD - sd) / 2; sx /= sd; sy /= sd;
          p.x = cl(p.x - sx * ps, p.r, bW - p.r); p.y = cl(p.y - sy * ps, p.r, bH - p.r);
          q.x = cl(q.x + sx * ps, q.r, bW - q.r); q.y = cl(q.y + sy * ps, q.r, bH - q.r);
        }
      }
    }

    for (i = 0; i < n; i++) {
      p = m.p[i];
      if (!p || p.dead || p.sw < A0 || p.sw >= A1) continue;
      fs = foes(m, i);
      for (j = 0; j < fs.length; j++) {
        o = fs[j];
        if (p.dead || p.sw < 0) break;
        if (o.dead || p.hs.indexOf(o.i) >= 0) continue;
        var edx = o.x - p.x, edy = o.y - p.y;
        var totalReach = p.reach || REACH;
        if (Math.hypot(edx, edy) < o.r + totalReach && Math.abs(norm(Math.atan2(edy, edx) - p.fa)) < 1.05) {
          p.hs.push(o.i); resolve(p, o, ev, false, m);
        }
      }
    }

    if (m.boss) {
      m.p.forEach(function (c) {
        if (c && c.dead && !c.rip) { c.rip = true; ev.push({ t: 'kill', i: c.i, x: c.x, y: c.y }); }
      });
      var bossP = m.p[m.bossIdx];
      var playersAlive = m.p.some(function (c) { return c && c.team === 0 && !c.dead; });
      if (bossP && bossP.dead) {
        m.p.forEach(function (c) { if (c && c.team === 1 && !c.dead) { c.dead = true; c.rip = true; } });
        m.phase = 'roundend'; m.t = 1.7; m.score[0] = 1;
      } else if (!playersAlive) {
        m.phase = 'roundend'; m.t = 1.7; m.score[1] = 1;
      }
      return;
    }

    if (m.endless) {
      m.p.forEach(function (c) {
        if (c && c.dead && !c.rip) {
          c.rip = true;
          ev.push({ t: 'kill', i: c.i, x: c.x, y: c.y });
          if (c.i > 0 && !c.isMinion) m.kills++;
        }
      });
      if (m.p[0] && m.p[0].dead) { m.phase = 'roundend'; m.t = 1.2; }
      return;
    }

    if (m.ffa) {
      m.p.forEach(function (c) {
        if (c && c.dead && !c.rip) {
          c.rip = true;
          if (!c.extracted) {
            ev.push({ t: 'kill', i: c.i, x: c.x, y: c.y });
          }
        }
      });
      return;
    }

    if (m.mode === '2v2') {
      m.p.forEach(function (c) {
        if (c && c.dead && !c.rip) {
          c.rip = true;
          ev.push({ t: 'kill', i: c.i, x: c.x, y: c.y });
        }
      });
      var t0Alive = m.p.some(function (c) { return c && c.team === 0 && !c.dead && !c.isMinion; });
      var t1Alive = m.p.some(function (c) { return c && c.team === 1 && !c.dead && !c.isMinion; });
      if (!t0Alive || !t1Alive) {
        m.phase = 'roundend'; m.t = 1.7;
        if (t0Alive && !t1Alive) m.score[0]++;
        else if (t1Alive && !t0Alive) m.score[1]++;
      }
      return;
    }

    m.p.forEach(function (c) {
      if (c && c.dead && !c.rip) {
        c.rip = true;
        ev.push({ t: 'kill', i: c.i, x: c.x, y: c.y });
      }
    });

    var d0 = m.p[0] && m.p[0].dead, d1 = m.p[1] && m.p[1].dead;
    if (d0 || d1) {
      m.phase = 'roundend'; m.t = 1.7;
      if (!(d0 && d1)) m.score[d0 ? 1 : 0]++;
    }
  }

  function tick(m, inp, dt) {
    var ev = [];
    if (m.phase === 'ready') { m.t -= dt; if (m.t <= 0) m.phase = 'fight'; }
    else if (m.phase === 'fight') {
      if (m.endless) endlessStep(m, inp, dt, ev);
      if (m.boss) bossStep(m, dt, ev);
      simulate(m, inp, dt, ev);
    } else if (m.phase === 'roundend') {
      m.t -= dt;
      if (m.t <= 0) {
        if (m.endless) { m.phase = 'over'; m.winner = -1; }
        else if (Math.max(m.score[0], m.score[1]) >= m.win) { m.phase = 'over'; m.winner = m.score[0] > m.score[1] ? 0 : 1; }
        else { m.round++; reset(m); }
      }
    }
    return ev;
  }

  var api = {
    W: W, H: H, FFA_W: FFA_W, FFA_H: FFA_H, R: R, PAR: PAR, A0: A0, A1: A1, REACH: REACH, CHARGE_T: CHARGE_T,
    SWING_CD: SWING_CD, BLINK_D: BLINK_D, BLINK_WIND: BLINK_WIND, SHRINE_R: SHRINE_R, EXTRACT_TIME: EXTRACT_TIME,
    TIERS: TIERS, MT: MT, createBoss: createBoss, startBoss: startBoss, create: create, create2v2: create2v2, createEndless: createEndless, createFFA: createFFA, spawnBodyguard: spawnBodyguard, tick: tick
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shared = api;
})(typeof self !== 'undefined' ? self : this);