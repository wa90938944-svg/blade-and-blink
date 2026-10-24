(function () {
  'use strict';
  var S = Shared, W = S.W, H = S.H, R = S.R, PAR = S.PAR, A0 = S.A0, A1 = S.A1;
  var $ = function (i) { return document.getElementById(i); };
  var cv = $('c'), ctx = cv.getContext('2d');
  var COL = ['#6fe3ff', '#ff5a4d'];
  var RANKS = [
    { n: 'Bronze', min: 0, next: 501, c: '#cd7f32' },
    { n: 'Silver', min: 501, next: 1001, c: '#c4ccd8' },
    { n: 'Gold', min: 1001, next: 1001, c: '#ffc933' }
  ];
  var CTRL = [
    { u: 'w', d: 's', l: 'a', r: 'd', sw: 'f', pa: 'g', bl: 'h' },
    { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight', sw: ',', pa: '.', bl: '/' }
  ];
  var sock = typeof io !== 'undefined' ? io() : null;
  var mode = null, lastKind = 'bot', M = null, me = 0, names = ['P1', 'P2'], prof = null;
  var fx = [], keys = {}, pend = [{}, {}], disp = [{ x: 0, y: 0 }, { x: 0, y: 0 }], snap = true;
  var lastPhase = '', lastScore = [0, 0], msg = '', msgT = 0, shake = 0;
  var mouse = { x: W / 2, y: H / 2 }, qT = 0, qI = null, bot = { x: 0, y: 0, t: 0 };

  // ---------- screens & profile ----------
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (e) { e.classList.toggle('on', e.id === id); });
    $('ov').style.display = id ? 'flex' : 'none';
  }
  function showLobby() {
    $('card').style.display = prof ? '' : 'none';
    $('rank').disabled = !prof;
    show('lobby');
  }
  function setProfile(p) {
    prof = p;
    var r = RANKS.filter(function (x) { return x.n === p.rank; })[0];
    $('badge').textContent = r.n[0];
    $('badge').style.setProperty('--rc', r.c);
    $('uname').textContent = p.name;
    $('rname').textContent = r.n;
    $('rname').style.color = r.c;
    $('mmr').textContent = p.mmr + ' MMR';
    $('wl').textContent = p.wins + 'W ' + p.losses + 'L';
    var hasNext = r.next > r.min;
    $('prog').style.width = (hasNext ? Math.min(1, (p.mmr - r.min) / (r.next - r.min)) * 100 : 100) + '%';
    $('prog').style.background = r.c;
    $('nextlbl').textContent = hasNext ? (r.next - p.mmr) + ' to ' + RANKS[RANKS.indexOf(r) + 1].n : 'Top rank';
  }
  function result(title, d1, d2, delta) {
    $('rt').textContent = title;
    $('rd').textContent = d1 || '';
    $('rd2').textContent = d2 || '';
    var e = $('rdelta');
    e.textContent = delta || '';
    e.style.display = delta ? '' : 'none';
    e.className = delta && delta[0] === '+' ? 'up' : 'down';
    show('result');
  }
  function pips(n, win) { var s = ''; for (var i = 0; i < win; i++) s += i < n ? '\u25CF' : '\u25CB'; return s; }
  function hud() {
    if (!M) return;
    $('s0').textContent = names[0] + ' ' + pips(M.score[0], M.win);
    $('s1').textContent = pips(M.score[1], M.win) + ' ' + names[1];
    $('rnd').textContent = (mode === 'online' ? 'Ranked, round ' : 'Round ') + M.round;
  }

  // ---------- login / lobby / queue ----------
  $('name').value = localStorage.getItem('bb_name') || '';
  $('enter').onclick = function () {
    $('err').textContent = '';
    if (!sock) { $('err').textContent = 'Server not reachable. Run npm start and open the page from it.'; return; }
    var n = $('name').value.trim();
    sock.emit('login', n, function (r) {
      if (r.err) { $('err').textContent = r.err; return; }
      localStorage.setItem('bb_name', n);
      setProfile(r.profile);
      showLobby();
    });
  };
  $('name').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('enter').click(); });
  $('offline').onclick = function () { prof = null; showLobby(); };
  $('rank').onclick = enterQueue;
  $('bot').onclick = function () { startLocal('bot'); };
  $('local').onclick = function () { startLocal('local'); };
  $('cancel').onclick = function () { sock.emit('unqueue'); clearInterval(qI); showLobby(); };
  $('tolobby').onclick = showLobby;
  $('again').onclick = function () { if (lastKind === 'online') enterQueue(); else startLocal(lastKind); };

  function enterQueue() {
    lastKind = 'online'; qT = 0;
    $('qt').textContent = '0:00';
    show('queue');
    sock.emit('queue');
    clearInterval(qI);
    qI = setInterval(function () {
      qT++;
      $('qt').textContent = Math.floor(qT / 60) + ':' + ('0' + (qT % 60)).slice(-2);
    }, 1000);
  }

  // ---------- starting matches ----------
  function beginView() {
    fx = []; snap = true; lastPhase = ''; lastScore = [0, 0]; msgT = 0; bot.x = bot.y = 0;
    show(null); hud();
  }
  function startLocal(k) {
    lastKind = k; mode = k; M = S.create(4); me = 0;
    names = ['P1', k === 'bot' ? 'Bot' : 'P2'];
    beginView();
  }

  if (sock) {
    sock.on('connect', function () {
      if (prof) sock.emit('login', prof.name, function (r) { if (r.ok) setProfile(r.profile); });
    });
    sock.on('match', function (d) {
      console.log('match found', d);
      clearInterval(qI);
      mode = 'online'; lastKind = 'online'; me = d.you; names = d.names; M = null;
      beginView();
      $('rnd').textContent = 'Ranked';
    });
    sock.on('s', function (d) {
      if (mode !== 'online') return;
      if (!M) console.log('first snapshot', d.m);
      M = d.m; onEv(d.ev);
    });
    sock.on('end', function (d) {
      mode = null;
      setProfile(d.profile);
      var won = d.winner === d.you;
      result(won ? 'Victory' : 'Defeat',
        names[0] + ' ' + d.score[0] + ' - ' + d.score[1] + ' ' + names[1] + (d.forfeit ? ' (opponent left)' : ''),
        d.profile.rank + ', ' + d.profile.mmr + ' MMR',
        (d.delta > 0 ? '+' : '') + d.delta + ' MMR');
    });
    sock.on('disconnect', function () {
      if (mode === 'online') { mode = null; result('Disconnected', 'Lost connection to the server.', '', ''); }
    });
  }

  // ---------- events & effects ----------
  function say(t, s) { msg = t; msgT = s; }
  function burst(x, y, c, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 7, sp = 60 + Math.random() * 260;
      fx.push({ k: 'p', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.5 + Math.random() * 0.6, c: c });
    }
  }
  function onEv(ev) {
    (ev || []).forEach(function (e) {
      if (e.t === 'blink') fx.push({ k: 'l', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, t: 0.4, c: COL[e.i] });
      else if (e.t === 'parry') { burst(e.x, e.y, '#ffe27a', 22); say('Parried!', 0.8); shake = 6; }
      else if (e.t === 'kill') { burst(e.x, e.y, COL[e.i], 40); shake = 10; }
    });
  }
  function watch() {
    if (!M || M.phase === lastPhase) return;
    lastPhase = M.phase;
    if (M.phase === 'ready') { say('Round ' + M.round, 1.3); snap = true; }
    else if (M.phase === 'fight') say('Fight!', 0.6);
    else if (M.phase === 'roundend') {
      var w = M.score[0] > lastScore[0] ? 0 : M.score[1] > lastScore[1] ? 1 : -1;
      say(w < 0 ? 'Double KO' : names[w] + ' scores', 1.7);
      lastScore = M.score.slice();
    }
    hud();
  }

  // ---------- input ----------
  addEventListener('keydown', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (mode && (k.indexOf('Arrow') === 0 || k === ' ' || k === '/' || k === ',' || k === '.')) e.preventDefault();
    keys[k] = true;
    if (!mode || e.repeat) return;
    if (mode === 'online') {
      if (k === ' ') sock.emit('act', 'bl');
      else if (k === 'e') sock.emit('act', 'pa');
      return;
    }
    for (var i = 0; i < (mode === 'bot' ? 1 : 2); i++) {
      var c = CTRL[i];
      if (k === c.sw) pend[i].sw = true;
      else if (k === c.pa) pend[i].pa = true;
      else if (k === c.bl) pend[i].bl = true;
    }
  });
  addEventListener('keyup', function (e) { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
  addEventListener('blur', function () { keys = {}; });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('mousemove', function (e) {
    var r = cv.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * W / r.width;
    mouse.y = (e.clientY - r.top) * H / r.height;
  });
  cv.addEventListener('mousedown', function (e) {
    if (mode !== 'online') return;
    if (e.button === 0) sock.emit('act', 'sw');
    else if (e.button === 2) sock.emit('act', 'pa');
  });
  setInterval(function () {
    if (mode !== 'online' || !M) return;
    var d = disp[me];
    sock.emit('in', {
      x: ((keys.d || keys.ArrowRight) ? 1 : 0) - ((keys.a || keys.ArrowLeft) ? 1 : 0),
      y: ((keys.s || keys.ArrowDown) ? 1 : 0) - ((keys.w || keys.ArrowUp) ? 1 : 0),
      aim: Math.atan2(mouse.y - d.y, mouse.x - d.x)
    });
  }, 33);

  function localInp(i) {
    var c = CTRL[i];
    var o = { x: (keys[c.r] ? 1 : 0) - (keys[c.l] ? 1 : 0), y: (keys[c.d] ? 1 : 0) - (keys[c.u] ? 1 : 0) };
    ['sw', 'pa', 'bl'].forEach(function (k) { o[k] = pend[i][k]; pend[i][k] = false; });
    return o;
  }
  function botInp(dt) {
    var b = M.p[1], a = M.p[0], o = { x: bot.x, y: bot.y };
    bot.t -= dt;
    if (bot.t <= 0 && !a.dead && !b.dead) {
      bot.t = 0.09 + Math.random() * 0.1;
      var dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      var face = Math.cos(b.fa) * ux + Math.sin(b.fa) * uy;
      bot.x = ux; bot.y = uy;
      if (a.sw >= 0 && a.sw < 0.2 && d < R + 78 && Math.random() < 0.45) o.pa = true;
      else if (d > 170) { if (b.ch > 1 && Math.random() < 0.22) { o.x = ux; o.y = uy; o.bl = true; } }
      else if (d < R + 50) { if ((face > 0.7 && Math.random() < 0.6) || a.st > 0) o.sw = true; }
      else { var s = Math.random() < 0.5 ? 1 : -1; bot.x = ux * 0.75 - uy * 0.6 * s; bot.y = uy * 0.75 + ux * 0.6 * s; }
    }
    return o;
  }

  // ---------- render ----------
  function smooth() {
    if (!M) return;
    for (var i = 0; i < 2; i++) {
      var p = M.p[i], d = disp[i];
      if (snap || mode !== 'online' || Math.hypot(p.x - d.x, p.y - d.y) > 60) { d.x = p.x; d.y = p.y; }
      else { d.x += (p.x - d.x) * 0.5; d.y += (p.y - d.y) * 0.5; }
    }
    snap = false;
  }
  function fxStep(dt) {
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i]; f.t -= dt;
      if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.94; f.vy *= 0.94; }
      if (f.t <= 0) fx.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - 40 * dt);
    if (msgT > 0) msgT -= dt;
  }
  function draw(now) {
    ctx.save();
    ctx.fillStyle = '#0d0d16'; ctx.fillRect(0, 0, W, H);
    if (!M) {
      if (mode === 'online') {
        ctx.fillStyle = '#8d8a99'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Match found, waiting for the server...', W / 2, H / 2);
      }
      ctx.restore(); return;
    }
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.strokeStyle = 'rgba(180,170,220,.07)'; ctx.lineWidth = 1; ctx.beginPath();
    var x, y;
    for (x = 40; x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (y = 40; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.strokeStyle = '#2c2a44'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.strokeStyle = 'rgba(180,170,220,.18)'; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
    fx.forEach(function (f) {
      if (f.k === 'l') {
        ctx.globalAlpha = Math.max(0, f.t / 0.4); ctx.strokeStyle = f.c; ctx.lineWidth = 8;
        ctx.shadowColor = f.c; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = f.c; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); ctx.globalAlpha = 1;
      }
    });
    M.p.forEach(function (p, i) {
      if (p.dead) return;
      var px = disp[i].x, py = disp[i].y, c = COL[i];
      if (p.sw >= 0) {
        var act = p.sw >= A0 && p.sw < A1;
        ctx.globalAlpha = act ? 0.85 : 0.2; ctx.fillStyle = act ? '#fff' : c;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, R + 34, p.fa - 1.05, p.fa + 1.05); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (p.pa >= 0) {
        var on = p.pa < PAR;
        ctx.strokeStyle = on ? '#ffe27a' : 'rgba(255,226,122,.25)'; ctx.lineWidth = on ? 4 : 2;
        ctx.beginPath(); ctx.arc(px, py, R + 9 + (on ? p.pa * 20 : 0), 0, 7); ctx.stroke();
      }
      ctx.shadowColor = c; ctx.shadowBlur = 18; ctx.fillStyle = p.st > 0 ? '#ddd' : c;
      ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(px + Math.cos(p.fa) * R * 0.4, py + Math.sin(p.fa) * R * 0.4);
      ctx.lineTo(px + Math.cos(p.fa) * (R + 14), py + Math.sin(p.fa) * (R + 14)); ctx.stroke();
      if (p.st > 0) {
        ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2;
        for (var k = 0; k < 3; k++) { var a = now / 120 + k * 2.1; ctx.beginPath(); ctx.arc(px + Math.cos(a) * 15, py - R - 8 + Math.sin(a) * 4, 3, 0, 7); ctx.stroke(); }
      }
      if (mode === 'online' && i === me) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "Trebuchet MS",sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('YOU', px, py - R - 18);
      }
    });
    M.p.forEach(function (p, i) {
      var bx = i === 0 ? 20 : W - 20 - 3 * 22;
      for (var k = 0; k < 3; k++) {
        var full = k < p.ch, part = k === p.ch;
        ctx.save(); ctx.translate(bx + k * 22 + 8, H - 18); ctx.rotate(0.785);
        ctx.strokeStyle = COL[i]; ctx.lineWidth = 2; ctx.fillStyle = COL[i];
        if (full) ctx.fillRect(-6, -6, 12, 12);
        else {
          ctx.globalAlpha = 0.4; ctx.strokeRect(-6, -6, 12, 12);
          if (part) { ctx.globalAlpha = 0.7; var h = 12 * (p.rc / 2.2); ctx.fillRect(-6, 6 - h, 12, h); }
        }
        ctx.restore();
      }
    });
    if (msgT > 0) {
      ctx.globalAlpha = Math.min(1, msgT * 3); ctx.fillStyle = '#f1ece4';
      ctx.font = 'bold 44px "Trebuchet MS",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(msg, W / 2, H / 2 - 60); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    try { frame(now, dt); } catch (err) { fail(err); }
    requestAnimationFrame(loop);
  }
  function fail(err) {
    console.error('Blade & Blink render error:', err);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0d16'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff5a4d'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Render error: ' + ((err && err.message) || err), W / 2, H / 2);
  }
  function frame(now, dt) {
    if (M && (mode === 'bot' || mode === 'local') && M.phase !== 'over') {
      var inp = [localInp(0), mode === 'bot' ? botInp(dt) : localInp(1)];
      onEv(S.tick(M, inp, dt));
      if (M.phase === 'over') {
        var w = M.winner;
        result(mode === 'bot' ? (w === 0 ? 'You win!' : 'The bot wins') : names[w] + ' wins!',
          names[0] + ' ' + M.score[0] + ' - ' + M.score[1] + ' ' + names[1], '', '');
        mode = null;
      }
    }
    watch(); smooth();
    fxStep(M && M.phase === 'roundend' ? dt * 0.4 : dt);
    draw(now);
  }
  requestAnimationFrame(loop);
})();
