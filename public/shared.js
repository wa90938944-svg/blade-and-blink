// Game rules shared by the server (authoritative online matches) and the
// browser (local bot / 2-player modes), so every mode plays identically.
(function (root) {
  var W = 640, H = 400, R = 13, PAR = 0.24, A0 = 0.1, A1 = 0.22;

  function mk(i, x, fa) {
    return { i: i, x: x, y: H / 2, fa: fa, ch: 3, rc: 0, st: 0, sw: -1, hit: false,
             pa: -1, bc: 0, dead: false, ix: 0, iy: 0 };
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

  function resolve(a, d, ev) {
    if (parrying(d)) { a.st = 1.1; a.sw = -1; ev.push({ t: 'parry', x: d.x, y: d.y }); }
    else d.dead = true;
  }

  // k: 'sw' swing, 'pa' parry, 'bl' blink
  function act(m, i, k, ev) {
    var p = m.p[i], o = m.p[1 - i];
    if (p.dead || p.st > 0) return;
    if (k === 'sw' && p.sw < 0 && p.pa < 0) { p.sw = 0; p.hit = false; }
    else if (k === 'pa' && p.sw < 0 && p.pa < 0) { p.pa = 0; }
    else if (k === 'bl' && p.ch > 0 && p.bc <= 0 && p.pa < 0) {
      var dx = p.ix, dy = p.iy;
      if (!dx && !dy) { dx = Math.cos(p.fa); dy = Math.sin(p.fa); }
      var l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      var nx = cl(p.x + dx * 145, R, W - R), ny = cl(p.y + dy * 145, R, H - R);
      ev.push({ t: 'blink', i: i, x1: p.x, y1: p.y, x2: nx, y2: ny });
      if (!o.dead && segd(p.x, p.y, nx, ny, o.x, o.y) < R + 11) resolve(p, o, ev);
      p.x = nx; p.y = ny; p.fa = Math.atan2(dy, dx); p.ch--; p.bc = 0.18; p.sw = -1;
    }
  }

  function simulate(m, inp, dt, ev) {
    var i, p, o, u, l;
    for (i = 0; i < 2; i++) {
      p = m.p[i];
      if (p.ch < 3) { p.rc += dt; if (p.rc >= 2.2) { p.ch++; p.rc = 0; } }
      if (p.st > 0) p.st -= dt;
      if (p.bc > 0) p.bc -= dt;
      if (p.sw >= 0) { p.sw += dt; if (p.sw > 0.38) p.sw = -1; }
      if (p.pa >= 0) { p.pa += dt; if (p.pa > 0.8) p.pa = -1; }
    }
    for (i = 0; i < 2; i++) {
      p = m.p[i]; u = inp[i] || {};
      var x = +u.x || 0, y = +u.y || 0; l = Math.hypot(x, y);
      if (l > 0) { x /= l; y /= l; }
      p.ix = x; p.iy = y;
      if (u.sw) act(m, i, 'sw', ev);
      if (u.pa) act(m, i, 'pa', ev);
      if (u.bl) act(m, i, 'bl', ev);
    }
    for (i = 0; i < 2; i++) {
      p = m.p[i]; u = inp[i] || {};
      if (p.dead || p.st > 0) continue;
      l = Math.hypot(p.ix, p.iy);
      if (p.sw < 0) {
        if (typeof u.aim === 'number' && isFinite(u.aim)) p.fa = u.aim;
        else if (l > 0) p.fa = Math.atan2(p.iy, p.ix);
      }
      if (l > 0) {
        var sp = 200 * (p.sw >= 0 ? 0.45 : 1) * (parrying(p) ? 0.5 : 1);
        p.x = cl(p.x + p.ix * sp * dt, R, W - R);
        p.y = cl(p.y + p.iy * sp * dt, R, H - R);
      }
    }
    for (i = 0; i < 2; i++) {
      p = m.p[i]; o = m.p[1 - i];
      if (p.dead || p.sw < A0 || p.sw >= A1 || p.hit) continue;
      var dx = o.x - p.x, dy = o.y - p.y;
      if (Math.hypot(dx, dy) < R * 2 + 34 && Math.abs(norm(Math.atan2(dy, dx) - p.fa)) < 1.05) {
        p.hit = true; resolve(p, o, ev);
      }
    }
    var d0 = m.p[0].dead, d1 = m.p[1].dead;
    if (d0 || d1) {
      m.phase = 'roundend'; m.t = 1.7;
      if (!(d0 && d1)) m.score[d0 ? 1 : 0]++;
      m.p.forEach(function (q) { if (q.dead) ev.push({ t: 'kill', i: q.i, x: q.x, y: q.y }); });
    }
  }

  // Advance a match by dt seconds. inp[i] = {x, y, aim?, sw?, pa?, bl?}. Returns events.
  function tick(m, inp, dt) {
    var ev = [];
    if (m.phase === 'ready') { m.t -= dt; if (m.t <= 0) m.phase = 'fight'; }
    else if (m.phase === 'fight') simulate(m, inp, dt, ev);
    else if (m.phase === 'roundend') {
      m.t -= dt;
      if (m.t <= 0) {
        if (Math.max(m.score[0], m.score[1]) >= m.win) { m.phase = 'over'; m.winner = m.score[0] > m.score[1] ? 0 : 1; }
        else { m.round++; reset(m); }
      }
    }
    return ev;
  }

  var api = { W: W, H: H, R: R, PAR: PAR, A0: A0, A1: A1, create: create, tick: tick };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shared = api;
})(typeof self !== 'undefined' ? self : this);
