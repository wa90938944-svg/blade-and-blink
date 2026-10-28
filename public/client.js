(function () {
  'use strict';
  var S = Shared, W = S.W, H = S.H, R = S.R, PAR = S.PAR, A0 = S.A0, A1 = S.A1;
  var missing = [];
  var $ = function (i) {
    var e = document.getElementById(i);
    if (e) return e;
    if (missing.indexOf(i) < 0) missing.push(i);
    return document.createElement('div');
  };
  var cv = $('c'), ctx = cv.getContext('2d');
  var COL = ['#191514', '#c9331f'], GOLD = '#b8891f', PAPER = '#e8dfc9', INK = '#191514';
  var RANKS = [
    { n: 'Bronze', min: 0, next: 500, c: '#cd7f32' },
    { n: 'Silver', min: 500, next: 1000, c: '#b8b3a8' },
    { n: 'Gold', min: 1000, next: 1500, c: '#d9a526' },
    { n: 'Platinum', min: 1500, next: 2000, c: '#8fbfb4' },
    { n: 'Diamond', min: 2000, next: 2000, c: '#f2ece0' },
    { n: 'Admin', min: 9999, next: 9999, c: '#8fbfb4' },
    { n: 'Owner', min: 9999, next: 9999, c: '#e2503a' }
  ];

  var BONE = '#efe6d2';
  var LOOKS = [
    { id: 'none', name: 'Plain', need: 'Bronze', desc: 'The bare circle, nothing added.' },
    { id: 'bronze', name: 'Scarred', need: 'Silver', desc: 'A slash scar across the circle and a notch in the blade.' },
    { id: 'silver', name: 'Wanderer', need: 'Silver', desc: 'A straw cone hat and a silver tint on your dash trail.' },
    { id: 'gold', name: 'Veteran', need: 'Gold', desc: 'Two battle scars and a gold edge on the blade.' },
    { id: 'platinum', name: 'Ronin', need: 'Platinum', desc: 'A wide-brimmed ronin hat and a chest plate.' },
    { id: 'diamond', name: 'Champion', need: 'Diamond', desc: 'Crossed scars, a crown and aura, and diamond dash sparks.' }
  ];
  var TRAIL_TINT = { silver: '#d6d2c8', gold: '#e5b842', platinum: '#c9331f' };
  var looks = ['none', 'none'];
  var teams = [0, 1];
  var godActive = false, noCdActive = false, speedActive = false;

  var selectedTier = 'novice';
  var apexConquered = false;
  var isBossEncounter = false;
  var bossDialogueT = 0;
  var cam = { x: W / 2, y: H / 2 };

  function hexA(h, a) { return 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')'; }
  function strokePath(g, pts, px, py, col, w) {
    g.beginPath();
    for (var i = 0; i < pts.length; i++) { var x = px + pts[i][0] * R, y = py + pts[i][1] * R; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
  }
  function ringPoly(g, px, py, n, r0, r1, rot) {
    var m = r0 === r1 ? n : n * 2, i;
    g.beginPath();
    for (i = 0; i < m; i++) {
      var a = rot + i * 6.283 / m, r = r0 === r1 ? r0 : (i % 2 ? r0 : r1);
      if (i) g.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); else g.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
    }
    g.closePath();
  }
  function lookBelow(g, look, px, py, c, now) {
    if (look !== 'diamond') return;
    var pu = 0.5 + 0.5 * Math.sin(now / 420);
    g.strokeStyle = c; g.lineWidth = 2;
    g.globalAlpha = 0.2 + 0.2 * pu; g.beginPath(); g.arc(px, py, R + 9 + pu * 3, 0, 7); g.stroke();
    g.globalAlpha = 0.1 + 0.1 * pu; g.beginPath(); g.arc(px, py, R + 15 + pu * 4, 0, 7); g.stroke();
    g.globalAlpha = 1;
  }
  function lookAbove(g, look, px, py, c) {
    var i, a;
    var isRed = (c === COL[1]);
    var rimColor = isRed ? '#191514' : INK;
    var accentBone = isRed ? '#ffffff' : BONE;
    var secondary = isRed ? '#ffe8d6' : '#9e9788';

    if (look === 'bronze') {
      strokePath(g, [[-0.8, -0.6], [-0.2, -0.12], [0.08, 0.1], [0.78, 0.62]], px, py, accentBone, 2.0);
    } else if (look === 'silver') {
      ringPoly(g, px, py, 12, R + 4, R + 4, 0.26);
      g.strokeStyle = rimColor; g.lineWidth = 2.4; g.lineJoin = 'round'; g.stroke();
      ringPoly(g, px, py, 12, R * 0.55, R * 0.55, 0.26);
      g.strokeStyle = secondary; g.lineWidth = 1.3; g.stroke();
      for (i = 0; i < 12; i++) {
        a = 0.26 + i * (6.283 / 12);
        strokePath(g, [[Math.cos(a) * 0.1, Math.sin(a) * 0.1], [Math.cos(a) * (1 + 4 / R), Math.sin(a) * (1 + 4 / R)]], px, py, accentBone, 1.1);
      }
      g.fillStyle = rimColor; g.beginPath(); g.arc(px, py, 2.2, 0, 7); g.fill();
    } else if (look === 'gold') {
      strokePath(g, [[-0.95, -0.3], [-0.3, 0.1], [0.1, 0.35], [0.75, 0.85]], px, py, accentBone, 2.2);
      strokePath(g, [[-0.6, -0.85], [-0.05, -0.3], [0.45, 0.0], [0.95, 0.4]], px, py, accentBone, 2.2);
      strokePath(g, [[-0.45, 0.0], [-0.2, 0.22]], px, py, GOLD, 1.6);
      strokePath(g, [[0.15, -0.22], [0.35, 0.0]], px, py, GOLD, 1.6);
      g.strokeStyle = GOLD; g.lineWidth = 2.0;
      g.beginPath(); g.arc(px, py, R + 2.5, -2.4, -0.74); g.stroke();
      g.beginPath(); g.arc(px, py, R + 2.5, 0.74, 2.4); g.stroke();
    } else if (look === 'platinum') {
      g.strokeStyle = rimColor; g.lineWidth = 3.2; g.beginPath(); g.arc(px, py, R + 9, 0, 7); g.stroke();
      g.strokeStyle = isRed ? '#ffffff' : '#c9331f'; g.lineWidth = 1.6; g.beginPath(); g.arc(px, py, R + 7.5, 0, 7); g.stroke();
      for (i = 0; i < 16; i++) {
        a = i * (6.283 / 16);
        strokePath(g, [[Math.cos(a) * (1 + 2 / R), Math.sin(a) * (1 + 2 / R)], [Math.cos(a) * (1 + 9 / R), Math.sin(a) * (1 + 9 / R)]], px, py, hexA(accentBone, 0.85), 1.0);
      }
      var cordCol = isRed ? '#ffffff' : '#c9331f';
      strokePath(g, [[-0.5, -0.5], [0.5, 0.5]], px, py, cordCol, 1.6);
      strokePath(g, [[0.5, -0.5], [-0.5, 0.5]], px, py, cordCol, 1.6);
      ringPoly(g, px, py, 6, R * 0.65, R * 0.65, 0);
      g.strokeStyle = accentBone; g.lineWidth = 1.7; g.lineJoin = 'miter'; g.stroke();
      ringPoly(g, px, py, 6, R * 0.35, R * 0.35, 0);
      g.strokeStyle = rimColor; g.lineWidth = 1.3; g.stroke();
    } else if (look === 'diamond') {
      strokePath(g, [[-0.8, -0.75], [-0.1, -0.05], [0.1, 0.1], [0.8, 0.78]], px, py, accentBone, 1.7);
      strokePath(g, [[0.78, -0.8], [0.1, -0.1], [-0.1, 0.1], [-0.8, 0.75]], px, py, accentBone, 1.7);
      ringPoly(g, px, py, 8, R + 2, R + 8, -1.57); g.strokeStyle = rimColor; g.lineWidth = 2.4; g.lineJoin = 'miter'; g.stroke();
      g.strokeStyle = GOLD; g.lineWidth = 1; g.stroke();
    }
  }
  function drawBlade(g, look, px, py, fa, c, dim) {
    var ca = Math.cos(fa), sa = Math.sin(fa);
    var x0 = px + ca * R * 0.4, y0 = py + sa * R * 0.4, x1 = px + ca * (R + 14), y1 = py + sa * (R + 14);
    var isRed = (c === COL[1]);
    g.globalAlpha = dim ? 0.45 : 1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    if (look === 'gold') { g.strokeStyle = GOLD; g.lineWidth = 9.5; g.stroke(); }
    else if (look === 'silver') { g.strokeStyle = '#d6d2c8'; g.lineWidth = 8.5; g.stroke(); }
    else if (look === 'platinum') { g.strokeStyle = isRed ? '#ffffff' : '#c9331f'; g.lineWidth = 9.0; g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
    g.strokeStyle = BONE; g.lineWidth = 3; g.stroke();
    var gr = g.createLinearGradient(x1, y1, x0, y0);
    gr.addColorStop(0, hexA(c, 0.95)); gr.addColorStop(0.5, hexA(c, 0)); gr.addColorStop(1, hexA(c, 0));
    g.strokeStyle = gr; g.lineWidth = 3.2; g.stroke();
    g.fillStyle = hexA(c, 0.9); g.beginPath(); g.arc(x1 - ca * 0.6, y1 - sa * 0.6, 2.6, 0, 7); g.fill();
    g.globalAlpha = 1;
  }

  function drawChains(g, now) {
    g.save();
    for (var i = 1; i <= 5; i++) {
      var anchorX = (W / 6) * i;
      var sway = Math.sin(now / 900 + i * 1.3) * 14;
      var links = 9 + (i % 3) * 2;
      for (var l = 0; l < links; l++) {
        var t = l / links;
        var lx = anchorX + sway * (t * t);
        var ly = 8 + l * 16;
        g.strokeStyle = '#261e1a';
        g.lineWidth = 2.6;
        g.beginPath();
        if (l % 2 === 0) g.ellipse(lx, ly, 4, 8, (sway * 0.015), 0, 6.283);
        else { g.moveTo(lx, ly - 7); g.lineTo(lx, ly + 7); }
        g.stroke();
      }
      var endX = anchorX + sway;
      var endY = 8 + links * 16;
      g.fillStyle = '#191310';
      g.beginPath(); g.moveTo(endX - 6, endY); g.lineTo(endX + 6, endY); g.lineTo(endX, endY + 14); g.closePath(); g.fill();
    }
    g.restore();
  }

  function drawTetanus(g, px, py, fa, now, p) {
    var baseR = p.r || (R * 2.2);
    var pu = 0.5 + 0.5 * Math.sin(now / 260);

    g.strokeStyle = 'rgba(139, 12, 8, ' + (0.22 + 0.18 * pu).toFixed(2) + ')';
    g.lineWidth = 4;
    g.beginPath(); g.arc(px, py, baseR + 8 + pu * 4, 0, 6.283); g.stroke();

    g.fillStyle = p.st > 0 ? '#7a524c' : '#580a06';
    g.beginPath(); g.arc(px, py, baseR, 0, 6.283); g.fill();
    g.strokeStyle = '#191514'; g.lineWidth = 4; g.stroke();

    var eyeR = baseR * 0.46;
    g.fillStyle = '#efe6d2';
    g.beginPath(); g.arc(px, py, eyeR, 0, 6.283); g.fill();
    g.strokeStyle = '#191514'; g.lineWidth = 2; g.stroke();

    var target = (M && M.p[0] && !M.p[0].dead) ? M.p[0] : { x: px + Math.cos(fa) * 40, y: py + Math.sin(fa) * 40 };
    if (p.isPlayableTetanus) target = { x: px + Math.cos(fa) * 40, y: py + Math.sin(fa) * 40 };
    var disp0 = p.isPlayableTetanus ? target : (disp[0] || target);
    var ang = Math.atan2(disp0.y - py, disp0.x - px);
    var off = eyeR * 0.38;
    var ex = px + Math.cos(ang) * off, ey = py + Math.sin(ang) * off;

    g.fillStyle = '#c9331f';
    g.beginPath(); g.arc(ex, ey, eyeR * 0.48, 0, 6.283); g.fill();

    g.save();
    g.translate(ex, ey);
    g.rotate(ang);
    g.fillStyle = '#090707';
    g.beginPath();
    g.ellipse(0, 0, eyeR * 0.16, eyeR * 0.42, 0, 0, 6.283);
    g.fill();
    g.restore();

    var ca = Math.cos(fa), sa = Math.sin(fa);
    var x0 = px + ca * baseR * 0.4, y0 = py + sa * baseR * 0.4;
    var x1 = px + ca * (baseR + 30), y1 = py + sa * (baseR + 30);
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.strokeStyle = '#191514'; g.lineWidth = 12; g.stroke();
    g.strokeStyle = '#c9331f'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = BONE; g.lineWidth = 2; g.stroke();
  }

  function drawFighter(g, look, px, py, c, fa, now) {
    lookBelow(g, look, px, py, c, now);
    g.fillStyle = c; g.beginPath(); g.arc(px, py, R, 0, 7); g.fill();
    lookAbove(g, look, px, py, c);
    drawBlade(g, look, px, py, fa, c, false);
  }

  function sparks(x1, y1, x2, y2, c) {
    for (var i = 0; i < 18; i++) {
      var t = Math.random(), a = Math.random() * 6.283, sp = 20 + Math.random() * 70;
      fx.push({ k: 'p', dm: true, x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.55 + Math.random() * 0.5, c: i % 3 ? c : GOLD });
    }
  }

  var CTRL = [
    { u: 'w', d: 's', l: 'a', r: 'd', sw: 'f', pa: 'g', bl: 'h' },
    { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight', sw: ',', pa: '.', bl: '/' }
  ];
  var sock = typeof io !== 'undefined' ? io() : null;
  var mode = null, lastKind = 'bot', M = null, me = 0, names = ['P1', 'P2'], vs = null, prof = null;
  var fx = [], keys = {}, pend = [{}, {}], disp = [], snap = true;
  var lastPhase = '', lastScore = [0, 0], msg = '', msgT = 0, msgD = 1;
  var shake = 0, punch = 0, flash = 0, freeze = 0;
  var mouse = { x: W / 2, y: H / 2 }, qT = 0, qI = null, fArm = 0, cur = 'login', authMode = 'login', claimToken = '', toastT = 0;
  var calm = false;
  try { calm = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var touch = false;
  try { touch = matchMedia('(pointer: coarse)').matches; } catch (e) {}
  var sv = { x: 0, y: 0 }, sid = null;

  function snd(n, x) { if (typeof Sfx !== 'undefined') Sfx.play(n, x); }
  function vib(ms) { try { if (touch && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  function getToken() { try { return localStorage.getItem('bb_token') || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) localStorage.setItem('bb_token', t); else localStorage.removeItem('bb_token'); } catch (e) {} }

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
    $('coopcategorybtn').hidden = false;
    $('boardbtn').hidden = !sock;
    $('lookbtn').hidden = !prof;
    $('savebtn').hidden = !prof;
    $('logout').hidden = !prof;
    $('adminbar').hidden = !(prof && (prof.isOwner || prof.isAdmin));
    show('lobby');
  }

  function setProfile(p) {
    prof = p;
    var r = RANKS.filter(function (x) { return x.n === p.rank; })[0] || RANKS[0];
    $('badge').textContent = p.isOwner ? '👑' : (p.isAdmin ? 'A' : r.n[0]);
    $('badge').style.setProperty('--rc', r.c);
    $('uname').textContent = (p.isOwner ? '[OWNER] ' : (p.isAdmin ? '[ADMIN] ' : '')) + p.name;
    $('rname').textContent = r.n;
    $('rname').style.color = r.c;
    $('mmr').textContent = p.mmr + ' MMR';
    $('wl').textContent = p.wins + 'W ' + p.losses + 'L' + (p.streak >= 2 ? '  \u00D7' + p.streak : '');
    var hasNext = r.next > r.min;
    $('prog').style.width = (hasNext ? Math.min(1, (p.mmr - r.min) / (r.next - r.min)) * 100 : 100) + '%';
    $('prog').style.background = r.c;
    $('nextlbl').textContent = (p.isOwner || p.isAdmin) ? 'Infinite Reign' : (hasNext ? (r.next - p.mmr) + ' to next' : 'Top rank');
    $('adminbar').hidden = !(p.isOwner || p.isAdmin);
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
  function heartPips(curH, maxH) {
    var s = ''; for (var i = 0; i < maxH; i++) s += i < curH ? '\u2665' : '\u2661'; return s;
  }

  function hud() {
    if (!M) return;
    if (M.endless) {
      $('s0').textContent = 'Kills ' + M.kills;
      $('s1').textContent = 'Bots ' + M.p.filter(function (q) { return q && q.i > 0 && !q.dead; }).length;
      $('rnd').textContent = 'Endless ' + Math.floor(M.time) + 's';
      return;
    }
    if (M.ffa) {
      var selfP = M.p[me] || {};
      $('s0').textContent = 'Essence ' + (selfP.points || 0);
      $('s1').textContent = 'Fighters ' + M.p.filter(function (q) { return q && !q.dead && !q.isMinion; }).length;
      $('rnd').textContent = 'Shrine Extraction (Live)';
      return;
    }
    if (mode === 'bot' && M.p[1] && M.p[1].tier !== 'player') {
      var p0 = M.p[0], b = M.p[1];
      $('s0').textContent = 'YOU ' + (p0 ? pips(p0.lives, p0.maxLives) : '\u25CB');
      $('s1').textContent = names[1] + ' ' + pips(b.lives, b.maxLives) + (b.maxHearts > 1 ? ' ' + heartPips(b.hearts, b.maxHearts) : '');
      $('rnd').textContent = isBossEncounter ? 'SECRET BOSS: TETANUS' : (b.tier.toUpperCase() + ' DUEL');
      return;
    }
    if (M.mode === '2v2') {
      $('s0').textContent = 'Team Black ' + pips(M.score[0], M.win);
      $('s1').textContent = pips(M.score[1], M.win) + ' Team Red';
      $('rnd').textContent = '2v2 Duel, Round ' + M.round;
      return;
    }
    $('s0').textContent = names[0] + ' ' + pips(M.score[0], M.win);
    $('s1').textContent = pips(M.score[1], M.win) + ' ' + names[1];
    $('rnd').textContent = (mode === 'online' ? 'Ranked, round ' : 'Round ') + M.round;
  }

  function toast(text, bad) {
    var t = $('toast');
    t.textContent = text; t.className = bad ? 'bad' : ''; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.hidden = true; }, 2400);
  }

  function setAuthMode(m, name) {
    authMode = m;
    var reg = m !== 'login';
    $('pass2').hidden = !reg;
    $('enter').textContent = m === 'login' ? 'Log in' : 'Create account';
    $('switch').textContent = m === 'login' ? 'New here? Create an account' : 'Have an account? Log in';
    if (name) $('name').value = name;
  }

  $('enter').onclick = function () {
    var err = $('err'); err.textContent = '';
    if (!sock) return err.textContent = 'Server not reachable.';
    var pw = $('pass').value, n = $('name').value.trim();
    if (!n) return err.textContent = 'Enter username';
    if (!pw) return err.textContent = 'Enter password';
    sock.emit(authMode === 'login' ? 'login' : 'register', { name: n, password: pw }, function (r) {
      if (!r || r.err) return err.textContent = (r && r.err) || 'Error';
      setToken(r.token); setProfile(r.profile); showLobby();
    });
  };
  $('switch').onclick = function () { setAuthMode(authMode === 'login' ? 'register' : 'login'); };
  $('logout').onclick = function () { sock.emit('logout'); setToken(''); show('login'); };
  $('offline').onclick = function () { prof = null; showLobby(); };
  $('rank').onclick = enterQueue;
  $('botNovice').onclick = function () { startBotDuel('novice'); };
  $('botVeteran').onclick = function () { startBotDuel('veteran'); };
  $('botApex').onclick = function () { startBotDuel('apex'); };
  $('endless').onclick = function () { startLocal('endless'); };
  $('cancel').onclick = function () { sock.emit('unqueue'); clearInterval(qI); showLobby(); };
  $('tolobby').onclick = showLobby;
  $('again').onclick = function () {
    if (lastKind === 'online') enterQueue();
    else if (lastKind === 'ffa') joinFFAInstant();
    else if (lastKind === 'bot') startBotDuel(selectedTier);
    else startLocal(lastKind);
  };
  $('coopcategorybtn').onclick = function () { show('coopmenu'); };
  $('coopback').onclick = showLobby;
  $('coop2v2btn').onclick = function () { sock.emit('partyCreate', { mode: '2v2' }); };
  $('cooppartybtn').onclick = function () { show('partymenu'); };
  $('cooplocalbtn').onclick = function () { startLocal('local'); };
  $('coopextractbtn').onclick = joinFFAInstant;

  function joinFFAInstant() {
    lastKind = 'ffa'; isBossEncounter = false;
    sock.emit('joinFFA', function (r) {
      if (r && r.err) return toast(r.err, true);
      mode = 'ffa'; me = r.idx; M = null; looks = []; names = []; teams = []; disp = [];
      beginView(); $('rnd').textContent = 'Shrine Extraction (Live)';
    });
  }

  // ==========================================
  // MULTI-PAGE ADMIN CONTROLLER
  // ==========================================
  var managedUser = null;

  $('adminbtn').onclick = function () {
    if (!prof || (!prof.isOwner && !prof.isAdmin)) return;
    if (mode) {
      $('admOwnerCheats').hidden = !prof.isOwner;
      show('admincheats');
    } else {
      show('adminhub');
    }
  };

  $('adminHubClose').onclick = showLobby;
  $('cheatsClose').onclick = function () { show(null); };

  // Hub Screen buttons
  $('navDb').onclick = function () {
    $('admSearch').value = '';
    show('admindb');
    loadAdminUserList();
  };
  $('navLedger').onclick = function () {
    show('adminledger');
    loadAdminReports();
  };
  $('dbBack').onclick = function () { show('adminhub'); };
  $('ledgerBack').onclick = function () { show('adminhub'); };
  $('mgrBack').onclick = function () { show('admindb'); };

  $('admSearch').oninput = function () {
    var q = this.value.toLowerCase();
    document.querySelectorAll('.adm-li').forEach(function (row) {
      row.style.display = row.innerText.toLowerCase().includes(q) ? '' : 'none';
    });
  };

  function loadAdminUserList() {
    var list = $('adminUserList');
    list.innerHTML = '<li style="padding:12px;text-align:center">Loading database...</li>';
    sock.emit('admin_get_users', function (r) {
      if (!r || !r.ok) { list.innerHTML = '<li style="padding:12px;color:var(--redhi)">Failed to load data</li>'; return; }
      list.innerHTML = '';
      r.users.forEach(function (u) {
        var li = document.createElement('li');
        li.className = 'adm-li';
        var tags = '';
        if (u.isOwner) tags += '<span class="tag tag-owner">OWNER</span>';
        if (u.isAdmin) tags += '<span class="tag tag-admin">ADMIN</span>';
        if (u.banned) tags += '<span class="tag tag-banned">BANNED</span>';

        li.innerHTML = `
          <div class="adm-li-info">
            <div class="adm-li-title">${u.name}${tags}</div>
            <div class="adm-li-sub">${u.rank} (${u.mmr} MMR)</div>
          </div>
          <button class="sec adm-li-btn" id="mbtn_${u.key}">Manage</button>
        `;
        list.appendChild(li);
        li.querySelector('#mbtn_' + u.key).onclick = function () { openManageUser(u); };
      });
      $('admSearch').dispatchEvent(new Event('input'));
    });
  }

  function openManageUser(u) {
    managedUser = u;
    var tags = '';
    if (u.isOwner) tags += '<span class="tag tag-owner">OWNER</span>';
    if (u.isAdmin) tags += '<span class="tag tag-admin">ADMIN</span>';
    if (u.banned) tags += '<span class="tag tag-banned">BANNED</span>';

    $('mgrName').innerHTML = u.name + tags;
    $('mgrRank').textContent = u.rank + ' \u00B7 ' + u.mmr + ' MMR';
    $('mgrOwnerTools').hidden = !prof.isOwner;
    $('mgrMmrInp').value = u.mmr;
    $('mgrPromote').textContent = u.isAdmin ? 'Demote Admin' : 'Promote to Admin';
    $('mgrPromote').disabled = u.isOwner;
    $('mgrBanReason').value = u.banReason || '';

    var canBan = true;
    if (u.isOwner) canBan = false;
    if (!prof.isOwner && u.isAdmin) canBan = false;

    $('mgrBanArea').style.display = canBan ? 'block' : 'none';
    $('mgrBanBtn').hidden = u.banned;
    $('mgrUnbanBtn').hidden = !u.banned;

    show('adminmanage');
  }

  $('mgrSaveMmr').onclick = function () {
    if (!managedUser || !prof.isOwner) return;
    var val = $('mgrMmrInp').value;
    sock.emit('admin_set_mmr', { key: managedUser.key, mmr: val }, function (r) {
      if (r && r.ok) {
        toast('MMR updated to ' + r.mmr);
        managedUser.mmr = r.mmr;
        managedUser.rank = r.rank;
        openManageUser(managedUser);
      } else toast((r && r.err) || 'Error', true);
    });
  };

  $('mgrPromote').onclick = function () {
    if (!managedUser || !prof.isOwner) return;
    sock.emit('owner_set_admin', { key: managedUser.key, isAdmin: !managedUser.isAdmin }, function (r) {
      if (r && r.ok) {
        toast(r.isAdmin ? 'Promoted to Admin' : 'Demoted from Admin');
        managedUser.isAdmin = r.isAdmin;
        openManageUser(managedUser);
      } else toast((r && r.err) || 'Error', true);
    });
  };

  $('mgrBanBtn').onclick = function () {
    if (!managedUser) return;
    var reason = $('mgrBanReason').value.trim();
    if (reason.length < 4) return toast('Detailed reason required', true);
    sock.emit('admin_set_ban', { key: managedUser.key, banned: true, reason: reason }, function (r) {
      if (r && r.ok) {
        toast('Player Banned');
        managedUser.banned = true;
        managedUser.banReason = reason;
        openManageUser(managedUser);
      } else toast((r && r.err) || 'Error', true);
    });
  };

  $('mgrUnbanBtn').onclick = function () {
    if (!managedUser) return;
    sock.emit('admin_set_ban', { key: managedUser.key, banned: false, reason: '' }, function (r) {
      if (r && r.ok) {
        toast('Player Unbanned');
        managedUser.banned = false;
        managedUser.banReason = '';
        openManageUser(managedUser);
      } else toast((r && r.err) || 'Error', true);
    });
  };

  function loadAdminReports() {
    var list = $('adminReportsList');
    list.innerHTML = '<li style="padding:12px;text-align:center">Loading reports...</li>';
    sock.emit('admin_get_reports', function (r) {
      if (!r || !r.ok) { list.innerHTML = '<li style="padding:12px;color:var(--redhi)">Failed to load data</li>'; return; }
      list.innerHTML = '';
      if (r.reports.length === 0) list.innerHTML = '<li style="padding:12px;text-align:center;color:var(--dim)">No active reports found.</li>';
      r.reports.forEach(function (rep) {
        var li = document.createElement('li');
        li.className = 'adm-report-box';
        var date = new Date(rep.timestamp).toLocaleString();
        var roleTag = rep.adminRole === 'OWNER' ? '<span class="tag tag-owner">OWNER</span>' : '<span class="tag tag-admin">ADMIN</span>';
        var status = rep.activeBan ? '' : '<span class="tag" style="background:#555;color:#fff">LIFTED</span>';
        li.innerHTML = `
          <div style="font-size:16px;margin-bottom:3px"><b style="color:var(--redhi)">${rep.targetName}</b> ${status}</div>
          <div style="font-size:13px;color:var(--dim);margin-bottom:5px">By: <b>${rep.adminName}</b> ${roleTag} &middot; ${date}</div>
          <div style="font-size:14px;background:var(--panel-hi);padding:6px;border-left:3px solid var(--redhi)">${rep.reason}</div>
        `;
        if (rep.activeBan && (prof.isOwner || rep.adminRole !== 'OWNER')) {
          var unbanBtn = document.createElement('button');
          unbanBtn.className = 'sec';
          unbanBtn.style.marginTop = '6px';
          unbanBtn.style.padding = '4px 8px';
          unbanBtn.style.fontSize = '12px';
          unbanBtn.textContent = 'Unban ' + rep.targetName;
          unbanBtn.onclick = function () {
            sock.emit('admin_set_ban', { key: rep.targetKey, banned: false }, function () { toast('Unbanned'); loadAdminReports(); });
          };
          li.appendChild(unbanBtn);
        }
        list.appendChild(li);
      });
    });
  }

  // Live Match Cheats
  function spawnGuardCmd() {
    if (!prof || !prof.isOwner || !mode || !M) return;
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      var ev = [];
      S.spawnBodyguard(M, me, ev);
      onEv(ev);
      var cnt = M.p.filter(function (x) { return x && x.isMinion && !x.dead && x.ownerIdx === me; }).length;
      toast('Spawned Bodyguard (' + cnt + ' active)');
      return;
    }
    sock.emit('admin_spawn_bodyguard', function (r) {
      if (r && r.ok) toast('Spawned Bodyguard (' + r.count + ' active)');
    });
  }

  $('admFightTetanus').onclick = function () {
    if (!prof || !prof.isOwner || !mode || !M) return;
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      if (M && M.p[me]) {
        var ev = [];
        S.morphTetanus(M, me, ev);
        onEv(ev);
        toast('Morphed into Tetanus!');
        show(null);
      }
      return;
    }
    sock.emit('owner_play_tetanus', function (r) {
      if (r && r.ok) toast('Morphed into Tetanus!');
      show(null);
    });
  };

  $('admSpawnGuard').onclick = spawnGuardCmd;

  $('admKillAll').onclick = function () {
    if (!prof || !prof.isOwner || !mode || !M) return;
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      M.p.forEach(function (p, idx) {
        if (idx !== me && p && !p.dead && !p.isMinion) { p.lives = 0; p.hearts = 0; p.dead = true; }
      });
      toast('Annihilated enemies');
      show(null);
      return;
    }
    sock.emit('admin_match_kill_enemies');
    toast('Annihilated enemies');
    show(null);
  };

  $('admGod').onclick = function () {
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      if (M && M.p[me]) {
        M.p[me].god = !M.p[me].god;
        godActive = M.p[me].god;
        $('admGod').textContent = 'Invuln: ' + (godActive ? 'ON' : 'OFF');
        $('admGod').style.color = godActive ? 'var(--gold)' : 'var(--bone)';
        toast('God Mode ' + (godActive ? 'Enabled' : 'Disabled'));
      }
      return;
    }
    sock.emit('admin_match_toggle_god', function (r) {
      godActive = r.god;
      $('admGod').textContent = 'Invuln: ' + (godActive ? 'ON' : 'OFF');
      $('admGod').style.color = godActive ? 'var(--gold)' : 'var(--bone)';
      toast('God Mode ' + (godActive ? 'Enabled' : 'Disabled'));
    });
  };

  $('admNoCd').onclick = function () {
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      if (M && M.p[me]) {
        M.p[me].noCd = !M.p[me].noCd;
        noCdActive = M.p[me].noCd;
        $('admNoCd').textContent = 'No CD: ' + (noCdActive ? 'ON' : 'OFF');
        $('admNoCd').style.color = noCdActive ? 'var(--gold)' : 'var(--bone)';
        toast('No Cooldowns ' + (noCdActive ? 'Enabled' : 'Disabled'));
      }
      return;
    }
    sock.emit('admin_match_toggle_nocd', function (r) {
      noCdActive = r.noCd;
      $('admNoCd').textContent = 'No CD: ' + (noCdActive ? 'ON' : 'OFF');
      $('admNoCd').style.color = noCdActive ? 'var(--gold)' : 'var(--bone)';
      toast('No Cooldowns ' + (noCdActive ? 'Enabled' : 'Disabled'));
    });
  };

  $('admSpeed').onclick = function () {
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      if (M && M.p[me]) {
        M.p[me].fast = !M.p[me].fast;
        M.p[me].spd = M.p[me].fast ? 340 : (M.p[me].isPlayableTetanus ? 185 : 200);
        speedActive = M.p[me].fast;
        $('admSpeed').textContent = '2x Speed: ' + (speedActive ? 'ON' : 'OFF');
        $('admSpeed').style.color = speedActive ? 'var(--gold)' : 'var(--bone)';
        toast('2x Speed ' + (speedActive ? 'Enabled' : 'Disabled'));
      }
      return;
    }
    sock.emit('admin_match_toggle_speed', function (r) {
      speedActive = r.fast;
      $('admSpeed').textContent = '2x Speed: ' + (speedActive ? 'ON' : 'OFF');
      $('admSpeed').style.color = speedActive ? 'var(--gold)' : 'var(--bone)';
      toast('2x Speed ' + (speedActive ? 'Enabled' : 'Disabled'));
    });
  };

  $('admHeal').onclick = function () {
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      if (M && M.p[me] && !M.p[me].dead) {
        M.p[me].lives = Math.max(M.p[me].maxLives, 5);
        M.p[me].maxLives = Math.max(M.p[me].maxLives, 5);
        M.p[me].hearts = M.p[me].maxHearts;
        M.p[me].st = 0;
        toast('Health Refilled');
      }
      return;
    }
    sock.emit('admin_match_heal', function (r) { if (r.ok) toast('Health Refilled'); });
  };

  $('admAnnounceBtn').onclick = function () {
    if (!prof || !prof.isOwner) return;
    var t = $('admAnnounceText').value;
    if (!t) return;
    sock.emit('admin_announce', { text: t }, function (r) {
      if (r && r.ok) { $('admAnnounceText').value = ''; toast('Announcement Sent'); }
    });
  };

  // ---------- Wardrobe ----------
  $('lookbtn').onclick = function () { renderLooks(); show('wardrobe'); };
  $('lookback').onclick = showLobby;
  function renderLooks() {
    var grid = $('lookgrid'), unlocked = (prof && prof.unlocked) || [], cur = prof && prof.equipped && prof.equipped.look;
    grid.innerHTML = '';
    LOOKS.forEach(function (L) {
      var open = (prof && (prof.isOwner || prof.isAdmin)) || unlocked.indexOf(L.id) >= 0;
      var b = document.createElement('button'), pv = document.createElement('canvas'), nm = document.createElement('span'), sm = document.createElement('small');
      b.className = 'look' + (L.id === cur ? ' sel' : '');
      b.disabled = !open;
      pv.width = 60; pv.height = 60;
      var g = pv.getContext('2d');
      g.fillStyle = PAPER; g.fillRect(0, 0, 60, 60);
      drawFighter(g, L.id, 30, 30, COL[0], -0.6, performance.now());
      nm.textContent = L.name;
      sm.textContent = L.id === cur ? 'Equipped' : open ? 'Unlocked' : L.need;
      b.appendChild(pv); b.appendChild(nm); b.appendChild(sm);
      b.onclick = function () {
        sock.emit('equip', { look: L.id }, function (r) { if (r && r.ok) { setProfile(r.profile); renderLooks(); } });
      };
      grid.appendChild(b);
    });
  }

  // ---------- Paper layers ----------
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

  function fadeInk() {
    if (isBossEncounter) return;
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
  function say(t, s) { msg = t; msgT = s; msgD = s; }
  function burst(x, y, c, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 7, sp = 60 + Math.random() * 260;
      fx.push({ k: 'p', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.5 + Math.random() * 0.6, c: c });
    }
  }
  function ring(x, y, c, r1, t, w) { fx.push({ k: 'r', x: x, y: y, t: t, T: t, r0: R, r1: r1, c: c, w: w }); }

  function onEv(ev) {
    (ev || []).forEach(function (e) {
      var c;
      if (e.t === 'swing') snd('swing', e.x);
      else if (e.t === 'raise') snd('raise', e.x);
      else if (e.t === 'shine') snd('shine', e.x);
      else if (e.t === 'blink') {
        c = e.unparryable ? '#680c07' : COL[teams[e.i] || 0];
        if (M && M.p[e.i] && M.p[e.i].isPlayableTetanus) c = '#680c07';
        fx.push({ k: 'l', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, t: 0.4, c: c });
        streak(e.x1, e.y1, e.x2, e.y2, c, e.unparryable ? 16 : 7);
        snd('blink', e.x1);
      } else if (e.t === 'parry') {
        burst(e.x, e.y, GOLD, 26); ring(e.x, e.y, GOLD, R + 60, 0.45, 5); stain(e.x, e.y, GOLD, 8, 18);
        say(e.b ? 'Dash punished!' : 'Parried!', 0.8);
        shake = 7; snd('parry', e.x);
      } else if (e.t === 'hurt') {
        c = COL[teams[e.i] || 0];
        burst(e.x, e.y, c, 14);
        shake = 6; snd('kill', e.x);
      } else if (e.t === 'lose_life') {
        c = COL[teams[e.i] || 0];
        ring(e.x, e.y, c, R + 55, 0.45, 5);
        say((e.i === 0 ? 'You: ' : '') + e.lives + (e.lives === 1 ? ' Life Left!' : ' Lives Left!'), 0.9);
        shake = 9;
      } else if (e.t === 'kill') {
        c = COL[teams[e.i] || 0];
        burst(e.x, e.y, c, 22);
        shake = 11; snd('kill', e.x);
      } else if (e.t === 'boss_morph') {
        shake = 15; burst(e.x, e.y, '#5c0a06', 40); ring(e.x, e.y, '#c9331f', R + 120, 0.8, 8); snd('gong');
      }
    });
    hud();
  }

  function beginView() {
    fx = []; snap = true; lastPhase = ''; lastScore = [0, 0]; msgT = 0;
    shake = punch = flash = freeze = 0;
    cam.x = W / 2; cam.y = H / 2;
    inkX.clearRect(0, 0, W, H);
    show(null); hud();
  }

  function startBotDuel(tier) {
    selectedTier = tier; lastKind = 'bot';
    var activeTier = tier;
    isBossEncounter = (tier === 'tetanus');

    if (tier === 'novice' && apexConquered && Math.random() < 0.25) {
      activeTier = 'tetanus'; isBossEncounter = true; apexConquered = false;
    }

    mode = 'bot'; me = 0;
    looks = [(prof && prof.equipped && prof.equipped.look) || 'none', activeTier === 'apex' ? 'platinum' : 'bronze'];
    teams = [0, 1];
    M = S.create(1, '1v1', activeTier);
    names = ['You', isBossEncounter ? 'TETANUS' : (activeTier.charAt(0).toUpperCase() + activeTier.slice(1) + ' CPU')];
    disp = [];
    beginView();

    if (isBossEncounter) {
      bossDialogueT = 2.6; shake = 16; snd('gong');
    }
  }

  function startLocal(k) {
    lastKind = k; mode = k; me = 0; isBossEncounter = false;
    looks = [(prof && prof.equipped && prof.equipped.look) || 'none', 'none'];
    teams = [0, 1];
    M = k === 'endless' ? S.createEndless() : S.create(4, '1v1', 'player');
    names = k === 'endless' ? ['You', 'Bots'] : ['P1', 'P2'];
    disp = [];
    beginView();
  }

  function enterQueue() {
    lastKind = 'online'; qT = 0; isBossEncounter = false;
    $('qt').textContent = '0:00'; show('queue');
    sock.emit('queue');
    clearInterval(qI);
    qI = setInterval(function () {
      qT++; $('qt').textContent = Math.floor(qT / 60) + ':' + ('0' + (qT % 60)).slice(-2);
    }, 1000);
  }

  // Socket setup
  if (sock) {
    sock.on('connect', function () {
      var t = getToken();
      if (t) sock.emit('resume', { token: t }, function (r) { if (r && r.ok) { setProfile(r.profile); showLobby(); } });
    });
    sock.on('profile_sync', function (p) { if (p) setProfile(p); });
    sock.on('match', function (d) {
      clearInterval(qI); isBossEncounter = false;
      mode = d.mode === '2v2' ? '2v2' : 'online';
      lastKind = mode; me = d.you; names = d.names; M = null;
      looks = d.looks || []; teams = d.teams || [0, 1]; disp = [];
      beginView();
      $('rnd').textContent = d.mode === '2v2' ? '2v2 Duel' : 'Ranked';
    });
    sock.on('s', function (d) { if (mode) { M = d.m; onEv(d.ev); } });
    sock.on('end', function (d) {
      mode = null; if (d.profile) setProfile(d.profile);
      var won = d.winner === (d.mode === '2v2' ? teams[me] : d.you);
      result(won ? 'Victory' : 'Defeat', names[0] + ' ' + (d.score ? d.score[0] + ' - ' + d.score[1] : '') + ' ' + names[1], '', d.delta ? (d.delta > 0 ? '+' : '') + d.delta + ' MMR' : '', won ? 'win' : 'lose');
    });
    sock.on('stats', function (d) {
      document.querySelectorAll('.stats').forEach(function (e) {
        e.textContent = d.online + ' online, ' + d.queue + ' in queue';
      });
    });
  }

  // Input Handling
  function localInp(i) {
    var c = CTRL[i];
    var o = { x: (keys[c.r] ? 1 : 0) - (keys[c.l] ? 1 : 0), y: (keys[c.d] ? 1 : 0) - (keys[c.u] ? 1 : 0) };
    if (i === 0 && (mode === 'bot' || mode === 'endless')) {
      o.x = ((keys.d || keys.ArrowRight) ? 1 : 0) - ((keys.a || keys.ArrowLeft) ? 1 : 0);
      o.y = ((keys.s || keys.ArrowDown) ? 1 : 0) - ((keys.w || keys.ArrowUp) ? 1 : 0);
      if (M && M.p[0]) o.aim = Math.atan2(mouse.y - M.p[0].y, mouse.x - M.p[0].x);
    }
    ['sw', 'pa', 'bl'].forEach(function (k) { o[k] = pend[i][k]; pend[i][k] = false; });
    if (i === 0 && (sv.x || sv.y)) { o.x = sv.x; o.y = sv.y; }
    return o;
  }

  addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'p' && prof && prof.isOwner && mode) return spawnGuardCmd();
    keys[k] = true;
    if (mode === 'online' || mode === 'ffa' || mode === '2v2') {
      if (k === ' ') sock.emit('act', 'bl');
      else if (k === 'e') sock.emit('act', 'pa');
    } else if (mode === 'bot' || mode === 'endless') {
      if (k === ' ' || k === 'h') pend[0].bl = true;
      else if (k === 'e' || k === 'g') pend[0].pa = true;
      else if (k === 'f') pend[0].sw = true;
    }
  });
  addEventListener('keyup', function (e) { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
  cv.addEventListener('mousemove', function (e) {
    var r = cv.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * W / r.width;
    mouse.y = (e.clientY - r.top) * H / r.height;
  });
  cv.addEventListener('mousedown', function (e) {
    if (!mode) return;
    if (mode === 'online' || mode === 'ffa' || mode === '2v2') {
      if (e.button === 0) sock.emit('act', 'sw');
      else if (e.button === 2) sock.emit('act', 'pa');
    } else if (mode === 'bot' || mode === 'endless') {
      if (e.button === 0) pend[0].sw = true;
      else if (e.button === 2) pend[0].pa = true;
    }
  });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Multiplayer tick
  setInterval(function () {
    if ((mode !== 'online' && mode !== 'ffa' && mode !== '2v2') || !M) return;
    var d = disp[me] || (M.p[me] ? { x: M.p[me].x, y: M.p[me].y } : { x: W / 2, y: H / 2 });
    sock.emit('in', {
      x: ((keys.d || keys.ArrowRight) ? 1 : 0) - ((keys.a || keys.ArrowLeft) ? 1 : 0),
      y: ((keys.s || keys.ArrowDown) ? 1 : 0) - ((keys.w || keys.ArrowUp) ? 1 : 0),
      aim: Math.atan2(mouse.y - d.y, mouse.x - d.x)
    });
  }, 33);

  // Render & Frame loops
  function draw(now) {
    ctx.save();
    ctx.fillStyle = isBossEncounter ? '#dfd1b8' : PAPER;
    ctx.fillRect(0, 0, W, H);
    if (!M) { ctx.restore(); return; }

    var boundW = (M && M.boundW) || W, boundH = (M && M.boundH) || H;
    if (shake > 0 && !calm) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    ctx.drawImage(inkC, 0, 0);
    if (isBossEncounter) drawChains(ctx, now);

    ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.strokeRect(4, 4, boundW - 8, boundH - 8);

    // Particles
    fx.forEach(function (f) {
      if (f.k === 'l') {
        ctx.globalAlpha = Math.max(0, f.t / 0.4); ctx.strokeStyle = f.c; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      } else if (f.k === 'r') {
        ctx.globalAlpha = Math.max(0, f.t / f.T); ctx.strokeStyle = f.c; ctx.lineWidth = f.w;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - f.t / f.T), 0, 7); ctx.stroke();
      } else {
        ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = f.c; ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
    });

    // Fighters
    M.p.forEach(function (p, i) {
      if (!p || p.dead) return;
      var px = disp[i] ? disp[i].x : p.x, py = disp[i] ? disp[i].y : p.y;
      var c = COL[(p.team || 0) % COL.length];

      if (p.sw >= 0) {
        ctx.globalAlpha = (p.sw >= A0 && p.sw < A1) ? 0.8 : 0.18; ctx.fillStyle = p.tier === 'tetanus' ? '#680c07' : c;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, p.reach || S.REACH, p.fa - 1.05, p.fa + 1.05); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (p.pa >= 0) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = (p.st <= 0 && p.pa < PAR) ? 4 : 2;
        ctx.beginPath(); ctx.arc(px, py, p.r + 9, 0, 7); ctx.stroke();
      }
      if (p.god) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, p.r + 4, 0, 6.283); ctx.stroke();
      }

      if (p.tier === 'tetanus') {
        drawTetanus(ctx, px, py, p.fa, now, p);
      } else {
        lookBelow(ctx, looks[i] || 'none', px, py, c, now);
        ctx.fillStyle = p.st > 0 ? '#9c9484' : c;
        ctx.beginPath(); ctx.arc(px, py, p.r || R, 0, 7); ctx.fill();
        lookAbove(ctx, looks[i] || 'none', px, py, c);
        drawBlade(ctx, looks[i] || 'none', px, py, p.fa, c, p.sc > 0);
      }
    });

    ctx.restore();

    // HUD Ammo Indicator
    var selfP = M.p[me || 0];
    if (selfP && !selfP.dead) {
      for (var k = 0; k < 3; k++) {
        ctx.save(); ctx.translate(20 + k * 22 + 8, H - 18); ctx.rotate(0.785);
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillStyle = INK;
        if (k < selfP.ch) ctx.fillRect(-6, -6, 12, 12);
        else ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
      }
    }
  }

  function frame(now, dt) {
    if (bossDialogueT > 0) { bossDialogueT -= dt; draw(now); return; }
    if (M && (mode === 'bot' || mode === 'local' || mode === 'endless') && M.phase !== 'over') {
      var inp = mode === 'endless' ? [localInp(0)] : [localInp(0), mode === 'bot' ? {} : localInp(1)];
      onEv(S.tick(M, inp, dt));
      if (M.phase === 'over') {
        var won = M.winner === 0;
        if (won && mode === 'bot') {
          if (M.p[1] && M.p[1].tier === 'apex') apexConquered = true;
          else if (M.p[1] && M.p[1].tier === 'novice' && apexConquered) {
            triggerTetanusAmbush(); return;
          }
        }
        result(won ? 'Victory' : 'Defeat', names[0] + ' ' + M.score[0] + ' - ' + M.score[1] + ' ' + names[1], '', '', won ? 'win' : 'lose');
        mode = null;
      }
    }
    // smooth positions
    if (M) {
      for (var i = 0; i < M.p.length; i++) {
        var p = M.p[i]; if (!p) continue;
        if (!disp[i] || snap) disp[i] = { x: p.x, y: p.y };
        else { disp[i].x += (p.x - disp[i].x) * 0.5; disp[i].y += (p.y - disp[i].y) * 0.5; }
      }
      snap = false;
    }
    // step FX
    for (var fIdx = fx.length - 1; fIdx >= 0; fIdx--) {
      var f = fx[fIdx]; f.t -= dt;
      if (f.vx) { f.x += f.vx * dt; f.y += f.vy * dt; }
      if (f.t <= 0) fx.splice(fIdx, 1);
    }
    shake = Math.max(0, shake - 40 * dt);
    draw(now);
  }

  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    frame(now, dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();