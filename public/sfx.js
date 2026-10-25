// Synthesized sound effects (Web Audio), so there are no audio files to host.
(function (root) {
  var ctx = null, master = null, noiseBuf = null, on = true, last = {};
  try { on = localStorage.getItem('bb_mute') !== '1'; } catch (e) {}

  function init() {
    if (ctx) return ctx;
    var AC = (typeof AudioContext !== 'undefined' && AudioContext) || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      var n = ctx.sampleRate, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;
    } catch (e) { ctx = null; }
    return ctx;
  }
  // browsers only allow audio after a click or key press, so call this from one
  function unlock() { var c = init(); if (c && c.state === 'suspended') c.resume(); }

  function bus(pan) {
    var g = ctx.createGain();
    if (ctx.createStereoPanner) {
      var p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      g.connect(p); p.connect(master);
    } else g.connect(master);
    return g;
  }
  function env(g, t, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(type, f0, f1, dur, peak, pan, delay) {
    var t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = bus(pan);
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, peak, dur); o.connect(g); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(type, f0, f1, q, dur, peak, pan, delay) {
    var t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = bus(pan);
    s.buffer = noiseBuf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, peak, dur); s.connect(f); f.connect(g); s.start(t); s.stop(t + dur + 0.05);
  }

  var SND = {
    swing: function (p) { noise('bandpass', 500, 2600, 1.1, 0.17, 0.3, p); },
    raise: function (p) { tone('triangle', 740, 520, 0.09, 0.07, p); },
    shine: function (p) { tone('sine', 1400, 3000, 0.1, 0.1, p); tone('triangle', 2100, 4200, 0.12, 0.05, p, 0.01); },
    blink: function (p) { noise('bandpass', 400, 5200, 0.9, 0.15, 0.28, p); tone('sine', 280, 1300, 0.12, 0.09, p); },
    parry: function (p) {
      tone('square', 1500, 1420, 0.32, 0.1, p); tone('sine', 2310, 2240, 0.42, 0.1, p);
      tone('triangle', 3320, 3180, 0.28, 0.05, p); noise('highpass', 4500, 3000, 0.7, 0.07, 0.22, p);
    },
    kill: function (p) { tone('sine', 170, 38, 0.38, 0.5, p); noise('lowpass', 2200, 260, 0.7, 0.24, 0.4, p); tone('square', 95, 48, 0.2, 0.12, p); },
    spawn: function (p) { tone('sine', 200, 420, 0.2, 0.1, p); },
    tick: function () { tone('square', 640, 640, 0.06, 0.06, 0); },
    gong: function () { tone('sine', 196, 188, 1.0, 0.22, 0); tone('triangle', 392, 380, 0.7, 0.08, 0); noise('bandpass', 900, 500, 1.5, 0.3, 0.07, 0); },
    win: function () { [392, 494, 587, 784].forEach(function (f, i) { tone('triangle', f, f, 0.3, 0.12, 0, i * 0.1); }); },
    lose: function () { [330, 262, 196].forEach(function (f, i) { tone('sawtooth', f, f * 0.97, 0.38, 0.06, 0, i * 0.17); }); },
    click: function () { tone('square', 520, 520, 0.04, 0.05, 0); }
  };

  // x = where it happened on the 640px-wide arena, used to pan left/right
  function play(name, x) {
    if (!on || !ctx || ctx.state !== 'running' || !SND[name]) return;
    var now = Date.now();
    if (last[name] && now - last[name] < 35) return;
    last[name] = now;
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
