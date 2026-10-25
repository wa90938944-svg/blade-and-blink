// Game rules shared by the server (authoritative online matches) and the
// browser (local bot / 2-player / endless modes), so every mode plays identically.
(function (root) {
  var W = 640, H = 400, R = 13, PAR = 0.32, A0 = 0.08, A1 = 0.22;
  var REACH = 56, BLINK_D = 120, BLINK_REC = 0.3, CHARGE_T = 3.5, SPAWN_T = 5, SWING_CD = 0.2, BLINK_WIND = 0.1;

  function mk(i, x, fa, y) {
    return { i: i, x: x, y: y === undefined ? H / 2 : y, fa: fa, ch: 3, rc: 0, st: 0, sw: -1, hs: [],
             pa: -1, bc: 0, sc: 0, bw: 0, bdx: 0, bdy: 0, dead: false, ix: 0, iy: 0, spd: 200 };
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
    m.p = [mk(0, 90, 0), mk(1, W - 90, Math.PI)];
    m.phase = 'ready'; m.t = 1.3; m.winner = -1;
  }
  function create(win) {
    var m = { win: win, score: [0, 0], round: 1 };
    reset(m);
    return m;
  }
  // Survival: you vs. a growing swarm of bots, one new bot every SPAWN_T seconds.
  function createEndless() {
    var m = { endless: true, win: 999, score: [0, 0], round: 1, kills: 0, time: 0, sp: 0, spawned: 0 };
    m.p = [mk(0, W / 2, 0)];
    m.phase = 'ready'; m.t = 1.3; m.winner = -1;
    return m;
  }

  // Who can fighter i hurt? 1v1: the other player. Endless: you vs. all bots (bots are allies).
  function foes(m, i) {
    if (!m.endless) return [m.p[1 - i]];
    if (i === 0) return m.p.filter(function (q, j) { return j > 0 && !q.dead; });
    return m.p[0].dead ? [] : [m.p[0]];
  }

  // a = attacker, d = defender. Parrying a sword swing stuns the attacker;
  // parrying a blink (dash) kills the dasher.
  function resolve(a, d, ev, blink) {
    if (parrying(d)) {
      if (blink) a.dead = true;
      else { a.st = 1.1; a.sw = -1; a.bw = 0; }
      ev.push({ t: 'parry', x: d.x, y: d.y, b: !!blink });
    } else d.dead = true;
  }

  // k: 'sw' swing, 'pa' parry, 'bl' blink
  function act(m, i, k, ev) {
    var p = m.p[i];
    if (p.dead || p.st > 0) return;
    if (k === 'sw' && p.sw < 0 && p.pa < 0 && p.bc <= 0 && p.sc <= 0 && p.bw <= 0) {
      p.sw = 0; p.hs = [];
      ev.push({ t: 'swing', i: i, x: p.x, y: p.y });
    }
    else if (k === 'pa' && p.sw < 0 && p.pa < 0 && p.bc <= 0 && p.bw <= 0) {
      p.pa = 0;
      ev.push({ t: 'raise', i: i, x: p.x, y: p.y });
    }
    else if (k === 'bl' && p.ch > 0 && p.bc <= 0 && p.pa < 0 && p.sw < 0 && p.bw <= 0) {
      var dx = p.ix, dy = p.iy;
      if (!dx && !dy) { dx = Math.cos(p.fa); dy = Math.sin(p.fa); }
      var l = Math.hypot(dx, dy) || 1;
      p.bdx = dx / l; p.bdy = dy / l; p.fa = Math.atan2(p.bdy, p.bdx); // direction is locked in now
      p.bw = BLINK_WIND; p.ch--;                                        // charge is spent when the shine starts
      ev.push({ t: 'shine', i: i, x: p.x, y: p.y });
    }
  }

  // The dash itself, BLINK_WIND seconds after the shine began.
  function dash(m, i, ev) {
    var p = m.p[i];
    var nx = cl(p.x + p.bdx * BLINK_D, R, W - R), ny = cl(p.y + p.bdy * BLINK_D, R, H - R);
    ev.push({ t: 'blink', i: i, x1: p.x, y1: p.y, x2: nx, y2: ny });
    var fs = foes(m, i);
    for (var j = 0; j < fs.length && !p.dead; j++) {
      if (!fs[j].dead && segd(p.x, p.y, nx, ny, fs[j].x, fs[j].y) < R + 8) resolve(p, fs[j], ev, true);
    }
    p.x = nx; p.y = ny; p.bc = BLINK_REC; p.sw = -1;
  }

  // Simple swarm AI: chase you, strafe when close, swing when facing you, sometimes parry.
  function botAI(m, b, dt) {
    var a = m.p[0];
    b.at -= dt;
    var o = {};
    if (b.at <= 0 && !a.dead) {
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
    do {
      var s = Math.floor(Math.random() * 4);
      x = s === 0 ? R : s === 1 ? W - R : R + Math.random() * (W - 2 * R);
      y = s === 2 ? R : s === 3 ? H - R : R + Math.random() * (H - 2 * R);
    } while (Math.hypot(x - a.x, y - a.y) < 220 && ++k < 12);
    var b = mk(m.p.length, x, Math.atan2(a.y - y, a.x - x), y);
    b.ch = 0; b.st = 0.7; b.at = 0; b.ax = 0; b.ay = 0;
    b.spd = Math.min(185, 125 + m.spawned * 2); // each new bot is a little faster, up to 185
    m.spawned++; m.p.push(b);
    ev.push({ t: 'spawn', x: x, y: y });
  }
  function endlessStep(m, inp, dt, ev) {
    m.time += dt; m.sp -= dt;
    if (m.sp <= 0) { spawnBot(m, ev); m.sp = SPAWN_T; }
    for (var j = 1; j < m.p.length; j++) if (!m.p[j].dead) inp[j] = botAI(m, m.p[j], dt);
  }

  function simulate(m, inp, dt, ev) {
    var n = m.p.length, i, j, p, o, q, u, l, fs;
    for (i = 0; i < n; i++) {
      p = m.p[i]; if (p.dead) continue;
      if (p.ch < 3) { p.rc += dt; if (p.rc >= CHARGE_T) { p.ch++; p.rc = 0; } }
      if (p.st > 0) p.st -= dt;
      if (p.bc > 0) p.bc -= dt;
      if (p.sc > 0) p.sc -= dt;
      if (p.bw > 0) { p.bw -= dt; if (p.bw <= 0) { p.bw = 0; dash(m, i, ev); } }
      if (p.sw >= 0) { p.sw += dt; if (p.sw > 0.34) { p.sw = -1; p.sc = SWING_CD; } }
      if (p.pa >= 0) { p.pa += dt; if (p.pa > 0.8) p.pa = -1; }
    }
    for (i = 0; i < n; i++) {
      p = m.p[i]; if (p.dead) continue;
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
      if (p.dead || p.st > 0) continue;
      l = Math.hypot(p.ix, p.iy);
      if (p.sw < 0 && p.bw <= 0) {
        if (typeof u.aim === 'number' && isFinite(u.aim)) p.fa = u.aim;
        else if (l > 0) p.fa = Math.atan2(p.iy, p.ix);
      }
      if (l > 0) {
        var sp = p.spd * (p.sw >= 0 ? 0.6 : 1) * (parrying(p) ? 0.5 : 1) * (p.bw > 0 ? 0.3 : 1);
        p.x = cl(p.x + p.ix * sp * dt, R, W - R);
        p.y = cl(p.y + p.iy * sp * dt, R, H - R);
      }
    }
    if (m.endless) { // keep bots from stacking on top of each other
      for (i = 1; i < n; i++) {
        p = m.p[i]; if (p.dead) continue;
        for (j = i + 1; j < n; j++) {
          q = m.p[j]; if (q.dead) continue;
          var sx = q.x - p.x, sy = q.y - p.y, sd = Math.hypot(sx, sy);
          if (sd > 0 && sd < R * 2) {
            var ps = (R * 2 - sd) / 2; sx /= sd; sy /= sd;
            p.x = cl(p.x - sx * ps, R, W - R); p.y = cl(p.y - sy * ps, R, H - R);
            q.x = cl(q.x + sx * ps, R, W - R); q.y = cl(q.y + sy * ps, R, H - R);
          }
        }
      }
    }
    for (i = 0; i < n; i++) {
      p = m.p[i];
      if (p.dead || p.sw < A0 || p.sw >= A1) continue;
      fs = foes(m, i);
      for (j = 0; j < fs.length; j++) {
        o = fs[j];
        if (p.dead || p.sw < 0) break;
        if (o.dead || p.hs.indexOf(o.i) >= 0) continue;
        var dx = o.x - p.x, dy = o.y - p.y;
        if (Math.hypot(dx, dy) < R + REACH && Math.abs(norm(Math.atan2(dy, dx) - p.fa)) < 1.05) {
          p.hs.push(o.i); resolve(p, o, ev);
        }
      }
    }
    if (m.endless) {
      m.p.forEach(function (c) {
        if (c.dead && !c.rip) {
          c.rip = true;
          ev.push({ t: 'kill', i: c.i, x: c.x, y: c.y });
          if (c.i > 0) m.kills++;
        }
      });
      if (m.p[0].dead) { m.phase = 'roundend'; m.t = 1.2; }
      return;
    }
    var d0 = m.p[0].dead, d1 = m.p[1].dead;
    if (d0 || d1) {
      m.phase = 'roundend'; m.t = 1.7;
      if (!(d0 && d1)) m.score[d0 ? 1 : 0]++;
      m.p.forEach(function (c) { if (c.dead) ev.push({ t: 'kill', i: c.i, x: c.x, y: c.y }); });
    }
  }

  // Advance a match by dt seconds. inp[i] = {x, y, aim?, sw?, pa?, bl?}. Returns events.
  function tick(m, inp, dt) {
    var ev = [];
    if (m.phase === 'ready') { m.t -= dt; if (m.t <= 0) m.phase = 'fight'; }
    else if (m.phase === 'fight') {
      if (m.endless) endlessStep(m, inp, dt, ev);
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

  var api = { W: W, H: H, R: R, PAR: PAR, A0: A0, A1: A1, REACH: REACH, CHARGE_T: CHARGE_T, SWING_CD: SWING_CD, BLINK_D: BLINK_D, BLINK_WIND: BLINK_WIND,
              create: create, createEndless: createEndless, tick: tick };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shared = api;
})(typeof self !== 'undefined' ? self : this);
