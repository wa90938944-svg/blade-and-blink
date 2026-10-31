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
  var RANK_NAMES = RANKS.map(function (r) { return r.n; });

  var BONE = '#efe6d2';
  var LOOKS = [
    { id: 'none', name: 'Plain', need: 'Bronze', desc: 'The bare circle, nothing added.' },
    { id: 'bronze', name: 'Scarred', need: 'Silver', desc: 'A slash scar across the circle and a notch in the blade.' },
    { id: 'silver', name: 'Wanderer', need: 'Silver', desc: 'A straw cone hat and a silver tint on your dash trail.' },
    { id: 'gold', name: 'Veteran', need: 'Gold', desc: 'Two battle scars and a gold edge on the blade.' },
    { id: 'platinum', name: 'Ronin', need: 'Platinum', desc: 'A wide-brimmed ronin hat and a chest plate.' },
    { id: 'diamond', name: 'Champion', need: 'Diamond', desc: 'Crossed scars, a crown and aura, and diamond dash sparks.' }
  ];
  var TRAIL_TINT = { silver: '#d6d2c8', gold: '#e5b842', platinum: '#c9331f', mastertetanus: '#ffe9a0' };
  var looks = ['none', 'none'];
  var teams = [0, 1];
  var godActive = false, noCdActive = false, fastActive = false;

  var selectedTier = 'novice';
  var apexConquered = false;
  var isBossEncounter = false;
  var bossDialogueT = 0, BOSS_INTRO_T = 3.6;
  var cam = { x: W / 2, y: H / 2 };

  // ---------- MASTERTETANUS boss fight state ----------
  var MT_GOLD = '#b58a2e', MT_GOLD_HI = '#e0b64a', MT_CRIM = '#8a1a12', MT_BLACK = '#120e0d';
  // divine palette: white-gold light, with a thin crimson edge so he still reads as an anti-hero
  var DV_WHITE = '#fffaf0', DV_CREAM = '#fff1b8', DV_GOLD = '#f2c75c', DV_GOLD_D = '#b8860b', DV_DEEP = '#6b4a08', DV_EYE = '#c9331f';
  var mtBarLag = 1;
  var bossHostIdx = 0, tetToken = '', mtForfeitSelf = false, mtBanOn = false;
  var OWNER_LOOK = { id: 'mastertetanus', name: 'MASTERTETANUS', need: 'Owner', desc: 'Divine: a blazing white-gold body, wings of light, a double halo and rising gold motes. Owner only.' };
  function isNet() { return mode === 'online' || mode === 'ffa' || mode === '2v2' || mode === 'boss'; }
  function allLooks() { return LOOKS.concat(prof && prof.isOwner ? [OWNER_LOOK] : []); }

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
  // Light wings: two fans of feathers behind the fighter, breathing slowly. Drawn beside the body, so the body stays player-sized.
  function divineWings(g, px, py, now, alpha, big) {
    var s, i, flap = Math.sin(now / 520), n = big ? 6 : 5;
    g.save();
    for (s = -1; s <= 1; s += 2) {
      for (i = 0; i < n; i++) {
        var a = -0.15 - i * 0.3 + flap * 0.05, len = (big ? 34 : 28) - i * 2.2 + flap * 1.5;
        var bx = px + s * 4, by = py - 1 + i * 0.4;
        var tx = bx + s * Math.cos(a) * len, ty = by + Math.sin(a) * len;
        var mx = (bx + tx) / 2, my = (by + ty) / 2, nx = -(ty - by), ny = (tx - bx), nl = Math.hypot(nx, ny) || 1;
        nx = nx / nl * 3.4; ny = ny / nl * 3.4;
        g.globalAlpha = alpha * (0.55 - i * 0.05);
        g.fillStyle = i % 2 ? DV_CREAM : DV_WHITE;
        g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(mx + nx, my + ny, tx, ty); g.quadraticCurveTo(mx - nx, my - ny, bx, by); g.closePath(); g.fill();
        g.globalAlpha = alpha * 0.5; g.strokeStyle = DV_GOLD; g.lineWidth = 0.9; g.stroke();
      }
    }
    g.restore();
  }
  // Radiant glow, slow rotating rays and the wings, all in light
  function divineAura(g, px, py, now, alpha, wings, big) {
    var pu = 0.5 + 0.5 * Math.sin(now / 650), k, rot = now / 4200;
    var gr = g.createRadialGradient(px, py, R * 0.6, px, py, R + 30 + pu * 4);
    gr.addColorStop(0, 'rgba(255,236,170,' + (0.5 * alpha).toFixed(3) + ')');
    gr.addColorStop(0.55, 'rgba(255,214,110,' + (0.2 * alpha).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(255,214,110,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, R + 30 + pu * 4, 0, 6.283); g.fill();
    g.save(); g.lineCap = 'round';
    for (k = 0; k < 12; k++) {
      var a = rot + k * 0.5236, long = k % 2 === 0, r0 = R + 5, r1 = R + (long ? 24 : 15) + pu * 3;
      g.globalAlpha = alpha * (long ? 0.55 : 0.35); g.strokeStyle = long ? DV_WHITE : DV_GOLD; g.lineWidth = long ? 1.6 : 1;
      g.beginPath(); g.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0); g.lineTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1); g.stroke();
    }
    g.restore();
    if (wings) divineWings(g, px, py, now, alpha, big);
    // outer dashed ring turning the other way, then the whole inner halo
    g.save(); g.translate(px, py); g.rotate(-now / 3200);
    g.setLineDash([6, 7]); g.strokeStyle = DV_GOLD; g.lineWidth = 1.4; g.globalAlpha = alpha * 0.8;
    g.beginPath(); g.arc(0, 0, R + 15, 0, 6.283); g.stroke(); g.setLineDash([]);
    g.restore();
    godlyHalo(g, px, py, now, R + 7, alpha, true);
    g.globalAlpha = 1;
  }
  // Tilted gold ring behind the fighter, broken in one place unless `whole`, with shards drifting off it
  function godlyHalo(g, px, py, now, r, alpha, whole) {
    var rot = now / 2600, k;
    g.save(); g.translate(px, py); g.rotate(rot); g.lineCap = 'round';
    g.strokeStyle = MT_GOLD; g.lineWidth = 2.6; g.globalAlpha = alpha;
    g.beginPath(); if (whole) g.arc(0, 0, r, 0, 6.283); else g.arc(0, 0, r, 0.55, 6.283); g.stroke();
    g.strokeStyle = MT_GOLD_HI; g.lineWidth = 1; g.globalAlpha = alpha * 0.8;
    g.beginPath(); if (whole) g.arc(0, 0, r, 0, 6.283); else g.arc(0, 0, r, 0.55, 6.283); g.stroke();
    g.restore();
    g.fillStyle = MT_GOLD_HI;
    for (k = 0; k < 3; k++) {
      var a = -rot * 1.3 + k * 2.094, rr = r + 4 + Math.sin(now / 500 + k * 2) * 2.5, sx = px + Math.cos(a) * rr, sy = py + Math.sin(a) * rr;
      g.globalAlpha = alpha * 0.9;
      g.beginPath(); g.moveTo(sx, sy - 3); g.lineTo(sx + 1.8, sy); g.lineTo(sx, sy + 3); g.lineTo(sx - 1.8, sy); g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  }
  function lookBelow(g, look, px, py, c, now) {
    if (look === 'mastertetanus') {
      divineAura(g, px, py, now, 0.95, true, false);
      return;
    }
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

    if (look === 'mastertetanus') {
      var bg0 = g.createRadialGradient(px - R * 0.25, py - R * 0.3, 1, px, py, R);
      bg0.addColorStop(0, DV_WHITE); bg0.addColorStop(0.6, DV_CREAM); bg0.addColorStop(1, DV_GOLD);
      g.fillStyle = bg0; g.beginPath(); g.arc(px, py, R, 0, 6.283); g.fill();
      g.strokeStyle = c; g.lineWidth = 2.4; g.beginPath(); g.arc(px, py, R - 1.2, 0, 6.283); g.stroke();
      g.strokeStyle = DV_GOLD_D; g.lineWidth = 1.2; g.beginPath(); g.arc(px, py, R * 0.6, 0, 6.283); g.stroke();
      g.fillStyle = DV_GOLD_D; g.beginPath(); g.moveTo(px, py - 4); g.lineTo(px + 2.8, py); g.lineTo(px, py + 4); g.lineTo(px - 2.8, py); g.closePath(); g.fill();
      g.fillStyle = DV_WHITE; g.beginPath(); g.arc(px, py, 1.3, 0, 6.283); g.fill();
    } else if (look === 'bronze') {
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
    if (look === 'mastertetanus') { g.strokeStyle = 'rgba(255,225,130,0.45)'; g.lineWidth = 14; g.stroke(); g.strokeStyle = DV_GOLD; g.lineWidth = 10; g.stroke(); }
    else if (look === 'gold') { g.strokeStyle = GOLD; g.lineWidth = 9.5; g.stroke(); }
    else if (look === 'silver') { g.strokeStyle = '#d6d2c8'; g.lineWidth = 8.5; g.stroke(); }
    else if (look === 'platinum') { g.strokeStyle = isRed ? '#ffffff' : '#c9331f'; g.lineWidth = 9.0; g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
    g.strokeStyle = BONE; g.lineWidth = 3; g.stroke();
    if (look === 'mastertetanus') { g.strokeStyle = DV_WHITE; g.lineWidth = 5.5; g.stroke(); g.strokeStyle = DV_CREAM; g.lineWidth = 2; g.stroke(); }
    var gr = g.createLinearGradient(x1, y1, x0, y0);
    gr.addColorStop(0, hexA(c, 0.95)); gr.addColorStop(0.5, hexA(c, 0)); gr.addColorStop(1, hexA(c, 0));
    g.strokeStyle = gr; g.lineWidth = 3.2; g.stroke();
    g.fillStyle = hexA(c, 0.9); g.beginPath(); g.arc(x1 - ca * 0.6, y1 - sa * 0.6, 2.6, 0, 7); g.fill();
    if (look === 'bronze') {
      var nx = -sa, ny = ca, tx = x0 + (x1 - x0) * 0.62, ty = y0 + (y1 - y0) * 0.62;
      g.fillStyle = PAPER; g.beginPath();
      g.moveTo(tx - ca * 2 + nx * 4.5, ty - sa * 2 + ny * 4.5); g.lineTo(tx + ca * 2 + nx * 4.5, ty + sa * 2 + ny * 4.5); g.lineTo(tx + nx * 0.7, ty + ny * 0.7);
      g.closePath(); g.fill();
    } else if (look === 'silver') {
      var nx1 = -sa, ny1 = ca, tx1 = x0 + (x1 - x0) * 0.8, ty1 = y0 + (y1 - y0) * 0.8;
      g.strokeStyle = '#f2ece0'; g.lineWidth = 1.5; g.beginPath();
      g.moveTo(tx1 + nx1 * 3, ty1 + ny1 * 3); g.lineTo(x1 + nx1 * 1.5, y1 + ny1 * 1.5); g.stroke();
    } else if (look === 'gold') {
      var nx2 = -sa, ny2 = ca, mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5;
      g.strokeStyle = GOLD; g.lineWidth = 2.2; g.beginPath();
      g.moveTo(mx - ca * 3 + nx2 * 3.5, my - sa * 3 + ny2 * 3.5);
      g.lineTo(mx + ca * 3 + nx2 * 3.5, my + sa * 3 + ny2 * 3.5);
      g.stroke();
    } else if (look === 'platinum') {
      var nx3 = -sa, ny3 = ca;
      g.fillStyle = '#191514'; g.beginPath();
      g.arc(x0 + ca * 4, y0 + sa * 4, 3.2, 0, 7); g.fill();
      g.strokeStyle = isRed ? '#ffffff' : '#c9331f'; g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(x0 + nx3 * 3.5, y0 + ny3 * 3.5);
      g.lineTo(x0 - nx3 * 3.5, y0 - ny3 * 3.5);
      g.stroke();
    }
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
        if (l % 2 === 0) {
          g.ellipse(lx, ly, 4, 8, (sway * 0.015), 0, 6.283);
        } else {
          g.moveTo(lx, ly - 7);
          g.lineTo(lx, ly + 7);
        }
        g.stroke();
      }
      var endX = anchorX + sway;
      var endY = 8 + links * 16;
      g.fillStyle = '#191310';
      g.beginPath();
      g.moveTo(endX - 6, endY);
      g.lineTo(endX + 6, endY);
      g.lineTo(endX, endY + 14);
      g.closePath();
      g.fill();
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
    var disp0 = disp[0] || target;
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

  // MASTERTETANUS: divine. A blazing white-gold body, wings of light, a double halo, a thin crimson edge.
  function drawMasterBoss(g, px, py, fa, now, p) {
    var clone = !!p.isClone, st = p.st > 0, pu = 0.5 + 0.5 * Math.sin(now / 700);
    var ca = Math.cos(fa), sa = Math.sin(fa), nx = -sa, ny = ca, s;
    g.save();
    divineAura(g, px, py, now, clone ? 0.5 : 1, true, true);
    g.globalAlpha = clone ? 0.6 : 1;
    var bg = g.createRadialGradient(px - R * 0.25, py - R * 0.3, 1, px, py, R);
    if (st) { bg.addColorStop(0, '#e8e2d0'); bg.addColorStop(1, '#a89f86'); }
    else { bg.addColorStop(0, DV_WHITE); bg.addColorStop(0.55, DV_CREAM); bg.addColorStop(1, DV_GOLD); }
    g.fillStyle = bg; g.beginPath(); g.arc(px, py, R, 0, 6.283); g.fill();
    g.strokeStyle = MT_CRIM; g.lineWidth = 1.8; g.beginPath(); g.arc(px, py, R - 0.9, 0, 6.283); g.stroke();
    g.strokeStyle = DV_GOLD_D; g.lineWidth = 1.2; g.beginPath(); g.arc(px, py, R * 0.62, 0, 6.283); g.stroke();
    g.fillStyle = DV_GOLD_D; g.beginPath(); g.moveTo(px, py - 3.6); g.lineTo(px + 2.6, py); g.lineTo(px, py + 3.6); g.lineTo(px - 2.6, py); g.closePath(); g.fill();
    g.fillStyle = DV_WHITE; g.beginPath(); g.arc(px, py, 1.2, 0, 6.283); g.fill();
    g.strokeStyle = DV_EYE; g.lineWidth = 1.9; g.lineCap = 'round';
    for (s = -1; s <= 1; s += 2) {
      var ex = px + ca * 5.4 + nx * 4.2 * s, ey = py + sa * 5.4 + ny * 4.2 * s;
      g.beginPath(); g.moveTo(ex - ca * 1.7, ey - sa * 1.7); g.lineTo(ex + ca * 1.7, ey + sa * 1.7); g.stroke();
    }
    var x0 = px + ca * R * 0.4, y0 = py + sa * R * 0.4, x1 = px + ca * (R + 19), y1 = py + sa * (R + 19);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.strokeStyle = 'rgba(255,225,130,0.5)'; g.lineWidth = 13; g.stroke();
    g.strokeStyle = DV_GOLD; g.lineWidth = 8; g.stroke();
    g.strokeStyle = DV_WHITE; g.lineWidth = 5; g.stroke();
    g.strokeStyle = DV_CREAM; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = DV_WHITE; g.beginPath(); g.arc(x1, y1, 2.8 + pu * 0.8, 0, 6.283); g.fill();
    g.restore();
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
  function dashWanderer(x1, y1, x2, y2, c) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (var i = 0; i < 14; i++) {
      var t = Math.random(), wOff = (Math.random() - 0.5) * 18;
      var px = x1 + dx * t + nx * wOff, py = y1 + dy * t + ny * wOff;
      var a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.8;
      var sp = 30 + Math.random() * 80;
      fx.push({ k: 'p', leaf: true, x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.45 + Math.random() * 0.4, c: i % 2 ? '#d6d2c8' : '#8e8674' });
    }
  }
  function dashVeteran(x1, y1, x2, y2, c) {
    var dx = x2 - x1, dy = y2 - y1;
    for (var i = 0; i < 16; i++) {
      var t = Math.random(), sp = 50 + Math.random() * 110, a = Math.random() * 6.283;
      fx.push({ k: 'p', spark: true, x: x1 + dx * t, y: y1 + dy * t, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.35 + Math.random() * 0.35, c: i % 3 === 0 ? '#ffffff' : (i % 2 === 0 ? GOLD : '#d9a526') });
    }
  }
  function dashRonin(x1, y1, x2, y2, c) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    var cutColor = (c === COL[1]) ? '#ffffff' : '#c9331f';
    for (var i = 0; i < 15; i++) {
      var t = Math.random(), sgn = Math.random() < 0.5 ? 1 : -1, off = sgn * (4 + Math.random() * 16);
      var px = x1 + dx * t + nx * off, py = y1 + dy * t + ny * off;
      fx.push({ k: 'p', roninCut: true, x: px, y: py, vx: nx * sgn * (40 + Math.random() * 60), vy: ny * sgn * (40 + Math.random() * 60), t: 0.38 + Math.random() * 0.32, c: i % 3 ? cutColor : INK });
    }
  }

  var CTRL = [
    { u: 'w', d: 's', l: 'a', r: 'd', sw: 'f', pa: 'g', bl: 'h' },
    { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight', sw: ',', pa: '.', bl: '/' }
  ];
  var sock = typeof io !== 'undefined' ? io(window.SERVER_URL || undefined) : null;
  var mode = null, lastKind = 'bot', M = null, me = 0, names = ['P1', 'P2'], vs = null, prof = null;
  var fx = [], keys = {}, pend = [{}, {}], disp = [], snap = true;
  var lastPhase = '', lastScore = [0, 0], msg = '', msgT = 0, msgD = 1;
  var shake = 0, punch = 0, flash = 0, freeze = 0, vig = 0;
  var petals = [], petalW = W, petalH = H;
  var mouse = { x: W / 2, y: H / 2 }, qT = 0, qI = null, fArm = 0, cur = 'login', authMode = 'login', claimToken = '', toastT = 0;
  var calm = false;
  try { calm = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var touch = false;
  try { touch = matchMedia('(pointer: coarse)').matches; } catch (e) {}
  var sv = { x: 0, y: 0 }, sid = null;
  try { document.fonts.load('40px "Dela Gothic One"'); document.fonts.load('600 14px "Barlow Condensed"'); } catch (e) {}
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
    $('coop2v2btn').disabled = !prof;
    $('coopextractbtn').disabled = !prof;
    $('cooppartybtn').disabled = !prof;
    $('boardbtn').hidden = !sock;
    $('lookbtn').hidden = !prof;
    $('savebtn').hidden = !prof;
    $('logout').hidden = !prof;
    $('cooplocalbtn').hidden = touch;
    $('adminbar').hidden = !(prof && (prof.isOwner || prof.isAdmin));
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
    $('wl').textContent = p.wins + 'W ' + p.losses + 'L' + (p.streak >= 2 ? '  \u00D7' + p.streak : '');
    $('card').title = (p.isOwner ? 'Owner Account. ' : '') + 'Peak ' + (p.peak || p.mmr) + ' MMR, ' + (p.games || 0) + ' games.';
    var hasNext = r.next > r.min;
    $('prog').style.width = (hasNext ? Math.min(1, (p.mmr - r.min) / (r.next - r.min)) * 100 : 100) + '%';
    $('prog').style.background = r.c;
    $('nextlbl').textContent = p.isOwner ? 'Infinite Reign' : (hasNext ? (r.next - p.mmr) + ' to ' + RANKS[RANKS.indexOf(r) + 1].n : 'Top rank');
    $('adminbar').hidden = !(p.isOwner || p.isAdmin);
    syncPartyModes();
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
    var s = '';
    for (var i = 0; i < maxH; i++) s += i < curH ? '\u2665' : '\u2661';
    return s;
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
    if (M.boss) {
      var selfB = M.p[me] || {}, bossB = M.p[M.bossIdx] || {};
      var alive = M.p.filter(function (q) { return q && q.team === 0 && !q.dead; }).length;
      $('s0').textContent = 'YOU \u2665 ' + Math.max(0, selfB.hearts || 0) + '/' + (selfB.maxHearts || 0) + '   Alive ' + alive + '/' + (M.nPlayers || 1);
      $('s1').textContent = 'MASTERTETANUS \u2665 ' + Math.max(0, bossB.hearts || 0);
      $('rnd').textContent = 'MASTERTETANUS';
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

  try { $('name').value = localStorage.getItem('bb_name') || ''; } catch (e) {}

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
  function signedIn(r) {
    setToken(r.token);
    try { localStorage.setItem('bb_name', r.profile.name); } catch (e) {}
    $('pass').value = ''; $('pass2').value = '';
    setProfile(r.profile);
    showLobby();
  }
  function toLogin(msg) {
    prof = null; mode = null;
    $('adminbar').hidden = true;
    setAuthMode('login'); show('login');
    if (msg) $('err').textContent = msg;
  }

  $('enter').onclick = function () {
    var err = $('err'); err.textContent = '';
    if (!sock) { err.textContent = 'Server not reachable.'; return; }
    var pw = $('pass').value, n = $('name').value.trim();
    if (!n && authMode !== 'claim') { err.textContent = 'Enter a username'; return; }
    if (!pw) { err.textContent = 'Enter a password'; return; }
    if (authMode !== 'login') {
      if (pw.length < 8) { err.textContent = 'Password must be at least 8 characters'; return; }
      if (pw !== $('pass2').value) { err.textContent = 'Passwords do not match'; return; }
    }
    var b = $('enter'), settled = false;
    b.disabled = true;
    var wait = setTimeout(function () { if (!settled) { settled = true; b.disabled = false; err.textContent = 'No answer from server'; } }, 10000);
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

  function readEquipped() { return prof && prof.equipped ? prof.equipped : {}; }
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
    else if (lastKind === 'boss') show('partymenu');
    else startLocal(lastKind);
  };
  $('boardbtn').onclick = function () {
    sock.emit('top', function (rows) { renderBoard(rows || []); show('board'); });
  };
  $('boardback').onclick = showLobby;

  // ---------- Co-op & Modes Hub ----------
  $('coopcategorybtn').onclick = function () { show('coopmenu'); };
  $('coopback').onclick = showLobby;
  $('coop2v2btn').onclick = function () {
    sock.emit('partyCreate', { mode: '2v2' }, function (r) {
      if (r && r.err) toast(r.err, true);
    });
  };
  $('coopextractbtn').onclick = joinFFAInstant;
  $('cooppartybtn').onclick = function () { show('partymenu'); };
  $('cooplocalbtn').onclick = function () { startLocal('local'); };

  function joinFFAInstant() {
    lastKind = 'ffa';
    isBossEncounter = false;
    sock.emit('joinFFA', function (r) {
      if (r && r.err) return toast(r.err, true);
      mode = 'ffa'; me = r.idx; M = null;
      looks = []; names = []; teams = []; disp = [];
      beginView();
      $('rnd').textContent = 'Shrine Extraction (Live)';
    });
  }

  // ---------- Private Parties UI ----------
  $('partyback').onclick = function () { show('coopmenu'); };
  $('partycreate').onclick = function () {
    var m = $('partymode').value;
    sock.emit('partyCreate', { mode: m }, function (r) {
      if (r && r.err) toast(r.err, true);
    });
  };
  $('partyjoin').onclick = function () {
    var code = $('partycode').value.trim();
    if (!code) return toast('Enter room code', true);
    sock.emit('partyJoin', { code: code }, function (r) {
      if (r && r.err) toast(r.err, true);
    });
  };
  $('partyleave').onclick = function () {
    sock.emit('partyLeave');
    showLobby();
  };
  $('partystart').onclick = function () {
    sock.emit('partyStart', function (r) {
      if (r && r.err) toast(r.err, true);
    });
  };
  $('partyready').onclick = function () {
    sock.emit('partyToggleReady');
  };

  if (sock) {
    sock.on('partyUpdate', function (d) {
      show('partyroom');
      $('roomcode').textContent = d.code;
      $('roommode').textContent = d.mode === 'boss' ? 'MASTERTETANUS (CO-OP BOSS)' : d.mode.toUpperCase();
      var list = $('partymembers');
      while (list.firstChild) list.removeChild(list.firstChild);
      d.members.forEach(function (m) {
        var li = document.createElement('li');
        li.textContent = m.name + (m.ready ? ' \u2713' : ' (waiting)');
        list.appendChild(li);
      });
      $('partystart').hidden = !d.host;
      $('partyready').textContent = d.host ? 'Ready (Host)' : 'Toggle Ready';
    });
    
    sock.on('announcement', function (msg) {
      var banner = $('announcement');
      if (banner) {
        banner.textContent = msg;
        banner.classList.add('show');
        snd('gong');
        setTimeout(function () { banner.classList.remove('show'); }, 6000);
      }
    });

    sock.on('chat_msg', function(d) {
      var log = $('chatLog');
      $('chatWrap').hidden = false;
      var el = document.createElement('div');
      el.className = 'chat-msg';
      var nameSpan = document.createElement('b');
      nameSpan.textContent = '[' + d.name + ']: ';
      el.appendChild(nameSpan);
      var textSpan = document.createElement('span');
      textSpan.textContent = d.msg;
      el.appendChild(textSpan);
      log.appendChild(el);
      if (log.childNodes.length > 5) log.removeChild(log.firstChild);
      setTimeout(function() {
        if (el.parentNode === log) {
          log.removeChild(el);
          if (log.childNodes.length === 0 && $('chatInputWrap').style.display !== 'block') {
            $('chatWrap').hidden = true;
          }
        }
      }, 8000);
    });
  }

  // ---------- Admin Panel Interactions ----------
  $('adminbtn').onclick = function () {
    if (!prof || (!prof.isOwner && !prof.isAdmin)) return;
    var inMatch = !!mode;
    $('adminMatchTools').hidden = !inMatch;
    $('adminMenuTools').hidden = inMatch;
    
    // Only display owner cheats if the player is actually the owner
    $('ownerCheats').style.display = (inMatch && prof.isOwner) ? 'flex' : 'none';
    
    if (!inMatch) {
      $('admSearch').value = '';
      loadAdminUserList('');
    }
    show('adminpanel');
  };
  
  $('adminClose').onclick = function () {
    if (mode) show(null);
    else showLobby();
  };
  
  $('admFightTetanus').onclick = function () {
    if (!prof || (!prof.isOwner && !prof.isAdmin)) return;
    startBotDuel('tetanus');
  };

  $('admSearchBtn').onclick = function() { loadAdminUserList($('admSearch').value); };
  $('admSearch').addEventListener('keydown', function(e) { if (e.key === 'Enter') $('admSearchBtn').click(); });

  function loadAdminUserList(searchStr) {
    var list = $('adminUserList');
    list.innerHTML = '<div style="padding:10px;text-align:center">Loading user records...</div>';
    sock.emit('admin_get_users', { search: searchStr }, function (r) {
      if (!r || !r.ok) { list.innerHTML = '<div style="padding:10px;color:var(--redhi)">Failed to load data</div>'; return; }
      list.innerHTML = '';
      r.users.forEach(function (u) {
        var row = document.createElement('div');
        row.className = 'adm-user-row';
        var adminHtml = (prof.isOwner && !u.isOwner) ? '<button class="sec" style="background:var(--gold);color:#000" id="prom_' + u.key + '">' + (u.isAdmin ? 'Demote' : 'Promote') + '</button>' : '';
        row.innerHTML = '<div><b>' + u.name + '</b> <small>(' + u.rank + ', ' + u.mmr + ' MMR' + (u.banned ? ' - <span style="color:var(--redhi)">BANNED</span>' : '') + (u.isAdmin ? ' - <span style="color:var(--gold)">ADMIN</span>' : '') + ')</small></div>' +
          '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:4px">' +
          adminHtml +
          '<input type="number" id="mmr_' + u.key + '" placeholder="MMR" value="' + u.mmr + '">' +
          '<button class="sec" id="setmmr_' + u.key + '">Save</button>' +
          '<button style="background:' + (u.banned ? 'var(--gold)' : 'var(--red)') + '" id="ban_' + u.key + '">' + (u.banned ? 'Unban' : 'Ban') + '</button>' +
          '</div>';
        list.appendChild(row);

        $('setmmr_' + u.key).onclick = function () {
          if (!prof.isOwner) return toast('Owner level required to adjust MMR', true);
          var val = $('mmr_' + u.key).value;
          sock.emit('admin_set_mmr', { key: u.key, mmr: val }, function (resp) {
            if (resp && resp.ok) { toast('MMR Updated (' + resp.mmr + ')'); loadAdminUserList($('admSearch').value); }
            else toast((resp && resp.err) || 'Error', true);
          });
        };
        $('ban_' + u.key).onclick = function () {
          var willBan = !u.banned;
          var reason = '';
          if (willBan) {
            reason = prompt('Enter a detailed reason for banning ' + u.name + ':');
            if (reason === null) return;
          }
          sock.emit('admin_set_ban', { key: u.key, banned: willBan, reason: reason }, function (resp) {
            if (resp && resp.ok) { toast(resp.banned ? 'Player Banned' : 'Player Unbanned'); loadAdminUserList($('admSearch').value); }
            else toast((resp && resp.err) || 'Error', true);
          });
        };
        if ($('prom_' + u.key)) {
          $('prom_' + u.key).onclick = function () {
            sock.emit('admin_set_admin', { key: u.key, isAdmin: !u.isAdmin }, function (resp) {
              if (resp && resp.ok) { toast(resp.isAdmin ? 'Promoted to Admin' : 'Demoted'); loadAdminUserList($('admSearch').value); }
              else toast((resp && resp.err) || 'Error', true);
            });
          };
        }
      });
    });
  }

  $('admBansBtn').onclick = function() {
    var list = $('adminBansList');
    list.innerHTML = '<div style="padding:10px;text-align:center">Loading reports...</div>';
    show('adminBanReports');
    sock.emit('admin_get_bans', function(r) {
      if (!r || !r.ok) { list.innerHTML = '<span class="err" style="padding:10px">Failed to load</span>'; return; }
      list.innerHTML = '';
      if (r.bans.length === 0) list.innerHTML = '<div style="padding:10px">No banned players.</div>';
      r.bans.forEach(function(b) {
         var d = document.createElement('div');
         d.style.cssText = 'padding:6px;border-bottom:1px solid var(--line)';
         d.innerHTML = '<strong style="color:var(--redhi)">' + b.name + '</strong>: ' + (b.reason || 'No description provided.');
         list.appendChild(d);
      });
    });
  };
  
  $('admBackToPanel').onclick = function() { show('adminpanel'); };

  function spawnGuardCmd() {
    if (!prof || (!prof.isOwner && !prof.isAdmin) || !mode || !M) return;
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      var ev = [];
      S.spawnBodyguard(M, 0, ev);
      onEv(ev);
      var cnt = M.p.filter(function (x) { return x && x.isMinion && !x.dead; }).length;
      toast('Spawned Bodyguard (' + cnt + ' active)');
      return;
    }
    sock.emit('admin_spawn_bodyguard', function (r) {
      if (r && r.ok) toast('Spawned Bodyguard (' + r.count + ' active)');
    });
  }

  $('admSpawnGuard').onclick = spawnGuardCmd;
  
  function cleanBotsCmd() {
    if (!prof || (!prof.isOwner && !prof.isAdmin) || !mode || !M) return;
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      let count = 0;
      M.p.forEach(function (p) {
        if (p && !p.dead && p.isMinion) { p.dead = true; p.lives = 0; p.hearts = 0; count++; }
      });
      toast('Cleaned ' + count + ' bots');
      return;
    }
    sock.emit('admin_clean_bots', function (r) {
      if (r && r.ok) toast('Cleaned ' + r.count + ' bots');
    });
  }
  
  $('admCleanBots').onclick = cleanBotsCmd;

  $('admKillAll').onclick = function () {
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      if (M) {
        M.p.forEach(function (p, idx) {
          if (idx !== 0 && p && !p.dead && !p.isMinion && !p.isOwner) { p.lives = 0; p.hearts = 0; p.dead = true; }
        });
      }
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
      if (M && M.p[0]) {
        M.p[0].god = !M.p[0].god;
        godActive = M.p[0].god;
        $('admGod').textContent = 'Invulnerability: ' + (godActive ? 'ON' : 'OFF');
        $('admGod').style.color = godActive ? 'var(--gold)' : 'var(--bone)';
        toast('God Mode ' + (godActive ? 'Enabled' : 'Disabled'));
      }
      return;
    }
    sock.emit('admin_match_toggle_god', function (r) {
      godActive = r.god;
      $('admGod').textContent = 'Invulnerability: ' + (godActive ? 'ON' : 'OFF');
      $('admGod').style.color = godActive ? 'var(--gold)' : 'var(--bone)';
      toast('God Mode ' + (godActive ? 'Enabled' : 'Disabled'));
    });
  };

  $('admNoCd').onclick = function () {
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      if (M && M.p[0]) {
        M.p[0].noCd = !M.p[0].noCd;
        noCdActive = M.p[0].noCd;
        $('admNoCd').textContent = 'No Cooldowns: ' + (noCdActive ? 'ON' : 'OFF');
        $('admNoCd').style.color = noCdActive ? 'var(--gold)' : 'var(--bone)';
        toast('No Cooldowns ' + (noCdActive ? 'Enabled' : 'Disabled'));
      }
      return;
    }
    sock.emit('admin_match_toggle_nocd', function (r) {
      noCdActive = r.noCd;
      $('admNoCd').textContent = 'No Cooldowns: ' + (noCdActive ? 'ON' : 'OFF');
      $('admNoCd').style.color = noCdActive ? 'var(--gold)' : 'var(--bone)';
      toast('No Cooldowns ' + (noCdActive ? 'Enabled' : 'Disabled'));
    });
  };
  
  $('admFast').onclick = function () {
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      if (M && M.p[0]) {
        M.p[0].fast = !M.p[0].fast;
        fastActive = M.p[0].fast;
        $('admFast').textContent = 'Super Speed: ' + (fastActive ? 'ON' : 'OFF');
        $('admFast').style.color = fastActive ? 'var(--gold)' : 'var(--bone)';
        toast('Super Speed ' + (fastActive ? 'Enabled' : 'Disabled'));
      }
      return;
    }
    sock.emit('admin_match_toggle_fast', function (r) {
      fastActive = r.fast;
      $('admFast').textContent = 'Super Speed: ' + (fastActive ? 'ON' : 'OFF');
      $('admFast').style.color = fastActive ? 'var(--gold)' : 'var(--bone)';
      toast('Super Speed ' + (fastActive ? 'Enabled' : 'Disabled'));
    });
  };

  $('admBecomeTetanus').onclick = function () {
    if (!prof || !prof.isOwner) return;
    if (mode === 'bot' || mode === 'local' || mode === 'endless') {
      if (M && M.p[0]) {
        var p = M.p[0];
        p.tier = 'tetanus';
        p.maxLives = 3; p.lives = 3;
        p.maxHearts = 5; p.hearts = 5;
        p.reach = 92; p.scale = 2.2; p.r = 13 * 2.2; p.spd = 175;
        toast('You are now Tetanus!');
      }
      return;
    }
    sock.emit('admin_become_tetanus', function (r) {
      if (r && r.ok) toast('You are now Tetanus!');
    });
  };
  
  $('admAnnounceBtn').onclick = function() {
    var msg = $('admAnnounceText').value.trim();
    if (!msg) return;
    sock.emit('admin_announce', { message: msg }, function(r) {
      if (r && r.ok) {
        toast('Announcement sent');
        $('admAnnounceText').value = '';
      }
    });
  };
  $('admAnnounceText').addEventListener('keydown', function(e) { if (e.key === 'Enter') $('admAnnounceBtn').click(); });

  // ---------- Look Picker ----------
  $('lookbtn').onclick = function () { renderLooks(); show('wardrobe'); };
  $('lookback').onclick = showLobby;
  function renderLooks() {
    var LOOKS_ALL = allLooks();
    var grid = $('lookgrid'), unlocked = (prof && prof.unlocked) || [], cur = prof && prof.equipped && prof.equipped.look;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    LOOKS_ALL.forEach(function (L) {
      var open = (prof && prof.isOwner) || unlocked.indexOf(L.id) >= 0;
      var b = document.createElement('button'), pv = document.createElement('canvas'), nm = document.createElement('span'), sm = document.createElement('small');
      b.className = 'look' + (L.id === cur ? ' sel' : '');
      b.disabled = !open;
      b.title = open ? L.desc : 'Reach ' + L.need + ' to unlock this look';
      pv.width = 72; pv.height = 72;
      var g = pv.getContext('2d');
      g.fillStyle = PAPER; g.fillRect(0, 0, 72, 72);
      g.globalAlpha = open ? 1 : 0.3;
      g.save(); g.translate(36, 38); g.scale(1.3, 1.3);
      drawFighter(g, L.id, 0, 0, COL[0], -0.6, performance.now());
      g.restore(); g.globalAlpha = 1;
      nm.textContent = L.name;
      sm.textContent = L.id === cur ? 'Equipped' : open ? (prof && prof.isOwner ? 'Unlocked (Owner)' : 'Unlocked') : 'Reach ' + L.need;
      b.appendChild(pv); b.appendChild(nm); b.appendChild(sm);
      b.onclick = function () { equipLook(L.id); };
      grid.appendChild(b);
    });
    var now = LOOKS_ALL.filter(function (L) { return L.id === cur; })[0];
    $('lookinfo').textContent = now ? now.name + ': ' + now.desc : '';
  }
  function equipLook(id) {
    if (!sock || !prof) return;
    sock.emit('equip', { look: id }, function (r) {
      if (r && r.ok) { setProfile(r.profile); renderLooks(); }
      else toast('Could not equip look', true);
    });
  }
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
      a.textContent = (i + 1) + '. ' + (r.isOwner ? '[OWNER] ' : '') + r.name;
      b.textContent = r.rank + '  ' + r.mmr;
      if (prof && r.name === prof.name) li.className = 'me';
      li.appendChild(a); li.appendChild(b); ol.appendChild(li);
    });
  }

  function enterQueue() {
    lastKind = 'online'; qT = 0; isBossEncounter = false;
    $('qt').textContent = '0:00';
    show('queue');
    sock.emit('queue');
    clearInterval(qI);
    qI = setInterval(function () {
      qT++;
      $('qt').textContent = Math.floor(qT / 60) + ':' + ('0' + (qT % 60)).slice(-2);
    }, 1000);
  }

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
    if (isNet()) { if (mode === 'boss') mtForfeitSelf = true; sock.emit('forfeit'); return; }
    var k = mode; mode = null; isBossEncounter = false; bossDialogueT = 0;
    if (k === 'endless') endResult('Run ended');
    else if (k === 'bot') result('You forfeited', names[1] + ' takes the win.', '', '', 'lose');
    else result('Match abandoned', names[0] + ' ' + M.score[0] + ' - ' + M.score[1] + ' ' + names[1], '', '');
  }

  function beginView() {
    fx = []; snap = true; lastPhase = ''; lastScore = [0, 0]; msgT = 0;
    shake = punch = flash = freeze = vig = 0;
    cam.x = W / 2; cam.y = H / 2;
    inkX.clearRect(0, 0, W, H);
    show(null); hud();
  }

  function decorateTetanusArena() {
    for (var s = 0; s < 14; s++) {
      var bx = 60 + Math.random() * (W - 120);
      var by = 50 + Math.random() * (H - 100);
      splat(bx, by, '#5c0a06', 14 + Math.random() * 18);
      stain(bx, by, '#4a0704', 12, 36);
    }
    bossDialogueT = BOSS_INTRO_T;
    shake = 16;
    snd('gong');
  }

  function triggerTetanusAmbush() {
    apexConquered = false;
    isBossEncounter = true;
    tetanusBegin();
    selectedTier = 'tetanus';
    M = S.create(1, '1v1', 'tetanus');
    names = ['You', 'TETANUS'];
    disp = [];
    snap = true;
    lastPhase = '';
    lastScore = [0, 0];
    decorateTetanusArena();
    hud();
  }

  function startBotDuel(tier) {
    selectedTier = tier;
    lastKind = 'bot';
    var activeTier = tier;
    isBossEncounter = (tier === 'tetanus');

    if (tier === 'novice' && apexConquered && Math.random() < 0.25) {
      activeTier = 'tetanus';
      isBossEncounter = true;
      apexConquered = false;
    }

    mode = 'bot'; vs = null; me = 0;
    var botLook = activeTier === 'apex' ? 'platinum' : (activeTier === 'veteran' ? 'gold' : 'bronze');
    looks = [(prof && prof.equipped && prof.equipped.look) || 'none', botLook];
    teams = [0, 1];
    M = S.create(1, '1v1', activeTier);
    var label = isBossEncounter ? 'TETANUS' : (activeTier.charAt(0).toUpperCase() + activeTier.slice(1) + ' CPU');
    names = ['You', label];
    disp = [];
    beginView();

    if (isBossEncounter) {
      tetanusBegin();
      decorateTetanusArena();
    }
  }

  function startLocal(k) {
    lastKind = k; mode = k; vs = null; me = 0; isBossEncounter = false; bossDialogueT = 0;
    looks = [(prof && prof.equipped && prof.equipped.look) || 'none', 'none'];
    teams = [0, 1];
    M = k === 'endless' ? S.createEndless() : S.create(4, '1v1', 'player');
    names = k === 'endless' ? ['You', 'Bots'] : ['P1', 'P2'];
    disp = [];
    beginView();
  }

  if (sock) {
    var resume = function (n) {
      var t = getToken();
      if (!t) return;
      sock.emit('resume', { token: t }, function (r) {
        if (r && r.ok) { setProfile(r.profile); if (cur === 'login') showLobby(); }
        else if (r && r.legacy) { claimToken = t; setAuthMode('claim', r.name); if (cur === 'login') show('login'); }
        else if (r && r.err) { setToken(''); if (prof || cur !== 'login') toLogin(r.err || 'Session ended'); }
        else if (n < 5) setTimeout(function () { resume(n + 1); }, 2000);
      });
    };
    sock.on('connect', function () { resume(0); });
    sock.on('match', function (d) {
      clearInterval(qI);
      isBossEncounter = false; bossDialogueT = 0;
      mode = d.mode === '2v2' ? '2v2' : d.mode === 'boss' ? 'boss' : 'online';
      lastKind = mode; me = d.you; names = d.names; M = null;
      vs = { ranks: d.ranks, mmrs: d.mmrs };
      looks = d.looks || [];
      teams = (d.teams || [0, 1]).slice();
      if (d.mode === 'boss') while (teams.length < 40) teams.push(1);   // guards and the clone are always on the boss's team
      disp = [];
      beginView();
      $('rnd').textContent = d.mode === '2v2' ? '2v2 Duel' : d.mode === 'boss' ? 'MASTERTETANUS' : 'Ranked';
      if (d.mode === 'boss') { bossHostIdx = d.hostIdx; mtForfeitSelf = false; mtBanSeen = false; mtIntroStart(d.you === d.hostIdx); }
    });
    sock.on('ffa_meta', function (d) {
      if (mode !== 'ffa') return;
      names = d.names;
      looks = d.looks;
      teams = d.names.map(function (_, i) { return i; });
    });
    sock.on('s', function (d) {
      if (!isNet()) return;
      M = d.m; onEv(d.ev);
      // the host pressed Challenge: release everyone else from the intro screen too
      if (mode === 'boss' && M && M.phase !== 'intro' && mtState) mtHideIntro();
      // MASTERTETANUS just died: cut to black right now, don't wait for the server's end message
      if (mode === 'boss' && M && M.boss && M.phase === 'roundend' && M.score && M.score[0]) showBanned();
    });
    sock.on('end', function (d) {
      if (d.mode === 'boss') { if (d.profile) setProfile(d.profile); bossEnded(d); return; }
      mode = null;
      if (d.profile) setProfile(d.profile);
      if (d.mode === 'ffa') {
        var kills = d.kills || 0;
        if (d.extracted) {
          var mmrGained = kills * 40;
          result('Extracted!', 'Secured ' + kills + ' Kills.', 'Banked to rank: +' + mmrGained + ' MMR', '+' + mmrGained + ' MMR', 'win');
        } else {
          var penaltyText = kills < 5 ? 'Lost 150 MMR (Under 5 kills)' : 'All unbanked Ink Essence was lost in the arena.';
          var deltaText = kills < 5 ? '-150 MMR' : '';
          result('Defeated', 'You failed to extract.', penaltyText, deltaText, 'lose');
        }
        return;
      }
      var won = d.winner === (d.mode === '2v2' ? teams[me] : d.you);
      var why = d.forfeit ? (d.quit === d.you ? 'You forfeited. ' : 'Opponent forfeited. ') : '';
      var line = (d.profile ? d.profile.rank + ', ' + d.profile.mmr + ' MMR' : '');
      if (d.unranked) line = 'Unranked Private Match';
      result(won ? 'Victory' : 'Defeat', why + (d.score ? names[0] + ' ' + d.score[0] + ' - ' + d.score[1] + ' ' + names[1] : ''),
        line, d.delta ? (d.delta > 0 ? '+' : '') + d.delta + ' MMR' : '', won ? 'win' : 'lose');
    });
    sock.on('kicked', function () { toLogin('You have been disconnected.'); });
    sock.on('unauth', function () { setToken(''); toLogin('Your session ended, please log in again.'); });
    sock.on('disconnect', function () {
      if (isNet()) { mode = null; mtHideIntro(); result('Disconnected', 'Lost connection to server.', '', '', 'lose'); }
    });
    sock.on('stats', function (d) {
      document.querySelectorAll('.stats').forEach(function (e) {
        e.textContent = d.online + ' online, ' + d.queue + ' ranked, ' + (d.ffa || 0) + ' extraction';
      });
    });
    setInterval(function () {
      if (!sock.connected) return;
      var t = Date.now();
      sock.volatile.emit('pg', function () { $('ping').textContent = (Date.now() - t) + ' ms'; });
    }, 2000);
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
  // Crescent sweep that follows the sword swing
  function slashArc(e) {
    var p = M && M.p && M.p[e.i]; if (!p) return;
    fx.push({ k: 'a', x: e.x, y: e.y, a: p.fa || 0, r: (p.reach || S.REACH) * (e.scale || 1), t: 0.2, T: 0.2, c: COL[teams[e.i] || 0] });
  }
  // Radial impact lines on hits and parries
  function starburst(x, y, c, n, len) {
    if (x == null || y == null) return;
    var ang = [], ln = [], base = Math.random() * 6.283;
    for (var i = 0; i < n; i++) { ang.push(base + i * 6.283 / n + (Math.random() - 0.5) * 0.4); ln.push(len * (0.6 + Math.random() * 0.8)); }
    fx.push({ k: 's', x: x, y: y, t: 0.28, T: 0.28, c: c, ang: ang, ln: ln });
  }
  function dustPuff(x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = 20 + Math.random() * 50, tt = 0.45 + Math.random() * 0.3;
      fx.push({ k: 'p', dust: true, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: tt, T: tt, c: '#8e8674' });
    }
  }
  // Fading afterimages along the dash, plus dust where it starts and lands
  function blinkFx(e, c) {
    for (var i = 1; i <= 3; i++) {
      var u = i / 4, tt = 0.14 + i * 0.07;
      fx.push({ k: 'g', x: e.x1 + (e.x2 - e.x1) * u, y: e.y1 + (e.y2 - e.y1) * u, t: tt, T: tt, c: c });
    }
    fx.push({ k: 'g', x: e.x2, y: e.y2, t: 0.3, T: 0.3, c: c });
    dustPuff(e.x1, e.y1, 7); dustPuff(e.x2, e.y2, 5);
  }
  // Slow drifting blossom petals behind the fighters
  function newPetal(anywhere) {
    return { x: Math.random() * petalW, y: anywhere ? Math.random() * petalH : -8, vx: 4 + Math.random() * 10, vy: 14 + Math.random() * 16,
      ph: Math.random() * 6.283, r: Math.random() * 6.283, vr: (Math.random() - 0.5) * 3, s: 2.5 + Math.random() * 1.6, dark: Math.random() < 0.25 };
  }
  function petalStep(dt) {
    if (calm) return;
    while (petals.length < 14) petals.push(newPetal(true));
    for (var i = 0; i < petals.length; i++) {
      var q = petals[i]; q.ph += dt;
      q.x += (q.vx + Math.sin(q.ph * 1.3) * 12) * dt; q.y += q.vy * dt; q.r += q.vr * dt;
      if (q.y > petalH + 10 || q.x > petalW + 10) petals[i] = newPetal(false);
    }
  }
  function drawPetals() {
    if (calm) return;
    for (var i = 0; i < petals.length; i++) {
      var q = petals[i];
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r);
      ctx.globalAlpha = q.dark ? 0.16 : 0.3; ctx.fillStyle = q.dark ? INK : '#c9331f';
      ctx.beginPath(); ctx.ellipse(0, 0, q.s * 1.5, q.s * 0.8, 0, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function hitStop(t) { if (!isNet()) freeze = t; }

  function onEv(ev) {
    (ev || []).forEach(function (e) {
      var c, small;
      if (e.t === 'swing') { snd('swing', e.x); slashArc(e); }
      else if (e.t === 'raise') snd('raise', e.x);
      else if (e.t === 'shine') snd('shine', e.x);
      else if (e.t === 'shrine_spawn') {
        ring(e.x, e.y, GOLD, R + 60, 0.7, 4); snd('shrine', e.x);
        burst(e.x, e.y, GOLD, 18);
      }
      else if (e.t === 'spawn_minion') {
        ring(e.x, e.y, GOLD, R + 45, 0.4, 4); snd('minion', e.x);
        burst(e.x, e.y, GOLD, 16);
      }
      else if (e.t === 'clone_spawn') {
        ring(e.x, e.y, MT_GOLD_HI, R + 55, 0.5, 4); burst(e.x, e.y, MT_GOLD_HI, 18); starburst(e.x, e.y, MT_GOLD_HI, 8, 40);
        snd('shine', e.x); say('MASTERTETANUS SPLITS', 1.0);
      }
      else if (e.t === 'clone_end') {
        burst(e.x, e.y, MT_GOLD, 12); ring(e.x, e.y, MT_GOLD, R + 30, 0.4, 3); snd('whiff', e.x);
      }
      else if (e.t === 'shield_break') {
        ring(e.x, e.y, '#ffffff', R + 40, 0.5, 4);
        shatter(e.x, e.y, '#ffffff', 8);
        snd('shield', e.x);
        vib(20);
      }
      else if (e.t === 'blink') {
        c = e.unparryable ? '#680c07' : COL[teams[e.i] || 0];
        var lk = looks[e.i] || 'none';
        fx.push({ k: 'l', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, t: 0.4, c: c, tint: TRAIL_TINT[lk] });
        if (lk === 'diamond') sparks(e.x1, e.y1, e.x2, e.y2, c);
        else if (lk === 'silver') dashWanderer(e.x1, e.y1, e.x2, e.y2, c);
        else if (lk === 'gold') dashVeteran(e.x1, e.y1, e.x2, e.y2, c);
        else if (lk === 'platinum') dashRonin(e.x1, e.y1, e.x2, e.y2, c);
        fx.push({ k: 'g', x: e.x1, y: e.y1, t: 0.35, T: 0.35, c: c });
        streak(e.x1, e.y1, e.x2, e.y2, c, e.unparryable ? 16 : 7);
        snd('blink', e.x1);
        blinkFx(e, c);
      } else if (e.t === 'parry') {
        burst(e.x, e.y, GOLD, 26); ring(e.x, e.y, GOLD, R + 60, 0.45, 5); stain(e.x, e.y, GOLD, 8, 18);
        say(e.b ? 'Dash punished!' : 'Parried!', 0.8);
        shake = 7; punch = 0.02; hitStop(0.08); snd('parry', e.x); vib(15);
        starburst(e.x, e.y, GOLD, 9, 46);
      } else if (e.t === 'hurt') {
        c = COL[teams[e.i] || 0];
        burst(e.x, e.y, c, 14);
        stain(e.x, e.y, isBossEncounter ? '#5c0a06' : c, 10, 24);
        shake = 6; punch = 0.015; hitStop(0.05); snd('hurt', e.x);
        starburst(e.x, e.y, c, 6, 32);
      } else if (e.t === 'lose_life') {
        c = COL[teams[e.i] || 0];
        shatter(e.x, e.y, c, 10);
        ring(e.x, e.y, c, R + 55, 0.45, 5);
        splat(e.x, e.y, isBossEncounter ? '#5c0a06' : c, 16);
        say((e.i === 0 ? 'You: ' : '') + e.lives + (e.lives === 1 ? ' Life Left!' : ' Lives Left!'), 0.9);
        shake = 9; punch = 0.025; hitStop(0.09);
        snd('lifeloss', e.x); starburst(e.x, e.y, c, 8, 44);
        if (e.i === me) vig = 0.7;
      } else if (e.t === 'whiff_parry') {
        ring(e.x, e.y, '#c9331f', R + 45, 0.4, 4);
        say('Parry Whiffed! Punish!', 0.9);
        snd('whiff', e.x);
      } else if (e.t === 'god_block') {
        burst(e.x, e.y, '#ffffff', 14); ring(e.x, e.y, GOLD, R + 30, 0.3, 4);
        snd('godblock', e.x); starburst(e.x, e.y, '#ffffff', 6, 28);
      } else if (e.t === 'intercept') {
        say('Blink Intercepted! +25', 0.9);
        snd('intercept', e.x); starburst(e.x, e.y, GOLD, 7, 40);
      } else if (e.t === 'extract') {
        say('Player Extracted!', 1.2);
        snd('extract');
        ring(e.x || W / 2, e.y || H / 2, GOLD, R + 90, 0.8, 6);
      } else if (e.t === 'kill') {
        c = COL[teams[e.i] || 0];
        small = !!(M && M.endless && e.i > 0);
        shatter(e.x, e.y, c, small ? 8 : 18); burst(e.x, e.y, c, small ? 10 : 22);
        ring(e.x, e.y, c, R + (small ? 44 : 80), 0.55, 6);
        splat(e.x, e.y, c, small ? 12 : 22); stain(e.x, e.y, c, small ? 10 : 26, small ? 20 : 42);
        shake = small ? 4 : 11; punch = small ? 0.012 : 0.035; flash = small ? 0 : 0.35;
        hitStop(small ? 0.03 : 0.12); snd('kill', e.x);
        starburst(e.x, e.y, c, small ? 7 : 12, small ? 40 : 70);
        if (e.i === me) vib(90);
        if (mode === 'boss' && M && M.bossIdx === e.i) showBanned();
      } else if (e.t === 'spawn') { burst(e.x, e.y, COL[1], 14); ring(e.x, e.y, COL[1], R + 30, 0.4, 3); snd('spawn', e.x); }
    });
    hud();
  }

  function watch() {
    if (!M || M.phase === lastPhase) return;
    lastPhase = M.phase;
    if (M.phase === 'ready') {
      say(M.boss ? 'MASTERTETANUS' : isBossEncounter ? 'SURVIVE TETANUS' : M.endless ? 'Survive!' : mode === 'bot' ? names[1] : 'Round ' + M.round, 1.3);
      snap = true;
      fadeInk(); snd('tick');
    } else if (M.phase === 'fight') { say('Fight!', 0.6); snd('gong'); }
    else if (M.phase === 'roundend') {
      if (M.boss) {
        say(M.score[0] ? 'MASTERTETANUS FALLS' : 'WIPED OUT', 1.7);
      } else if (M.mode === '2v2') {
        say('Round Concluded', 1.7);
      } else if (mode === 'bot') {
        var bw = M.score[0] > lastScore[0] ? 0 : 1;
        say(bw === 0 ? 'Target Slain!' : 'Defeated!', 1.5);
        lastScore = M.score.slice();
      } else {
        var w = M.score[0] > lastScore[0] ? 0 : M.score[1] > lastScore[1] ? 1 : -1;
        say(M.endless ? 'Overrun!' : w < 0 ? 'Double KO' : names[w] + ' scores', 1.7);
        lastScore = M.score.slice();
      }
    }
    hud();
  }

  // ---------- Input ----------
  ['pointerdown', 'keydown'].forEach(function (ev) {
    addEventListener(ev, function () { if (typeof Sfx !== 'undefined') Sfx.unlock(); });
  });
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('button')) snd('click');
  });
  document.addEventListener('mouseover', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button');
    if (b && !b.disabled && !(e.relatedTarget && b.contains(e.relatedTarget))) snd('hover');
  });
  (function () {
    var st = document.createElement('style'), d = '', i;
    for (i = 1; i <= 8; i++) d += '.screen.on>*:nth-child(' + i + '){animation-delay:' + (0.02 + 0.04 * (i - 1)).toFixed(2) + 's}';
    st.textContent = '@media (prefers-reduced-motion:no-preference){' +
      '@keyframes uiIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
      '@keyframes slam{0%{opacity:0;transform:scale(1.6)}65%{opacity:1;transform:scale(.96)}100%{opacity:1;transform:scale(1)}}' +
      '@keyframes popIn{0%{opacity:0;transform:scale(.7)}60%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}' +
      '.screen.on>*:not(#badge):not(.spin){animation:uiIn .34s cubic-bezier(.16,1,.3,1) backwards}' + d +
      '.screen.on>*:nth-child(n+9){animation-delay:.34s}' +
      '#result.on #rt{animation:slam .45s cubic-bezier(.2,.9,.3,1.2) backwards}' +
      '#result.on #rdelta{animation:popIn .5s cubic-bezier(.2,.9,.3,1.3) .35s backwards}' +
      '}';
    document.head.appendChild(st);
  })();

  $('chatInput').addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      var txt = this.value.trim();
      if (txt) sock.emit('chat', txt);
      this.value = '';
      $('chatInputWrap').style.display = 'none';
      cv.focus();
    }
    if (e.key === 'Escape') {
      this.value = '';
      $('chatInputWrap').style.display = 'none';
      cv.focus();
    }
  });

  addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'm' && typeof Sfx !== 'undefined') { Sfx.toggle(); syncMute(); return; }
    
    if (k === 'c' && (isNet())) {
      e.preventDefault();
      $('chatWrap').hidden = false;
      $('chatInputWrap').style.display = 'block';
      $('chatInput').focus();
      return;
    }

    if (k === 'p' && prof && (prof.isOwner || prof.isAdmin) && mode) {
      spawnGuardCmd();
      return;
    }
    if (k === 'o' && prof && (prof.isOwner || prof.isAdmin) && mode) {
      cleanBotsCmd();
      return;
    }
    if (mode && (k.indexOf('Arrow') === 0 || k === ' ' || k === '/' || k === ',' || k === '.')) e.preventDefault();
    keys[k] = true;
    if (!mode || e.repeat) return;
    if (isNet()) {
      if (k === ' ') sock.emit('act', 'bl');
      else if (k === 'e') sock.emit('act', 'pa');
      return;
    }
    if (mode === 'bot' || mode === 'endless') {
      if (k === ' ' || k === 'h') pend[0].bl = true;
      else if (k === 'e' || k === 'g') pend[0].pa = true;
      else if (k === 'f') pend[0].sw = true;
      return;
    }
    for (var i = 0; i < 2; i++) {
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
    if (!mode) return;
    if (isNet()) {
      if (e.button === 0) sock.emit('act', 'sw');
      else if (e.button === 2) sock.emit('act', 'pa');
    } else if (mode === 'bot' || mode === 'endless') {
      if (e.button === 0) pend[0].sw = true;
      else if (e.button === 2) pend[0].pa = true;
    }
  });

  setInterval(function () {
    if ((!isNet()) || !M) return;
    var d = disp[me] || (M.p[me] ? { x: M.p[me].x, y: M.p[me].y } : { x: W / 2, y: H / 2 });
    var zx = (mode === 'boss' && M.boundW) ? W / M.boundW : 1, zy = (mode === 'boss' && M.boundH) ? H / M.boundH : 1;
    var aimX = mode === 'ffa' ? mouse.x + (cam.x - W / 2) : mouse.x / zx;
    var aimY = mode === 'ffa' ? mouse.y + (cam.y - H / 2) : mouse.y / zy;
    sock.emit('in', {
      x: sv.x || (((keys.d || keys.ArrowRight) ? 1 : 0) - ((keys.a || keys.ArrowLeft) ? 1 : 0)),
      y: sv.y || (((keys.s || keys.ArrowDown) ? 1 : 0) - ((keys.w || keys.ArrowUp) ? 1 : 0)),
      aim: touch ? null : Math.atan2(aimY - d.y, aimX - d.x)
    });
  }, 33);

  function localInp(i) {
    var c = CTRL[i];
    var o = { x: (keys[c.r] ? 1 : 0) - (keys[c.l] ? 1 : 0), y: (keys[c.d] ? 1 : 0) - (keys[c.u] ? 1 : 0) };
    if (i === 0 && (mode === 'bot' || mode === 'endless')) {
      o.x = ((keys.d || keys.ArrowRight) ? 1 : 0) - ((keys.a || keys.ArrowLeft) ? 1 : 0);
      o.y = ((keys.s || keys.ArrowDown) ? 1 : 0) - ((keys.w || keys.ArrowUp) ? 1 : 0);
      if (!touch && M && M.p[0]) {
        o.aim = Math.atan2(mouse.y - M.p[0].y, mouse.x - M.p[0].x);
      }
    }
    ['sw', 'pa', 'bl'].forEach(function (k) { o[k] = pend[i][k]; pend[i][k] = false; });
    if (i === 0 && (sv.x || sv.y)) { o.x = sv.x; o.y = sv.y; }
    return o;
  }

  // ---------- Touch controls ----------
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
    if (isNet()) sock.emit('act', k); else pend[0][k] = true;
  }
  [['tbSwing', 'sw'], ['tbParry', 'pa'], ['tbBlink', 'bl']].forEach(function (b) {
    var btn = $(b[0]);
    btn.addEventListener('pointerdown', function (e) { e.preventDefault(); btn.classList.add('down'); press(b[1]); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { btn.addEventListener(n, function () { btn.classList.remove('down'); }); });
  });
  function padState() {
    var p = M && M.p[isNet() ? me : 0];
    if (!p || !mode) return;
    $('tbSwing').classList.toggle('cd', p.sc > 0 || p.sw >= 0 || p.bw > 0);
    $('tbParry').classList.toggle('cd', p.pa >= 0);
    $('tbBlink').classList.toggle('cd', p.ch <= 0 || p.bc > 0 || p.bw > 0);
    $('chn').textContent = p.ch;
  }

  // ---------- Render ----------
  function smooth() {
    if (!M) return;
    for (var i = 0; i < M.p.length; i++) {
      var p = M.p[i]; if (!p) continue;
      if (!disp[i]) disp[i] = { x: p.x, y: p.y };
      var d = disp[i];
      if (p.gen !== undefined && d.gen !== p.gen) { d.x = p.x; d.y = p.y; d.gen = p.gen; }
      if (snap || (!isNet()) || Math.hypot(p.x - d.x, p.y - d.y) > 60) {
        d.x = p.x; d.y = p.y;
      } else {
        d.x += (p.x - d.x) * 0.5; d.y += (p.y - d.y) * 0.5;
      }
    }
    snap = false;
  }

  // slow white-gold motes of light rising off the boss and its clone
  function emberStep(dt) {
    if (calm || mode !== 'boss' || !M) return;
    for (var i = 0; i < M.p.length; i++) {
      var q = M.p[i];
      if (!q || q.dead || q.tier !== 'mtboss' || Math.random() > dt * 16) continue;
      var d = disp[i] || q;
      fx.push({ k: 'p', ember: true, x: d.x + (Math.random() - 0.5) * 18, y: d.y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 12, vy: -(10 + Math.random() * 14), t: 1.4, T: 1.4, c: q.isClone ? '#c9b27a' : (Math.random() < 0.5 ? DV_WHITE : DV_GOLD) });
    }
  }
  function fxStep(dt) {
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i]; f.t -= dt;
      if (f.k === 'p') {
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.ember) { f.vy -= 4 * dt; f.vx *= 0.99; }
        else if (f.leaf) { f.vx *= 0.91; f.vy *= 0.91; }
        else if (f.spark) { f.vx *= 0.88; f.vy *= 0.88; }
        else if (f.roninCut) { f.vx *= 0.85; f.vy *= 0.85; }
        else { f.vx *= 0.94; f.vy *= 0.94; }
      }
      else if (f.k === 'd') {
        var fr = Math.pow(0.03, dt);
        f.vx *= fr; f.vy *= fr; f.va *= fr; f.a += f.va * dt;
        f.x = f.x + f.vx * dt; f.y = f.y + f.vy * dt;
        streak(f.px, f.py, f.x, f.y, f.c, 2); f.px = f.x; f.py = f.y;
        if (Math.hypot(f.vx, f.vy) < 24) f.t = 0;
      }
      if (f.t <= 0) { if (f.k === 'd') landShard(f); fx.splice(i, 1); }
    }
    shake = Math.max(0, shake - 40 * dt);
    punch = Math.max(0, punch - 0.12 * dt);
    flash = Math.max(0, flash - 1.2 * dt);
    vig = Math.max(0, vig - 1.6 * dt);
    petalStep(dt);
    if (msgT > 0) msgT -= dt;
  }

  function drawShrines(g, shrines, now) {
    if (!shrines) return;
    shrines.forEach(function (sh) {
      var pulse = 0.5 + 0.5 * Math.sin(now / 500);
      g.strokeStyle = 'rgba(184, 137, 31, 0.4)'; g.lineWidth = 2;
      g.beginPath(); g.arc(sh.x, sh.y, sh.r + pulse * 4, 0, 6.283); g.stroke();
      ringPoly(g, sh.x, sh.y, 8, sh.r * 0.7, sh.r * 0.7, now / 2000);
      g.strokeStyle = GOLD; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = INK; g.font = '600 11px "Barlow Condensed"'; g.textAlign = 'center';
      g.fillText('SHRINE', sh.x, sh.y + 4);
    });
  }

  function draw(now) {
    ctx.save();
    ctx.fillStyle = isBossEncounter ? '#8c8271' : PAPER;
    ctx.fillRect(0, 0, W, H);
    if (!M) {
      if (isNet()) {
        ctx.fillStyle = '#5a4f40'; ctx.font = '600 20px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Searching for match...', W / 2, H / 2);
      }
      ctx.restore(); return;
    }

    var boundW = (M && M.boundW) || W;
    var boundH = (M && M.boundH) || H;

    if (mode === 'ffa') {
      var selfPos = disp[me] || (M.p[me] ? { x: M.p[me].x, y: M.p[me].y } : { x: boundW / 2, y: boundH / 2 });
      cam.x += (selfPos.x - cam.x) * 0.1;
      cam.y += (selfPos.y - cam.y) * 0.1;
      ctx.translate(W / 2 - cam.x, H / 2 - cam.y);
    }

    if (punch > 0 && !calm) {
      ctx.translate(W / 2, H / 2); ctx.scale(1 + punch, 1 + punch); ctx.translate(-W / 2, -H / 2);
    }
    if (shake > 0 && !calm) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    if (mode === 'boss') ctx.scale(W / boundW, H / boundH);   // the whole 1.5x arena fits on screen

    ctx.strokeStyle = 'rgba(60,40,20,.10)'; ctx.lineWidth = 1; ctx.beginPath();
    var x, y;
    for (x = 40; x < boundW; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, boundH); }
    for (y = 40; y < boundH; y += 40) { ctx.moveTo(0, y); ctx.lineTo(boundW, y); }
    ctx.stroke();

    if (mode !== 'ffa' && mode !== 'boss') ctx.drawImage(inkC, 0, 0);
    petalW = boundW; petalH = boundH; if (!isBossEncounter && mode !== 'boss') drawPetals();

    if (isBossEncounter) drawChains(ctx, now);

    if (M.shrines) drawShrines(ctx, M.shrines, now);

    ctx.strokeStyle = 'rgba(60,40,20,.22)'; ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(boundW / 2, 0); ctx.lineTo(boundW / 2, boundH); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.strokeRect(4, 4, boundW - 8, boundH - 8);

    fx.forEach(function (f) {
      var a = f.T ? Math.max(0, f.t / f.T) : 1;
      if (f.k === 'l') {
        ctx.globalAlpha = Math.max(0, f.t / 0.4); ctx.strokeStyle = f.c; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        if (f.tint) { ctx.strokeStyle = f.tint; ctx.lineWidth = 3; ctx.stroke(); }
        ctx.globalAlpha = 1;
      } else if (f.k === 'r') {
        ctx.globalAlpha = a; ctx.strokeStyle = f.c; ctx.lineWidth = f.w * a + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - a), 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (f.k === 'd') {
        ctx.fillStyle = f.c; shardPath(ctx, f); ctx.fill();
        ctx.strokeStyle = 'rgba(239,230,210,.6)'; ctx.lineWidth = 1; ctx.stroke();
      } else if (f.k === 'g') {
        ctx.globalAlpha = 0.4 * a; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      } else if (f.k === 'a') {
        var sw = Math.min(1, (1 - a) * 2.2);
        ctx.save(); ctx.lineCap = 'round';
        ctx.globalAlpha = a * 0.85; ctx.strokeStyle = f.c; ctx.lineWidth = 7 * a + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.92, f.a - 1.0, f.a - 1.0 + 2.0 * sw); ctx.stroke();
        ctx.globalAlpha = a; ctx.strokeStyle = PAPER; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.92, f.a - 1.0 + 0.9 * sw, f.a - 1.0 + 2.0 * sw); ctx.stroke();
        ctx.restore();
      } else if (f.k === 's') {
        var sr = 8 + (1 - a) * 22;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = f.c; ctx.lineCap = 'round'; ctx.lineWidth = 3 * a + 0.5;
        ctx.beginPath();
        for (var si = 0; si < f.ang.length; si++) {
          var cs = Math.cos(f.ang[si]), sn = Math.sin(f.ang[si]);
          ctx.moveTo(f.x + cs * sr, f.y + sn * sr); ctx.lineTo(f.x + cs * (sr + f.ln[si] * a), f.y + sn * (sr + f.ln[si] * a));
        }
        ctx.stroke(); ctx.restore();
      } else {
        ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = f.c;
        if (f.ember) {
          ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(f.x, f.y, 1.7, 0, 6.283); ctx.fill();
        } else if (f.dust) {
          ctx.globalAlpha = 0.3 * a; ctx.beginPath(); ctx.arc(f.x, f.y, 3 + (1 - a) * 7, 0, 6.283); ctx.fill();
        } else if (f.dm) {
          ctx.beginPath(); ctx.moveTo(f.x, f.y - 4); ctx.lineTo(f.x + 3, f.y); ctx.lineTo(f.x, f.y + 4); ctx.lineTo(f.x - 3, f.y); ctx.closePath(); ctx.fill();
        } else if (f.leaf) {
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.vx * 0.05);
          ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 2, 0, 0, 6.283); ctx.fill();
          ctx.restore();
        } else if (f.spark) {
          ctx.beginPath(); ctx.arc(f.x, f.y, 1.8, 0, 6.283); ctx.fill();
        } else if (f.roninCut) {
          ctx.save(); ctx.translate(f.x, f.y);
          ctx.beginPath(); ctx.moveTo(-3, -1.5); ctx.lineTo(3, 1.5); ctx.lineWidth = 2; ctx.strokeStyle = f.c; ctx.stroke();
          ctx.restore();
        } else {
          ctx.fillRect(f.x - 2, f.y - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
      }
    });

    M.p.forEach(function (p, i) {
      if (!p || p.dead) return;
      var px = disp[i] ? disp[i].x : p.x, py = disp[i] ? disp[i].y : p.y;
      var teamId = (M.mode === '2v2' && p.team !== undefined) ? p.team : (teams[i] !== undefined ? teams[i] : (i > 0 ? 1 : 0));
      var c = COL[teamId % COL.length];
      var look = p.isMinion ? 'gold' : (looks[i] || 'none');
      var isRed = (c === COL[1]);
      var pReach = p.reach || S.REACH;
      var pR = p.r || R;

      if (p.isLeader && mode === 'ffa') {
        var aPulse = 0.5 + 0.5 * Math.sin(now / 300);
        ctx.strokeStyle = `rgba(217, 165, 38, ${0.4 + aPulse * 0.3})`; 
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, pR + 14 + aPulse * 4, 0, 6.283);
        ctx.stroke();
        
        ctx.fillStyle = GOLD;
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('👑', px, py - pR - 32);
      }

      if (p.bossTelegraph > 0) {
        ctx.save();
        if (p.bossAction === 'crush') {
          var ca = Math.cos(p.fa), sa = Math.sin(p.fa);
          ctx.strokeStyle = 'rgba(201, 51, 31, 0.75)';
          ctx.lineWidth = pR * 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + ca * S.BLINK_D * 1.45, py + sa * S.BLINK_D * 1.45);
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(201, 51, 31, 0.22)';
          ctx.strokeStyle = '#c9331f';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.arc(px, py, pReach, p.fa - 1.05, p.fa + 1.05);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      if (p.sw >= 0) {
        var act = p.sw >= A0 && p.sw < A1;
        ctx.globalAlpha = act ? 0.8 : 0.18; ctx.fillStyle = p.tier === 'tetanus' ? '#680c07' : (p.tier === 'mtboss' ? DV_GOLD : c);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, pReach, p.fa - 1.05, p.fa + 1.05); ctx.closePath(); ctx.fill();
        if (act) {
          if (p.tier === 'mtboss' || look === 'mastertetanus') {
            ctx.strokeStyle = DV_WHITE; ctx.lineWidth = 4.5; ctx.beginPath();
            ctx.arc(px, py, pReach, p.fa - 1.0, p.fa + 1.0); ctx.stroke();
            ctx.strokeStyle = DV_GOLD; ctx.lineWidth = 2; ctx.beginPath();
            ctx.arc(px, py, pReach - 4, p.fa - 0.75, p.fa + 0.75); ctx.stroke();
          } else if (look === 'silver') {
            ctx.strokeStyle = '#d6d2c8'; ctx.lineWidth = 3.5; ctx.beginPath();
            ctx.arc(px, py, pReach, p.fa - 1.0, p.fa + 1.0); ctx.stroke();
          } else if (look === 'gold') {
            ctx.strokeStyle = GOLD; ctx.lineWidth = 4.5; ctx.beginPath();
            ctx.arc(px, py, pReach, p.fa - 0.95, p.fa + 0.95); ctx.stroke();
            ctx.strokeStyle = BONE; ctx.lineWidth = 1.8; ctx.beginPath();
            ctx.arc(px, py, pReach - 4, p.fa - 0.7, p.fa + 0.7); ctx.stroke();
          } else if (look === 'platinum') {
            ctx.strokeStyle = isRed ? '#ffffff' : '#c9331f'; ctx.lineWidth = 4; ctx.beginPath();
            ctx.arc(px, py, pReach, p.fa - 1.05, p.fa + 1.05); ctx.stroke();
            ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath();
            ctx.arc(px, py, pReach - 3, p.fa - 1.05, p.fa + 1.05); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
      if (p.pa >= 0) {
        var on = p.pa < PAR;
        ctx.strokeStyle = on ? GOLD : 'rgba(184,137,31,.3)'; ctx.lineWidth = on ? 4 : 2;
        ctx.beginPath(); ctx.arc(px, py, pR + 9 + (on ? p.pa * 20 : 0), 0, 7); ctx.stroke();
      }

      if (M.mode === '2v2' && i !== me && teams[i] === teams[me] && !p.isMinion) {
        ctx.strokeStyle = hexA(BONE, 0.65); ctx.lineWidth = 2; ctx.beginPath();
        ctx.arc(px, py, pR + 6, 0, 6.283); ctx.stroke();
      }

      if (p.isMinion) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath();
        ctx.arc(px, py, pR + 5, 0, 6.283); ctx.stroke();
        ctx.fillStyle = GOLD; ctx.font = '700 11px "Barlow Condensed"'; ctx.textAlign = 'center';
        ctx.fillText('GUARD', px, py - pR - 8);
      }

      if (p.extract > 0) {
        var ratio = Math.min(1, p.extract / S.EXTRACT_TIME);
        ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.beginPath();
        ctx.arc(px, py, pR + 8, -1.57, -1.57 + ratio * 6.283); ctx.stroke();
      }

      if (p.god) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, pR + 4 + Math.sin(now / 150) * 2, 0, 6.283); ctx.stroke();
      }
      
      if (p.shield) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px, py, pR + 10 + Math.sin(now / 200) * 3, 0, 6.283); ctx.stroke();
      }

      if (p.tier === 'tetanus') {
        drawTetanus(ctx, px, py, p.fa, now, p);
      } else if (p.tier === 'mtboss') {
        drawMasterBoss(ctx, px, py, p.fa, now, p);
      } else {
        lookBelow(ctx, look, px, py, c, now);
        var shine = p.bw > 0 ? 1 - p.bw / S.BLINK_WIND : -1;
        ctx.shadowBlur = 0; ctx.fillStyle = p.st > 0 ? '#9c9484' : c;
        ctx.beginPath(); ctx.arc(px, py, pR, 0, 7); ctx.fill();
        if (shine >= 0) {
          var gl = ctx.createRadialGradient(px - pR * 0.3, py - pR * 0.35, 0, px, py, pR);
          gl.addColorStop(0, 'rgba(255,252,240,' + (0.25 + 0.6 * shine).toFixed(2) + ')');
          gl.addColorStop(1, 'rgba(255,252,240,0)');
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px, py, pR, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,' + (0.2 + 0.65 * shine).toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(px - pR * 0.32, py - pR * 0.36, pR * 0.2, 0, 7); ctx.fill();
        }
        lookAbove(ctx, look, px, py, c);
        drawBlade(ctx, look, px, py, p.fa, c, p.sc > 0);
      }

      if (!p.isMinion && p.tier !== 'mtboss' && ((p.tier && p.tier !== 'player') || p.maxLives > 1 || (mode === 'boss' && p.team === 0))) {
        var barW = Math.max(36, pR * 2.2);
        var sx = px - barW / 2;
        var sy = py - pR - 16;
        for (var h = 0; h < p.maxHearts; h++) {
          ctx.fillStyle = h < p.hearts ? '#c9331f' : 'rgba(25,21,20,.35)';
          var segW = (barW / p.maxHearts) - 2;
          ctx.fillRect(sx + h * (barW / p.maxHearts), sy, segW, 5);
        }
        ctx.fillStyle = INK;
        ctx.font = '700 11px "Barlow Condensed"';
        ctx.textAlign = 'center';
        if (mode === 'boss') { ctx.fillText(Math.max(0, p.hearts) + '/' + p.maxHearts, px, sy - 4); }
        else ctx.fillText('LIVES: ' + p.lives + '/' + p.maxLives, px, sy - 4);
      }

      if (p.st > 0) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
        for (var k = 0; k < 3; k++) { var a = now / 120 + k * 2.1; ctx.beginPath(); ctx.arc(px + Math.cos(a) * 15, py - pR - 8 + Math.sin(a) * 4, 3, 0, 7); ctx.stroke(); }
      }
      if ((isNet()) && i === me) {
        ctx.fillStyle = (prof && prof.isOwner) ? '#c9331f' : INK;
        ctx.font = '700 14px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText((prof && prof.isOwner) ? '[OWNER] ' + prof.name : 'YOU', px, py - pR - (mode === 'boss' ? 28 : 18));
      } else if (mode === 'boss' && p.team === 0 && names[i]) {
        ctx.fillStyle = hexA(INK, 0.75);
        ctx.font = '700 12px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(names[i], px, py - pR - 28);
      }
    });

    ctx.restore();

    if (mode === 'boss' && M.boss && M.phase !== 'intro') {
      var bp = M.p[M.bossIdx];
      if (bp) {
        var bw = 440, bh = 22, bx0 = (W - bw) / 2, by0 = 26, frac = Math.max(0, bp.hearts / bp.maxHearts), bcx = W / 2;
        if (frac > mtBarLag) mtBarLag = frac; else mtBarLag += (frac - mtBarLag) * 0.05;
        var low = frac < 0.25, bpu = 0.5 + 0.5 * Math.sin(now / (low ? 160 : 600));
        // soft divine glow behind the whole bar
        var gl0 = ctx.createRadialGradient(bcx, by0 + bh / 2, 10, bcx, by0 + bh / 2, bw * 0.62);
        gl0.addColorStop(0, 'rgba(255,225,130,' + (0.28 + 0.12 * bpu).toFixed(3) + ')'); gl0.addColorStop(1, 'rgba(255,225,130,0)');
        ctx.fillStyle = gl0; ctx.fillRect(bx0 - 80, by0 - 40, bw + 160, bh + 80);
        // dark panel and double gold frame
        ctx.fillStyle = 'rgba(20,14,6,.88)'; ctx.fillRect(bx0 - 6, by0 - 6, bw + 12, bh + 12);
        ctx.strokeStyle = DV_GOLD; ctx.lineWidth = 2.2; ctx.strokeRect(bx0 - 5.5, by0 - 5.5, bw + 11, bh + 11);
        ctx.strokeStyle = DV_CREAM; ctx.lineWidth = 0.8; ctx.strokeRect(bx0 - 9.5, by0 - 9.5, bw + 19, bh + 19);
        // lagging chunk, then the radiant fill
        if (mtBarLag > frac) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(bx0 + bw * frac, by0, bw * (mtBarLag - frac), bh); }
        var bgd = ctx.createLinearGradient(0, by0, 0, by0 + bh);
        bgd.addColorStop(0, DV_WHITE); bgd.addColorStop(0.45, DV_GOLD); bgd.addColorStop(1, DV_GOLD_D);
        ctx.fillStyle = bgd; ctx.fillRect(bx0, by0, bw * frac, bh);
        // slow shimmer sweeping across the filled part
        if (frac > 0.02) {
          ctx.save(); ctx.beginPath(); ctx.rect(bx0, by0, bw * frac, bh); ctx.clip();
          var sh = ((now / 2600) % 1) * (bw + 120) - 60;
          var shg = ctx.createLinearGradient(bx0 + sh - 40, 0, bx0 + sh + 40, 0);
          shg.addColorStop(0, 'rgba(255,255,255,0)'); shg.addColorStop(0.5, 'rgba(255,255,255,.7)'); shg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = shg; ctx.fillRect(bx0, by0, bw, bh); ctx.restore();
        }
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(bx0, by0, bw * frac, 2);
        ctx.fillStyle = 'rgba(20,14,6,.45)';
        for (var tk = 1; tk < 10; tk++) ctx.fillRect(bx0 + bw * tk / 10 - 0.5, by0, 1, bh);
        if (low) { ctx.fillStyle = 'rgba(201,51,31,' + (0.12 + 0.18 * bpu).toFixed(3) + ')'; ctx.fillRect(bx0, by0, bw * frac, bh); }
        // winged ornaments and diamonds at both ends
        var sd;
        for (sd = -1; sd <= 1; sd += 2) {
          var ox = bcx + sd * (bw / 2 + 14), oy = by0 + bh / 2;
          ctx.fillStyle = DV_GOLD; ctx.beginPath(); ctx.moveTo(ox, oy - 9); ctx.lineTo(ox + 6, oy); ctx.lineTo(ox, oy + 9); ctx.lineTo(ox - 6, oy); ctx.closePath(); ctx.fill();
          ctx.fillStyle = DV_WHITE; ctx.beginPath(); ctx.arc(ox, oy, 2.2, 0, 6.283); ctx.fill();
          ctx.strokeStyle = DV_GOLD; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
          for (var wf = 0; wf < 3; wf++) {
            ctx.globalAlpha = 0.85 - wf * 0.2;
            ctx.beginPath(); ctx.moveTo(ox + sd * 8, oy - wf * 2.5); ctx.lineTo(ox + sd * (24 - wf * 3), oy - 7 - wf * 3.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ox + sd * 8, oy + wf * 2.5); ctx.lineTo(ox + sd * (24 - wf * 3), oy + 7 + wf * 3.5); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        // name above the bar, hearts inside it
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
        ctx.font = '700 17px "Barlow Condensed", sans-serif';
        ctx.fillStyle = DV_GOLD; ctx.fillText('M A S T E R T E T A N U S', bcx, by0 - 14);
        ctx.fillStyle = 'rgba(255,250,240,.9)'; ctx.fillRect(bcx - 62, by0 - 11, 124, 1);
        ctx.font = '700 14px "Barlow Condensed", sans-serif';
        ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(20,14,6,.9)'; ctx.strokeText(Math.max(0, bp.hearts) + ' / ' + bp.maxHearts, bcx, by0 + 16);
        ctx.fillStyle = DV_WHITE; ctx.fillText(Math.max(0, bp.hearts) + ' / ' + bp.maxHearts, bcx, by0 + 16);
        var cl2 = M.cloneIdx >= 0 ? M.p[M.cloneIdx] : null;
        if (cl2 && !cl2.dead) {
          ctx.textAlign = 'center'; ctx.fillStyle = DV_GOLD; ctx.font = '700 13px "Barlow Condensed", sans-serif';
          ctx.fillText('SPLIT  ' + Math.ceil(Math.max(0, cl2.life)) + 's', W / 2, by0 + bh + 22);
        }
      }
    }

    var selfP = M.p[me || 0];
    if (selfP && !selfP.dead && (!M.endless || me === 0)) {
      var bx = 20;
      for (var k = 0; k < 3; k++) {
        var full = k < selfP.ch, part = k === selfP.ch;
        ctx.save(); ctx.translate(bx + k * 22 + 8, H - 18); ctx.rotate(0.785);
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillStyle = INK;
        if (full) ctx.fillRect(-6, -6, 12, 12);
        else {
          ctx.globalAlpha = 0.4; ctx.strokeRect(-6, -6, 12, 12);
          if (part) { ctx.globalAlpha = 0.7; var h = 12 * (selfP.rc / S.CHARGE_T); ctx.fillRect(-6, 6 - h, 12, h); }
        }
        ctx.restore();
      }
    }

    if (isBossEncounter) {
      var bossV = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.6);
      bossV.addColorStop(0, 'rgba(8,3,2,0)'); bossV.addColorStop(1, 'rgba(8,3,2,0.55)');
      ctx.fillStyle = bossV; ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(vigC, 0, 0);
    ctx.globalAlpha = 0.6; ctx.drawImage(grainC, 0, 0); ctx.globalAlpha = 1;

    if (bossDialogueT > 0) {
      var bt = BOSS_INTRO_T - bossDialogueT;
      var bl1 = Math.max(0, Math.min(1, bt / 0.7)), bl2 = Math.max(0, Math.min(1, (bt - 1.3) / 0.7));
      ctx.save();
      ctx.fillStyle = 'rgba(8, 4, 3, 0.94)';
      ctx.fillRect(0, H / 2 - 46, W, 92);
      ctx.strokeStyle = '#5c0a06';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, H / 2 - 46, W, 92);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '400 28px "Dela Gothic One", Impact, sans-serif';
      ctx.globalAlpha = bl1; ctx.fillStyle = '#efe6d2';
      ctx.fillText('NOBODY IS COMING FOR YOU.', W / 2, H / 2 - 8);
      ctx.font = '700 17px "Barlow Condensed", sans-serif';
      ctx.globalAlpha = bl2; ctx.fillStyle = '#9a1b12';
      ctx.fillText('I WILL NOT STOP.', W / 2, H / 2 + 24);
      ctx.restore();
    } else if (msgT > 0) {
      var age = msgD - msgT, sc = 1 + Math.max(0, 0.18 - age) * 2.2;
      ctx.save(); ctx.translate(W / 2, H / 2 - 60); ctx.scale(sc, sc);
      ctx.globalAlpha = Math.min(1, msgT * 3);
      ctx.font = '44px "Dela Gothic One", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = PAPER; ctx.strokeText(msg, 0, 0);
      ctx.fillStyle = INK; ctx.fillText(msg, 0, 0);
      ctx.restore();
    }
    if (flash > 0 && !calm) { ctx.globalAlpha = Math.min(1, flash); ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (vig > 0 && !calm) {
      var vigG = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
      vigG.addColorStop(0, 'rgba(201,51,31,0)'); vigG.addColorStop(1, 'rgba(201,51,31,' + Math.min(0.8, vig) + ')');
      ctx.fillStyle = vigG; ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- MASTERTETANUS: intro dialogue, Challenge / Forfeit, the "banned" prank ----------
  var MT_LINES = [
    'You have beaten my greatest design.',
    'Congratulations..',
    'Why are you playing this game?',
    'This is such a pointless game.',
    "You know what? User, I'd love to challenge you."
  ];
  (function () {
    var st = document.createElement('style');
    st.textContent = '@keyframes mtfade{from{opacity:0}to{opacity:1}}' +
      '@keyframes bshake{0%,100%{transform:translate(0,0) rotate(-1deg)}25%{transform:translate(-6px,4px) rotate(1deg)}50%{transform:translate(5px,-5px) rotate(-2deg)}75%{transform:translate(-4px,-3px) rotate(1deg)}}' +
      '@keyframes bshake2{0%,100%{transform:translate(0,0) rotate(0) scale(1)}10%{transform:translate(-24px,14px) rotate(-4deg) scale(1.04)}20%{transform:translate(20px,-18px) rotate(3deg) scale(.97)}30%{transform:translate(-28px,-10px) rotate(5deg) scale(1.02)}40%{transform:translate(26px,16px) rotate(-3deg) scale(1.05)}50%{transform:translate(-14px,24px) rotate(-5deg) scale(.98)}60%{transform:translate(22px,-22px) rotate(4deg) scale(1.03)}70%{transform:translate(-26px,8px) rotate(-2deg) scale(1.04)}80%{transform:translate(16px,-14px) rotate(5deg) scale(.97)}90%{transform:translate(-20px,18px) rotate(-4deg) scale(1.02)}}' +
      '@keyframes bglitch{0%{text-shadow:6px 0 #ff0000,-6px 0 #00e5ff,0 0 30px rgba(224,48,28,.6)}50%{text-shadow:-8px 3px #ff0000,8px -3px #00e5ff,0 0 40px rgba(224,48,28,.8)}100%{text-shadow:4px -4px #ff0000,-4px 4px #00e5ff,0 0 30px rgba(224,48,28,.6)}}';
    document.head.appendChild(st);
  })();
  var mtOv = document.createElement('div'), mtLine = document.createElement('div'), mtSub = document.createElement('div'), mtBtns = document.createElement('div');
  mtOv.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:90;display:none;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:24px;text-align:center;background:rgba(6,4,3,.94);color:#efe6d2;font-family:"Barlow Condensed",sans-serif;user-select:none';
  mtLine.style.cssText = 'font-size:clamp(22px,4.2vw,40px);font-weight:600;letter-spacing:.02em;min-height:1.4em;max-width:900px;line-height:1.25;text-shadow:0 0 18px rgba(181,138,46,.35)';
  mtSub.style.cssText = 'font-size:14px;letter-spacing:.14em;color:#8b7a52;text-transform:uppercase;min-height:1.2em';
  mtBtns.style.cssText = 'display:none;gap:16px;flex-wrap:wrap;justify-content:center';
  function mtBtn(label, bg, fg, bd) {
    var b = document.createElement('button'); b.textContent = label;
    b.style.cssText = 'padding:14px 34px;font:700 20px "Barlow Condensed",sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;border-radius:2px;background:' + bg + ';color:' + fg + ';border:2px solid ' + bd;
    return b;
  }
  var mtForfeitBtn = mtBtn('Forfeit', 'transparent', '#9a917f', '#5a5246'), mtChallengeBtn = mtBtn('Challenge', '#7d150e', '#efe6d2', '#b58a2e');
  mtBtns.appendChild(mtForfeitBtn); mtBtns.appendChild(mtChallengeBtn);
  mtOv.appendChild(mtLine); mtOv.appendChild(mtBtns); mtOv.appendChild(mtSub);
  document.body.appendChild(mtOv);

  var mtState = null;
  function mtIntroStart(isHost) {
    mtHideIntro();
    mtState = { host: isHost, i: 0, c: 0, timer: 0 };
    mtOv.style.display = 'flex'; mtBtns.style.display = 'none';
    mtLine.textContent = ''; mtSub.textContent = 'Click to continue';
    mtType();
  }
  function mtType() {                      // typed out slowly, with a long pause on every full stop
    var st = mtState; if (!st) return;
    var line = MT_LINES[st.i];
    if (st.c < line.length) {
      var ch = line.charAt(st.c); st.c++; mtLine.textContent = line.slice(0, st.c);
      st.timer = setTimeout(mtType, ch === '.' ? 340 : (ch === ',' || ch === '?') ? 260 : 62);
    } else {
      st.timer = setTimeout(mtAdvance, st.i === MT_LINES.length - 1 ? 1200 : 1800);
    }
  }
  function mtAdvance() {
    var st = mtState; if (!st) return;
    clearTimeout(st.timer);
    st.i++;
    if (st.i >= MT_LINES.length) { mtButtons(); return; }
    st.c = 0; mtLine.textContent = ''; mtType();
  }
  function mtButtons() {
    var st = mtState; if (!st) return;
    mtSub.textContent = st.host ? '' : 'Waiting for the host to decide...';
    mtChallengeBtn.style.display = st.host ? '' : 'none';
    mtBtns.style.display = 'flex';
    if (!calm) mtBtns.style.animation = 'mtfade .9s ease both';
  }
  mtOv.addEventListener('click', function (e) {
    var st = mtState; if (!st || (e.target && e.target.tagName === 'BUTTON') || mtBtns.style.display === 'flex') return;
    clearTimeout(st.timer);
    var line = MT_LINES[st.i];
    if (st.c < line.length) { st.c = line.length; mtLine.textContent = line; st.timer = setTimeout(mtAdvance, 900); }
    else mtAdvance();
  });
  mtChallengeBtn.onclick = function () { mtHideIntro(); snd('gong'); if (sock) sock.emit('bossChallenge'); };
  mtForfeitBtn.onclick = function () { mtForfeitSelf = true; mtHideIntro(); if (sock) sock.emit('forfeit'); };
  function mtHideIntro() { if (mtState) clearTimeout(mtState.timer); mtState = null; mtOv.style.display = 'none'; }

  // Beating MASTERTETANUS cuts straight to black with a fake ban screen and a fake Windows-style crash box.
  // Nothing is banned and nothing crashes. After 8 seconds you land back in the menu and it just says "jk".
  var MT_BAN_MS = 8000, MT_CRASH_DELAY = 1100, mtBanSeen = false;
  var mtBan = document.createElement('div'), mtBanText = document.createElement('div'), mtCrash = document.createElement('div');
  mtBan.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:95;display:none;align-items:center;justify-content:center;background:#000;padding:20px;overflow:hidden;cursor:none';
  mtBanText.textContent = "YOU'RE BANNED!!!";
  mtBanText.style.cssText = 'font-family:"Dela Gothic One",Impact,sans-serif;font-size:clamp(40px,10vw,128px);color:#e0301c;text-align:center;letter-spacing:.02em;text-shadow:0 0 30px rgba(224,48,28,.55);line-height:1.05';
  mtCrash.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,92vw);background:#f0f0f0;border:1px solid #707070;box-shadow:0 10px 36px rgba(0,0,0,.7);font:12px "Segoe UI",Tahoma,Arial,sans-serif;color:#000;z-index:96;display:none;user-select:none;cursor:default';
  mtCrash.innerHTML =
    '<div style="height:31px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding-left:10px">' +
      '<span style="font-size:12px">Blade &amp; Blink</span>' +
      '<span data-x="1" style="width:46px;height:31px;line-height:31px;text-align:center;font-size:15px;cursor:default">&#10005;</span>' +
    '</div>' +
    '<div style="background:#fff;padding:22px 22px 26px;display:flex;gap:16px;align-items:flex-start">' +
      '<div style="flex:none;width:32px;height:32px;border-radius:50%;background:#d6202b;color:#fff;font:700 20px/32px Arial,sans-serif;text-align:center">&#10005;</div>' +
      '<div style="line-height:1.5"><div style="font-size:14px;margin-bottom:6px">Game crashed</div>' +
      '<div style="color:#444">Blade &amp; Blink has stopped working. The program will now close.</div>' +
      '<div style="color:#888;margin-top:8px;font-size:11px">Exception code: 0xC0000005 (ACCESS_VIOLATION)</div></div>' +
    '</div>' +
    '<div style="background:#f0f0f0;padding:12px 14px;text-align:right;border-top:1px solid #dfdfdf">' +
      '<span data-ok="1" style="display:inline-block;min-width:73px;height:21px;line-height:21px;text-align:center;background:#e1e1e1;border:1px solid #adadad;cursor:default">OK</span>' +
    '</div>';
  mtBan.appendChild(mtBanText); mtBan.appendChild(mtCrash); document.body.appendChild(mtBan);
  (function () {
    var x = mtCrash.querySelector('[data-x]'), ok = mtCrash.querySelector('[data-ok]');
    x.onmouseenter = function () { x.style.background = '#e81123'; x.style.color = '#fff'; };
    x.onmouseleave = function () { x.style.background = ''; x.style.color = ''; };
    ok.onmouseenter = function () { ok.style.background = '#e5f1fb'; ok.style.borderColor = '#0078d7'; };
    ok.onmouseleave = function () { ok.style.background = '#e1e1e1'; ok.style.borderColor = '#adadad'; };
    x.onclick = ok.onclick = function () { mtCrash.style.display = 'none'; };
  })();
  function showBanned() {
    if (mtBanOn || mtBanSeen) return;
    mtBanOn = true; mtBanSeen = true;
    mode = null;                                   // the fight stops dead, like a real crash
    mtHideIntro();
    mtBan.style.display = 'flex'; mtCrash.style.display = 'none';
    mtBanText.style.animation = calm ? 'none' : 'bshake2 .22s linear infinite, bglitch .12s steps(2) infinite';
    setTimeout(function () { if (mtBanOn) mtCrash.style.display = 'block'; }, MT_CRASH_DELAY);
    setTimeout(function () {
      mtBan.style.display = 'none'; mtCrash.style.display = 'none'; mtBanOn = false; mode = null; mtHideIntro(); showLobby();
      var jk = document.createElement('div');       // plain unstyled text: browser default font, no box
      jk.textContent = 'jk';
      jk.style.cssText = 'all:initial;position:fixed;left:50%;top:45%;transform:translate(-50%,-50%);z-index:96;font-size:20px;color:#000';
      document.body.appendChild(jk);
      setTimeout(function () { if (jk.parentNode) jk.parentNode.removeChild(jk); }, 3500);
    }, MT_BAN_MS);
  }
  function bossEnded(d) {
    mtHideIntro();
    if (d.forfeit) {
      mode = null; M = null; showLobby();
      toast(mtForfeitSelf ? 'You forfeited the fight.' : 'The host forfeited the fight.');
      mtForfeitSelf = false;
      return;
    }
    mode = null;
    if (d.playersWon) { showBanned(); return; }
    result('Defeated', 'The party was wiped out.', 'MASTERTETANUS stands.', '', 'lose');
  }

  // The server remembers who has beaten Tetanus; the client only reports the start and the win.
  function tetanusBegin() {
    tetToken = '';
    if (sock && prof && !prof.beatTetanus) sock.emit('tetanusStart', function (r) { tetToken = (r && r.token) || ''; });
  }
  function tetanusWon() {
    if (!sock || !prof || !tetToken) return;
    var t = tetToken; tetToken = '';
    sock.emit('tetanusWin', { token: t }, function (r) {
      if (r && r.ok) { setProfile(r.profile); toast('MASTERTETANUS co-op boss unlocked in Private Party!'); }
    });
  }
  function syncPartyModes() {
    var sel = $('partymode'); if (!sel || !sel.options) return;
    var opt = null, i;
    for (i = 0; i < sel.options.length; i++) if (sel.options[i].value === 'boss') opt = sel.options[i];
    if (!opt) { opt = document.createElement('option'); opt.value = 'boss'; sel.appendChild(opt); }
    var ok = !!(prof && prof.beatTetanus);
    opt.disabled = !ok;
    opt.textContent = ok ? 'MASTERTETANUS Co-op Boss (2-4 players)' : 'MASTERTETANUS (beat the secret boss Tetanus to unlock)';
  }
  syncPartyModes();

  function endResult(title) {
    var best = 0;
    try { best = +localStorage.getItem('bb_best') || 0; } catch (e) {}
    if (M.kills > best) { best = M.kills; try { localStorage.setItem('bb_best', best); } catch (e) {} }
    result(title || 'Overrun!', 'Kills: ' + M.kills + '   Survived: ' + Math.floor(M.time) + 's', 'Best: ' + best + ' kills', '', 'lose');
  }
  function finishLocal() {
    var w = M.winner, k = mode;
    if (k === 'bot' && w === 0) {
      var defeatedTier = M.p[1] ? M.p[1].tier : selectedTier;
      if (defeatedTier === 'apex') {
        apexConquered = true;
      } else if (defeatedTier === 'novice' && apexConquered) {
        triggerTetanusAmbush();
        return;
      }
    }
    mode = null;
    if (k === 'endless') {
      endResult();
    } else if (k === 'bot') {
      var won = w === 0;
      var sub = isBossEncounter
        ? (won ? 'You conquered the secret boss Tetanus!' : 'Crushed by Tetanus.')
        : (won ? 'All ' + M.p[1].maxLives + ' CPU lives depleted.' : 'Remaining CPU lives: ' + M.p[1].lives + '/' + M.p[1].maxLives);
      if (won && isBossEncounter) tetanusWon();
      isBossEncounter = false;
      result(won ? 'Victory!' : 'Defeated', sub, '', '', won ? 'win' : 'lose');
    } else {
      result(names[w] + ' wins!', names[0] + ' ' + M.score[0] + ' - ' + M.score[1] + ' ' + names[1], '', '', 'win');
    }
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
    if (bossDialogueT > 0) {
      bossDialogueT -= dt;
      shake = Math.max(0, shake - 10 * dt);
      draw(now);
      return;
    }
    if (M && (mode === 'bot' || mode === 'local' || mode === 'endless') && M.phase !== 'over') {
      if (freeze > 0) freeze -= dt;
      else {
        var inp = mode === 'endless' ? [localInp(0)] : [localInp(0), mode === 'bot' ? {} : localInp(1)];
        onEv(S.tick(M, inp, dt));
        if (M.phase === 'over') finishLocal();
      }
    }
    watch(); smooth();
    if (M && (mode === 'endless' || mode === 'ffa' || mode === 'bot' || mode === 'boss')) hud();
    if (touch) padState();
    fxStep(M && M.phase === 'roundend' ? dt * 0.4 : dt);
    emberStep(dt);
    draw(now);
  }
  if (touch) {
    $('legend').hidden = true;
    $('hint').textContent = 'Drag left stick to move and aim. Tap Swing, Parry and Blink.';
  }
  if (missing.length) {
    console.error('Blade & Blink missing elements: ' + missing.join(', '));
  }
  requestAnimationFrame(loop);
})();