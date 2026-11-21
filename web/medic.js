(function () {
  'use strict';
  var C = JSON.parse(document.getElementById('config').textContent);
  var $ = function (id) { return document.getElementById(id); };
  var dark = matchMedia('(prefers-color-scheme: dark)');
  var st = { exam: null, deep: false, busy: false, hours: 24, hogBy: 'cpu', diary: null };
  var AREAS = [['memory', 'Memory'], ['heat', 'Heat'], ['storage', 'Storage'], ['energy', 'Energy'], ['battery', 'Battery'], ['system', 'Restarts'], ['network', 'Internet'], ['startup', 'Startup']];
  var KEEP = /^(Finder|Dock|SystemUIServer|WindowServer|loginwindow|Control Center|Spotlight|NotificationCenter|kernel_task|launchd|medic|node|Terminal|iTerm2)$/;
  var GB = Math.pow(1024, 3);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function gb(n) { if (n == null) return '?'; if (n < GB) return Math.round(n / 1048576) + ' MB'; return (n >= 10 * GB ? Math.round(n / GB) : Math.round((n / GB) * 10) / 10) + ' GB'; }
  function pct(a, b) { return b ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0; }
  function hm(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + ' h ' + (m ? m + ' min' : '') : m + ' min'; }
  function when(t, withDay) {
    var d = new Date(t), h = d.getHours(), s = (h % 12 || 12) + (d.getMinutes() ? ':' + String(d.getMinutes()).padStart(2, '0') : '') + (h < 12 ? ' AM' : ' PM');
    return withDay ? d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + s : s;
  }
  function api(what, body) {
    return fetch(C.base + '/api/' + what, { method: 'POST', headers: { 'content-type': 'application/json', 'x-medic': C.secret }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'medic had a problem.'); return j; }); });
  }
  var toastT = 0;
  function toast(t) { var el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 3200); }
  function fail(e) { toast(e.message || 'Something went wrong.'); }
  function meter(p, cls) { return '<span class="meter ' + (cls || '') + '"><i style="width:' + Math.max(1.5, p) + '%"></i></span>'; }
  function stat(label, value, bar) { return '<div class="stat"><span>' + esc(label) + '</span>' + (bar || '<span></span>') + '<b>' + value + '</b></div>'; }

  /** "Go ahead?" in a little sheet; resolves true or false. */
  function confirmIt(title, text, yes) {
    return new Promise(function (resolve) {
      var d = $('ask');
      $('askTitle').textContent = title; $('askText').textContent = text; $('askYes').textContent = yes || 'Go ahead';
      function done(v) { $('askYes').onclick = $('askNo').onclick = null; d.close(); resolve(v); }
      $('askYes').onclick = function () { done(true); }; $('askNo').onclick = function () { done(false); };
      d.onclose = function () { resolve(false); };
      d.showModal(); $('askYes').focus();
    });
  }

  // ── Lotl, and the pond ──
  var LOTL = ['............', '.....r.r....', '......RRPPP.', '...rRRQPPEP.', '.f...QPPPPMP', 'fFPPPPPpppQ.', '.fQQPPPPPQ..', '...L...L....', '............'];
  var INK = { P: '#f6a6b8', p: '#ffd3dd', Q: '#e5859c', R: '#d84a7a', r: '#f27aa6', E: '#1d1416', M: '#b8506c', F: '#fbc4d1', f: '#e98aa5', L: '#e5859c' };
  function drawLotl() {
    var g = $('lotl').getContext('2d'); g.clearRect(0, 0, 12, 9);
    LOTL.forEach(function (row, y) { row.split('').forEach(function (ch, x) { if (INK[ch]) { g.fillStyle = INK[ch]; g.fillRect(x, y, 1, 1); } }); });
  }
  drawLotl();
  if (window.Pond) window.Pond.start($('scene'), { night: function () { return dark.matches; }, share: 0.42 });

  // ── the gist ──
  function showVerdict(x) {
    var v = x.vitals;
    if (!v.mac) {
      $('verdict').textContent = 'medic checks Macs, and this computer isn\'t one, so there\'s nothing to show here.';
      $('verdict').classList.remove('loading');
      return;
    }
    $('verdict').textContent = x.verdict;
    $('verdict').classList.remove('loading');
    var worst = {};
    x.findings.forEach(function (f) { var o = { fix: 3, watch: 2, good: 1 }; if (!worst[f.area] || o[f.level] > o[worst[f.area]]) worst[f.area] = f.level; });
    $('areas').innerHTML = AREAS.filter(function (a) { return worst[a[0]] || (a[0] === 'network' && !v.network); }).map(function (a) {
      var lvl = worst[a[0]] || 'none';
      var said = { fix: 'needs attention', watch: 'keep an eye on it', good: 'fine', none: 'still checking' }[lvl];
      return '<span class="area ' + lvl + '" title="' + esc(a[1] + ': ' + said) + '"><i></i>' + esc(a[1]) + '</span>';
    }).join('');
    var list = x.findings.filter(function (f) { return f.level !== 'good'; });
    $('findings').innerHTML = list.map(function (f, i) {
      var fixes = [f.fix].concat(f.more || []).filter(Boolean);
      return '<li class="finding ' + f.level + '"><div><h3>' + esc(f.title) + '</h3><p>' + esc(f.why) + '</p>' + (f.todo ? '<p class="todo">' + esc(f.todo) + '</p>' : '') +
        (fixes.length ? '<div class="acts">' + fixes.map(function (fx, j) { return '<button class="btn' + (j === 0 ? ' main' : '') + '" data-f="' + i + '" data-j="' + j + '">' + esc(fx.label) + '</button>'; }).join('') + '</div>' : '') + '</div></li>';
    }).join('');
    $('findings').hidden = !list.length;
    st.fixes = list.map(function (f) { return [f.fix].concat(f.more || []).filter(Boolean); });
    var good = x.findings.filter(function (f) { return f.level === 'good'; });
    $('goodies').hidden = !good.length;
    $('goodies').innerHTML = good.length ? '<b>Fine:</b> ' + good.map(function (f) { return esc(f.title.charAt(0).toLowerCase() + f.title.slice(1)); }).join('; ').replace(/^./, function (c) { return c.toUpperCase(); }) + '.' : '';
  }

  // ── the details ──
  function showBattery(b) {
    if (!b || !b.has) { $('battery').innerHTML = '<p class="empty">This Mac has no battery: it runs on the charger.</p>'; $('battWhen').textContent = ''; return; }
    $('battWhen').textContent = b.plugged ? 'plugged in' : 'on battery';
    var state = /charg(ed|ing)|finishing/i.test(b.state) ? b.state.replace(/^\w/, function (c) { return c.toUpperCase(); }) : b.plugged ? 'Not charging' : 'Running on battery';
    var left = b.minutesLeft != null ? (b.plugged ? ', full in ' : ', about ') + hm(b.minutesLeft) + (b.plugged ? '' : ' left') : '';
    var h = stat('Charge', b.percent + '%', meter(b.percent, b.percent <= 15 ? 'bad' : 'pink'));
    h += '<p class="empty" style="padding:0 0 4px">' + esc(state + left) + '</p>';
    if (b.health != null) h += stat('Health', b.health + '%', meter(b.health, b.health < 80 ? 'bad' : b.health < 88 ? 'warn' : ''));
    if (b.cycles != null) h += stat('Charge cycles', b.cycles.toLocaleString(), '<span class="lock">' + (b.cycles < 300 ? 'young' : b.cycles < 800 ? 'well used' : 'a lot') + '</span>');
    if (b.tempC != null) h += stat('Temperature', Math.round(b.tempC) + ' °C', '<span class="lock">' + (b.tempC >= 40 ? 'warm' : 'cool') + '</span>');
    if (b.condition) h += stat('macOS says', esc(b.condition), '<span></span>');
    if (b.charger) h += stat('Charger', b.charger + ' W', '<span></span>');
    if (b.fullMah && b.designMah) h += stat('Holds', b.fullMah.toLocaleString() + ' mAh', '<span class="lock">of ' + b.designMah.toLocaleString() + ' new</span>');
    $('battery').innerHTML = h;
  }
  function showMemory(m) {
    if (!m || !m.total) { $('memory').innerHTML = '<p class="empty">medic couldn\'t read the memory.</p>'; return; }
    var tight = { normal: 'Fine', warning: 'Tight', critical: 'Very tight' }[m.pressure] || 'Fine';
    var h = stat('In use', gb(m.used) + ' of ' + gb(m.total), meter(pct(m.used, m.total), m.pressure === 'critical' ? 'bad' : m.pressure === 'warning' ? 'warn' : ''));
    h += stat('How tight', tight, '<span class="lock">' + (m.pressure === 'normal' ? 'nothing is waiting for room' : 'apps are waiting for room') + '</span>');
    h += stat('Squeezed', gb(m.compressed || 0), '<span class="lock">packed small to fit</span>');
    h += stat('On the disk', gb(m.swap || 0), '<span class="lock">' + (m.swap > 2 * GB ? 'slow: the disk standing in for memory' : 'the disk standing in for memory') + '</span>');
    $('memory').innerHTML = h;
  }
  function showHogs(apps) {
    var list = (apps || []).slice().sort(function (a, b) { return st.hogBy === 'cpu' ? b.cpu - a.cpu || b.mem - a.mem : b.mem - a.mem; }).slice(0, 8);
    var seg = '<div style="margin:-4px 0 8px"><span class="seg" role="group" aria-label="Sort by"><button data-by="cpu" aria-pressed="' + (st.hogBy === 'cpu') + '">Processor</button><button data-by="mem" aria-pressed="' + (st.hogBy === 'mem') + '">Memory</button></span></div>';
    $('hogs').innerHTML = seg + (list.length ? list.map(function (a) {
      var safe = !a.system && !KEEP.test(a.name);
      return '<div class="row"><span class="nm" title="' + esc(a.name) + '">' + esc(a.name) + (a.procs > 1 ? ' <small>' + a.procs + ' parts</small>' : '') + (a.system ? ' <small>macOS</small>' : '') + '</span>' +
        '<span class="v">' + gb(a.mem) + '</span><span class="v">' + Math.round(a.cpu) + '%</span>' +
        '<button class="x" data-quit="' + esc(a.name) + '"' + (safe ? '' : ' disabled') + ' title="Quit ' + esc(a.name) + '">Quit</button></div>';
    }).join('') : '<p class="empty">Nothing is working hard.</p>');
  }
  function showStorage(d) {
    if (!d || !d.total) { $('storage').innerHTML = '<p class="empty">medic couldn\'t read the disk.</p>'; return; }
    var p = pct(d.free, d.total);
    $('storage').innerHTML = stat('Used', gb(d.used) + ' of ' + gb(d.total), meter(100 - p, p < 5 ? 'bad' : p < 12 ? 'warn' : '')) +
      stat('Free', gb(d.free), '<span class="lock">' + p + '% of the disk</span>') +
      '<div class="acts" style="display:flex;gap:6px;margin-top:10px"><button class="btn" data-fx="roomy">Find what\'s taking space</button><button class="btn quiet" data-fx="settings:storage">Storage settings</button></div>';
  }
  function showStartup(list) {
    list = (list || []).slice().sort(function (a, b) { return (b.mine - a.mine) || a.name.localeCompare(b.name); });
    var on = list.filter(function (s) { return s.on && !s.turnedOff; }).length;
    $('startCount').textContent = list.length ? on + ' on' : '';
    $('startup').innerHTML = list.length ? list.map(function (s) {
      var isOn = s.on && !s.turnedOff;
      return '<div class="row s"><span class="nm" title="' + esc(s.label) + '">' + esc(s.name) + ' <small>' + (s.mine ? 'yours' : 'everyone') + '</small></span>' +
        '<span class="v">' + (s.running ? 'running' : isOn ? 'waiting' : 'off') + '</span>' +
        '<input type="checkbox" class="toggle" data-label="' + esc(s.label) + '" data-name="' + esc(s.name) + '"' + (isOn ? ' checked' : '') + (s.mine ? '' : ' disabled') + ' aria-label="' + esc(s.name) + ' starts by itself"' + (s.mine ? '' : ' title="Set up for everyone on this Mac, so only an administrator can change it."') + '></div>';
    }).join('') : '<p class="empty">Nothing starts by itself apart from macOS. Nice and tidy.</p>';
  }
  function showNet(n, v) {
    if (!n) { $('net').innerHTML = '<p class="empty">' + (st.busy ? 'Checking…' : 'Press Check again to test the connection.') + '</p>'; return; }
    var h = '';
    if (n.loss >= 100) h += '<p class="empty" style="color:var(--fix)">Nothing came back from the internet.</p>';
    else h += stat('Answers in', n.ping + ' ms', '<span class="lock">' + (n.ping < 40 ? 'quick' : n.ping < 150 ? 'fine' : 'slow') + '</span>') + (n.loss ? stat('Lost', n.loss + '%', '<span class="lock">of the test messages</span>') : '');
    if (n.signal != null) {
      var bars = n.signal > -55 ? 4 : n.signal > -65 ? 3 : n.signal > -75 ? 2 : 1;
      h += stat('Wi-Fi signal', n.signal + ' dBm', '<span class="bars" aria-label="' + bars + ' of 4 bars">' + [1, 2, 3, 4].map(function (i) { return '<i class="' + (i <= bars ? 'on' : '') + '" style="height:' + (i * 25) + '%"></i>'; }).join('') + '</span>');
      if (n.rate) h += stat('Wi-Fi speed', n.rate + ' Mbps', '<span class="lock">between your Mac and the router</span>');
      if (n.channel) h += stat('Channel', esc(String(n.channel).split(' ')[0]), '<span class="lock">' + (/[56]\s?GHz/i.test(n.channel) ? '5 GHz: faster, shorter reach' : /2(\.4)?\s?GHz/i.test(n.channel) ? '2.4 GHz: slower, longer reach' : '') + '</span>');
    } else if (n.connected === false) h += '<p class="empty">Not on Wi-Fi (or medic couldn\'t see it).</p>';
    if (v && v.slowAt) h += '<p class="empty" style="font-size:12px">Checked at ' + when(v.slowAt) + '.</p>';
    $('net').innerHTML = h;
  }
  function showSys(v) {
    var s = v.system || {}, d = v.boot ? Math.floor((Date.now() - v.boot) / 86400000) : null;
    $('mac').textContent = [s.name, s.modelName ? s.modelName + (/^Apple (M\d.*)$/.test(s.chip) ? ' (' + s.chip.replace(/^Apple /, '') + ')' : '') : s.model].filter(Boolean).join(', ') + (s.macos ? ' on macOS ' + s.macos : '');
    $('sys').innerHTML = stat('Name', esc(s.name || '?')) + stat('Model', esc(s.modelName || s.model || '?'), s.modelName && s.model ? '<span class="lock">' + esc(s.model) + '</span>' : '') + stat('Chip', esc(s.chip || '?'), '<span class="lock">' + (s.cores ? s.cores + ' cores' : '') + '</span>') +
      stat('macOS', esc(s.macos || '?')) + (d != null ? stat('Restarted', d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago') : '');
  }
  function showHistory(list) {
    if (!list || list.length < 2) { $('history').innerHTML = '<p class="empty">Each day medic does a full checkup, it keeps a note of the main figures. Come back another day to see how things change.</p>'; return; }
    list = list.slice(-60);
    var W = 300, H = 70, n = list.length;
    var x = function (i) { return 6 + (i * (W - 12)) / Math.max(1, n - 1); };
    var y = function (s) { return 6 + ((100 - s) * (H - 12)) / 100; };
    var dots = list.map(function (h, i) { var c = h.score >= 90 ? 'var(--good)' : h.score >= 70 ? 'var(--watch)' : 'var(--fix)'; return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(h.score).toFixed(1) + '" r="3" fill="' + c + '"><title>' + new Date(h.at).toLocaleDateString() + ': ' + h.score + '</title></circle>'; }).join('');
    var line = list.map(function (h, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(h.score).toFixed(1); }).join(' ');
    var first = list.find(function (h) { return h.health != null; }), last = list.slice().reverse().find(function (h) { return h.health != null; });
    var hl = first && last && first !== last ? stat('Battery health', first.health + '% → ' + last.health + '%', '<span class="lock">since ' + new Date(first.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</span>') : '';
    $('history').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:80px" role="img" aria-label="Checkup scores, one a day"><path d="' + line + '" fill="none" stroke="var(--line)" stroke-width="1.5"/>' + dots + '</svg>' + hl +
      stat('Checkups', String(n), '<span class="lock">a score out of 100 each day</span>');
  }

  // ── the battery diary ──
  function showDiary(d) {
    st.diary = d;
    $('diaryOn').checked = !!d.on;
    var S = d.samples || [];
    if (S.length < 2) {
      $('chart').innerHTML = '<p class="empty">' + (d.on ? 'The diary is on. The first notes are in; use your Mac on battery for an hour or so and come back to see what drains it.' : 'Turn on the diary and medic takes a note every five minutes: the charge, and which apps use the most power while you\'re unplugged. After a few hours on battery it can tell you what\'s draining it.') + '</p>';
      $('diarySum').innerHTML = '';
      return;
    }
    var W = 600, H = 170, L = 34, R = 8, T = 8, B = 22, now = Date.now(), from = now - d.hours * 3600000;
    var x = function (t) { return L + ((t - from) * (W - L - R)) / (now - from); };
    var y = function (p) { return T + ((100 - p) * (H - T - B)) / 100; };
    var g = '';
    [0, 50, 100].forEach(function (p) { g += '<line class="ax" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(p) + '" y2="' + y(p) + '"/><text class="lbl" x="' + (L - 6) + '" y="' + (y(p) + 3) + '" text-anchor="end">' + p + '%</text>'; });
    // plugged in: shaded
    for (var i = 1; i < S.length; i++) if (S[i - 1][2] && S[i][1] != null && S[i][0] - S[i - 1][0] < 20 * 60000) g += '<rect class="plug" x="' + x(S[i - 1][0]).toFixed(1) + '" y="' + T + '" width="' + Math.max(0.5, x(S[i][0]) - x(S[i - 1][0])).toFixed(1) + '" height="' + (H - T - B) + '"/>';
    // the charge, broken where the Mac was asleep
    var path = '';
    S.forEach(function (s, k) { var gap = k && s[0] - S[k - 1][0] > 20 * 60000; path += (k === 0 || gap ? 'M' : 'L') + x(s[0]).toFixed(1) + ' ' + y(s[1]).toFixed(1) + ' '; });
    g += '<path class="ln" d="' + path + '"/>';
    var ticks = d.hours <= 24 ? 4 : d.hours <= 72 ? 3 : 7;
    for (var k = 0; k <= ticks; k++) { var t = from + ((now - from) * k) / ticks; g += '<text class="lbl" x="' + x(t) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === ticks ? 'end' : 'middle') + '">' + (k === ticks ? 'now' : when(t, d.hours > 24)) + '</text>'; }
    $('chart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Battery charge over the last ' + d.hours + ' hours">' + g + '</svg><p class="empty" style="font-size:12px;padding-top:4px">The pink line is the charge; the shaded parts are when it was plugged in. Gaps are when it was asleep.</p>';
    var s = d.summary || {};
    var h = '';
    if (s.hoursOnBattery < 0.25) h = '<p class="empty">It\'s been plugged in the whole time, so there\'s nothing to say about draining yet.</p>';
    else {
      h += stat('On battery', s.hoursOnBattery + ' h');
      if (s.perHour != null) h += stat('Draining', s.perHour + '% an hour', '<span class="lock">' + (s.perHour <= 10 ? 'gentle' : s.perHour <= 18 ? 'normal' : 'fast') + '</span>');
      if (s.hoursFull) h += stat('A full charge', 'about ' + s.hoursFull + ' h', '<span class="lock">at that rate</span>');
      if (s.apps && s.apps.length) h += '<p class="empty" style="padding:8px 0 2px">What used the most power:</p>' + s.apps.map(function (a) { return '<div class="stat"><span>' + esc(a.name) + '</span>' + meter(a.share, 'pink') + '<b>' + a.share + '%</b></div>'; }).join('');
    }
    $('diarySum').innerHTML = h;
  }
  function loadDiary() { return api('diary', { hours: st.hours }).then(showDiary).catch(fail); }

  // ── checking ──
  function render(x) {
    st.exam = x;
    var v = x.vitals;
    showVerdict(x);
    if (!v.mac) return;
    showBattery(v.battery); showMemory(v.memory); showHogs(v.apps); showStorage(v.disk); showStartup(v.startup); showNet(v.network, v); showSys(v);
    $('took').textContent = 'Checked at ' + when(v.at) + (st.deep ? '' : ' (a quick look; the full checkup is on its way)');
  }
  function check() {
    if (st.busy) return Promise.resolve();
    st.busy = true; st.deep = false;
    $('again').disabled = true; $('again').textContent = 'Looking…';
    return api('check', { deep: false }).then(function (x) {
      render(x);
      $('again').textContent = 'Looking closer…';
      return api('check', { deep: true });
    }).then(function (x) {
      st.deep = true; render(x);
      return api('history').then(function (h) { showHistory(h.history); });
    }).catch(fail).then(function () {
      st.busy = false; $('again').disabled = false; $('again').textContent = 'Check again';
      if (st.exam) showNet(st.exam.vitals.network, st.exam.vitals);
    });
  }
  /** A quick look, to show a fix worked (the slow parts are remembered for a while). */
  function quick() {
    if (st.busy) return Promise.resolve();
    return api('check', { deep: false }).then(function (x) { st.deep = true; render(x); }).catch(function () { /* next time */ });
  }

  // ── fixing ──
  function doFix(fx) {
    var go = fx.ask ? confirmIt(fx.label + '?', fx.ask, fx.label) : Promise.resolve(true);
    return go.then(function (yes) {
      if (!yes) return;
      return api('fix', { action: fx.action, arg: fx.arg }).then(function (r) { toast(r.said || 'Done.'); return quick(); }).catch(fail);
    });
  }
  $('findings').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-f]'); if (!b) return;
    var fx = (st.fixes[+b.dataset.f] || [])[+b.dataset.j]; if (!fx) return;
    b.disabled = true;
    doFix(fx).then(function () { b.disabled = false; });
  });
  $('hogs').addEventListener('click', function (e) {
    var by = e.target.closest('button[data-by]');
    if (by) { st.hogBy = by.dataset.by; if (st.exam) showHogs(st.exam.vitals.apps); return; }
    var q = e.target.closest('button[data-quit]'); if (!q) return;
    var name = q.dataset.quit;
    doFix({ label: 'Quit ' + name, action: 'quit', arg: name, ask: 'Quit ' + name + '? If anything isn\'t saved in it, it will ask you first.' });
  });
  $('storage').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-fx]'); if (!b) return;
    var p = b.dataset.fx.split(':');
    doFix({ label: b.textContent, action: p[0], arg: p[1] });
  });
  $('startup').addEventListener('change', function (e) {
    var t = e.target; if (!t.dataset.label) return;
    var on = t.checked, name = t.dataset.name;
    var go = on ? Promise.resolve(true) : confirmIt('Turn off ' + name + '?', 'It won\'t start by itself when you log in any more. Nothing is deleted: turn it back on here any time.', 'Turn it off');
    go.then(function (yes) {
      if (!yes) { t.checked = !on; return; }
      t.disabled = true;
      return api('startup', { label: t.dataset.label, on: on }).then(function (r) { toast(r.said); return quick(); }).catch(function (err) { t.checked = !on; t.disabled = false; fail(err); });
    });
  });
  $('again').addEventListener('click', check);

  // ── the diary's controls ──
  $('range').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-h]'); if (!b) return;
    st.hours = +b.dataset.h;
    Array.prototype.forEach.call($('range').children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    loadDiary();
  });
  $('diaryOn').addEventListener('change', function () {
    var on = $('diaryOn').checked;
    api(on ? 'diary-on' : 'diary-off').then(function (r) { toast(on ? (r.said || 'The diary is on.') : 'The diary is off. What it noted stays until it\'s two weeks old.'); if (on && r.ok === false) $('diaryOn').checked = false; return loadDiary(); }).catch(function (e) { $('diaryOn').checked = !on; fail(e); });
  });

  // ── off we go ──
  check().then(loadDiary);
  setInterval(function () { api('ping').catch(function () { /* the window outlived medic */ }); }, 30000);
  setInterval(function () { if (!document.hidden) quick(); }, 60000);
  setInterval(function () { if (!document.hidden && st.diary && st.diary.on) loadDiary(); }, 300000);
})();
