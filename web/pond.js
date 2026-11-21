/* pond.js: under the water of a pond, at the bottom of medic's window.
 *
 *   always: the waterline with lily pads floating on it, pond weed swaying,
 *   a sandy bottom with pebbles and a sunken branch, little fish, a snail,
 *   and Lotl the axolotl walking along the bottom, stopping to look around
 *   and now and then swimming up for a gulp of air.
 *   day (light mode): sunbeams slanting down through the water.
 *   night (dark mode): glowing specks drifting, and moonlight on the surface.
 * The page's own white or black shows through: the water is only suggested.
 *
 *   Pond.start(canvas, { night: () => bool, share: 0.42 })
 */
(function (root) {
  'use strict';
  var PS = root.PixelScene;

  var DAY = {
    line: '#8fcfe0', ripple: '#bfe6ef', pad: ['#5fa56a', '#4b8f58', '#79bd76'], flower: ['#f7b6c8', '#ffffff', '#f2d16b'],
    weed: ['#4f9a63', '#6bb36f', '#3f8556', '#86c47a'], sand: ['#eadfc5', '#e0d2b2', '#d4c39d'], pebble: ['#b9ae99', '#a39883', '#c8beab', '#8f9aa0'],
    wood: ['#8a6a4a', '#6f5238'], bubble: '#9fd3e0', fish: [['#f28c38', '#d9702a'], ['#4a90d9', '#3474b8'], ['#f2c14e', '#d9a530']], snail: ['#c98f5a', '#a8713f', '#d9c4a0'],
    beam: 'rgba(143, 207, 224, 0.10)', glow: null,
  };
  var NIGHT = {
    line: '#2d6f80', ripple: '#3f8da0', pad: ['#1f4a2e', '#183b25', '#2a5c39'], flower: ['#a86a80', '#c9c9d6', '#a89a5a'],
    weed: ['#1d4a34', '#245a3f', '#173d2b', '#2c6a4a'], sand: ['#26231f', '#2d2a25', '#1f1c18'], pebble: ['#3a3833', '#2f2d29', '#45423c', '#34393c'],
    wood: ['#3a2d22', '#2c2219'], bubble: '#4fa6bd', fish: [['#a3602a', '#8a4f22'], ['#3a6aa0', '#2c5585'], ['#a8893a', '#8f742e']], snail: ['#7a5a3a', '#5f452c', '#8f7f66'],
    beam: null, glow: ['#7fe8ff', '#b6ffde', '#c9a8ff'], moon: '#d8e6ff',
  };
  var LOTL = { P: '#f6a6b8', p: '#ffd3dd', Q: '#e5859c', R: '#d84a7a', r: '#f27aa6', E: '#1d1416', M: '#b8506c', F: '#fbc4d1', f: '#e98aa5', L: '#e5859c' };
  var LOTL_NIGHT = { P: '#d8869a', p: '#f0b8c6', Q: '#c06a80', R: '#c23e6c', r: '#e0699a', E: '#0d0a0b', M: '#9a4258', F: '#e8a8b8', f: '#c87088', L: '#c06a80' };
  // Lotl at pond size: two walking frames, and swimming
  var WALK = [['.r.r......', '..RRPPP...', 'rRRQPPEP..', '.f.QPPPPMP', 'fFPPPPpppQ', '.fQQPPPPQ.', '..L...L...'],
    ['.r.r......', '..RRPPP...', 'rRRQPPEP..', '.f.QPPPPMP', 'fFPPPPpppQ', '.fQQPPPPQ.', '...L...L..']];
  var SWIM = [['..r.r.....', '...RRPPP..', '.rRRQPPEP.', 'ffFPPPPPMP', '.fFQPPpppQ', '..f.LQQL..', '..........'],
    ['..r.r.....', '...RRPPP..', '.rRRQPPEP.', '.fFPPPPPMP', 'ffFQPPpppQ', '....LQQL..', '..........']];
  var FISH = ['.AA.', 'AABA', '.AA.'];

  function start(cv, opts) {
    opts = opts || {};
    var share = opts.share || 0.42;
    var A = {};

    function build(o) {
      var W = o.W, H = o.H, rnd = o.rnd, P = o.night ? NIGHT : DAY;
      var top = Math.round(H * (1 - share)), floor = H - Math.max(8, Math.round((H - top) * 0.16));
      // the bottom: sand and pebbles, drawn once
      var back = PS.canvas(W, H), g = back.getContext('2d');
      for (var x = 0; x < W; x++) {
        var y0 = floor + Math.round(Math.sin(x / 23) * 1.5 + Math.sin(x / 7) * 0.6);
        for (var y = y0; y < H; y++) { g.fillStyle = P.sand[(x * 7 + y * 13) % 11 < 2 ? 1 : (x + y) % 17 === 0 ? 2 : 0]; g.fillRect(x, y, 1, 1); }
      }
      for (var i = 0; i < W / 5; i++) {
        var px = Math.floor(rnd() * W), py = floor + 1 + Math.floor(rnd() * (H - floor - 2)), pw = 1 + Math.floor(rnd() * 3);
        g.fillStyle = P.pebble[Math.floor(rnd() * 4)]; g.fillRect(px, py, pw, pw > 2 ? 2 : 1);
      }
      // a sunken branch
      var bx = Math.floor(W * (0.15 + rnd() * 0.25)), bl = 30 + Math.floor(rnd() * 20);
      for (var k = 0; k < bl; k++) { g.fillStyle = P.wood[k % 5 === 0 ? 1 : 0]; g.fillRect(bx + k, floor - 2 - Math.round(k * 0.08), 1, 3); }
      g.fillStyle = P.wood[1]; g.fillRect(bx + 10, floor - 6, 1, 4); g.fillRect(bx + 11, floor - 7, 3, 1);
      // pond weed: strands that sway
      var weeds = [];
      for (var w = 0; w < W / 9; w++) {
        var wx = Math.floor(rnd() * W), h = Math.round((floor - top) * (0.25 + rnd() * 0.55));
        weeds.push({ x: wx, h: h, c: P.weed[Math.floor(rnd() * 4)], ph: rnd() * 6, leafy: rnd() < 0.4 });
      }
      // lily pads on the waterline
      var pads = [];
      for (var p = 0; p < W / 40; p++) pads.push({ x: Math.floor(rnd() * W), w: 6 + Math.floor(rnd() * 6), c: P.pad[Math.floor(rnd() * 3)], flower: rnd() < 0.3 ? P.flower[Math.floor(rnd() * 3)] : null, ph: rnd() * 6 });
      var fish = [];
      for (var f = 0; f < Math.max(2, W / 120); f++) fish.push({ x: rnd() * W, y: top + 8 + rnd() * (floor - top - 20), v: (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 6), c: P.fish[Math.floor(rnd() * 3)], ph: rnd() * 6, turn: 4 + rnd() * 10 });
      var specks = [];
      if (o.night) for (var s = 0; s < W / 6; s++) specks.push({ x: rnd() * W, y: top + rnd() * (floor - top), c: P.glow[Math.floor(rnd() * 3)], ph: rnd() * 6, v: 0.5 + rnd() });
      A = { lotl: null, bubbles: [], snail: { x: rnd() * W, dir: rnd() < 0.5 ? -1 : 1 } };
      return { P: P, top: top, floor: floor, back: back, weeds: weeds, pads: pads, fish: fish, specks: specks, rnd: rnd };
    }

    function draw(g, S, t, dt) {
      var P = S.P, W = S.W, H = S.H, top = S.top, floor = S.floor;
      // light through the water
      if (P.beam) {
        g.fillStyle = P.beam;
        for (var b = 0; b < 5; b++) {
          var bx = ((b * 0.23 + 0.08) * W + Math.sin(t * 0.15 + b) * 6) | 0;
          for (var y = top + 2; y < floor; y++) g.fillRect(bx + (y - top) * 0.45, y, 6 + b % 3, 1);
        }
      }
      g.drawImage(S.back, 0, 0);
      // the waterline, gently moving
      for (var x = 0; x < W; x++) {
        var wy = top + Math.round(Math.sin(x / 9 + t * 1.2) * 0.6 + Math.sin(x / 31 - t * 0.7) * 0.5);
        g.fillStyle = P.line; g.fillRect(x, wy, 1, 1);
        if ((x + Math.floor(t * 3)) % 13 === 0) { g.fillStyle = P.ripple; g.fillRect(x, wy + 2, 3, 1); }
      }
      if (S.night) { for (var m = 0; m < 14; m++) { g.fillStyle = P.moon; g.globalAlpha = 0.5 - m * 0.03; g.fillRect(W * 0.78 + Math.sin(t + m) * 3 - m, top + 1 + m * 0.4, 6 - m * 0.3, 1); } g.globalAlpha = 1; }
      // lily pads
      S.pads.forEach(function (p) {
        var px = p.x + Math.sin(t * 0.3 + p.ph) * 2;
        g.fillStyle = p.c; g.fillRect(px, top - 1, p.w, 2); g.fillRect(px + 1, top - 2, p.w - 2, 1);
        g.fillStyle = P.line; g.fillRect(px + p.w / 2, top - 2, 1, 1);
        if (p.flower) { g.fillStyle = p.flower; g.fillRect(px + 2, top - 4, 3, 2); g.fillRect(px + 3, top - 5, 1, 1); }
        g.fillStyle = p.c; g.fillRect(px + p.w / 2, top + 1, 1, Math.round((floor - top) * 0.3));
      });
      // weed swaying
      S.weeds.forEach(function (w) {
        for (var k = 0; k < w.h; k++) {
          var sway = Math.sin(t * 0.9 + w.ph + k * 0.12) * (k / w.h) * 3;
          g.fillStyle = w.c; g.fillRect(w.x + sway, floor - k, 1, 1);
          if (w.leafy && k % 5 === 3) g.fillRect(w.x + sway + (k % 10 === 3 ? 1 : -1), floor - k, 1, 1);
        }
      });
      // glowing specks at night
      S.specks.forEach(function (s) {
        s.y -= dt * s.v; if (s.y < top + 2) s.y = floor;
        g.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.3 + s.ph));
        g.fillStyle = s.c; g.fillRect(s.x + Math.sin(t + s.ph) * 2, s.y, 1, 1);
      });
      g.globalAlpha = 1;
      // fish
      S.fish.forEach(function (f) {
        f.turn -= dt;
        if (f.turn < 0) { f.v = -f.v; f.turn = 5 + S.rnd() * 12; }
        f.x += f.v * dt; f.y += Math.sin(t * 2 + f.ph) * 0.04;
        if (f.x < -6) f.x = W + 4; if (f.x > W + 6) f.x = -4;
        var tail = Math.floor(t * 6 + f.ph) % 2;
        PS.sprite(g, FISH, f.x, f.y, { A: f.c[0], B: f.c[1] }, f.v < 0);
        g.fillStyle = f.c[1]; g.fillRect(f.v < 0 ? f.x + 4 : f.x - 1, f.y + tail, 1, 2 - tail);
      });
      // a snail, very slowly
      var sn = A.snail;
      sn.x += sn.dir * dt * 0.6; if (sn.x < 2 || sn.x > W - 6) sn.dir = -sn.dir;
      g.fillStyle = P.snail[0]; g.fillRect(sn.x + 1, floor - 3, 3, 2); g.fillStyle = P.snail[1]; g.fillRect(sn.x + 2, floor - 3, 1, 1);
      g.fillStyle = P.snail[2]; g.fillRect(sn.dir > 0 ? sn.x + 4 : sn.x, floor - 1, 2, 1); g.fillRect(sn.x + 1, floor - 1, 3, 1);
      lotl(g, S, t, dt);
      // bubbles
      A.bubbles = A.bubbles.filter(function (b) {
        b.y -= dt * (6 + b.r * 2); b.x += Math.sin(t * 3 + b.ph) * 0.05;
        g.fillStyle = P.bubble;
        if (b.r > 1) { g.fillRect(b.x, b.y - 1, 1, 1); g.fillRect(b.x - 1, b.y, 1, 1); g.fillRect(b.x + 1, b.y, 1, 1); g.fillRect(b.x, b.y + 1, 1, 1); } else g.fillRect(b.x, b.y, 1, 1);
        return b.y > top + 1;
      });
      S.weeds.forEach(function (w) { if (S.rnd() < dt * 0.02) A.bubbles.push({ x: w.x, y: floor - w.h, r: 1, ph: S.rnd() * 6 }); });
    }

    // Lotl: walks along the bottom, stops to look, swims up for air now and then
    function lotl(g, S, t, dt) {
      var ink = S.night ? LOTL_NIGHT : LOTL;
      if (!A.lotl) A.lotl = { x: S.W * 0.62, y: S.floor - 7, dir: -1, mode: 'walk', wait: 3, step: 0, frame: 0 };
      var a = A.lotl;
      a.wait -= dt;
      if (a.mode === 'walk') {
        a.step += dt;
        if (a.step > 0.28) { a.step = 0; a.x += a.dir; a.frame ^= 1; }
        if (a.x < 4 || a.x > S.W - 14) a.dir = -a.dir;
        if (a.wait < 0) { var r = S.rnd(); if (r < 0.45) { a.mode = 'rest'; a.wait = 2 + S.rnd() * 3; } else if (r < 0.65) { a.mode = 'up'; } else { a.dir = S.rnd() < 0.5 ? -1 : 1; a.wait = 3 + S.rnd() * 4; } }
      } else if (a.mode === 'rest') {
        if (S.rnd() < dt * 0.6) A.bubbles.push({ x: a.x + (a.dir > 0 ? 9 : 0), y: a.y + 2, r: S.rnd() < 0.5 ? 2 : 1, ph: S.rnd() * 6 });
        if (a.wait < 0) { a.mode = 'walk'; a.wait = 3 + S.rnd() * 5; }
      } else if (a.mode === 'up') {
        a.y -= dt * 9; a.x += a.dir * dt * 3;
        if (a.y <= S.top + 2) { a.mode = 'down'; A.bubbles.push({ x: a.x + 5, y: a.y + 3, r: 2, ph: 1 }); }
      } else if (a.mode === 'down') {
        a.y += dt * 5; a.x += a.dir * dt * 4;
        if (a.y >= S.floor - 7) { a.y = S.floor - 7; a.mode = 'walk'; a.wait = 3; }
        if (a.x < 4 || a.x > S.W - 14) a.dir = -a.dir;
      }
      var pic = a.mode === 'up' || a.mode === 'down' ? SWIM[Math.floor(t * 4) % 2] : WALK[a.mode === 'rest' ? 0 : a.frame];
      PS.sprite(g, pic, a.x, a.y, ink, a.dir < 0);
    }

    return PS.start(cv, { night: opts.night, build: build, draw: draw, fps: opts.fps || 20 });
  }

  root.Pond = { start: start };
})(window);
