// Game rules shared by the server (authoritative online matches) and the
// browser (local bot / 2-player / endless modes), so every mode plays identically.
(function (root) {
  var W = 640, H = 400, R = 13, PAR = 0.32, A0 = 0.08, A1 = 0.22;
  var FFA_W = 1800, FFA_H = 1200;
  var REACH = 56, BLINK_D = 120, BLINK_REC = 0.3, CHARGE_T = 3.5, SPAWN_T = 5, SWING_CD = 0.2, BLINK_WIND = 0.1;
  var SHRINE_R = 36, EXTRACT_TIME = 3.0;

  function mk(i, x, fa, y, team) {
    return {
      i: i, x: x, y: y === undefined ? H / 2 : y, fa: fa, ch: 3, rc: 0, st: 0, sw: -1, hs: [],
      pa: -1, bc: 0, sc: 0, bw: 0, bdx: 0, bdy: 0, dead: false, ix: 0, iy: 0, spd: 200,
      team: team !== undefined ? team : i, extract: 0, points: 0, kills: 0, parries: 0, blinks: 0,
      god: false, noCd: false, isMinion: false, ownerIdx: -1, at: 0, ax: 0, ay: 0
    };
  }
  function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function norm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function segd(ax, ay, bx, by, px, py) {
    var vx = bx - ax, vy = by - ay, l = vx * vx + vy * vy;
    var t = l ? cl(((px - ax) * vx + (py - ay) * vy) / l, 0, 1) : 0;
    return Math.hypot(ax + vx * t - px, ay + vy * t - py);
  }
  function parrying(p) { return p.pa >= 0 && p.pa < PAR; }

  function reset(m) {
    if (m.mode === '2v2') {
      m.p = [
        mk(0, 90, 0, H / 3, 0),
        mk(1, 90, 0, (2 * H) / 3, 0),
        mk(2, W - 90, Math.PI, H / 3, 1),
        mk(3, W - 90, Math.PI, (2 * H) / 3, 1)
      ];
    } else {
      m.p = [mk(0, 90, 0), mk(1, W - 90, Math.PI)];
    }
    m.phase = 'ready'; m.t = 1.3; m.winner = -1;
  }

  function create(win, mode) {
    var m = { win: win, score: [0, 0], round: 1, mode: mode || '1v1', boundW: W, boundH: H };
    reset(m);
    return m;
  }

  function create2v2(win) {
    return create(win, '2v2');
  }

  function createEndless() {
    var m = { endless: true, win: 999, score: [0, 0], round: 1, kills: 0, time: 0, sp: 0, spawned: 0, boundW: W, boundH: H };
    m.p = [mk(0, W / 2, 0)];
    m.phase = 'ready'; m.t = 1.3; m.winner = -1;
    return m;
  }

  function createFFA() {
    return {
      ffa: true, mode: 'ffa', p: [], shrines: [],
      phase: 'fight', round: 1, score: [0, 0], win: 9999,
      boundW: FFA_W, boundH: FFA_H, shrineTimer: 10
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
    var bg = mk(idx, x, owner.fa, y, owner.team);
    bg.isMinion = true;
    bg.ownerIdx = ownerIdx;
    bg.spd = 195;
    m.p.push(bg);
    ev.push({ t: 'spawn_minion', i: idx, x: x, y: y, owner: ownerIdx });
    return bg;
  }

  function foes(m, i) {
    var self = m.p[i];
    if (!self) return [];
    if (self.isMinion) {
      return m.p.filter(function (q) {
        return q && !q.dead && q.i !== self.ownerIdx && !q.isMinion;
      });
    }
    if (m.endless) {
      if (i === 0) return m.p.filter(function (q, j) { return j > 0 && !q.dead && !q.isMinion; });
      return m.p[0].dead ? [] : [m.p[0]];
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

  function resolve(a, d, ev, blink) {
    if (d.god) {
      ev.push({ t: 'god_block', x: d.x, y: d.y });
      return;
    }
    if (parrying(d)) {
      if (blink) {
        if (!a.god) a.dead = true;
        d.points = (d.points || 0) + 25;
        d.blinks = (d.blinks || 0) + 1;
        ev.push({ t: 'intercept', by: d.i, victim: a.i, x: d.x, y: d.y });
      } else {
        if (!a.god) {
          a.st = 1.1; a.sw = -1; a.bw = 0;
        }
        d.points = (d.points || 0) + 15;
        d.parries = (d.parries || 0) + 1;
      }
      ev.push({ t: 'parry', x: d.x, y: d.y, b: !!blink, by: d.i });
    } else {
      d.dead = true;
      a.points = (a.points || 0) + 35;
      a.kills = (a.kills || 0) + 1;
      ev.push({ t: 'slain', killer: a.i, victim: d.i });
    }
  }

  function act(m, i, k, ev) {
    var p = m.p[i];
    if (!p || p.dead || (!p.noCd && p.st > 0)) return;
    if (k === 'sw' && (p.noCd || (p.sw < 0 && p.pa < 0 && p.bc <= 0 && p.sc <= 0 && p.bw <= 0))) {
      p.sw = 0; p.hs = []; p.extract = 0;
      ev.push({ t: 'swing', i: i, x: p.x, y: p.y });
    }
    else if (k === 'pa' && (p.noCd || (p.sw < 0 && p.pa < 0 && p.bc <= 0 && p.bw <= 0))) {
      p.pa = 0; p.extract = 0;
      ev.push({ t: 'raise', i: i, x: p.x, y: p.y });
    }
    else if (k === 'bl' && (p.noCd || (p.ch > 0 && p.bc <= 0 && p.pa < 0 && p.sw < 0 && p.bw <= 0))) {
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
    var nx = cl(p.x + p.bdx * BLINK_D, R, bW - R), ny = cl(p.y + p.bdy * BLINK_D, R, bH - R);
    ev.push({ t: 'blink', i: i, x1: p.x, y1: p.y, x2: nx, y2: ny });
    var fs = foes(m, i);
    for (var j = 0; j < fs.length && !p.dead; j++) {
      if (!fs[j].dead && segd(p.x, p.y, nx, ny, fs[j].x, fs[j].y) < R + 8) resolve(p, fs[j], ev, true);
    }
    p.x = nx; p.y = ny; p.bc = p.noCd ? 0 : BLINK_REC; p.sw = -1;
  }

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
      } else if (dist < R + REACH - 2) {
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
    var b = mk(m.p.length, x, a ? Math.atan2(a.y - y, a.x - x) : 0, y);
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
    // Lowered shrine spawn frequency: Max 2 shrines active on the 1800x1200 map
    if (m.shrineTimer <= 0) {
      if (m.shrines.length < 2) {
        var sx = 120 + Math.random() * (m.boundW - 240);
        var sy = 120 + Math.random() * (m.boundH - 240);
        m.shrines.push({ id: Math.random(), x: sx, y: sy, r: SHRINE_R, life: 40 });
        ev.push({ t: 'shrine_spawn', x: sx, y: sy });
      }
      m.shrineTimer = 25; // 25s delay between spawn attempts
    }
  }

  function simulate(m, inp, dt, ev) {
    var n = m.p.length, i, j, p, o, q, u, l, fs;
    var bW = m.boundW || W, bH = m.boundH || H;

    if (m.ffa) updateShrines(m, dt, ev);

    for (i = 0; i < n; i++) {
      p = m.p[i];
      if (p && !p.dead && p.isMinion) {
        inp[i] = bodyguardAI(m, p, dt);
      }
    }

    for (i = 0; i < n; i++) {
      p = m.p[i]; if (!p || p.dead) continue;
      if (p.noCd) {
        p.ch = 3; p.rc = CHARGE_T; p.st = 0; p.bc = 0; p.sc = 0;
      } else {
        if (p.ch < 3) { p.rc += dt; if (p.rc >= CHARGE_T) { p.ch++; p.rc = 0; } }
        if (p.st > 0) p.st -= dt;
        if (p.bc > 0) p.bc -= dt;
        if (p.sc > 0) p.sc -= dt;
      }
      if (p.bw > 0) { p.bw -= dt; if (p.bw <= 0) { p.bw = 0; dash(m, i, ev); } }
      if (p.sw >= 0) { p.sw += dt; if (p.sw > 0.34) { p.sw = -1; p.sc = p.noCd ? 0 : SWING_CD; } }
      if (p.pa >= 0) { p.pa += dt; if (p.pa > 0.8) p.pa = -1; }
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
      if (!p || p.dead || (!p.noCd && p.st > 0)) continue;
      l = Math.hypot(p.ix, p.iy);
      if (p.sw < 0 && p.bw <= 0) {
        if (typeof u.aim === 'number' && isFinite(u.aim)) p.fa = u.aim;
        else if (l > 0) p.fa = Math.atan2(p.iy, p.ix);
      }
      if (l > 0) {
        var sp = p.spd * (p.sw >= 0 ? 0.6 : 1) * (parrying(p) ? 0.5 : 1) * (p.bw > 0 ? 0.3 : 1);
        p.x = cl(p.x + p.ix * sp * dt, R, bW - R);
        p.y = cl(p.y + p.iy * sp * dt, R, bH - R);
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
            ev.push({ t: 'extract', i: p.i, points: p.points || 0 });
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
        var sx = q.x - p.x, sy = q.y - p.y, sd = Math.hypot(sx, sy);
        if (sd > 0 && sd < R * 2) {
          var ps = (R * 2 - sd) / 2; sx /= sd; sy /= sd;
          p.x = cl(p.x - sx * ps, R, bW - R); p.y = cl(p.y - sy * ps, R, bH - R);
          q.x = cl(q.x + sx * ps, R, bW - R); q.y = cl(q.y + sy * ps, R, bH - R);
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
        if (Math.hypot(edx, edy) < R + REACH && Math.abs(norm(Math.atan2(edy, edx) - p.fa)) < 1.05) {
          p.hs.push(o.i); resolve(p, o, ev);
        }
      }
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
          ev.push({ t: 'kill', i: c.i, x: c.x, y: c.y });
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

    var d0 = m.p[0] && m.p[0].dead, d1 = m.p[1] && m.p[1].dead;
    if (d0 || d1) {
      m.phase = 'roundend'; m.t = 1.7;
      if (!(d0 && d1)) m.score[d0 ? 1 : 0]++;
      m.p.forEach(function (c) { if (c && c.dead && !c.rip) { c.rip = true; ev.push({ t: 'kill', i: c.i, x: c.x, y: c.y }); } });
    }
  }

  function tick(m, inp, dt) {
    var ev = [];
    if (m.phase === 'ready') { m.t -= dt; if (m.t <= 0) m.phase = 'fight'; }
    else if (m.phase === 'fight') {
      if (m.endless) endlessStep(m, inp, dt, ev);
      simulate(m, inp, dt, ev);
    } else if (m.phase === 'roundend') {
      m.t -= dt;
      if (m.t <= 0) {
        if (m.endless) { m.phase = 'over'; }
        else if (Math.max(m.score[0], m.score[1]) >= m.win) { m.phase = 'over'; m.winner = m.score[0] > m.score[1] ? 0 : 1; }
        else { m.round++; reset(m); }
      }
    }
    return ev;
  }

  var api = {
    W: W, H: H, FFA_W: FFA_W, FFA_H: FFA_H, R: R, PAR: PAR, A0: A0, A1: A1, REACH: REACH, CHARGE_T: CHARGE_T,
    SWING_CD: SWING_CD, BLINK_D: BLINK_D, BLINK_WIND: BLINK_WIND, SHRINE_R: SHRINE_R, EXTRACT_TIME: EXTRACT_TIME,
    create: create, create2v2: create2v2, createEndless: createEndless, createFFA: createFFA, spawnBodyguard: spawnBodyguard, tick: tick
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shared = api;
})(typeof self !== 'undefined' ? self : this);