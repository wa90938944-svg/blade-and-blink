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
  var godActive = false, noCdActive = false;

  var lastDefeatedTier = null;
  var isBossEncounter = false;
  var bossDialogueT = 0;
  var cam = { x: W / 2, y: H / 2 };

  function hexA(h, a) { return 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')'; }

  function strokePath(g, pts, px, py, col, w) {
    g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var x = px + pts[i][0] * R, y = py + pts[i][1] * R;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
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

  function drawChains(g, now) {
    g.strokeStyle = '#28211b';
    g.lineWidth = 2.5;
    for (var i = 1; i <= 4; i++) {
      var anchorX = (W / 5) * i;
      var sway = Math.sin(now / 950 + i * 1.5) * 16;
      g.beginPath();
      g.moveTo(anchorX, 0);
      g.quadraticCurveTo(anchorX + sway * 0.4, 90, anchorX + sway, 190);
      g.stroke();
      g.fillStyle = '#1b1411';
      g.fillRect(anchorX + sway - 5, 190, 10, 14);
    }
  }

  function drawFighter(g, look, px, py, c, fa, now, p) {
    var scale = (p && p.scale) || 1.0;
    var baseR = R * scale;

    if (p && p.tier === 'tetanus') {
      g.fillStyle = '#5c0b06';
      g.beginPath();
      g.arc(px, py, baseR, 0, 6.283);
      g.fill();
      g.strokeStyle = '#0f0202';
      g.lineWidth = 4;
      g.stroke();

      // Eyeball motif
      var eyeRadius = baseR * 0.44;
      g.fillStyle = '#efe6d2';
      g.beginPath();
      g.arc(px, py, eyeRadius, 0, 6.283);
      g.fill();

      // Pupil tracks Player 0
      var target = (M && M.p[0]) || { x: px + Math.cos(fa), y: py + Math.sin(fa) };
      var eAngle = Math.atan2(target.y - py, target.x - px);
      var pupilOffset = eyeRadius * 0.42;
      var pupilX = px + Math.cos(eAngle) * pupilOffset;
      var pupilY = py + Math.sin(eAngle) * pupilOffset;

      g.fillStyle = '#c9331f';
      g.beginPath();
      g.arc(pupilX, pupilY, eyeRadius * 0.44, 0, 6.283);
      g.fill();
      g.fillStyle = '#000000';
      g.beginPath();
      g.arc(pupilX, pupilY, eyeRadius * 0.22, 0, 6.283);
      g.fill();

      // Massive Jagged Boss Blade
      var ca = Math.cos(fa), sa = Math.sin(fa);
      var x1 = px + ca * (baseR + 26), y1 = py + sa * (baseR + 26);
      g.strokeStyle = '#191514'; g.lineWidth = 10; g.beginPath(); g.moveTo(px, py); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = '#c9331f'; g.lineWidth = 4; g.stroke();
      return;
    }

    lookBelow(g, look, px, py, c, now);
    g.fillStyle = c;
    g.beginPath();
    g.arc(px, py, baseR, 0, 7);
    g.fill();
    lookAbove(g, look, px, py, c);

    // Standard blade
    var ca = Math.cos(fa), sa = Math.sin(fa);
    var x0 = px + ca * baseR * 0.4, y0 = py + sa * baseR * 0.4;
    var x1 = px + ca * (baseR + 14), y1 = py + sa * (baseR + 14);
    g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = BONE; g.lineWidth = 3; g.stroke();
  }

  var CTRL = [
    { u: 'w', d: 's', l: 'a', r: 'd', sw: 'f', pa: 'g', bl: 'h' },
    { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight', sw: ',', pa: '.', bl: '/' }
  ];
  var sock = typeof io !== 'undefined' ? io() : null;
  var mode = null, lastKind = 'bot', selectedTier = 'novice', M = null, me = 0, names = ['P1', 'P2'], vs = null, prof = null;
  var fx = [], keys = {}, pend = [{}, {}], disp = [], snap = true;
  var lastPhase = '', lastScore = [0, 0], msg = '', msgT = 0, msgD = 1;
  var shake = 0, punch = 0, flash = 0, freeze = 0;
  var mouse = { x: W / 2, y: H / 2 }, qT = 0, qI = null, cur = 'login', authMode = 'login', claimToken = '', toastT = 0;
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
    $('coopcategorybtn').hidden = !prof;
    $('boardbtn').hidden = !sock;
    $('lookbtn').hidden = !prof;
    $('savebtn').hidden = !prof;
    $('logout').hidden = !prof;
    $('adminbar').hidden = !(prof && prof.isOwner);
    show('lobby');
  }

  function setProfile(p) {
    prof = p;
    var r = RANKS.filter(function (x) { return x.n === p.rank; })[0] || RANKS[0];
    $('badge').textContent = p.isOwner ? '👑' : r.n[0];
    $('badge').style.setProperty('--rc', r.c);
    $('uname').textContent = (p.isOwner ? '[OWNER] ' : '') + p.name;
    $('rname').textContent = r.n;
    $('rname').style.color = r.c;
    $('mmr').textContent = p.mmr + ' MMR';
    $('wl').textContent = p.wins + 'W ' + p.losses + 'L';
    var hasNext = r.next > r.min;
    $('prog').style.width = (hasNext ? Math.min(1, (p.mmr - r.min) / (r.next - r.min)) * 100 : 100) + '%';
    $('prog').style.background = r.c;
    $('nextlbl').textContent = p.isOwner ? 'Infinite Reign' : (hasNext ? (r.next - p.mmr) + ' to next' : 'Top rank');
    $('adminbar').hidden = !p.isOwner;
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

  function hud() {
    if (!M) return;
    var p0 = M.p[0], p1 = M.p[1];
    if (p1 && p1.tier && p1.tier !== 'player') {
      $('s0').textContent = names[0] + '  ❤ ' + p0.hearts + ' [L' + p0.lives + ']';
      $('s1').textContent = names[1] + '  ❤ ' + p1.hearts + ' [L' + p1.lives + ']';
      $('rnd').textContent = isBossEncounter ? 'SECRET BOSS: TETANUS' : (p1.tier.toUpperCase() + ' CPU');
      return;
    }
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
    $('s0').textContent = names[0];
    $('s1').textContent = names[1];
  }

  function toast(text, bad) {
    var t = $('toast');
    t.textContent = text; t.className = bad ? 'bad' : ''; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.hidden = true; }, 2400);
  }

  function beginView() {
    fx = []; snap = true; lastPhase = ''; lastScore = [0, 0]; msgT = 0;
    shake = punch = flash = freeze = 0;
    cam.x = W / 2; cam.y = H / 2;
    inkX.clearRect(0, 0, W, H);
    show(null); hud();
  }

  // --- Start Singleplayer CPU Duels ---
  function startBotDuel(tier) {
    selectedTier = tier;
    var activeTier = tier;
    isBossEncounter = false;

    // 10% chance to trigger Tetanus when picking Novice immediately after defeating Apex
    if (tier === 'novice' && lastDefeatedTier === 'apex' && Math.random() < 0.10) {
      activeTier = 'tetanus';
      isBossEncounter = true;
    }

    mode = 'bot'; me = 0;
    looks = [prof && prof.equipped && prof.equipped.look || 'none', isBossEncounter ? 'diamond' : 'none'];
    teams = [0, 1];
    M = S.create(3, '1v1', activeTier);
    names = ['You', isBossEncounter ? 'TETANUS' : (activeTier.charAt(0).toUpperCase() + activeTier.slice(1) + ' CPU')];
    disp = [];
    beginView();

    if (isBossEncounter) {
      bossDialogueT = 2.4;
      shake = 16;
      snd('gong');
    }
  }

  // Hook up Bot Tier Buttons explicitly
  $('botNovice').onclick = function () { startBotDuel('novice'); };
  $('botVeteran').onclick = function () { startBotDuel('veteran'); };
  $('botApex').onclick = function () { startBotDuel('apex'); };

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
  function shatter(x, y, c, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = 120 + Math.random() * 340;
      fx.push({ k: 'd', x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 4, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        a: Math.random() * 6.283, va: (Math.random() - 0.5) * 20, s: 3 + Math.random() * 5.5, n: Math.random() < 0.4 ? 4 : 3,
        t: 1.4, T: 1.4, c: c });
    }
  }
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
        c = COL[teams[e.i] || 0];
        fx.push({ k: 'l', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, t: 0.4, c: c });
        streak(e.x1, e.y1, e.x2, e.y2, c);
        snd('blink', e.x1);
      } else if (e.t === 'parry') {
        burst(e.x, e.y, GOLD, 26); ring(e.x, e.y, GOLD, R + 60, 0.45, 5); stain(e.x, e.y, GOLD, 8, 18);
        say(e.b ? 'Dash punished!' : 'Parried!', 0.8);
        shake = 7; snd('parry', e.x);
      } else if (e.t === 'hurt') {
        shake = 6;
        burst(e.x || W / 2, e.y || H / 2, COL[1], 10);
        snd('hit');
      } else if (e.t === 'whiff_parry') {
        say('Parry Whiffed! Stunned!', 0.85);
        snd('parry');
      } else if (e.t === 'kill') {
        c = COL[teams[e.i] || 0];
        shatter(e.x, e.y, c, 16); burst(e.x, e.y, c, 20);
        shake = 12; snd('kill', e.x);
      }
    });
  }

  function localInp(i) {
    var c = CTRL[i];
    var o = { x: (keys[c.r] ? 1 : 0) - (keys[c.l] ? 1 : 0), y: (keys[c.d] ? 1 : 0) - (keys[c.u] ? 1 : 0) };
    ['sw', 'pa', 'bl'].forEach(function (k) { o[k] = pend[i][k]; pend[i][k] = false; });
    if (i === 0 && (sv.x || sv.y)) { o.x = sv.x; o.y = sv.y; }
    return o;
  }

  // --- Render Loop ---
  function draw(now) {
    ctx.save();
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    if (!M) { ctx.restore(); return; }

    if (shake > 0 && !calm) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // Arena background watermarks (Premium Japanese Calligraphy Ink Motifs)
    ctx.save();
    ctx.fillStyle = 'rgba(60,40,20,.05)';
    ctx.font = '700 130px "Noto Serif JP", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('刃', W / 2 - 120, H / 2);
    ctx.fillText('瞬', W / 2 + 120, H / 2);
    ctx.restore();

    if (isBossEncounter) drawChains(ctx, now);

    ctx.drawImage(inkC, 0, 0);

    // Arena Border
    ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);

    // Telegraphed windup circle for Tetanus
    M.p.forEach(function (p) {
      if (!p || p.dead) return;
      if (p.bossTelegraph > 0) {
        ctx.strokeStyle = '#c9331f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.reach + 8, 0, 6.283);
        ctx.stroke();
      }
    });

    // Render Fighters
    M.p.forEach(function (p, i) {
      if (!p || p.dead) return;
      var c = COL[p.team % COL.length];
      var look = (looks && looks[i]) || 'none';
      drawFighter(ctx, look, p.x, p.y, c, p.fa, now, p);

      // Render Hearts above fighter heads
      var barW = 34 * (p.scale || 1);
      var startX = p.x - barW / 2;
      var heartY = p.y - p.r - 12;
      for (var h = 0; h < p.maxHearts; h++) {
        ctx.fillStyle = h < p.hearts ? '#c9331f' : '#453a2d';
        ctx.fillRect(startX + h * (barW / p.maxHearts), heartY, (barW / p.maxHearts) - 2, 4);
      }
    });

    // Boss dialogue banner
    if (bossDialogueT > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(16, 12, 10, 0.92)';
      ctx.fillRect(0, H / 2 - 44, W, 88);
      ctx.strokeStyle = '#c9331f';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, H / 2 - 44, W, 88);
      ctx.font = '700 24px "Dela Gothic One", sans-serif';
      ctx.fillStyle = '#efe6d2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BLOOD CALLS FOR BLOOD...', W / 2, H / 2);
      ctx.restore();
    }

    ctx.restore();
  }

  function frame(now, dt) {
    if (bossDialogueT > 0) {
      bossDialogueT -= dt;
      draw(now);
      return;
    }
    if (M && mode === 'bot' && M.phase !== 'over') {
      var inp = [localInp(0), {}];
      onEv(S.tick(M, inp, dt));
      hud();
      if (M.phase === 'over') {
        var won = M.winner === 0;
        if (won) lastDefeatedTier = M.p[1].tier;
        result(won ? 'Victory' : 'Defeat', names[0] + ' ' + M.score[0] + ' - ' + M.score[1] + ' ' + names[1], '', '', won ? 'win' : 'lose');
        mode = null;
      }
    }
    draw(now);
  }

  // --- Auth & Lobby Controls ---
  $('enter').onclick = function () {
    var err = $('err'); err.textContent = '';
    if (!sock) { err.textContent = 'Server not reachable.'; return; }
    var pw = $('pass').value, n = $('name').value.trim();
    if (!n && authMode !== 'claim') { err.textContent = 'Enter a username'; return; }
    if (!pw) { err.textContent = 'Enter a password'; return; }
    var b = $('enter'); b.disabled = true;
    var done = function (r) {
      b.disabled = false;
      if (!r || r.err) { err.textContent = (r && r.err) || 'Error'; return; }
      setToken(r.token);
      setProfile(r.profile);
      showLobby();
    };
    sock.emit(authMode === 'login' ? 'login' : 'register', { name: n, password: pw }, done);
  };

  $('switch').onclick = function () {
    authMode = authMode === 'login' ? 'register' : 'login';
    $('pass2').hidden = (authMode === 'login');
    $('enter').textContent = authMode === 'login' ? 'Enter Arena' : 'Create Account';
    $('switch').textContent = authMode === 'login' ? 'New warrior? Create account' : 'Have an account? Log in';
  };

  $('offline').onclick = function () { prof = null; showLobby(); };
  $('logout').onclick = function () { setToken(''); show('login'); };
  $('tolobby').onclick = showLobby;
  $('again').onclick = function () { startBotDuel(selectedTier); };
  $('coopcategorybtn').onclick = function () { show('coopmenu'); };
  $('coopback').onclick = showLobby;

  // Key listeners
  addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys[k] = true;
    if (mode === 'bot') {
      if (k === 'f') pend[0].sw = true;
      if (k === 'g') pend[0].pa = true;
      if (k === 'h' || k === ' ') pend[0].bl = true;
    }
  });
  addEventListener('keyup', function (e) { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });

  cv.addEventListener('mousedown', function (e) {
    if (mode === 'bot') {
      if (e.button === 0) pend[0].sw = true;
      else if (e.button === 2) pend[0].pa = true;
    }
  });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Main Loop
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    frame(now, dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();