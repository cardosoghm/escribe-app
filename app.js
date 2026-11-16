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

  // Tableros de frases (editables en modo adulto, una por línea)
  const DEF_PHRASES = [
    '✅ Sí', '❌ No', '🤷 No sé', '🚽 Quiero ir al baño',
    '🍽️ Tengo hambre', '🥤 Tengo sed', '✋ Pará, basta', '🆘 Ayudame',
    '⏳ Esperá', '🙈 Quiero estar solo', '🏠 Quiero ir a casa', '🔁 Otra vez',
    '👍 Me gusta', '👎 No me gusta', '🙏 Gracias', '❤️ Te quiero',
  ].join('\n');
  const DEF_PAIN = [
    'la cabeza', 'la panza', 'la garganta', 'los oídos', 'las muelas', 'los ojos',
    'la espalda', 'el pecho', 'los brazos', 'las piernas', 'los pies', 'las manos',
  ].join('\n');
  const DEF_FEEL = [
    '😊 contento', '😢 triste', '😠 enojado', '😨 con miedo', '😬 nervioso', '😴 cansado',
    '😑 aburrido', '😌 tranquilo', '🥶 con frío', '🥵 con calor', '😵 mareado', '🥱 con sueño',
  ].join('\n');
  const INTENSITY = [
    { t: 'un poco', c: '#e9c46a' }, { t: 'bastante', c: '#f4a261' },
    { t: 'mucho', c: '#e76f51' }, { t: 'muchísimo', c: '#c1121f' },
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
    lang: 'es-AR', rate: 1, pitch: 1, autoSpeak: 0, voice: 'auto',
    predict: true, predictN: 4, learn: true,
    lock: true, pin: '0000',
    phrases: DEF_PHRASES, pain: DEF_PAIN, feel: DEF_FEEL,
    tabPhrases: false, tabPain: true, tabFeel: false, cfgVer: 2,
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const S = Object.assign({}, DEFAULTS, store.get('escribe.settings', {}));
  const save = () => store.set('escribe.settings', S);
  // v2: Frases y Emociones ocultas por defecto (se pueden activar en modo adulto)
  if ((S.cfgVer || 1) < 2) { S.tabPhrases = false; S.tabFeel = false; S.cfgVer = 2; save(); }
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
    document.body.classList.toggle('upper', S.upper);
    r.setProperty('--pn', S.predictN);
    document.body.classList.toggle('noflash', !S.flash);
    renderTabs();
    renderBoard();
    renderPredict();
  }

  // =====================================================================
  // ARCHIVO: guarda automáticamente todo lo que escribe
  // Entrada: {id, t: texto, d: creado, u: actualizado, k: tipo, s: dicho en voz alta}
  // =====================================================================
  const KIND = { escrito: '✍️', frase: '💬', dolor: '🤕', emocion: '🙂' };
  let archive = store.get('escribe.history', []).map((h, i) => Object.assign({ id: 'old' + i, k: 'escrito', u: h.d, s: true }, h));
  let currentId = store.get('escribe.currentId', null);
  let archTimer = null;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const saveArchive = () => {
    if (archive.length > 5000) archive = archive.slice(-5000);
    store.set('escribe.history', archive);
    store.set('escribe.currentId', currentId);
  };
  function upsertCurrent(spoken) {
    clearTimeout(archTimer);
    const t = text.trim();
    let e = currentId && archive.find((x) => x.id === currentId);
    const now = new Date().toISOString();
    if (!t) {
      if (e && !e.s) archive = archive.filter((x) => x !== e); // borró todo antes de decirlo
      if (!e || !e.s) currentId = null;
    } else if (e) {
      e.t = t; e.u = now; if (spoken) e.s = true;
    } else {
      e = { id: newId(), t, d: now, u: now, k: 'escrito', s: !!spoken };
      archive.push(e); currentId = e.id;
    }
    saveArchive();
  }
  function markDirty() { clearTimeout(archTimer); archTimer = setTimeout(() => upsertCurrent(false), 1500); }
  function closeCurrent() { upsertCurrent(false); currentId = null; saveArchive(); }
  function addEntry(t, k) {
    const now = new Date().toISOString();
    const e = { id: newId(), t, d: now, u: now, k, s: true };
    archive.push(e); saveArchive();
    return e;
  }

  // ---------- Predicción de palabras (offline) ----------
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const WORDS = window.ESCRIBE_WORDS || [];
  const WNORM = WORDS.map(norm);
  const DICT = new Set(WORDS);
  let learned = store.get('escribe.learned', {});   // palabra -> veces usada
  let bigrams = store.get('escribe.bigrams', {});   // palabra -> {siguiente: veces}
  const predictEl = $('predict');

  function splitTail() {
    const m = text.match(/^(.*?)(\S*)$/s);
    const before = m[1], prefix = m[2];
    const pw = before.trim().split(/\s+/).pop() || '';
    return { prefix, prev: norm(pw) };
  }
  function suggestions() {
    if (!S.predict) return [];
    const { prefix, prev } = splitTail();
    const p = norm(prefix);
    const score = new Map();
    const add = (w, s) => { if (w && w !== prefix.toLowerCase()) score.set(w, Math.max(score.get(w) || 0, s) + (score.has(w) ? 0.5 : 0)); };
    const next = (prev && bigrams[prev]) || {};
    Object.keys(next).forEach((w) => { if (norm(w).startsWith(p)) add(w, 3 + Math.min(next[w], 50) / 10); });
    if (p) {
      Object.keys(learned).forEach((w) => {
        if ((DICT.has(w) || learned[w] >= 2) && norm(w).startsWith(p)) add(w, 2 + Math.min(learned[w], 50) / 50);
      });
      let found = 0;
      for (let i = 0; i < WNORM.length && found < 40; i++) {
        if (WNORM[i].startsWith(p)) { add(WORDS[i], 1 - i / WNORM.length); found++; }
      }
    }
    return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, S.predictN).map((e) => e[0]);
  }
  function learn(w, prevW) {
    if (!S.learn) return;
    w = (w || '').toLowerCase();
    if (w.length < 2 || !/^[a-záéíóúüñ]+$/.test(w)) return;
    learned[w] = (learned[w] || 0) + 1;
    const pv = norm(prevW || '');
    if (pv) { bigrams[pv] = bigrams[pv] || {}; bigrams[pv][w] = (bigrams[pv][w] || 0) + 1; }
    store.set('escribe.learned', learned);
    store.set('escribe.bigrams', bigrams);
  }
  function learnLastWord() {
    const ws = text.trim().split(/\s+/);
    if (ws.length && ws[ws.length - 1]) learn(ws[ws.length - 1], ws[ws.length - 2]);
  }
  function renderPredict() {
    predictEl.innerHTML = '';
    if (!S.predict || (mode !== 'letters' && mode !== 'numbers')) return;
    const list = suggestions();
    for (let i = 0; i < S.predictN; i++) {
      const w = list[i];
      const b = document.createElement('button');
      b.className = 'pw' + (w ? '' : ' blank');
      b.textContent = w || '·';
      if (w) bindPress(b, () => chooseWord(w));
      predictEl.appendChild(b);
    }
  }
  function chooseWord(w) {
    const { prefix } = splitTail();
    const before = text.slice(0, text.length - prefix.length);
    const prevW = before.trim().split(/\s+/).pop() || '';
    text = before + w + ' ';
    learn(w, prevW);
    renderText(); buzz(); scheduleAuto(); markDirty();
    if (S.speakWord) speak(w);
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
    renderPredict();
  }
  function lastWord() {
    const m = text.trimEnd().match(/(\S+)$/);
    return m ? m[1] : '';
  }

  // ---------- Voz ----------
  // Nombres de voces masculinas conocidas en español (iOS, Windows, Mac, Google, Microsoft)
  const MALE = /(jorge|diego|juan|carlos|pablo|enrique|ra[uú]l|alvaro|álvaro|jos[eé]|miguel|tom[aá]s|andr[eé]s|gonzalo|lorenzo|federico|mateo|alonso|dario|darío|jaime|eduardo|hombre|\bmale\b|masculin)/i;
  let webVoices = [], nativeVoices = [];
  const esOnly = (v) => /^es/i.test(v.lang || '');
  if ('speechSynthesis' in window) {
    const load = () => { webVoices = speechSynthesis.getVoices().filter(esOnly); };
    load();
    speechSynthesis.onvoiceschanged = load;
  }
  async function loadNativeVoices() {
    if (!TTS) return;
    try {
      const r = await TTS.getSupportedVoices();
      nativeVoices = (r.voices || []).map((v, i) => Object.assign({ index: i }, v)).filter(esOnly);
    } catch (e) { nativeVoices = []; }
  }
  loadNativeVoices();
  function voiceList() { return TTS ? nativeVoices : webVoices; }
  function pickVoice() {
    const list = voiceList();
    if (!list.length) return null;
    if (S.voice !== 'auto') {
      const v = list.find((x) => (x.voiceURI || x.name) === S.voice);
      if (v) return v;
    }
    const sameLang = list.filter((x) => x.lang === S.lang || x.lang.replace('_', '-') === S.lang);
    return sameLang.find((x) => MALE.test(x.name || x.voiceURI || '')) ||
      list.find((x) => MALE.test(x.name || x.voiceURI || '')) || null;
  }
  async function speak(t) {
    t = (t || '').trim();
    if (!t) return;
    const say = t.toLowerCase(); // evita que deletree palabras en mayúsculas
    const v = pickVoice();
    if (TTS) {
      try { await TTS.stop(); } catch (e) {}
      const opts = { text: say, lang: v ? v.lang : S.lang, rate: S.rate, pitch: S.pitch, volume: 1, category: 'playback' };
      if (v) opts.voice = v.index;
      try { await TTS.speak(opts); } catch (e) {
        try { await TTS.speak({ text: say, lang: 'es-ES', rate: S.rate, pitch: S.pitch, volume: 1 }); }
        catch (e2) { toast('No hay voz en español instalada en el dispositivo'); }
      }
      return;
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(say);
      u.lang = v ? v.lang : S.lang; u.rate = S.rate; u.pitch = S.pitch;
      if (v) u.voice = v;
      else { const d = webVoices.find((x) => x.lang === S.lang) || webVoices[0]; if (d) { u.voice = d; u.lang = d.lang; } }
      speechSynthesis.speak(u);
    }
  }
  function fillVoiceSelect() {
    const sel = $('sVoice');
    sel.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = 'auto'; auto.textContent = 'Automática (preferir voz de hombre)';
    sel.appendChild(auto);
    voiceList().forEach((v) => {
      const o = document.createElement('option');
      o.value = v.voiceURI || v.name;
      o.textContent = (v.name || v.voiceURI) + ' (' + v.lang + ')' + (MALE.test(v.name || v.voiceURI || '') ? ' – hombre' : '');
      sel.appendChild(o);
    });
    sel.value = S.voice;
    if (sel.value !== S.voice) sel.value = 'auto';
    sel.onchange = () => { S.voice = sel.value; save(); speak('Hola, soy Romeo'); };
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

  // ---------- Pestañas ----------
  const TABS = [
    { m: 'letters', ico: 'ABC', lbl: 'Letras' },
    { m: 'numbers', ico: '123', lbl: 'Números' },
    { m: 'phrases', ico: '💬', lbl: 'Frases', key: 'tabPhrases' },
    { m: 'pain', ico: '🤕', lbl: 'Dolor', key: 'tabPain' },
    { m: 'feel', ico: '🙂', lbl: 'Emociones', key: 'tabFeel' },
  ];
  function renderTabs() {
    const nav = $('tabs');
    nav.innerHTML = '';
    const visible = TABS.filter((t) => !t.key || S[t.key]);
    if (!visible.find((t) => t.m === mode)) mode = 'letters';
    nav.style.setProperty('--tn', visible.length);
    visible.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'tab' + (t.m === mode ? ' on' : '');
      b.innerHTML = '<span class="ico"></span><span class="lbl"></span>';
      b.firstChild.textContent = t.ico; b.lastChild.textContent = t.lbl;
      bindPress(b, () => { mode = t.m; painPart = null; renderTabs(); renderBoard(); renderPredict(); buzz(); });
      nav.appendChild(b);
    });
  }

  // ---------- Tableros ----------
  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const splitEmoji = (line) => {
    const m = line.match(/^(\P{L}+?)\s+(.+)$/u);
    return m && !/[a-záéíóúñ0-9]/i.test(m[1]) ? { e: m[1], t: m[2] } : { e: '', t: line };
  };
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  let painPart = null, painEntry = null;

  function card(label, emoji, onSelect, extraClass) {
    const b = document.createElement('button');
    b.className = 'card' + (extraClass ? ' ' + extraClass : '');
    if (emoji) { const e = document.createElement('span'); e.className = 'em'; e.textContent = emoji; b.appendChild(e); }
    const l = document.createElement('span'); l.className = 'tx'; l.textContent = label; b.appendChild(l);
    bindPress(b, () => { flash(b); onSelect(); });
    return b;
  }
  function flash(el) {
    buzz();
    if (S.flash) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 220); }
  }
  function sayAndShow(phrase, kind) {
    speak(phrase);
    showSaid(phrase);
    return addEntry(phrase, kind);
  }
  let saidTimer = null;
  function showSaid(p) {
    const el = $('said');
    el.textContent = p; el.classList.remove('hidden');
    clearTimeout(saidTimer); saidTimer = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function renderBoard() {
    board.innerHTML = '';
    board.className = 'mode-' + mode;
    if (mode === 'letters' || mode === 'numbers') {
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
      return;
    }
    if (mode === 'phrases') {
      lines(S.phrases).forEach((ln) => {
        const { e, t } = splitEmoji(ln);
        board.appendChild(card(t, e, () => sayAndShow(t, 'frase')));
      });
      return;
    }
    if (mode === 'feel') {
      lines(S.feel).forEach((ln) => {
        const { e, t } = splitEmoji(ln);
        board.appendChild(card(t, e, () => sayAndShow('Estoy ' + t, 'emocion')));
      });
      return;
    }
    if (mode === 'pain') {
      const head = document.createElement('div');
      head.className = 'painHead';
      if (!painPart) {
        head.textContent = '¿Dónde te duele?';
      } else {
        INTENSITY.forEach((it) => {
          const b = card(it.t, '', () => {
            const p = painPhrase(painPart) + ', ' + it.t;
            speak(p); showSaid(p);
            if (painEntry) { painEntry.t = p; painEntry.u = new Date().toISOString(); saveArchive(); }
            else painEntry = addEntry(p, 'dolor');
          }, 'intensity');
          b.style.background = it.c; b.style.color = '#1b1b1b';
          head.appendChild(b);
        });
      }
      board.appendChild(head);
      lines(S.pain).forEach((part) => {
        const label = part.replace(/^(el|la|los|las)\s+/i, '');
        board.appendChild(card(label, '', () => {
          painPart = part;
          const p = painPhrase(part);
          painEntry = sayAndShow(p, 'dolor');
          renderBoard();
        }, painPart === part ? 'sel' : ''));
      });
    }
  }
  function painPhrase(part) {
    return (/^(los|las)\s/i.test(part) ? 'Me duelen ' : 'Me duele ') + part;
  }

  function typeChar(ch, el) {
    text += ch.toLowerCase();
    renderText();
    scheduleAuto();
    markDirty();
    buzz();
    if (S.flash && el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 180); }
    if (S.speakLetter) speak(ch);
  }

  // ---------- Controles ----------
  const actions = {
    speak() {
      if (text && !text.endsWith(' ')) learnLastWord();
      clearTimeout(autoTimer);
      lastSpoken = text.trim();
      upsertCurrent(true);
      speak(text);
    },
    space() {
      const w = lastWord();
      if (text && !text.endsWith(' ')) { learnLastWord(); text += ' '; }
      renderText(); buzz(); scheduleAuto(); markDirty();
      if (S.speakWord && w) speak(w);
    },
    back() { text = text.slice(0, -1); renderText(); buzz(); scheduleAuto(); markDirty(); },
    clear() { clearTimeout(autoTimer); closeCurrent(); text = ''; lastSpoken = ''; renderText(); buzz(); },
  };
  document.querySelectorAll('.ctl').forEach((b) => {
    const a = b.dataset.action;
    bindPress(b, () => actions[a](), a === 'clear' ? { holdMs: 900 } : null);
  });

  // ---------- Acceso adulto: mantener ⚙ 3 s + PIN ----------
  (function () {
    const corner = $('adultCorner');
    let timer = null;
    const start = (e) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      clearTimeout(timer);
      corner.classList.add('holding');
      timer = setTimeout(() => { corner.classList.remove('holding'); openPin(); }, 3000);
    };
    const stop = () => { clearTimeout(timer); corner.classList.remove('holding'); };
    corner.addEventListener('touchstart', start, { passive: false });
    corner.addEventListener('touchend', stop);
    corner.addEventListener('touchcancel', stop);
    corner.addEventListener('mousedown', start);
    corner.addEventListener('mouseup', stop);
    corner.addEventListener('mouseleave', stop);
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
  function bindText(id, key) {
    const el = $(id);
    el.value = S[key];
    el.oninput = () => { S[key] = el.value; save(); renderBoard(); };
  }
  function openAdult() {
    bindRange('sScale', 'scale', 'vScale', (v) => v + '%');
    bindRange('sOutScale', 'outScale', 'vOutScale', (v) => v + '%');
    bindRange('sDebounce', 'debounce', 'vDebounce');
    bindRange('sHold', 'hold', 'vHold');
    bindRange('sRate', 'rate', 'vRate', (v) => Number(v).toFixed(1));
    bindRange('sPitch', 'pitch', 'vPitch', (v) => Number(v).toFixed(1));
    bindRange('sPredictN', 'predictN', 'vPredictN');
    $('learnCount').textContent = 'Palabras aprendidas: ' + Object.keys(learned).length + '.';
    bindRange('sAuto', 'autoSpeak', 'vAuto', (v) => (v ? v + ' segundos' : '— (apagado)'));
    ['Upper:upper', 'Enye:enye', 'Multi:multi', 'SpeakLetter:speakLetter', 'SpeakWord:speakWord', 'Vibrate:vibrate', 'Flash:flash',
      'Lock:lock', 'Predict:predict', 'Learn:learn', 'TabPhrases:tabPhrases', 'TabPain:tabPain', 'TabFeel:tabFeel']
      .forEach((p) => { const [a, b] = p.split(':'); bindCheck('s' + a, b); });
    bindText('sPhrases', 'phrases'); bindText('sPain', 'pain'); bindText('sFeel', 'feel');
    $('sBg').value = S.bg; $('sBg').oninput = (e) => { S.bg = e.target.value; save(); applySettings(); };
    $('sFg').value = S.fg; $('sFg').oninput = (e) => { S.fg = e.target.value; save(); applySettings(); };
    fillVoiceSelect();
    $('sLang').value = S.lang; $('sLang').onchange = (e) => { S.lang = e.target.value; save(); };
    $('sPin').value = '';
    $('lockHint').textContent = isNative
      ? 'La primera vez Android pregunta si querés fijar la app: aceptá. Para que pida PIN al desfijar: Ajustes → Seguridad → Fijar pantalla → «Pedir PIN antes de desfijar».'
      : 'Estás en la versión web: el bloqueo solo funciona en la app instalada. En el navegador usá «Fijar pantalla» (Android) o «Acceso guiado» (iPad).';
    upsertCurrent(false);
    $('histCount').textContent = '(' + archive.length + ' registros)';
    $('adultOverlay').classList.remove('hidden');
    $('adultOverlay').querySelector('.panel').scrollTop = 0;
  }
  function closeAdult() {
    $('adultOverlay').classList.add('hidden');
    if (S.lock) lockNow();
  }
  $('closeAdult').onclick = closeAdult;
  $('resetColors').onclick = () => { S.bg = DEFAULTS.bg; S.fg = DEFAULTS.fg; $('sBg').value = S.bg; $('sFg').value = S.fg; save(); applySettings(); };
  $('resetBoards').onclick = () => {
    S.phrases = DEF_PHRASES; S.pain = DEF_PAIN; S.feel = DEF_FEEL; save();
    $('sPhrases').value = S.phrases; $('sPain').value = S.pain; $('sFeel').value = S.feel;
    renderBoard(); toast('Tableros restaurados');
  };
  $('testVoice').onclick = () => speak('Hola, soy Romeo');
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

  // ---------- Vista del Archivo ----------
  const dayKey = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dayLabel = (iso) => {
    const d = new Date(iso), today = dayKey(new Date().toISOString()), yest = dayKey(new Date(Date.now() - 864e5).toISOString());
    const k = dayKey(iso);
    const base = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return (k === today ? 'Hoy · ' : k === yest ? 'Ayer · ' : '') + cap1(base);
  };
  const hhmm = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const shown = (t) => (S.upper ? t.toUpperCase() : t);
  const entryLine = (h) => hhmm(h.d) + '  ' + shown(h.t);

  function groupedEntries(filter) {
    const q = norm(filter || '');
    const list = archive.filter((h) => !q || norm(h.t).includes(q)).slice().reverse();
    const groups = [];
    list.forEach((h) => {
      const k = dayKey(h.d);
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) { g = { k, label: dayLabel(h.d), items: [] }; groups.push(g); }
      g.items.push(h);
    });
    return groups;
  }
  function renderArchive() {
    const box = $('archList');
    box.innerHTML = '';
    const groups = groupedEntries($('archSearch').value);
    $('archCount').textContent = archive.length + ' registros';
    if (!groups.length) {
      const p = document.createElement('p'); p.className = 'hint center';
      p.textContent = archive.length ? 'No hay resultados para esa búsqueda.' : 'Todavía no hay nada guardado. Todo lo que escriba se va a guardar acá automáticamente.';
      box.appendChild(p); return;
    }
    groups.forEach((g) => {
      const sec = document.createElement('section'); sec.className = 'day';
      const hd = document.createElement('div'); hd.className = 'dayHead';
      const h = document.createElement('h3'); h.textContent = g.label; hd.appendChild(h);
      const cp = document.createElement('button'); cp.className = 'btn small'; cp.textContent = 'Copiar día';
      cp.onclick = () => copyText(g.label + '\n' + g.items.slice().reverse().map(entryLine).join('\n'));
      hd.appendChild(cp);
      sec.appendChild(hd);
      g.items.forEach((it) => {
        const row = document.createElement('div'); row.className = 'entry';
        const meta = document.createElement('span'); meta.className = 'meta';
        meta.textContent = hhmm(it.d) + ' ' + (KIND[it.k] || '✍️') + (it.s ? ' 🔊' : '');
        meta.title = it.k + (it.s ? ' · dicho en voz alta' : ' · escrito, no dicho');
        const tx = document.createElement('span'); tx.className = 'etx'; tx.textContent = shown(it.t);
        const say = document.createElement('button'); say.className = 'btn small'; say.textContent = '🔊';
        say.title = 'Decir en voz alta'; say.onclick = () => speak(it.t);
        const del = document.createElement('button'); del.className = 'btn small danger'; del.textContent = '🗑';
        del.title = 'Borrar este registro';
        del.onclick = () => askConfirm('¿Borrar este registro?', () => {
          archive = archive.filter((x) => x !== it);
          if (currentId === it.id) currentId = null;
          saveArchive(); renderArchive();
        });
        row.append(meta, tx, say, del);
        sec.appendChild(row);
      });
      box.appendChild(sec);
    });
  }
  $('openArchive').onclick = () => {
    upsertCurrent(false);
    $('archSearch').value = '';
    renderArchive();
    $('archiveOverlay').classList.remove('hidden');
  };
  $('closeArchive').onclick = () => $('archiveOverlay').classList.add('hidden');
  $('archSearch').oninput = renderArchive;

  function archiveText() {
    const groups = groupedEntries('').reverse();
    return 'Archivo – Escribe\n(✍️ escrito · 💬 frase · 🤕 dolor · 🙂 emoción · 🔊 dicho en voz alta)\n\n' +
      groups.map((g) => g.label + '\n' + g.items.slice().reverse().map((h) => hhmm(h.d) + ' ' + (KIND[h.k] || '') + (h.s ? '🔊' : '') + '  ' + shown(h.t)).join('\n')).join('\n\n') + '\n';
  }
  async function exportArchive() {
    upsertCurrent(false);
    if (!archive.length) { toast('El archivo está vacío'); return; }
    const name = 'archivo-escribe-' + new Date().toISOString().slice(0, 10) + '.txt';
    if (FS && Share) {
      try {
        const r = await FS.writeFile({ path: name, data: archiveText(), directory: 'CACHE', encoding: 'utf8' });
        await Share.share({ title: 'Archivo Escribe', url: r.uri, dialogTitle: 'Compartir archivo' });
        return;
      } catch (e) { /* sigue con descarga */ }
    }
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([archiveText()], { type: 'text/plain;charset=utf-8' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { copyText(archiveText()); }
  }
  $('exportHist').onclick = exportArchive;
  $('archExport').onclick = exportArchive;
  $('archCopy').onclick = () => copyText(archiveText());
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('Copiado. Ya lo podés pegar en WhatsApp o en un mail.'); }
    catch (e) { toast('No se pudo copiar en este dispositivo'); }
  }

  $('clearLearn').onclick = () => {
    learned = {}; bigrams = {};
    store.set('escribe.learned', learned); store.set('escribe.bigrams', bigrams);
    $('learnCount').textContent = 'Palabras aprendidas: 0.'; renderPredict(); toast('Palabras aprendidas borradas');
  };
  $('clearHist').onclick = () => askConfirm('¿Borrar TODO el archivo? No se puede deshacer. Te conviene exportarlo antes.', () => {
    archive = []; currentId = null; saveArchive();
    $('histCount').textContent = '(0 registros)'; toast('Archivo borrado');
  });

  // ---------- Utilidades ----------
  let toastT = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3500);
  }
  function askConfirm(msg, onYes) {
    $('confirmMsg').textContent = msg;
    $('confirmOverlay').classList.remove('hidden');
    $('confirmYes').onclick = () => { $('confirmOverlay').classList.add('hidden'); onYes(); };
    $('confirmNo').onclick = () => $('confirmOverlay').classList.add('hidden');
  }

  // Guardar el texto en curso si la app se cierra o pasa a segundo plano
  document.addEventListener('visibilitychange', () => { if (document.hidden) upsertCurrent(false); });
  window.addEventListener('pagehide', () => upsertCurrent(false));

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
