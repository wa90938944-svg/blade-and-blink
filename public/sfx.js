// Synthesized sound effects (Web Audio), so there are no audio files to host.
// Built from layered noise, inharmonic metal partials, drum bodies and a small room reverb.
// Every hit gets a little random pitch/timing variation so repeats never sound copy-pasted.
(function (root) {
  var ctx = null, master = null, verbIn = null, noiseBuf = null, satCurve = null;
  var on = true, last = {}, V = 1;
  try { on = localStorage.getItem('bb_mute') !== '1'; } catch (e) {}

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Reverb tail made from decaying noise that gets darker over time, like a real room.
  function makeImpulse(sec, decay) {
    var n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), lp = 0;
      for (var i = 0; i < n; i++) {
        var t = i / n, a = 0.9 - 0.85 * t;
        lp += ((Math.random() * 2 - 1) - lp) * a;
        d[i] = lp * 2.2 * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  function init() {
    if (ctx) return ctx;
    var AC = (typeof AudioContext !== 'undefined' && AudioContext) || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.2;
      var soften = ctx.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 14000;
      master = ctx.createGain(); master.gain.value = 0.7;
      master.connect(soften); soften.connect(comp); comp.connect(ctx.destination);

      var conv = ctx.createConvolver(); conv.buffer = makeImpulse(1.7, 3);
      var wet = ctx.createGain(); wet.gain.value = 0.35;
      verbIn = ctx.createGain();
      verbIn.connect(conv); conv.connect(wet); wet.connect(master);

      var n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;

      satCurve = new Float32Array(1024);
      for (var j = 0; j < 1024; j++) { var x = j / 512 - 1; satCurve[j] = Math.tanh(x * 2.4); }
    } catch (e) { ctx = null; }
    return ctx;
  }
  // browsers only allow audio after a click or key press, so call this from one
  function unlock() { var c = init(); if (c && c.state === 'suspended') c.resume(); }

  function bus(pan, send) {
    var g = ctx.createGain(), out = g;
    if (ctx.createStereoPanner) {
      var p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      g.connect(p); out = p;
    }
    out.connect(master);
    if (send) { var s = ctx.createGain(); s.gain.value = send; out.connect(s); s.connect(verbIn); }
    return g;
  }
  function env(g, t, peak, dur, att) {
    att = att || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, att + 0.01));
  }
  // o = { att: attack seconds, send: reverb amount, sat: true for a heavier, driven body }
  function tone(type, f0, f1, dur, peak, pan, delay, o) {
    o = o || {};
    var t = ctx.currentTime + (delay || 0), osc = ctx.createOscillator(), g = bus(pan, o.send);
    f0 *= V; f1 = f1 ? f1 * V : 0;
    osc.type = type; osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, peak, dur, o.att);
    if (o.sat) { var sh = ctx.createWaveShaper(); sh.curve = satCurve; osc.connect(sh); sh.connect(g); }
    else osc.connect(g);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(type, f0, f1, q, dur, peak, pan, delay, o) {
    o = o || {};
    var t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = bus(pan, o.send);
    s.buffer = noiseBuf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0 * V, t); f.frequency.exponentialRampToValueAtTime(f1 * V, t + dur);
    env(g, t, peak, dur, o.att);
    s.connect(f); f.connect(g); s.start(t, rnd(0, 1.2)); s.stop(t + dur + 0.05);
  }
  // Metal and bells ring at odd, non-whole-number multiples, each fading at its own speed.
  function partials(base, ratios, peaks, decays, pan, delay, send) {
    var t = ctx.currentTime + (delay || 0), g = bus(pan, send);
    for (var i = 0; i < ratios.length; i++) {
      var f = base * V * ratios[i] * rnd(0.997, 1.003);
      if (f > 17000) continue;
      var o = ctx.createOscillator(), pg = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(peaks[i], t + 0.002);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + decays[i]);
      o.connect(pg); pg.connect(g); o.start(t); o.stop(t + decays[i] + 0.05);
    }
  }
  function thump(f0, f1, dur, peak, pan, delay, send) {
    tone('sine', f0, f1, dur, peak, pan, delay, { att: 0.003, send: send, sat: true });
  }
  function crack(peak, pan, delay, f) {
    f = f || 3500;
    noise('highpass', f, f * 0.6, 0.7, 0.04, peak, pan, delay);
  }
  function drum(delay, peak) {
    thump(150, 52, 0.34, peak || 0.45, 0, delay || 0, 0.25);
    noise('lowpass', 500, 120, 0.7, 0.16, 0.2, 0, delay || 0);
  }

  var SND = {
    swing: function (p) {
      noise('bandpass', rnd(500, 700), rnd(2000, 2800), 1.3, 0.2, 0.2, p, 0, { att: 0.07 });
      noise('highpass', 1800, 4200, 0.5, 0.16, 0.06, p, 0.01, { att: 0.06 });
    },
    raise: function (p) {
      noise('bandpass', 2200, 3400, 7, 0.13, 0.07, p, 0, { att: 0.02 });
      partials(2700, [1, 2.41], [0.025, 0.012], [0.12, 0.07], p, 0.02, 0.2);
    },
    shine: function (p) {
      partials(3100, [1, 2.76, 5.4], [0.05, 0.03, 0.015], [0.3, 0.18, 0.1], p, 0, 0.45);
      noise('highpass', 6000, 8000, 0.7, 0.05, 0.05, p);
    },
    blink: function (p) {
      noise('bandpass', 350, 5600, 0.9, 0.17, 0.26, p, 0, { att: 0.03 });
      thump(95, 52, 0.16, 0.22, p, 0.02);
      noise('highpass', 5000, 9000, 0.6, 0.1, 0.06, p, 0.04);
    },
    parry: function (p) {
      partials(rnd(1150, 1350), [1, 2.32, 3.87, 5.43, 7.62], [0.11, 0.09, 0.07, 0.045, 0.03], [0.55, 0.4, 0.28, 0.2, 0.12], p, 0, 0.35);
      crack(0.38, p, 0, 3800);
      thump(240, 110, 0.09, 0.16, p, 0);
      noise('bandpass', 4200, 2800, 3, 0.12, 0.08, p, 0.005);
    },
    kill: function (p) {
      crack(0.3, p, 0, 3000);
      noise('bandpass', 3200, 500, 1, 0.13, 0.22, p, 0, { att: 0.005 });
      thump(rnd(135, 165), 42, 0.38, 0.55, p, 0.005, 0.15);
      noise('lowpass', 1000, 150, 0.7, 0.32, 0.32, p, 0.01);
    },
    hurt: function (p) {
      crack(0.22, p, 0, 2600);
      thump(rnd(170, 200), 60, 0.22, 0.38, p, 0.003, 0.1);
      noise('lowpass', 900, 200, 0.7, 0.2, 0.2, p, 0.01);
    },
    lifeloss: function (p) {
      SND.kill(p);
      partials(86, [1, 1.52, 2.1], [0.16, 0.1, 0.06], [1.1, 0.8, 0.5], p, 0.02, 0.4);
    },
    godblock: function (p) {
      thump(210, 120, 0.1, 0.22, p, 0);
      partials(1700, [1, 2.76], [0.05, 0.03], [0.14, 0.09], p, 0, 0.2);
      crack(0.18, p, 0, 2500);
    },
    intercept: function (p) {
      crack(0.4, p, 0, 4200);
      partials(2000, [1, 2.9], [0.08, 0.04], [0.2, 0.12], p, 0, 0.25);
      thump(190, 80, 0.12, 0.26, p, 0);
    },
    shield: function (p) {
      for (var i = 0; i < 7; i++) {
        var d = rnd(0, 0.09);
        crack(rnd(0.12, 0.22), p, d, rnd(4500, 8000));
        partials(rnd(2800, 5200), [1, 1.7], [0.04, 0.02], [0.12, 0.07], p, d, 0.3);
      }
      thump(180, 90, 0.1, 0.18, p, 0);
    },
    whiff: function (p) {
      noise('bandpass', 1900, 300, 1.2, 0.26, 0.2, p, 0, { att: 0.04 });
    },
    spawn: function (p) {
      noise('bandpass', 400, 1300, 2, 0.24, 0.12, p, 0, { att: 0.09, send: 0.3 });
      thump(115, 70, 0.2, 0.14, p, 0.05);
    },
    minion: function (p) {
      thump(120, 60, 0.22, 0.28, p, 0, 0.2);
      noise('bandpass', 500, 900, 2, 0.28, 0.08, p, 0, { att: 0.12 });
    },
    shrine: function (p) {
      partials(523, [1, 2.76, 5.4], [0.1, 0.05, 0.03], [1.6, 1.0, 0.65], p, 0, 0.6);
      noise('bandpass', 300, 1400, 1.5, 0.5, 0.06, p, 0, { att: 0.2, send: 0.5 });
    },
    extract: function () {
      noise('bandpass', 500, 3200, 1.5, 0.5, 0.09, 0, 0, { att: 0.25, send: 0.4 });
      partials(660, [1, 2.0, 2.76, 4.07], [0.09, 0.05, 0.04, 0.02], [1.8, 1.2, 0.9, 0.6], 0, 0.3, 0.6);
      partials(990, [1, 2.76], [0.05, 0.03], [1.5, 0.9], 0, 0.42, 0.6);
    },
    // wooden clapper for the round countdown
    tick: function () {
      thump(340, 230, 0.07, 0.22, 0, 0);
      noise('bandpass', 1900, 1500, 4, 0.04, 0.16, 0, 0);
    },
    gong: function () {
      crack(0.1, 0, 0, 1800);
      partials(rnd(108, 116), [1, 1.5, 2.17, 2.9, 3.62, 4.7], [0.2, 0.14, 0.11, 0.08, 0.06, 0.04], [2.4, 2.0, 1.6, 1.3, 1.0, 0.8], 0, 0, 0.55);
      noise('lowpass', 700, 300, 1.2, 0.6, 0.09, 0, 0.02, { att: 0.12, send: 0.4 });
    },
    win: function () {
      drum(0); drum(0.2);
      partials(880, [1, 2.76, 5.4], [0.09, 0.05, 0.03], [1.6, 1.0, 0.7], 0, 0.42, 0.55);
      partials(1318, [1, 2.76], [0.05, 0.03], [1.3, 0.8], 0, 0.5, 0.55);
    },
    lose: function () {
      drum(0, 0.5);
      thump(110, 38, 0.5, 0.4, 0, 0.35, 0.3);
      partials(72, [1, 1.5, 2.2], [0.14, 0.09, 0.05], [1.4, 1.0, 0.7], 0, 0.05, 0.5);
    },
    click: function () {
      thump(520, 400, 0.035, 0.11, 0, 0);
      noise('bandpass', 2600, 2200, 3, 0.02, 0.07, 0, 0);
    },
    hover: function () { noise('bandpass', 3600, 3000, 3, 0.025, 0.035, 0, 0); }
  };

  // x = where it happened on the 640px-wide arena, used to pan left/right
  function play(name, x) {
    if (!on || !ctx || ctx.state !== 'running' || !SND[name]) return;
    var now = Date.now(), gap = name === 'hover' ? 90 : 35;
    if (last[name] && now - last[name] < gap) return;
    last[name] = now;
    V = rnd(0.95, 1.05);
    try { SND[name](x === undefined ? 0 : (x / 640 - 0.5) * 1.4); } catch (e) {}
  }
  function toggle() {
    on = !on;
    try { localStorage.setItem('bb_mute', on ? '0' : '1'); } catch (e) {}
    if (on) { unlock(); play('click'); }
    return on;
  }

  var api = { unlock: unlock, play: play, toggle: toggle, isOn: function () { return on; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sfx = api;
})(typeof self !== 'undefined' ? self : this);
