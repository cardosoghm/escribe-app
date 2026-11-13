/* Escribe – tablero de comunicación offline */
(function () {
  'use strict';

  // ---------- Disposición (igual al tablero de papel) ----------
  // 6 columnas x 5 filas. '' = casilla vacía. 'Ñ' se muestra solo si está activada.
  const LETTERS = [
    ['A', 'B', 'C', 'D', 'E', ''],
    ['F', 'G', 'H', 'I', 'J', ''],
    ['K', 'L', 'M', 'N', 'O', '@Ñ'],
    ['P', 'Q', 'R', 'S', 'T', ''],
    ['U', 'V', 'W', 'X', 'Y', 'Z'],
  ];
  const NUMBERS = [
    ['1', '2', '3', '4', '5', ''],
    ['6', '7', '8', '9', '0', ''],
    ['.', ',', '?', '!', '¿', '¡'],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
  ];

  // ---------- Capacitor (si corre como app) ----------
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const plug = (name) => (isNative && Cap.registerPlugin ? Cap.registerPlugin(name) : null);
  const TTS = plug('TextToSpeech');
  const AppP = plug('App');
  const Kiosk = plug('Kiosk');
  const Share = plug('Share');
  const FS = plug('Filesystem');

  // ---------- Ajustes ----------
  const DEFAULTS = {
    bg: '#30523A', fg: '#F2F2F2', scale: 100, outScale: 100, upper: true, enye: false,
    debounce: 350, hold: 0, multi: true,
    speakLetter: false, speakWord: false, vibrate: true, flash: true,
    lang: 'es-AR', rate: 1, pitch: 1, autoSpeak: 0,
    lock: true, pin: '0000',
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const S = Object.assign({}, DEFAULTS, store.get('escribe.settings', {}));
  const save = () => store.set('escribe.settings', S);
  let history = store.get('escribe.history', []);
  let text = store.get('escribe.text', '');

  // ---------- Elementos ----------
  const $ = (id) => document.getElementById(id);
  const board = $('board'), outText = $('text'), output = $('output');
  let mode = 'letters';
  let lastSelect = -Infinity;

  // ---------- Aplicar ajustes ----------
  function applySettings() {
    const r = document.documentElement.style;
    r.setProperty('--bg', S.bg);
    r.setProperty('--fg', S.fg);
    r.setProperty('--scale', S.scale / 100);
    r.setProperty('--outScale', S.outScale / 100);
    document.querySelector('meta[name=theme-color]').setAttribute('content', S.bg);
    output.classList.toggle('upper', S.upper);
    document.body.classList.toggle('noflash', !S.flash);
    renderBoard();
  }

  // ---------- Texto ----------
  let autoTimer = null, lastSpoken = '';
  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (!S.autoSpeak) return;
    autoTimer = setTimeout(() => {
      const t = text.trim();
      if (t && t !== lastSpoken) actions.speak();
    }, S.autoSpeak * 1000);
  }
  function renderText() {
    outText.textContent = text;
    output.scrollTop = output.scrollHeight;
    store.set('escribe.text', text);
  }
  function addHistory(t) {
    t = t.trim();
    if (!t) return;
    if (history.length && history[history.length - 1].t === t) return;
    history.push({ t, d: new Date().toISOString() });
    if (history.length > 1000) history = history.slice(-1000);
    store.set('escribe.history', history);
  }
  function lastWord() {
    const m = text.trimEnd().match(/(\S+)$/);
    return m ? m[1] : '';
  }

  // ---------- Voz ----------
  let webVoices = [];
  if ('speechSynthesis' in window) {
    const load = () => { webVoices = speechSynthesis.getVoices(); };
    load();
    speechSynthesis.onvoiceschanged = load;
  }
  async function speak(t) {
    t = (t || '').trim();
    if (!t) return;
    const say = t.toLowerCase(); // evita que deletree palabras en mayúsculas
    if (TTS) {
      try { await TTS.stop(); } catch (e) {}
      try {
        await TTS.speak({ text: say, lang: S.lang, rate: S.rate, pitch: S.pitch, volume: 1, category: 'playback' });
      } catch (e) {
        try { await TTS.speak({ text: say, lang: 'es-ES', rate: S.rate, pitch: S.pitch, volume: 1 }); }
        catch (e2) { toast('No hay voz en español instalada en el dispositivo'); }
      }
      return;
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(say);
      u.lang = S.lang; u.rate = S.rate; u.pitch = S.pitch;
      const v = webVoices.find((x) => x.lang === S.lang) || webVoices.find((x) => /^es/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    }
  }
  function buzz() {
    if (S.vibrate && navigator.vibrate) { try { navigator.vibrate(25); } catch (e) {} }
  }

  // ---------- Toques robustos ----------
  // La selección ocurre al LEVANTAR el dedo, sobre la misma tecla, respetando
  // tiempo mínimo de presión y tiempo mínimo entre selecciones.
  let activePointers = 0;
  document.addEventListener('pointerdown', () => { activePointers++; }, true);
  const dec = () => { activePointers = Math.max(0, activePointers - 1); };
  document.addEventListener('pointerup', dec, true);
  document.addEventListener('pointercancel', dec, true);

  const pressed = new Set(); // cancelar todo si se apoya otro dedo
  document.addEventListener('pointerdown', () => {
    if (S.multi && activePointers > 1) pressed.forEach((cancel) => cancel());
  }, true);

  function bindPress(el, onSelect, opts) {
    opts = opts || {};
    let pid = null, t0 = 0, cancelled = false, holdTimer = null;
    const reset = () => { pid = null; el.classList.remove('pressing'); clearTimeout(holdTimer); pressed.delete(cancel); };
    const cancel = () => { cancelled = true; reset(); };
    el.addEventListener('pointerdown', (e) => {
      if (S.multi && activePointers > 1) { cancel(); return; }
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch (err) {}
      pid = e.pointerId; t0 = performance.now(); cancelled = false;
      pressed.add(cancel);
      el.classList.add('pressing');
      if (opts.holdMs) {
        el.style.setProperty('--holdMs', opts.holdMs + 'ms');
        holdTimer = setTimeout(() => { if (pid !== null && !cancelled) { reset(); onSelect(); } }, opts.holdMs);
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pid) return;
      const now = performance.now();
      const held = now - t0;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const inside = under && (under === el || el.contains(under));
      const ok = !cancelled && inside && !opts.holdMs && held >= S.hold && now - lastSelect >= S.debounce;
      reset();
      if (ok) { lastSelect = now; onSelect(); }
    });
    el.addEventListener('pointerleave', (e) => { if (e.pointerId === pid) cancel(); });
    el.addEventListener('pointercancel', (e) => { if (e.pointerId === pid) cancel(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- Tablero ----------
  function renderBoard() {
    board.innerHTML = '';
    const grid = mode === 'letters' ? LETTERS : NUMBERS;
    grid.forEach((row) => row.forEach((cell) => {
      let ch = cell;
      if (ch.startsWith('@')) ch = S.enye ? ch.slice(1) : '';
      const b = document.createElement('button');
      b.className = 'key' + (ch ? '' : ' empty');
      b.textContent = ch;
      if (ch) {
        b.setAttribute('aria-label', ch);
        bindPress(b, () => typeChar(ch, b));
      } else {
        b.tabIndex = -1;
        b.setAttribute('aria-hidden', 'true');
      }
      board.appendChild(b);
    }));
    $('toggleIco').textContent = mode === 'letters' ? '123' : 'ABC';
    $('toggleLbl').textContent = mode === 'letters' ? 'Números' : 'Letras';
  }
  function typeChar(ch, el) {
    text += ch.toLowerCase();
    renderText();
    scheduleAuto();
    buzz();
    if (S.flash && el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 180); }
    if (S.speakLetter) speak(ch);
  }

  // ---------- Controles ----------
  const actions = {
    speak() { clearTimeout(autoTimer); lastSpoken = text.trim(); addHistory(text); speak(text); },
    space() {
      const w = lastWord();
      if (text && !text.endsWith(' ')) text += ' ';
      renderText(); buzz(); scheduleAuto();
      if (S.speakWord && w) speak(w);
    },
    back() { text = text.slice(0, -1); renderText(); buzz(); scheduleAuto(); },
    clear() { clearTimeout(autoTimer); addHistory(text); text = ''; lastSpoken = ''; renderText(); buzz(); },
    toggle() { mode = mode === 'letters' ? 'numbers' : 'letters'; renderBoard(); buzz(); },
  };
  document.querySelectorAll('.ctl').forEach((b) => {
    const a = b.dataset.action;
    bindPress(b, () => actions[a](), a === 'clear' ? { holdMs: 900 } : null);
  });

  // ---------- Acceso adulto: mantener esquina 3 s + PIN ----------
  (function () {
    const corner = $('adultCorner');
    let timer = null;
    corner.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      timer = setTimeout(openPin, 3000);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => corner.addEventListener(ev, () => clearTimeout(timer)));
    corner.addEventListener('contextmenu', (e) => e.preventDefault());
  })();

  let pinBuf = '';
  function openPin() {
    pinBuf = ''; drawDots();
    $('pinOverlay').classList.remove('hidden');
  }
  function drawDots() {
    [...$('pinDots').children].forEach((d, i) => d.classList.toggle('on', i < pinBuf.length));
  }
  (function buildPad() {
    const pad = $('pinPad');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach((k) => {
      const b = document.createElement('button');
      b.textContent = k;
      if (!k) { b.style.visibility = 'hidden'; }
      b.addEventListener('click', () => {
        if (k === '⌫') pinBuf = pinBuf.slice(0, -1);
        else if (pinBuf.length < 4) pinBuf += k;
        drawDots();
        if (pinBuf.length === 4) {
          if (pinBuf === String(S.pin)) {
            $('pinOverlay').classList.add('hidden');
            openAdult();
          } else {
            const box = document.querySelector('.pinBox');
            box.classList.add('shake');
            setTimeout(() => { box.classList.remove('shake'); pinBuf = ''; drawDots(); }, 350);
          }
        }
      });
      pad.appendChild(b);
    });
    $('pinCancel').addEventListener('click', () => $('pinOverlay').classList.add('hidden'));
  })();

  // ---------- Panel adulto ----------
  function bindRange(id, key, label, fmt) {
    const el = $(id), lb = label ? $(label) : null;
    el.value = S[key];
    const show = () => { if (lb) lb.textContent = fmt ? fmt(S[key]) : S[key]; };
    show();
    el.oninput = () => { S[key] = parseFloat(el.value); show(); save(); applySettings(); };
  }
  function bindCheck(id, key) {
    const el = $(id);
    el.checked = !!S[key];
    el.onchange = () => { S[key] = el.checked; save(); applySettings(); };
  }
  function openAdult() {
    bindRange('sScale', 'scale', 'vScale', (v) => v + '%');
    bindRange('sOutScale', 'outScale', 'vOutScale', (v) => v + '%');
    bindRange('sDebounce', 'debounce', 'vDebounce');
    bindRange('sHold', 'hold', 'vHold');
    bindRange('sRate', 'rate', 'vRate', (v) => Number(v).toFixed(1));
    bindRange('sPitch', 'pitch', 'vPitch', (v) => Number(v).toFixed(1));
    bindRange('sAuto', 'autoSpeak', 'vAuto', (v) => (v ? v + ' segundos' : '— (apagado)'));
    ['Upper:upper', 'Enye:enye', 'Multi:multi', 'SpeakLetter:speakLetter', 'SpeakWord:speakWord', 'Vibrate:vibrate', 'Flash:flash', 'Lock:lock']
      .forEach((p) => { const [a, b] = p.split(':'); bindCheck('s' + a, b); });
    $('sBg').value = S.bg; $('sBg').oninput = (e) => { S.bg = e.target.value; save(); applySettings(); };
    $('sFg').value = S.fg; $('sFg').oninput = (e) => { S.fg = e.target.value; save(); applySettings(); };
    $('sLang').value = S.lang; $('sLang').onchange = (e) => { S.lang = e.target.value; save(); };
    $('sPin').value = '';
    $('lockHint').textContent = isNative
      ? 'La primera vez Android pregunta si querés fijar la app: aceptá. Para que pida PIN al desfijar: Ajustes → Seguridad → Fijar pantalla → «Pedir PIN antes de desfijar».'
      : 'Estás en la versión web: el bloqueo solo funciona en la app instalada. En el navegador usá «Fijar pantalla» (Android) o «Acceso guiado» (iPad).';
    renderHistory();
    $('adultOverlay').classList.remove('hidden');
    $('adultOverlay').querySelector('.panel').scrollTop = 0;
  }
  function closeAdult() {
    $('adultOverlay').classList.add('hidden');
    if (S.lock) lockNow();
  }
  $('closeAdult').onclick = closeAdult;
  $('resetColors').onclick = () => { S.bg = DEFAULTS.bg; S.fg = DEFAULTS.fg; $('sBg').value = S.bg; $('sFg').value = S.fg; save(); applySettings(); };
  $('testVoice').onclick = () => speak('Hola, esta es mi voz');
  $('savePin').onclick = () => {
    const v = $('sPin').value;
    if (!/^\d{4}$/.test(v)) { toast('El PIN tiene que tener 4 números'); return; }
    S.pin = v; save(); $('sPin').value = ''; toast('PIN guardado');
  };
  $('unlockBtn').onclick = async () => {
    if (!Kiosk) { toast('Solo disponible en la app instalada'); return; }
    S.lock = false; save(); $('sLock').checked = false;
    try { await Kiosk.unlock(); toast('App desfijada. Ya podés salir.'); } catch (e) { toast('No se pudo desfijar'); }
  };
  $('lockBtn').onclick = async () => {
    if (!Kiosk) { toast('Solo disponible en la app instalada'); return; }
    S.lock = true; save(); $('sLock').checked = true;
    lockNow();
  };
  async function lockNow() { if (Kiosk) { try { await Kiosk.lock(); } catch (e) {} } }

  // ---------- Historial ----------
  const fmtDate = (iso) => { const d = new Date(iso); return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); };
  function renderHistory() {
    $('histCount').textContent = '(' + history.length + ')';
    const ol = $('histList');
    ol.innerHTML = '';
    history.slice().reverse().slice(0, 200).forEach((h) => {
      const li = document.createElement('li');
      const s = document.createElement('small'); s.textContent = fmtDate(h.d) + ' — ';
      li.appendChild(s); li.appendChild(document.createTextNode(S.upper ? h.t.toUpperCase() : h.t));
      ol.appendChild(li);
    });
  }
  function historyText() {
    return 'Historial – Escribe\n\n' + history.map((h) => fmtDate(h.d) + '  ' + (S.upper ? h.t.toUpperCase() : h.t)).join('\n') + '\n';
  }
  $('exportHist').onclick = async () => {
    if (!history.length) { toast('El historial está vacío'); return; }
    const name = 'historial-escribe-' + new Date().toISOString().slice(0, 10) + '.txt';
    if (FS && Share) {
      try {
        const r = await FS.writeFile({ path: name, data: historyText(), directory: 'CACHE', encoding: 'utf8' });
        await Share.share({ title: 'Historial Escribe', url: r.uri, dialogTitle: 'Compartir historial' });
        return;
      } catch (e) { /* sigue con descarga */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([historyText()], { type: 'text/plain;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
  $('clearHist').onclick = () => {
    if (!confirm('¿Borrar todo el historial? No se puede deshacer.')) return;
    history = []; store.set('escribe.history', history); renderHistory();
  };

  // ---------- Utilidades ----------
  let toastT = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  // Botón Atrás de Android: no hace nada (no se sale de la app)
  if (AppP) { try { AppP.addListener('backButton', () => {}); } catch (e) {} }

  // Sin zoom por gestos ni menú contextual
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('.panel')) e.preventDefault(); });

  // PWA offline (solo navegador)
  if (!isNative && 'serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ---------- Inicio ----------
  applySettings();
  renderText();
  if (S.lock) lockNow();
})();
