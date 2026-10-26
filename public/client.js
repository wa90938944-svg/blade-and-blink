(function () {
  'use strict';
  var S = Shared, W = S.W, H = S.H, R = S.R, PAR = S.PAR, A0 = S.A0, A1 = S.A1;
  var missing = [];
  // a missing element must never take the whole game down (a stale cached page, a partial upload...):
  // hand back a harmless stand-in and remember it so we can tell the player what is wrong
  var $ = function (i) {
    var e = document.getElementById(i);
    if (e) return e;
    if (missing.indexOf(i) < 0) missing.push(i);
    return document.createElement('div');
  };
  var cv = $('c'), ctx = cv.getContext('2d');
  var COL = ['#191514', '#c9331f'], GOLD = '#b8891f', PAPER = '#e8dfc9', INK = '#191514';
  var RANKS = [
    { n: 'Bronze', min: 0, next: 501, c: '#cd7f32' },
    { n: 'Silver', min: 501, next: 1001, c: '#b8b3a8' },
    { n: 'Gold', min: 1001, next: 1001, c: '#d9a526' }
  ];
  var RANK_NAMES = RANKS.map(function (r) { return r.n; });
  var CTRL = [
    { u: 'w', d: 's', l: 'a', r: 'd', sw: 'f', pa: 'g', bl: 'h' },
    { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight', sw: ',', pa: '.', bl: '/' }
  ];
  var sock = typeof io !== 'undefined' ? io() : null;
  var mode = null, lastKind = 'bot', M = null, me = 0, names = ['P1', 'P2'], vs = null, prof = null;
  var fx = [], keys = {}, pend = [{}, {}], disp = [{ x: 0, y: 0 }, { x: 0, y: 0 }], snap = true;
  var lastPhase = '', lastScore = [0, 0], msg = '', msgT = 0, msgD = 1;
  var shake = 0, punch = 0, flash = 0, freeze = 0;
  var mouse = { x: W / 2, y: H / 2 }, qT = 0, qI = null, bot = { x: 0, y: 0, t: 0 }, fArm = 0, cur = 'login', authMode = 'login', claimToken = '', toastT = 0;
  var calm = false; // respect "reduce motion": no shake, zoom punch or flashes
  try { calm = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var touch = false; // phones and tablets: show the on-screen stick and buttons
  try { touch = matchMedia('(pointer: coarse)').matches; } catch (e) {}
  var sv = { x: 0, y: 0 }, sid = null;
  try { document.fonts.load('40px "Dela Gothic One"'); document.fonts.load('600 14px "Barlow Condensed"'); } catch (e) {}
  function snd(n, x) { if (typeof Sfx !== 'undefined') Sfx.play(n, x); }
  function vib(ms) { try { if (touch && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  // ---------- account token: proves this browser owns its username ----------
  function getToken() { try { return localStorage.getItem('bb_token') || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) localStorage.setItem('bb_token', t); else localStorage.removeItem('bb_token'); } catch (e) {} }

  // ---------- screens & profile ----------
  function disarm() {
    if (fArm) { clearTimeout(fArm); fArm = 0; }
    var f = $('forfeit'); f.textContent = 'Forfeit'; f.classList.remove('arm');
  }
  function show(id) {
    cur = id;
    document.querySelectorAll('.screen').forEach(function (e) { e.classList.toggle('on', e.id === id); });
    $('ov').style.display = id ? 'flex' : 'none';
    $('forfeit').hidden = !(id === null && mode);
    $('pad').hidden = !(touch && id === null && mode);
    sv.x = 0; sv.y = 0; sid = null; $('knob').style.transform = '';
    disarm();
  }
  function showLobby() {
    $('card').style.display = prof ? '' : 'none';
    $('rank').disabled = !prof;
    $('boardbtn').hidden = !sock;
    $('savebtn').hidden = !prof;
    $('logout').hidden = !prof;
    $('local').hidden = touch; // two players on one keyboard needs a keyboard
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
    $('wl').textContent = p.wins + 'W ' + p.losses + 'L' + (p.streak >= 2 ? '  \u00D7' + p.streak : '');
    $('card').title = 'Peak ' + (p.peak || p.mmr) + ' MMR, ' + (p.games || 0) + ' games. Unlocked: ' + (p.unlocked || []).join(', ');
    var hasNext = r.next > r.min;
    $('prog').style.width = (hasNext ? Math.min(1, (p.mmr - r.min) / (r.next - r.min)) * 100 : 100) + '%';
    $('prog').style.background = r.c;
    $('nextlbl').textContent = hasNext ? (r.next - p.mmr) + ' to ' + RANKS[RANKS.indexOf(r) + 1].n : 'Top rank';
  }
  function result(title, d1, d2, delta, sound) {
    $('rt').textContent = title;
    $('rd').textContent = d1 || '';
    $('rd2').textContent = d2 || '';
    var e = $('rdelta');
    e.textContent = delta || '';
    e.style.display = delta ? '' : 'none';
    e.className = delta && delta[0] === '+' ? 'up' : 'down';
    show('result');
    if (sound) snd(sound);
  }
  function pips(n, win) { var s = ''; for (var i = 0; i < win; i++) s += i < n ? '\u25CF' : '\u25CB'; return s; }
  function hud() {
    if (!M) return;
    if (M.endless) {
      $('s0').textContent = 'Kills ' + M.kills;
      $('s1').textContent = 'Bots ' + M.p.filter(function (q) { return q.i > 0 && !q.dead; }).length;
      $('rnd').textContent = 'Endless ' + Math.floor(M.time) + 's';
      return;
    }
    $('s0').textContent = names[0] + ' ' + pips(M.score[0], M.win);
    $('s1').textContent = pips(M.score[1], M.win) + ' ' + names[1];
    $('rnd').textContent = (mode === 'online' ? 'Ranked, round ' : 'Round ') + M.round;
  }

  // ---------- login / lobby / queue ----------
  try { $('name').value = localStorage.getItem('bb_name') || ''; } catch (e) {}

  // brutalist notification: stark black block, thick border, hard shadow
  function toast(text, bad) {
    var t = $('toast');
    t.textContent = text; t.className = bad ? 'bad' : ''; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.hidden = true; }, 2400);
  }

  // login | register | claim (an old account from before passwords: set a password for it)
  function setAuthMode(m, name) {
    authMode = m;
    var reg = m !== 'login';
    $('pass2').hidden = !reg;
    $('pass').autocomplete = reg ? 'new-password' : 'current-password';
    $('enter').textContent = m === 'login' ? 'Log in' : m === 'register' ? 'Create account' : 'Set password';
    $('switch').textContent = m === 'login' ? 'New here? Create an account' : 'Have an account? Log in';
    $('switch').hidden = m === 'claim';
    $('authSub').textContent = m === 'claim' ? 'Welcome back, ' + name + '. Set a password to secure your account.'
      : m === 'register' ? 'Pick a username and a password (8+ characters).' : 'Log in to climb the ranked ladder.';
    if (name) $('name').value = name;
    $('name').disabled = m === 'claim';
    $('pass').value = ''; $('pass2').value = ''; $('err').textContent = '';
  }
  function signedIn(r) { // r: { token, profile } from the server
    setToken(r.token);
    try { localStorage.setItem('bb_name', r.profile.name); } catch (e) {}
    $('pass').value = ''; $('pass2').value = '';
    setProfile(r.profile);
    showLobby();
  }
  function toLogin(msg) { // back to the login screen (session ended, logged out, ...)
    prof = null; mode = null;
    setAuthMode('login'); show('login');
    if (msg) $('err').textContent = msg;
  }
  $('enter').onclick = function () {
    var err = $('err'); err.textContent = '';
    if (!sock) { err.textContent = 'Server not reachable. Run npm start and open the page from it.'; return; }
    var pw = $('pass').value, n = $('name').value.trim();
    if (!n && authMode !== 'claim') { err.textContent = 'Enter a username'; return; }
    if (!pw) { err.textContent = 'Enter a password'; return; }
    if (authMode !== 'login') {
      if (pw.length < 8) { err.textContent = 'Password must be at least 8 characters'; return; }
      if (pw !== $('pass2').value) { err.textContent = 'Passwords do not match'; return; }
    }
    var b = $('enter'), settled = false;
    b.disabled = true;
    var wait = setTimeout(function () { if (!settled) { settled = true; b.disabled = false; err.textContent = 'No answer from the server, try again'; } }, 10000);
    var done = function (r) {
      if (settled) return;
      settled = true; clearTimeout(wait); b.disabled = false;
      if (!r || r.err) { err.textContent = (r && r.err) || 'Something went wrong'; $('pass').value = ''; $('pass2').value = ''; return; }
      signedIn(r);
    };
    if (authMode === 'claim') sock.emit('claim', { token: claimToken, password: pw }, done);
    else sock.emit(authMode === 'login' ? 'login' : 'register', { name: n, password: pw }, done);
  };
  $('switch').onclick = function () { setAuthMode(authMode === 'login' ? 'register' : 'login'); };
  ['name', 'pass', 'pass2'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') $('enter').click(); });
  });
  $('logout').onclick = function () {
    sock.emit('logout', function (r) {
      if (r && r.err) { toast(r.err, true); return; }
      setToken('');
      toLogin('');
    });
  };

  // "Save Data": asks the server to write this account to disk. The server checks the live session and the
  // session token; rating and unlocks are the server's own numbers, only the equipped cosmetics come from here.
  function readEquipped() { try { return JSON.parse(localStorage.getItem('bb_equipped') || '{}') || {}; } catch (e) { return {}; } }
  $('savebtn').onclick = function () {
    var b = $('savebtn'), settled = false;
    if (b.disabled) return;
    b.disabled = true;
    var wait = setTimeout(function () { if (!settled) { settled = true; b.disabled = false; toast('Save timed out', true); } }, 8000);
    sock.emit('save', { token: getToken(), equipped: readEquipped() }, function (r) {
      if (settled) return;
      settled = true; clearTimeout(wait); b.disabled = false;
      if (r && r.ok) { setProfile(r.profile); toast('Data Saved \u2713'); }
      else toast('Save failed \u2717', true);
    });
  };
  $('offline').onclick = function () { prof = null; showLobby(); };
  $('rank').onclick = enterQueue;
  $('bot').onclick = function () { startLocal('bot'); };
  $('local').onclick = function () { startLocal('local'); };
  $('endless').onclick = function () { startLocal('endless'); };
  $('cancel').onclick = function () { sock.emit('unqueue'); clearInterval(qI); showLobby(); };
  $('tolobby').onclick = showLobby;
  $('again').onclick = function () { if (lastKind === 'online') enterQueue(); else startLocal(lastKind); };
  $('boardbtn').onclick = function () {
    sock.emit('top', function (rows) { renderBoard(rows || []); show('board'); });
  };
  $('boardback').onclick = showLobby;
  $('mute').onclick = function () { Sfx.toggle(); syncMute(); };
  function syncMute() { $('mute').textContent = Sfx.isOn() ? 'Sound on' : 'Sound off'; }
  if (typeof Sfx !== 'undefined') syncMute();

  function renderBoard(rows) {
    var ol = $('boardlist');
    while (ol.firstChild) ol.removeChild(ol.firstChild);
    if (!rows.length) {
      var e = document.createElement('li'); e.textContent = 'No ranked games played yet'; ol.appendChild(e); return;
    }
    rows.forEach(function (r, i) {
      var li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('span');
      a.textContent = (i + 1) + '. ' + r.name;
      b.textContent = r.rank + '  ' + r.mmr;
      if (prof && r.name === prof.name) li.className = 'me';
      li.appendChild(a); li.appendChild(b); ol.appendChild(li);
    });
  }

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

  // ---------- forfeit (click twice within 3 seconds, so a stray click can't cost you a ranked game) ----------
  $('forfeit').onclick = function () {
    if (!mode) return;
    var b = $('forfeit');
    if (!fArm) {
      b.textContent = 'Click again to forfeit'; b.classList.add('arm');
      fArm = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    forfeit();
  };
  function forfeit() {
    if (mode === 'online') { sock.emit('forfeit'); return; } // the server ends the match and sends 'end'
    var k = mode; mode = null;
    if (k === 'endless') endResult('Run ended');
    else if (k === 'bot') result('You forfeited', 'The bot takes the win.', '', '', 'lose');
    else result('Match abandoned', names[0] + ' ' + M.score[0] + ' - ' + M.score[1] + ' ' + names[1], '', '');
  }

  // ---------- starting matches ----------
  function beginView() {
    fx = []; snap = true; lastPhase = ''; lastScore = [0, 0]; msgT = 0; bot.x = bot.y = 0;
    shake = punch = flash = freeze = 0;
    inkX.clearRect(0, 0, W, H);
    show(null); hud();
  }
  function startLocal(k) {
    lastKind = k; mode = k; vs = null; me = 0;
    M = k === 'endless' ? S.createEndless() : S.create(4);
    names = k === 'endless' ? ['You', 'Bots'] : ['P1', k === 'bot' ? 'Bot' : 'P2'];
    beginView();
  }

  if (sock) {
    // on every (re)connect, pick the session back up from the token this browser holds
    var resume = function (n) {
      var t = getToken();
      if (!t) return;
      sock.emit('resume', { token: t }, function (r) {
        if (r && r.ok) { setProfile(r.profile); if (cur === 'login') showLobby(); }
        else if (r && r.legacy) { claimToken = t; setAuthMode('claim', r.name); if (cur === 'login') show('login'); }
        else if (r && r.err === 'Please log in') { setToken(''); if (prof || cur !== 'login') toLogin('Your session ended, please log in again.'); }
        else if (n < 5) setTimeout(function () { resume(n + 1); }, 2000);
      });
    };
    sock.on('connect', function () { resume(0); });
    sock.on('match', function (d) {
      clearInterval(qI);
      mode = 'online'; lastKind = 'online'; me = d.you; names = d.names; M = null;
      vs = { ranks: d.ranks, mmrs: d.mmrs };
      beginView();
      $('rnd').textContent = 'Ranked';
    });
    sock.on('s', function (d) {
      if (mode !== 'online') return;
      M = d.m; onEv(d.ev);
    });
    sock.on('end', function (d) {
      mode = null;
      var oldRank = prof && prof.rank;
      setProfile(d.profile);
      var won = d.winner === d.you;
      var why = d.forfeit ? (d.quit === d.you ? 'You forfeited. ' : 'Opponent forfeited. ') : '';
      var line = d.profile.rank + ', ' + d.profile.mmr + ' MMR';
      var from = RANK_NAMES.indexOf(d.oldRank || oldRank), to = RANK_NAMES.indexOf(d.profile.rank);
      if (from >= 0 && to > from) line = 'Promoted to ' + d.profile.rank + '!';
      else if (from >= 0 && to < from) line = 'Dropped to ' + d.profile.rank;
      else if (d.profile.streak >= 3) line += '  (' + d.profile.streak + ' wins in a row)';
      result(won ? 'Victory' : 'Defeat', why + names[0] + ' ' + d.score[0] + ' - ' + d.score[1] + ' ' + names[1],
        line, (d.delta > 0 ? '+' : '') + d.delta + ' MMR', won ? 'win' : 'lose');
    });
    sock.on('kicked', function () { toLogin('You signed in somewhere else.'); });
    sock.on('unauth', function () { setToken(''); toLogin('Your session ended, please log in again.'); });
    sock.on('disconnect', function () {
      if (mode === 'online') { mode = null; result('Disconnected', 'Lost connection to the server.', '', '', 'lose'); }
    });
    sock.on('stats', function (d) {
      document.querySelectorAll('.stats').forEach(function (e) { e.textContent = d.online + ' online, ' + d.queue + ' searching'; });
    });
    setInterval(function () {
      if (!sock.connected) return;
      var t = Date.now();
      sock.volatile.emit('pg', function () { $('ping').textContent = (Date.now() - t) + ' ms'; });
    }, 2000);
  }

  // ---------- layers: ink stains, paper grain, vignette ----------
  function mkCanvas() { var c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
  var inkC = mkCanvas(), inkX = inkC.getContext('2d'), grainC = mkCanvas(), vigC = mkCanvas();
  (function () {
    var g = grainC.getContext('2d'), i;
    for (i = 0; i < 5000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(60,40,20,.10)' : 'rgba(255,250,235,.10)';
      g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }
    var v = vigC.getContext('2d'), gr = v.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    gr.addColorStop(0, 'rgba(60,40,20,0)'); gr.addColorStop(1, 'rgba(60,40,20,.30)');
    v.fillStyle = gr; v.fillRect(0, 0, W, H);
  })();
  // stains pile up over a match; each new round fades the old ones by 45% instead of wiping the floor
  function fadeInk() {
    inkX.globalCompositeOperation = 'destination-out'; inkX.fillStyle = 'rgba(0,0,0,0.45)'; inkX.fillRect(0, 0, W, H);
    inkX.globalCompositeOperation = 'source-over';
  }
  function stain(x, y, c, n, spread) {
    inkX.globalAlpha = 0.5; inkX.fillStyle = c;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, d = Math.random() * spread, r = 1 + Math.random() * Math.random() * 7;
      inkX.beginPath(); inkX.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, 6.283); inkX.fill();
    }
    inkX.globalAlpha = 1;
  }
  function streak(x1, y1, x2, y2, c, w) {
    inkX.globalAlpha = w ? 0.3 : 0.16; inkX.strokeStyle = c; inkX.lineWidth = w || 7; inkX.lineCap = 'round';
    inkX.beginPath(); inkX.moveTo(x1, y1); inkX.lineTo(x2, y2); inkX.stroke(); inkX.globalAlpha = 1;
  }

  // ---------- events & effects ----------
  function say(t, s) { msg = t; msgT = s; msgD = s; }
  // A ball that dies breaks into angular shards. They skid outward, slow down, and where each one
  // comes to rest it is stamped onto the floor as a chip in the victim's colour (it stays until the round resets).
  function shatter(x, y, c, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = 120 + Math.random() * 340;
      fx.push({ k: 'd', x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 4, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        a: Math.random() * 6.283, va: (Math.random() - 0.5) * 20, s: 3 + Math.random() * 5.5, n: Math.random() < 0.4 ? 4 : 3,
        t: 1.4, T: 1.4, c: c });
    }
  }
  function shardPath(g, f) {
    g.beginPath();
    for (var i = 0; i < f.n; i++) {
      var an = f.a + i * 6.283 / f.n, rr = f.s * (i % 2 ? 0.55 : 1);
      var qx = f.x + Math.cos(an) * rr, qy = f.y + Math.sin(an) * rr;
      if (i) g.lineTo(qx, qy); else g.moveTo(qx, qy);
    }
    g.closePath();
  }
  function landShard(f) {
    inkX.globalAlpha = 0.85; inkX.fillStyle = f.c; shardPath(inkX, f); inkX.fill(); inkX.globalAlpha = 1;
    stain(f.x, f.y, f.c, 3, 7);
  }
  // the big irregular splat left where the ball broke, with a few drips
  function splat(x, y, c, r) {
    var n = 11, i, an;
    inkX.globalAlpha = 0.55; inkX.fillStyle = c; inkX.beginPath();
    for (i = 0; i < n; i++) {
      an = i / n * 6.283; var rr = r * (0.65 + Math.random() * 0.6);
      if (i) inkX.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); else inkX.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr);
    }
    inkX.closePath(); inkX.fill();
    inkX.strokeStyle = c; inkX.lineWidth = 2; inkX.lineCap = 'round';
    for (i = 0; i < 6; i++) {
      an = Math.random() * 6.283; var len = r * (1.2 + Math.random() * 1.1);
      inkX.beginPath(); inkX.moveTo(x + Math.cos(an) * r * 0.6, y + Math.sin(an) * r * 0.6);
      inkX.lineTo(x + Math.cos(an) * len, y + Math.sin(an) * len); inkX.stroke();
    }
    inkX.globalAlpha = 1;
  }
  function burst(x, y, c, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 7, sp = 60 + Math.random() * 260;
      fx.push({ k: 'p', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.5 + Math.random() * 0.6, c: c });
    }
  }
  function ring(x, y, c, r1, t, w) { fx.push({ k: 'r', x: x, y: y, t: t, T: t, r0: R, r1: r1, c: c, w: w }); }
  function hitStop(t) { if (mode !== 'online') freeze = t; } // online, the server owns the clock
  function onEv(ev) {
    (ev || []).forEach(function (e) {
      var c, small;
      if (e.t === 'swing') snd('swing', e.x);
      else if (e.t === 'raise') snd('raise', e.x);
      else if (e.t === 'shine') snd('shine', e.x);
      else if (e.t === 'blink') {
        c = COL[e.i > 0 ? 1 : 0];
        fx.push({ k: 'l', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, t: 0.4, c: c });
        fx.push({ k: 'g', x: e.x1, y: e.y1, t: 0.35, T: 0.35, c: c });
        streak(e.x1, e.y1, e.x2, e.y2, c);
        snd('blink', e.x1);
      } else if (e.t === 'parry') {
        burst(e.x, e.y, GOLD, 26); ring(e.x, e.y, GOLD, R + 60, 0.45, 5); stain(e.x, e.y, GOLD, 8, 18);
        say(e.b ? 'Dash punished!' : 'Parried!', 0.8);
        shake = 7; punch = 0.02; hitStop(0.08); snd('parry', e.x); vib(15);
      } else if (e.t === 'kill') {
        c = COL[e.i > 0 ? 1 : 0];
        small = !!(M && M.endless && e.i > 0); // a swarm bot dying: keep it light
        shatter(e.x, e.y, c, small ? 8 : 18); burst(e.x, e.y, c, small ? 10 : 22);
        ring(e.x, e.y, c, R + (small ? 44 : 80), 0.55, 6);
        splat(e.x, e.y, c, small ? 12 : 22); stain(e.x, e.y, c, small ? 10 : 26, small ? 20 : 42);
        shake = small ? 4 : 11; punch = small ? 0.012 : 0.035; flash = small ? 0 : 0.35;
        hitStop(small ? 0.03 : 0.12); snd('kill', e.x);
        if (e.i === (mode === 'online' ? me : 0)) vib(90);
      } else if (e.t === 'spawn') { burst(e.x, e.y, COL[1], 14); ring(e.x, e.y, COL[1], R + 30, 0.4, 3); snd('spawn', e.x); }
    });
  }
  function watch() {
    if (!M || M.phase === lastPhase) return;
    lastPhase = M.phase;
    if (M.phase === 'ready') {
      say(M.endless ? 'Survive!' : 'Round ' + M.round, 1.3); snap = true;
      fadeInk(); snd('tick');
    } else if (M.phase === 'fight') { say('Fight!', 0.6); snd('gong'); }
    else if (M.phase === 'roundend') {
      var w = M.score[0] > lastScore[0] ? 0 : M.score[1] > lastScore[1] ? 1 : -1;
      say(M.endless ? 'Overrun!' : w < 0 ? 'Double KO' : names[w] + ' scores', 1.7);
      lastScore = M.score.slice();
    }
    hud();
  }

  // ---------- input ----------
  ['pointerdown', 'keydown'].forEach(function (ev) {
    addEventListener(ev, function () { if (typeof Sfx !== 'undefined') Sfx.unlock(); });
  });
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('button')) snd('click');
  });
  addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'm' && typeof Sfx !== 'undefined') { Sfx.toggle(); syncMute(); return; }
    if (mode && (k.indexOf('Arrow') === 0 || k === ' ' || k === '/' || k === ',' || k === '.')) e.preventDefault();
    keys[k] = true;
    if (!mode || e.repeat) return;
    if (mode === 'online') {
      if (k === ' ') sock.emit('act', 'bl');
      else if (k === 'e') sock.emit('act', 'pa');
      return;
    }
    for (var i = 0; i < (mode === 'bot' || mode === 'endless' ? 1 : 2); i++) {
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
      x: sv.x || (((keys.d || keys.ArrowRight) ? 1 : 0) - ((keys.a || keys.ArrowLeft) ? 1 : 0)),
      y: sv.y || (((keys.s || keys.ArrowDown) ? 1 : 0) - ((keys.w || keys.ArrowUp) ? 1 : 0)),
      aim: touch ? null : Math.atan2(mouse.y - d.y, mouse.x - d.x) // touch: you face where you move
    });
  }, 33);

  function localInp(i) {
    var c = CTRL[i];
    var o = { x: (keys[c.r] ? 1 : 0) - (keys[c.l] ? 1 : 0), y: (keys[c.d] ? 1 : 0) - (keys[c.u] ? 1 : 0) };
    ['sw', 'pa', 'bl'].forEach(function (k) { o[k] = pend[i][k]; pend[i][k] = false; });
    if (i === 0 && (sv.x || sv.y)) { o.x = sv.x; o.y = sv.y; }
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

  // ---------- touch controls ----------
  var stickEl = $('stick'), knob = $('knob');
  function stickMove(e) {
    var r = stickEl.getBoundingClientRect(), max = r.width * 0.3;
    var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
    var k = Math.min(1, d / max);
    knob.style.transform = 'translate(' + (dx / d * k * max) + 'px,' + (dy / d * k * max) + 'px)';
    if (d < max * 0.3) { sv.x = 0; sv.y = 0; } else { sv.x = dx / d; sv.y = dy / d; }
  }
  function stickEnd(e) {
    if (e.pointerId !== sid) return;
    sid = null; sv.x = 0; sv.y = 0; knob.style.transform = '';
  }
  stickEl.addEventListener('pointerdown', function (e) {
    e.preventDefault(); sid = e.pointerId;
    try { stickEl.setPointerCapture(e.pointerId); } catch (x) {}
    stickMove(e);
  });
  stickEl.addEventListener('pointermove', function (e) { if (e.pointerId === sid) { e.preventDefault(); stickMove(e); } });
  stickEl.addEventListener('pointerup', stickEnd);
  stickEl.addEventListener('pointercancel', stickEnd);
  function press(k) {
    if (!mode) return;
    vib(10);
    if (mode === 'online') sock.emit('act', k); else pend[0][k] = true;
  }
  [['tbSwing', 'sw'], ['tbParry', 'pa'], ['tbBlink', 'bl']].forEach(function (b) {
    var btn = $(b[0]);
    btn.addEventListener('pointerdown', function (e) { e.preventDefault(); btn.classList.add('down'); press(b[1]); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { btn.addEventListener(n, function () { btn.classList.remove('down'); }); });
  });
  function padState() { // dim a button while that move is unavailable
    var p = M && M.p[mode === 'online' ? me : 0];
    if (!p || !mode) return;
    $('tbSwing').classList.toggle('cd', p.sc > 0 || p.sw >= 0 || p.bw > 0);
    $('tbParry').classList.toggle('cd', p.pa >= 0);
    $('tbBlink').classList.toggle('cd', p.ch <= 0 || p.bc > 0 || p.bw > 0);
    $('chn').textContent = p.ch;
  }

  // ---------- render ----------
  function smooth() {
    if (!M) return;
    for (var i = 0; i < 2; i++) {
      var p = M.p[i], d = disp[i]; if (!p) continue;
      if (snap || mode !== 'online' || Math.hypot(p.x - d.x, p.y - d.y) > 60) { d.x = p.x; d.y = p.y; }
      else { d.x += (p.x - d.x) * 0.5; d.y += (p.y - d.y) * 0.5; }
    }
    snap = false;
  }
  function fxStep(dt) {
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i]; f.t -= dt;
      if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.94; f.vy *= 0.94; }
      else if (f.k === 'd') {
        var fr = Math.pow(0.03, dt);
        f.vx *= fr; f.vy *= fr; f.va *= fr; f.a += f.va * dt;
        f.x = Math.max(8, Math.min(W - 8, f.x + f.vx * dt)); f.y = Math.max(8, Math.min(H - 8, f.y + f.vy * dt));
        streak(f.px, f.py, f.x, f.y, f.c, 2); f.px = f.x; f.py = f.y;
        if (Math.hypot(f.vx, f.vy) < 24) f.t = 0; // came to rest
      }
      if (f.t <= 0) { if (f.k === 'd') landShard(f); fx.splice(i, 1); }
    }
    shake = Math.max(0, shake - 40 * dt);
    punch = Math.max(0, punch - 0.12 * dt);
    flash = Math.max(0, flash - 1.2 * dt);
    if (msgT > 0) msgT -= dt;
  }
  function draw(now) {
    ctx.save();
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    if (!M) {
      if (mode === 'online') {
        ctx.fillStyle = '#5a4f40'; ctx.font = '600 20px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Match found, waiting for the server...', W / 2, H / 2);
      }
      ctx.restore(); return;
    }
    if (punch > 0 && !calm) {
      ctx.translate(W / 2, H / 2); ctx.scale(1 + punch, 1 + punch); ctx.translate(-W / 2, -H / 2);
    }
    if (shake > 0 && !calm) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.strokeStyle = 'rgba(60,40,20,.10)'; ctx.lineWidth = 1; ctx.beginPath();
    var x, y;
    for (x = 40; x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (y = 40; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.drawImage(inkC, 0, 0); // stains from this round
    ctx.strokeStyle = 'rgba(60,40,20,.22)'; ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
    fx.forEach(function (f) {
      var a = f.T ? Math.max(0, f.t / f.T) : 1;
      if (f.k === 'l') {
        ctx.globalAlpha = Math.max(0, f.t / 0.4); ctx.strokeStyle = f.c; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (f.k === 'r') {
        ctx.globalAlpha = a; ctx.strokeStyle = f.c; ctx.lineWidth = f.w * a + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - a), 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (f.k === 'd') {
        ctx.fillStyle = f.c; shardPath(ctx, f); ctx.fill();
        ctx.strokeStyle = 'rgba(239,230,210,.6)'; ctx.lineWidth = 1; ctx.stroke();
      } else if (f.k === 'g') {
        ctx.globalAlpha = 0.4 * a; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = f.c; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); ctx.globalAlpha = 1;
      }
    });
    M.p.forEach(function (p, i) {
      if (p.dead) return;
      var px = disp[i] ? disp[i].x : p.x, py = disp[i] ? disp[i].y : p.y, c = COL[i > 0 ? 1 : 0];
      if (p.sw >= 0) {
        var act = p.sw >= A0 && p.sw < A1;
        ctx.globalAlpha = act ? 0.8 : 0.18; ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, S.REACH, p.fa - 1.05, p.fa + 1.05); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (p.pa >= 0) {
        var on = p.pa < PAR;
        ctx.strokeStyle = on ? GOLD : 'rgba(184,137,31,.3)'; ctx.lineWidth = on ? 4 : 2;
        ctx.beginPath(); ctx.arc(px, py, R + 9 + (on ? p.pa * 20 : 0), 0, 7); ctx.stroke();
      }
      var shine = p.bw > 0 ? 1 - p.bw / S.BLINK_WIND : -1; // 0..1 while a dash is charging (0.1s)
      ctx.shadowBlur = 0; ctx.fillStyle = p.st > 0 ? '#9c9484' : c;
      ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill();
      if (shine >= 0) { // a soft white shine fades in inside the ball: the dash telegraph
        var gl = ctx.createRadialGradient(px - R * 0.3, py - R * 0.35, 0, px, py, R);
        gl.addColorStop(0, 'rgba(255,252,240,' + (0.25 + 0.6 * shine).toFixed(2) + ')');
        gl.addColorStop(1, 'rgba(255,252,240,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.2 + 0.65 * shine).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(px - R * 0.32, py - R * 0.36, R * 0.2, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = p.sc > 0 ? 0.45 : 1; // blade dims while the sword is on cooldown
      ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(px + Math.cos(p.fa) * R * 0.4, py + Math.sin(p.fa) * R * 0.4);
      ctx.lineTo(px + Math.cos(p.fa) * (R + 14), py + Math.sin(p.fa) * (R + 14)); ctx.stroke();
      ctx.strokeStyle = '#efe6d2'; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 1;
      if (p.st > 0) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
        for (var k = 0; k < 3; k++) { var a = now / 120 + k * 2.1; ctx.beginPath(); ctx.arc(px + Math.cos(a) * 15, py - R - 8 + Math.sin(a) * 4, 3, 0, 7); ctx.stroke(); }
      }
      if (mode === 'online' && i === me) {
        ctx.fillStyle = INK; ctx.font = '600 14px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('YOU', px, py - R - 18);
      }
    });
    M.p.forEach(function (p, i) {
      if (M.endless && i > 0) return;
      var bx = i === 0 ? 20 : W - 20 - 3 * 22;
      for (var k = 0; k < 3; k++) {
        var full = k < p.ch, part = k === p.ch;
        ctx.save(); ctx.translate(bx + k * 22 + 8, H - 18); ctx.rotate(0.785);
        ctx.strokeStyle = COL[i]; ctx.lineWidth = 2; ctx.fillStyle = COL[i];
        if (full) ctx.fillRect(-6, -6, 12, 12);
        else {
          ctx.globalAlpha = 0.4; ctx.strokeRect(-6, -6, 12, 12);
          if (part) { ctx.globalAlpha = 0.7; var h = 12 * (p.rc / S.CHARGE_T); ctx.fillRect(-6, 6 - h, 12, h); }
        }
        ctx.restore();
      }
    });
    if (mode === 'online' && vs && M.phase === 'ready') { // name plates while the round is about to start
      ctx.textBaseline = 'alphabetic';
      for (var i = 0; i < 2; i++) {
        ctx.textAlign = i ? 'right' : 'left';
        var tx = i ? W - 28 : 28;
        ctx.fillStyle = COL[i]; ctx.font = '700 26px "Barlow Condensed", sans-serif';
        ctx.fillText(String(names[i]).toUpperCase(), tx, 46);
        ctx.fillStyle = '#5a4f40'; ctx.font = '600 15px "Barlow Condensed", sans-serif';
        ctx.fillText(vs.ranks[i].toUpperCase() + '  ' + vs.mmrs[i] + ' MMR', tx, 66);
      }
    }
    ctx.drawImage(vigC, 0, 0);
    ctx.globalAlpha = 0.6; ctx.drawImage(grainC, 0, 0); ctx.globalAlpha = 1;
    if (msgT > 0) {
      var age = msgD - msgT, sc = 1 + Math.max(0, 0.18 - age) * 2.2; // banner slams in
      ctx.save(); ctx.translate(W / 2, H / 2 - 60); ctx.scale(sc, sc);
      ctx.globalAlpha = Math.min(1, msgT * 3);
      ctx.font = '44px "Dela Gothic One", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = PAPER; ctx.strokeText(msg, 0, 0);
      ctx.fillStyle = INK; ctx.fillText(msg, 0, 0);
      ctx.restore();
    }
    ctx.restore();
    if (flash > 0 && !calm) { ctx.globalAlpha = Math.min(1, flash); ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  function endResult(title) {
    var best = 0;
    try { best = +localStorage.getItem('bb_best') || 0; } catch (e) {}
    if (M.kills > best) { best = M.kills; try { localStorage.setItem('bb_best', best); } catch (e) {} }
    result(title || 'Overrun!', 'Kills: ' + M.kills + '   Survived: ' + Math.floor(M.time) + 's', 'Best: ' + best + ' kills', '', 'lose');
  }
  function finishLocal() {
    var w = M.winner, k = mode;
    mode = null;
    if (k === 'endless') endResult();
    else if (k === 'bot') result(w === 0 ? 'You win!' : 'The bot wins', names[0] + ' ' + M.score[0] + ' - ' + M.score[1] + ' ' + names[1], '', '', w === 0 ? 'win' : 'lose');
    else result(names[w] + ' wins!', names[0] + ' ' + M.score[0] + ' - ' + M.score[1] + ' ' + names[1], '', '', 'win');
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
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c9331f'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Render error: ' + ((err && err.message) || err), W / 2, H / 2);
  }
  function frame(now, dt) {
    if (M && (mode === 'bot' || mode === 'local' || mode === 'endless') && M.phase !== 'over') {
      if (freeze > 0) freeze -= dt; // hit-stop: the sim holds still for a beat on big hits
      else {
        var inp = mode === 'endless' ? [localInp(0)] : [localInp(0), mode === 'bot' ? botInp(dt) : localInp(1)];
        onEv(S.tick(M, inp, dt));
        if (M.phase === 'over') finishLocal();
      }
    }
    watch(); smooth();
    if (M && M.endless && mode === 'endless') hud();
    if (touch) padState();
    fxStep(M && M.phase === 'roundend' ? dt * 0.4 : dt);
    draw(now);
  }
  if (touch) {
    $('legend').hidden = true;
    $('hint').textContent = 'Drag the left stick to move and aim. Tap Swing, Parry and Blink. Landscape gives you more room.';
  }
  if (missing.length) {
    console.error('Blade & Blink: this page is missing elements the script needs: ' + missing.join(', '));
    try {
      var note = document.createElement('div');
      note.textContent = 'This page and its script are different versions (missing: ' + missing.join(', ') + '). Hard refresh with Ctrl+Shift+R, or upload every file together.';
      note.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;background:#c9331f;color:#efe6d2;padding:8px 12px;font:600 15px sans-serif;text-align:center';
      document.body.appendChild(note);
    } catch (e) {}
  }
  requestAnimationFrame(loop);
})();
