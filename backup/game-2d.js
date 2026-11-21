/*
 * STEEL BREAKER
 * One jacked hero vs three evil robots (Easy / Medium / Hard), each bigger and nastier.
 * Plain canvas + Web Audio, no libraries, runs straight from the file system.
 *
 * Controls: A/D or arrows move, W/Up/Space jump, J punch (tap 3x for a combo), K kick,
 *           L or S/Down block (hold), Shift dodge-roll, I special (when the energy bar is full),
 *           P/Esc pause, M mute.
 * Debug URL params: ?level=0..2 jump straight into a level, &autoplay lets the hero fight by himself.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- setup
  const W = 1280, H = 720, GROUND = 612, ARENA_L = 70, ARENA_R = 1210;
  const STEP = 1000 / 60;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let dpr = 1, viewScale = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewScale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * viewScale}px`;
    canvas.style.height = `${H * viewScale}px`;
    canvas.width = Math.round(W * dpr * viewScale);
    canvas.height = Math.round(H * dpr * viewScale);
  }
  window.addEventListener('resize', resize);
  resize();

  const params = new URLSearchParams(location.search);
  const AUTOPLAY = params.has('autoplay');

  let fatalError = null;
  window.addEventListener('error', (e) => { fatalError = e.message || String(e); });

  // ---------------------------------------------------------------- helpers
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const overlap = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const mulberry = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  // ---------------------------------------------------------------- input
  const keys = new Set();
  const pressed = new Set();
  const GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    sfx.unlock();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); if (game.mode === 'fight') game.mode = 'paused'; });
  const isDown = (...c) => c.some((k) => keys.has(k));
  const wasPressed = (...c) => c.some((k) => pressed.has(k));

  let mouse = null;
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse = { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  });
  canvas.addEventListener('click', () => { sfx.unlock(); if (mouse) game.click(mouse.x, mouse.y); });

  // ---------------------------------------------------------------- sound (synthesised)
  const sfx = {
    ac: null, muted: store.get('steelbreaker.muted', false),
    unlock() {
      if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
      if (this.ac.state === 'suspended') this.ac.resume();
    },
    tone(freq, dur, type = 'square', vol = 0.12, slideTo = null) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime, o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ac.destination); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.3, freq = 1200) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime, len = Math.floor(this.ac.sampleRate * dur);
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
      src.connect(f).connect(g).connect(this.ac.destination); src.start(t);
    },
    punch() { this.noise(0.08, 0.35, 1800); this.tone(150, 0.09, 'sine', 0.25, 60); },
    heavy() { this.noise(0.16, 0.5, 900); this.tone(110, 0.18, 'sine', 0.4, 40); },
    whoosh() { this.noise(0.12, 0.12, 3200); },
    block() { this.tone(1100, 0.05, 'square', 0.06); this.noise(0.05, 0.15, 5000); },
    hurt() { this.tone(220, 0.15, 'sawtooth', 0.12, 90); },
    clank() { this.tone(520, 0.06, 'square', 0.08, 300); this.noise(0.06, 0.2, 2600); },
    boom() { this.noise(0.7, 0.6, 450); this.tone(70, 0.6, 'sine', 0.5, 25); },
    charge() { this.tone(200, 0.9, 'sawtooth', 0.05, 900); },
    laser() { this.tone(880, 0.12, 'sawtooth', 0.05, 860); },
    jump() { this.tone(300, 0.1, 'triangle', 0.08, 520); },
    special() { this.tone(160, 0.5, 'sawtooth', 0.12, 640); this.noise(0.4, 0.2, 2200); },
    roar() { this.tone(90, 0.8, 'sawtooth', 0.14, 45); this.noise(0.6, 0.2, 700); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.12), i * 130)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.12), i * 180)); },
    select() { this.tone(660, 0.07, 'triangle', 0.1); },
  };

  // ---------------------------------------------------------------- effects
  const particles = [];
  const texts = [];
  let shake = 0, hitstop = 0, flash = 0;

  function burst(x, y, n, color, speed = 6, size = 4, gravity = 0.25, life = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(speed * 0.3, speed);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: rand(life * 0.6, life), max: life, color, size: rand(size * 0.5, size), g: gravity });
    }
  }
  function popText(x, y, str, color = '#fff', size = 26) {
    texts.push({ x, y, str, color, size, life: 50 });
  }
  function shakeIt(n) { shake = Math.max(shake, n); }

  // ---------------------------------------------------------------- levels
  const LEVELS = [
    {
      key: 'EASY', boss: 'SCRAP SENTINEL', tagline: 'A rusty enforcer. Learn his punches.',
      scale: 1.25, hp: 420, speed: 2.4, think: [40, 70], poise: 60,
      punch: { wind: 30, dmg: 10, chain: 0 }, dash: { wind: 42, dmg: 14, speed: 13 },
      grenades: 0, slam: null, laser: null, enrageAt: 0,
      palette: { shell: ['#7b8494', '#3d4553', '#232a35', '#0b0d12'], eye: '#ff3b3b', accent: '#c2410c' },
    },
    {
      key: 'MEDIUM', boss: 'IRON WARLORD', tagline: 'Throws grenades and slams the ground. Jump the shockwaves!',
      scale: 1.6, hp: 820, speed: 2.8, think: [28, 50], poise: 90,
      punch: { wind: 24, dmg: 14, chain: 0.4 }, dash: { wind: 36, dmg: 18, speed: 15 },
      grenades: 2, grenadeDmg: 18, slam: { wind: 26, dmg: 16 }, laser: null, enrageAt: 0.3,
      palette: { shell: ['#5a5f6e', '#2a2e38', '#15171d', '#07080b'], eye: '#ff2b2b', accent: '#d4a017' },
    },
    {
      key: 'HARD', boss: 'OMEGA TITAN', tagline: 'Fires a death laser. Block it or roll through it.',
      scale: 2.0, hp: 1300, speed: 3.2, think: [18, 36], poise: 130,
      punch: { wind: 18, dmg: 18, chain: 0.6 }, dash: { wind: 30, dmg: 22, speed: 17 },
      grenades: 3, grenadeDmg: 22, slam: { wind: 20, dmg: 20 }, laser: { charge: 66, fire: 44, dmg: 3 }, enrageAt: 0.4,
      palette: { shell: ['#45454f', '#1d1d22', '#0e0e11', '#000000'], eye: '#ff1a1a', accent: '#ff2d2d' },
    },
  ];

  // ---------------------------------------------------------------- backgrounds (pre-rendered)
  const bgCache = {};
  function makeBg(level) {
    if (bgCache[level]) return bgCache[level];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const R = mulberry(level * 97 + 13);
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    if (level === 0) { sky.addColorStop(0, '#140f35'); sky.addColorStop(0.55, '#5b1d4f'); sky.addColorStop(1, '#f2793b'); }
    if (level === 1) { sky.addColorStop(0, '#0b1220'); sky.addColorStop(0.6, '#25344a'); sky.addColorStop(1, '#5f6f86'); }
    if (level === 2) { sky.addColorStop(0, '#120000'); sky.addColorStop(0.55, '#3d0707'); sky.addColorStop(1, '#8b1a10'); }
    g.fillStyle = sky; g.fillRect(0, 0, W, GROUND);

    if (level === 0) {
      // sunset + two skyline layers with lit windows
      const sun = g.createRadialGradient(900, 470, 10, 900, 470, 200);
      sun.addColorStop(0, 'rgba(255,214,140,1)'); sun.addColorStop(0.3, 'rgba(255,150,80,0.8)'); sun.addColorStop(1, 'rgba(255,120,60,0)');
      g.fillStyle = sun; g.fillRect(600, 250, 600, 400);
      [['#2a1636', 0.55, 180], ['#170c22', 0.85, 300]].forEach(([col, dens, maxH]) => {
        let x = -20;
        while (x < W) {
          const w = 50 + R() * 90, h = 80 + R() * maxH;
          g.fillStyle = col; g.fillRect(x, GROUND - h, w, h);
          for (let wy = GROUND - h + 12; wy < GROUND - 14; wy += 18) {
            for (let wx = x + 8; wx < x + w - 10; wx += 14) {
              if (R() < dens * 0.35) { g.fillStyle = R() < 0.5 ? 'rgba(255,200,120,0.75)' : 'rgba(120,200,255,0.5)'; g.fillRect(wx, wy, 6, 8); }
            }
          }
          x += w + 4;
        }
      });
    } else if (level === 1) {
      // foundry: chimneys, gantries, gears
      g.fillStyle = '#1b2433';
      for (let i = 0; i < 9; i++) {
        const x = i * 150 + R() * 60, h = 200 + R() * 220, w = 34 + R() * 20;
        g.fillRect(x, GROUND - h, w, h);
        g.fillRect(x - 8, GROUND - h, w + 16, 12);
      }
      g.fillStyle = '#121a26';
      for (let i = 0; i < 6; i++) { const x = i * 230 + 40, h = 160 + R() * 120; g.fillRect(x, GROUND - h, 180, h); }
      g.strokeStyle = '#2c3a50'; g.lineWidth = 6;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, 240 + i * 70); g.lineTo(W, 260 + i * 60); g.stroke(); }
      for (let i = 0; i < 3; i++) {
        const cx = 200 + i * 420, cy = 330 + R() * 80, r = 50 + R() * 30;
        g.strokeStyle = '#33445e'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; g.fillStyle = '#33445e'; g.fillRect(cx + Math.cos(a) * (r + 8) - 6, cy + Math.sin(a) * (r + 8) - 6, 12, 12); }
      }
      g.fillStyle = 'rgba(255,170,60,0.12)'; g.fillRect(0, GROUND - 120, W, 120);
    } else {
      // reactor core: giant ring, pillars, lava glow
      const glow = g.createRadialGradient(W / 2, 330, 20, W / 2, 330, 330);
      glow.addColorStop(0, 'rgba(255,90,40,0.9)'); glow.addColorStop(0.4, 'rgba(200,20,10,0.45)'); glow.addColorStop(1, 'rgba(120,0,0,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, GROUND);
      g.strokeStyle = '#2a0505'; g.lineWidth = 36; g.beginPath(); g.arc(W / 2, 330, 210, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#ff5a2a'; g.lineWidth = 4; g.beginPath(); g.arc(W / 2, 330, 210, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#160202';
      for (let i = 0; i < 6; i++) { const x = i * 240 - 20; g.fillRect(x, 120, 70, GROUND - 120); g.fillRect(x - 14, 110, 98, 24); }
    }

    // floor
    const fl = g.createLinearGradient(0, GROUND, 0, H);
    const floors = [['#2a1730', '#0d0712'], ['#2b313b', '#101318'], ['#2a0a08', '#0a0202']][level];
    fl.addColorStop(0, floors[0]); fl.addColorStop(1, floors[1]);
    g.fillStyle = fl; g.fillRect(0, GROUND, W, H - GROUND);
    g.strokeStyle = ['rgba(255,120,200,0.18)', 'rgba(160,190,230,0.15)', 'rgba(255,80,40,0.25)'][level];
    g.lineWidth = 1.5;
    for (let i = -20; i <= 20; i++) { g.beginPath(); g.moveTo(W / 2 + i * 40, GROUND); g.lineTo(W / 2 + i * 130, H); g.stroke(); }
    for (let y = GROUND + 12, s = 10; y < H; s *= 1.35, y += s) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    if (level === 1) { // hazard stripes at the edge
      for (let x = 0; x < W; x += 40) { g.fillStyle = (x / 40) % 2 ? '#d4a017' : '#111'; g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x + 40, GROUND); g.lineTo(x + 30, GROUND + 8); g.lineTo(x - 10, GROUND + 8); g.fill(); }
    }
    if (level === 2) { // glowing lava cracks
      g.strokeStyle = '#ff4a1a'; g.lineWidth = 3; g.shadowColor = '#ff3a00'; g.shadowBlur = 12;
      for (let i = 0; i < 9; i++) { let x = R() * W, y = GROUND + 10 + R() * 80; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += rand(-40, 60); y += rand(4, 18); g.lineTo(x, y); } g.stroke(); }
      g.shadowBlur = 0;
    }
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, GROUND, W, 2);
    bgCache[level] = c;
    return c;
  }

  // ---------------------------------------------------------------- hero
  const HERO_MOVES = {
    punch1: { wind: 5, active: 5, rec: 11, dmg: 9, reach: [20, 100], y: [-168, -128], kb: 3, poise: 8, energy: 7, sfx: 'punch', lunge: 2.5 },
    punch2: { wind: 4, active: 5, rec: 12, dmg: 11, reach: [10, 96], y: [-168, -128], kb: 3, poise: 10, energy: 7, sfx: 'punch', lunge: 2.5 },
    upper: { wind: 7, active: 6, rec: 20, dmg: 18, reach: [10, 90], y: [-210, -120], kb: 7, poise: 30, energy: 10, sfx: 'heavy', lunge: 3 },
    kick: { wind: 9, active: 6, rec: 16, dmg: 16, reach: [20, 128], y: [-120, -70], kb: 8, poise: 22, energy: 9, sfx: 'heavy', lunge: 1.5 },
    airkick: { wind: 4, active: 16, rec: 6, dmg: 13, reach: [10, 96], y: [-80, -10], kb: 6, poise: 16, energy: 8, sfx: 'heavy', lunge: 0 },
  };
  const COMBO_NEXT = { punch1: 'punch2', punch2: 'upper' };

  const POSES = {
    idle: { lean: 0.05, bob: 0, fu: 0.55, ff: 2.55, bu: 0.25, bf: 2.85, ft: 0.28, fs: 0.05, bt: -0.25, bs: -0.05, head: 0 },
    walkA: { lean: 0.08, bob: -2, fu: 0.55, ff: 2.55, bu: 0.25, bf: 2.85, ft: 0.55, fs: 0.2, bt: -0.45, bs: -0.6, head: 0 },
    walkB: { lean: 0.08, bob: -2, fu: 0.55, ff: 2.55, bu: 0.25, bf: 2.85, ft: -0.2, fs: -0.65, bt: 0.35, bs: 0.15, head: 0 },
    windPunch: { lean: -0.05, bob: 0, fu: 0.1, ff: 2.9, bu: 0.3, bf: 2.8, ft: 0.3, fs: 0.05, bt: -0.3, bs: -0.05, head: 0 },
    punch: { lean: 0.16, bob: 0, fu: 1.57, ff: 1.57, bu: 0.15, bf: 2.8, ft: 0.4, fs: 0.1, bt: -0.4, bs: -0.1, head: 0.05 },
    cross: { lean: 0.22, bob: 0, fu: 0.5, ff: 2.6, bu: 1.45, bf: 1.6, ft: 0.4, fs: 0.1, bt: -0.4, bs: -0.1, head: 0.05 },
    windUpper: { lean: 0.15, bob: 6, fu: 0.2, ff: 0.6, bu: 0.3, bf: 2.8, ft: 0.4, fs: -0.1, bt: -0.4, bs: -0.2, head: 0 },
    upper: { lean: -0.12, bob: -8, fu: 2.6, ff: 3.0, bu: 0.3, bf: 2.6, ft: 0.25, fs: 0.1, bt: -0.3, bs: 0, head: -0.15 },
    windKick: { lean: -0.1, bob: 0, fu: 0.7, ff: 2.5, bu: 0.4, bf: 2.6, ft: 0.9, fs: -0.4, bt: -0.15, bs: 0, head: 0 },
    kick: { lean: -0.3, bob: 0, fu: 0.9, ff: 2.4, bu: -0.5, bf: 0.3, ft: 1.6, fs: 1.6, bt: -0.1, bs: 0, head: 0.1 },
    jump: { lean: 0.05, bob: -10, fu: 0.9, ff: 2.6, bu: 0.6, bf: 2.6, ft: 0.95, fs: -0.3, bt: 0.4, bs: -0.6, head: 0 },
    airkick: { lean: -0.25, bob: -6, fu: 1.0, ff: 2.4, bu: -0.6, bf: 0.5, ft: 1.15, fs: 1.15, bt: 0.5, bs: -0.5, head: 0.1 },
    block: { lean: 0.02, bob: 4, fu: 1.25, ff: 2.95, bu: 1.15, bf: 3.05, ft: 0.35, fs: 0.1, bt: -0.3, bs: -0.1, head: 0.1 },
    hurt: { lean: -0.35, bob: 2, fu: -0.3, ff: 0.6, bu: -0.6, bf: 0.2, ft: 0.4, fs: 0.2, bt: -0.4, bs: -0.2, head: -0.3 },
    roll: { lean: 0.3, bob: 26, fu: 1.6, ff: 2.8, bu: 1.4, bf: 2.8, ft: 1.8, fs: -0.2, bt: 1.4, bs: -0.4, head: 0.3 },
    raise: { lean: -0.05, bob: -4, fu: 3.0, ff: 3.1, bu: -3.0, bf: -3.1, ft: 0.6, fs: -0.2, bt: -0.6, bs: 0.2, head: -0.2 },
    smash: { lean: 0.35, bob: 10, fu: 1.1, ff: 1.0, bu: 1.0, bf: 0.9, ft: 0.7, fs: -0.1, bt: -0.6, bs: 0.3, head: 0.2 },
    flex: { lean: 0, bob: 0, fu: 1.6, ff: 3.1, bu: -1.6, bf: -3.1, ft: 0.25, fs: 0, bt: -0.25, bs: 0, head: -0.1 },
    dead: { lean: 0, bob: 0, fu: 0.2, ff: 0.2, bu: -0.2, bf: -0.2, ft: 0.1, fs: 0.1, bt: -0.1, bs: -0.1, head: 0 },
  };
  const POSE_KEYS = Object.keys(POSES.idle);

  class Hero {
    constructor() {
      this.x = 260; this.y = GROUND; this.vx = 0; this.vy = 0; this.face = 1;
      this.maxHp = 200; this.hp = 200; this.trail = 200; this.energy = 0;
      this.state = 'idle'; this.t = 0; this.move = null; this.queued = false; this.hasHit = false;
      this.onGround = true; this.inv = 0; this.dodgeCd = 0; this.stun = 0; this.combo = 0; this.comboTimer = 0;
      this.pose = { ...POSES.idle }; this.walkPhase = 0; this.deathT = 0; this.maxCombo = 0; this.damageTaken = 0;
    }
    get hurtbox() {
      if (this.state === 'dead') return null;
      if (this.state === 'dodge') return { x: this.x - 30, y: this.y - 80, w: 60, h: 80 };
      return { x: this.x - 30, y: this.y - 190, w: 60, h: 190 };
    }
    setState(s) { this.state = s; this.t = 0; }
    attack(name) {
      this.move = name; this.setState('attack'); this.hasHit = false; this.queued = false;
      sfx.whoosh();
    }
    attackBox() {
      const m = HERO_MOVES[this.move];
      const x0 = this.x + this.face * m.reach[0], x1 = this.x + this.face * m.reach[1];
      return { x: Math.min(x0, x1), y: this.y + m.y[0], w: Math.abs(x1 - x0), h: m.y[1] - m.y[0] };
    }
    update(c, boss) {
      this.t++;
      if (this.inv > 0) this.inv--;
      if (this.dodgeCd > 0) this.dodgeCd--;
      if (this.comboTimer > 0 && --this.comboTimer === 0) this.combo = 0;
      const toBoss = boss ? Math.sign(boss.x - this.x) || this.face : this.face;
      const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);

      switch (this.state) {
        case 'idle': case 'walk': {
          this.face = toBoss;
          if (c.special && this.energy >= 100) { this.startSpecial(boss); break; }
          if (c.punch) { this.attack('punch1'); break; }
          if (c.kick) { this.attack('kick'); break; }
          if (c.dodge && this.dodgeCd === 0) { this.setState('dodge'); this.inv = 22; this.vx = (dir || this.face) * 11; sfx.whoosh(); break; }
          if (c.block) { this.setState('block'); this.vx = 0; break; }
          if (c.jump) { this.vy = -17.5; this.onGround = false; this.setState('jump'); sfx.jump(); break; }
          this.vx = dir * 5.2;
          const ns = dir ? 'walk' : 'idle';
          if (ns !== this.state) this.state = ns;
          if (dir) this.walkPhase += 0.22;
          break;
        }
        case 'jump':
          this.vx = lerp(this.vx, dir * 5, 0.2);
          if (c.kick || c.punch) { this.attack('airkick'); }
          break;
        case 'attack': {
          const m = HERO_MOVES[this.move];
          if (c.punch && COMBO_NEXT[this.move]) this.queued = true;
          if (this.onGround) this.vx = this.t <= m.wind + 2 ? this.face * m.lunge : this.vx * 0.7;
          if (this.t > m.wind && this.t <= m.wind + m.active) this.checkHit(boss, m);
          if (this.move === 'airkick') { this.vx = lerp(this.vx, this.face * 6, 0.3); if (this.onGround) this.setState('idle'); break; }
          if (this.t >= m.wind + m.active + m.rec || (this.queued && this.t >= m.wind + m.active + 3)) {
            if (this.queued && COMBO_NEXT[this.move]) this.attack(COMBO_NEXT[this.move]);
            else this.setState('idle');
          }
          break;
        }
        case 'block':
          this.vx = 0;
          this.face = toBoss;
          if (!c.block) this.setState('idle');
          break;
        case 'dodge':
          this.vx *= 0.94;
          if (this.t >= 22) { this.setState('idle'); this.dodgeCd = 30; }
          break;
        case 'hurt':
          this.vx *= 0.86;
          if (--this.stun <= 0 && this.onGround) this.setState('idle');
          break;
        case 'special':
          this.updateSpecial(boss);
          break;
        case 'dead':
          this.vx *= 0.9; this.deathT++;
          break;
        case 'victory':
          this.vx = 0;
          break;
      }

      // physics
      if (!this.onGround) this.vy += 0.9;
      this.x += this.vx; this.y += this.vy;
      if (this.y >= GROUND) {
        this.y = GROUND; this.vy = 0;
        if (!this.onGround) {
          this.onGround = true;
          if (this.state === 'jump' || (this.state === 'attack' && this.move === 'airkick')) this.setState('idle');
        }
      }
      this.x = clamp(this.x, ARENA_L, ARENA_R);
      this.animate();
    }
    checkHit(boss, m) {
      const box = this.attackBox();
      // swat grenades back at the boss (any attack reaches down to the floor for this)
      const swat = { x: box.x, y: box.y, w: box.w, h: this.y + 8 - box.y };
      for (const g of game.grenades) {
        if (!g.reflected && overlap(swat, { x: g.x - 14, y: g.y - 14, w: 28, h: 28 })) {
          g.reflected = true; g.vx = this.face * 13; g.vy = -7; g.fuse = 40; g.landed = false;
          popText(g.x, g.y - 30, 'RETURNED!', '#7dd3fc', 22); sfx.clank(); hitstop = 4;
        }
      }
      if (this.hasHit || !boss || !boss.alive) return;
      if (overlap(box, boss.hurtbox)) {
        this.hasHit = true;
        const crit = this.combo >= 6 ? 1.2 : 1;
        boss.takeHit(Math.round(m.dmg * crit), m.poise, this.face * m.kb, box.x + box.w / 2, box.y + box.h / 2);
        this.energy = Math.min(100, this.energy + m.energy);
        this.combo++; this.comboTimer = 70; this.maxCombo = Math.max(this.maxCombo, this.combo);
        sfx[m.sfx]();
        hitstop = m.sfx === 'heavy' ? 6 : 3;
      }
    }
    startSpecial(boss) {
      this.setState('special'); this.energy = 0; this.inv = 60;
      this.vy = -21; this.onGround = false;
      this.specialTarget = boss ? boss.x - this.face * 90 : this.x;
      sfx.special();
      popText(this.x, this.y - 230, 'TITAN SMASH!', '#7dd3fc', 34);
    }
    updateSpecial(boss) {
      if (!this.onGround) {
        this.vx = (this.specialTarget - this.x) * 0.06;
        if (this.vy > 0) this.vy += 0.9; // slam down faster
        burst(this.x, this.y - 100, 1, '#7dd3fc', 2, 5, 0, 20);
        return;
      }
      if (!this.smashed) {
        this.smashed = true; this.t = 0; this.vx = 0;
        shakeIt(22); flash = 10; sfx.boom();
        burst(this.x, GROUND, 60, '#7dd3fc', 14, 7, 0.3, 45);
        burst(this.x, GROUND, 30, '#ffffff', 10, 4, 0.2, 30);
        game.rings.push({ x: this.x, y: GROUND, r: 10, life: 30, color: '125,211,252' });
        if (boss && boss.alive && Math.abs(boss.x - this.x) < 230 + 50 * boss.s) {
          boss.takeHit(70, 999, this.face * 12, boss.x, boss.y - 100 * boss.s);
          this.combo++; this.comboTimer = 70; this.maxCombo = Math.max(this.maxCombo, this.combo);
        }
      }
      if (this.t > 28) { this.smashed = false; this.setState('idle'); }
    }
    takeHit(dmg, fromX, kind = 'hit') {
      if (this.state === 'dead' || this.state === 'victory') return false;
      if (this.inv > 0) { if (this.state === 'dodge' && kind !== 'tick') popText(this.x, this.y - 210, 'DODGE', '#a7f3d0', 18); return false; }
      const attackerDir = Math.sign(fromX - this.x) || -this.face;
      if (this.state === 'block' && attackerDir === this.face) {
        const mult = kind === 'blast' ? 0.35 : kind === 'tick' ? 0.25 : 0.15;
        const d = Math.max(1, Math.round(dmg * mult));
        this.hp -= d; this.damageTaken += d;
        this.vx = -attackerDir * 3;
        if (kind !== 'tick') { sfx.block(); burst(this.x + this.face * 30, this.y - 140, 10, '#93c5fd', 5, 3); popText(this.x, this.y - 210, 'BLOCK', '#93c5fd', 18); }
        this.energy = Math.min(100, this.energy + 2);
      } else {
        this.hp -= dmg; this.damageTaken += dmg;
        this.combo = 0;
        burst(this.x, this.y - 120, 14, '#ff6b6b', 6, 4);
        popText(this.x, this.y - 210, `-${dmg}`, '#ff6b6b', 24);
        if (kind !== 'tick') {
          this.setState('hurt'); this.stun = kind === 'blast' ? 26 : 18;
          this.vx = -attackerDir * (kind === 'blast' ? 9 : 7);
          if (kind === 'blast' || dmg >= 16) { this.vy = -7; this.onGround = false; }
          this.inv = 24; sfx.hurt(); shakeIt(8);
        }
        this.energy = Math.min(100, this.energy + 4);
      }
      if (this.hp <= 0) { this.hp = 0; this.setState('dead'); this.inv = 0; game.onHeroDown(); }
      return true;
    }
    animate() {
      let target;
      const m = this.move && HERO_MOVES[this.move];
      switch (this.state) {
        case 'walk': target = Math.sin(this.walkPhase) > 0 ? POSES.walkA : POSES.walkB; break;
        case 'jump': target = POSES.jump; break;
        case 'attack':
          if (this.move === 'airkick') { target = POSES.airkick; break; }
          if (this.t <= m.wind) target = this.move === 'kick' ? POSES.windKick : this.move === 'upper' ? POSES.windUpper : POSES.windPunch;
          else target = { punch1: POSES.punch, punch2: POSES.cross, upper: POSES.upper, kick: POSES.kick }[this.move];
          break;
        case 'block': target = POSES.block; break;
        case 'hurt': target = POSES.hurt; break;
        case 'dodge': target = POSES.roll; break;
        case 'special': target = this.onGround && this.smashed ? POSES.smash : (this.vy < 0 ? POSES.raise : POSES.smash); break;
        case 'victory': target = POSES.flex; break;
        case 'dead': target = POSES.dead; break;
        default: target = POSES.idle;
      }
      const k = this.state === 'attack' ? 0.55 : 0.3;
      for (const key of POSE_KEYS) this.pose[key] = lerp(this.pose[key], target[key], k);
    }
  }

  // ---------------------------------------------------------------- hero drawing
  const SKIN = '#c98a52', SKIN_DK = '#9a6232', SKIN_LT = '#e8b07a';
  const PANTS = '#26334d', PANTS_DK = '#18223a', BOOT = '#151515', GLOVE = '#1c1c1c', BAND = '#e53935';

  function limb(x1, y1, x2, y2, r1, r2, fill) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.arc(x1, y1, r1, a + Math.PI / 2, a + Math.PI * 1.5);
    ctx.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }
  const vec = (a, len) => [Math.sin(a) * len, Math.cos(a) * len];

  function drawArm(sx, sy, ua, fa, front) {
    const [ex, ey] = vec(ua, 38), elbow = [sx + ex, sy + ey];
    const [wx, wy] = vec(fa, 34), wrist = [elbow[0] + wx, elbow[1] + wy];
    // deltoid
    ctx.fillStyle = front ? SKIN : SKIN_DK;
    ctx.beginPath(); ctx.arc(sx, sy + 4, 19, 0, Math.PI * 2); ctx.fill();
    limb(sx, sy, elbow[0], elbow[1], 15, 12, front ? SKIN : SKIN_DK);
    // biceps bulge
    ctx.save();
    ctx.translate((sx + elbow[0]) / 2, (sy + elbow[1]) / 2);
    ctx.rotate(Math.atan2(elbow[1] - sy, elbow[0] - sx));
    ctx.fillStyle = front ? SKIN_LT : SKIN;
    ctx.beginPath(); ctx.ellipse(0, -5, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    limb(elbow[0], elbow[1], wrist[0], wrist[1], 13, 11, front ? SKIN : SKIN_DK);
    // wrist wrap + fist
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath(); ctx.arc(wrist[0], wrist[1], 10, 0, Math.PI * 2); ctx.fill();
    const [fx, fy] = vec(fa, 9);
    ctx.fillStyle = GLOVE;
    ctx.beginPath(); ctx.arc(wrist[0] + fx, wrist[1] + fy, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(wrist[0] + fx - 3, wrist[1] + fy - 4, 4, 0, Math.PI * 2); ctx.fill();
  }

  function drawLeg(hx, hy, ta, sa, front) {
    const [kx, ky] = vec(ta, 46), knee = [hx + kx, hy + ky];
    const [ax, ay] = vec(sa, 44), ankle = [knee[0] + ax, knee[1] + ay];
    limb(hx, hy, knee[0], knee[1], 19, 14, front ? PANTS : PANTS_DK);
    limb(knee[0], knee[1], ankle[0], ankle[1], 14, 11, front ? PANTS : PANTS_DK);
    // boot points along the shin's "forward" direction
    ctx.save();
    ctx.translate(ankle[0], ankle[1]);
    ctx.rotate(-sa);
    ctx.fillStyle = BOOT;
    ctx.beginPath();
    ctx.moveTo(-11, -12); ctx.lineTo(12, -12); ctx.lineTo(14, 4); ctx.quadraticCurveTo(30, 4, 30, 12); ctx.lineTo(-12, 12); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHero(h) {
    const p = h.pose;
    ctx.save();
    // ground shadow
    const air = GROUND - h.y;
    ctx.fillStyle = `rgba(0,0,0,${0.35 * Math.max(0.2, 1 - air / 300)})`;
    ctx.beginPath(); ctx.ellipse(h.x, GROUND + 4, 48 * Math.max(0.4, 1 - air / 400), 10, 0, 0, Math.PI * 2); ctx.fill();

    ctx.translate(h.x, h.y);
    ctx.scale(h.face, 1);
    if (h.inv > 0 && h.state === 'hurt' && (h.inv >> 2) % 2) ctx.globalAlpha = 0.55;
    if (h.state === 'dodge') { ctx.translate(0, -60); ctx.rotate(h.t / 22 * Math.PI * 2); ctx.translate(0, 60); ctx.globalAlpha = 0.85; }
    if (h.state === 'dead') {
      const k = Math.min(1, h.deathT / 24);
      ctx.translate(-40 * k, -18 * k);
      ctx.rotate(-Math.PI / 2 * k);
    }
    if (h.state === 'special' && !h.onGround) { ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 30; }

    const hipY = -96 + p.bob;
    const rot = (x, y) => { // point in torso space (around the hip) -> body space
      const c = Math.cos(p.lean), s = Math.sin(p.lean);
      return [x * c - y * s, hipY + x * s + y * c];
    };

    // back limbs
    drawLeg(-12, hipY, p.bt, p.bs, false);
    const [bsx, bsy] = rot(-40, -66);
    drawArm(bsx, bsy, p.bu, p.bf, false);

    // torso (V-taper, pecs, abs)
    ctx.save();
    ctx.translate(0, hipY); ctx.rotate(p.lean);
    const tg = ctx.createLinearGradient(-50, -80, 50, 0);
    tg.addColorStop(0, SKIN_LT); tg.addColorStop(0.5, SKIN); tg.addColorStop(1, SKIN_DK);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-24, 4); ctx.quadraticCurveTo(-34, -30, -48, -58); ctx.quadraticCurveTo(-52, -72, -36, -78);
    ctx.lineTo(36, -78); ctx.quadraticCurveTo(52, -72, 48, -58); ctx.quadraticCurveTo(34, -30, 24, 4); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = SKIN_DK; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-30, -60); ctx.quadraticCurveTo(-16, -44, 0, -52); ctx.quadraticCurveTo(16, -44, 30, -60); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(0, -4); ctx.stroke();
    for (let i = 0; i < 3; i++) { const y = -38 + i * 12; ctx.beginPath(); ctx.moveTo(-14, y); ctx.lineTo(-3, y + 1); ctx.moveTo(3, y + 1); ctx.lineTo(14, y); ctx.stroke(); }
    // belt
    ctx.fillStyle = '#4a2f1d'; ctx.fillRect(-27, -4, 54, 12);
    ctx.fillStyle = '#d4a017'; ctx.fillRect(-7, -3, 14, 10);
    ctx.restore();

    // front leg
    drawLeg(12, hipY, p.ft, p.fs, true);

    // head
    const [nx, ny] = rot(4, -80);
    ctx.save();
    ctx.translate(nx, ny); ctx.rotate(p.lean + p.head);
    ctx.fillStyle = SKIN_DK; ctx.fillRect(-9, -12, 18, 16); // neck
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.roundRect(-16, -48, 34, 40, 10); ctx.fill(); // head with a square jaw
    ctx.fillStyle = '#1b1210';
    ctx.beginPath(); ctx.roundRect(-17, -52, 36, 14, [8, 8, 2, 2]); ctx.fill(); // flat-top hair
    ctx.fillStyle = BAND; ctx.fillRect(-17, -42, 36, 7); // headband
    const wave = Math.sin(game.time * 0.25) * 4;
    ctx.beginPath(); ctx.moveTo(-17, -42); ctx.quadraticCurveTo(-30, -40 + wave, -40, -32 + wave); ctx.lineTo(-38, -27 + wave); ctx.quadraticCurveTo(-28, -34, -17, -35); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(6, -31, 8, 4); // eye
    ctx.fillStyle = '#111'; ctx.fillRect(10, -31, 3, 4);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(4, -35); ctx.lineTo(16, -33); ctx.stroke(); // angry brow
    ctx.strokeStyle = SKIN_DK; ctx.lineWidth = 2;
    ctx.beginPath();
    if (h.state === 'victory') { ctx.arc(10, -19, 5, 0.1, Math.PI - 0.1); } else { ctx.moveTo(6, -17); ctx.lineTo(15, -18); }
    ctx.stroke();
    ctx.restore();

    // front arm
    const [fsx, fsy] = rot(40, -66);
    drawArm(fsx, fsy, p.fu, p.ff, true);

    ctx.restore();
  }

  // ---------------------------------------------------------------- boss
  const P = {
    body: new Path2D('M80 100 C110 100 120 130 114 152 C108 174 52 174 46 152 C40 130 50 100 80 100 Z'),
    head: new Path2D('M80 26 C114 26 128 46 126 64 C124 84 104 92 80 92 C56 92 36 84 34 64 C32 46 46 26 80 26 Z'),
    hornL: new Path2D('M54 36 L44 10 L68 30 Z'),
    hornR: new Path2D('M106 36 L116 10 L92 30 Z'),
    bigHornL: new Path2D('M52 38 L30 0 L70 28 Z'),
    bigHornR: new Path2D('M108 38 L130 0 L90 28 Z'),
    eyeL: new Path2D('M57 56 L76 63 Q75 69 67 69 Q58 68 57 56 Z'),
    eyeR: new Path2D('M103 56 L84 63 Q85 69 93 69 Q102 68 103 56 Z'),
    mouth: new Path2D('M66 74 L70 77 L74 74 L78 77 L82 74 L86 77 L90 74 L94 77'),
    cracks: new Path2D('M62 112 L70 124 L64 136 L72 150 M98 110 L92 126 L100 140 M80 150 L84 162'),
  };

  class Boss {
    constructor(levelIdx) {
      this.L = LEVELS[levelIdx]; this.level = levelIdx;
      this.s = this.L.scale;
      this.x = 1000; this.y = GROUND; this.vx = 0; this.vy = 0; this.face = -1; this.onGround = true;
      this.maxHp = this.L.hp; this.hp = this.maxHp; this.trail = this.maxHp;
      this.state = 'intro'; this.t = 0; this.wait = 70; this.poise = 0; this.enraged = false;
      this.cd = { grenade: 120, laser: 200 }; this.hasHit = false; this.flashT = 0;
      this.armRot = 0; this.backArmRot = 0; this.bob = 0; this.step = 0; this.alive = true; this.deathT = 0;
      this.chained = false; this.recentHits = 0;
    }
    get k() { return this.s * 1.1; } // drawing scale (SVG units -> px): ~255 / 330 / 410 px tall
    get hurtbox() {
      if (!this.alive) return null;
      const k = this.k;
      return { x: this.x - 44 * k, y: this.y - 176 * k, w: 88 * k, h: 176 * k };
    }
    get reach() { return 70 * this.k + 40; }
    setState(s) { this.state = s; this.t = 0; this.hasHit = false; }
    speedMul() { return this.enraged ? 1.3 : 1; }

    think(hero) {
      const L = this.L, dx = hero.x - this.x, dist = Math.abs(dx);
      this.face = Math.sign(dx) || this.face;
      const opts = [];
      const near = dist < this.reach + 30;
      if (near) {
        opts.push(['punch', 6]);
        if (L.slam) opts.push(['slam', 2]);
        opts.push(['retreat', 1]);
      } else {
        opts.push(['approach', 5]);
        if (dist > 260) opts.push(['dash', 2]);
        if (L.grenades && this.cd.grenade <= 0 && dist > 220) opts.push(['grenade', 3]);
        if (L.laser && this.cd.laser <= 0 && dist > 240) opts.push(['laser', 3]);
        if (L.slam && dist < 500) opts.push(['slam', 1]);
      }
      let total = opts.reduce((s, o) => s + o[1], 0), r = Math.random() * total, pick = opts[0][0];
      for (const [name, w] of opts) { if ((r -= w) <= 0) { pick = name; break; } }
      this.setState(pick);
      if (pick === 'approach') this.wait = Math.round(rand(40, 80));
      if (pick === 'retreat') this.wait = 30;
      if (pick === 'grenade') this.cd.grenade = this.enraged ? 200 : 300;
      if (pick === 'laser') { this.cd.laser = this.enraged ? 300 : 420; sfx.charge(); }
    }

    update(hero) {
      this.t++;
      if (this.flashT > 0) this.flashT--;
      for (const k in this.cd) if (this.cd[k] > 0) this.cd[k]--;
      if (this.poise > 0) this.poise -= 0.25;
      if (this.recentHits > 0) this.recentHits -= 0.02;
      this.trail = Math.max(this.hp, this.trail - 1.2);
      const L = this.L, sm = this.speedMul(), dist = Math.abs(hero.x - this.x);
      let targetArm = 0, targetBack = 0;

      if (!this.alive) { this.updateDeath(); return; }
      if (!this.enraged && L.enrageAt && this.hp <= this.maxHp * L.enrageAt) {
        this.enraged = true; popText(this.x, this.y - 210 * this.k, 'ENRAGED!', '#ff3b3b', 40); sfx.roar(); shakeIt(14);
      }
      if (hero.state === 'dead' && this.state !== 'gloat') this.setState('gloat');

      switch (this.state) {
        case 'intro':
          targetArm = this.t > 20 && this.t < 60 ? -2.6 : 0;
          if (this.t === 20) { sfx.roar(); shakeIt(10); }
          if (this.t >= this.wait) this.setState('idle');
          break;
        case 'idle':
          this.vx *= 0.8;
          if (this.thinkAt == null) this.thinkAt = rand(...L.think) / sm;
          if (this.t >= this.thinkAt) { this.thinkAt = null; this.think(hero); }
          break;
        case 'approach':
          this.face = Math.sign(hero.x - this.x) || this.face;
          this.vx = this.face * L.speed * sm; this.step += 0.18;
          if (dist < this.reach || this.t > this.wait) { this.vx = 0; this.setState('idle'); this.t = 999; }
          break;
        case 'retreat':
          this.vx = -this.face * L.speed * sm; this.step += 0.18;
          if (this.t > this.wait) { this.vx = 0; this.setState('idle'); }
          break;
        case 'punch': {
          const wind = Math.round(L.punch.wind / sm);
          this.vx *= 0.7;
          if (this.t < wind) { targetArm = 0.9; this.telegraph = true; } // pull back
          else if (this.t < wind + 10) {
            targetArm = -Math.PI / 2;
            if (this.t === wind) { this.vx = this.face * 7; sfx.whoosh(); }
            if (!this.hasHit) {
              const box = this.frontBox(this.reach + 20, -120, -60);
              if (overlap(box, hero.hurtbox) && hero.takeHit(L.punch.dmg, this.x)) { this.hasHit = true; hitstop = 5; sfx.heavy(); }
              else if (overlap(box, hero.hurtbox)) this.hasHit = true;
            }
          } else {
            targetArm = -0.4;
            if (this.t > wind + 34) {
              if (!this.chained && Math.random() < L.punch.chain) { this.chained = true; this.setState('punch'); this.t = Math.round(wind * 0.4); }
              else { this.chained = false; this.setState('idle'); }
            }
          }
          break;
        }
        case 'dash': {
          const wind = Math.round(L.dash.wind / sm);
          if (this.t < wind) { this.vx = -this.face * 0.6; targetArm = 0.6; targetBack = 0.6; this.telegraph = true; if (this.t % 4 === 0) burst(this.x - this.face * 40, this.y - 10, 2, '#ffb366', 3, 3, 0.1, 15); }
          else if (this.t === wind) { this.vx = this.face * L.dash.speed * sm; this.dashFrom = this.x; sfx.whoosh(); }
          else {
            targetArm = -1.2; targetBack = -1.2;
            if (this.t % 2 === 0) burst(this.x - this.face * 50 * this.k, this.y - 40, 2, '#ffd166', 2, 4, 0, 14);
            if (!this.hasHit && overlap(this.hurtbox, hero.hurtbox) && hero.takeHit(L.dash.dmg, this.x - this.face * 40, 'blast')) { this.hasHit = true; hitstop = 6; sfx.heavy(); shakeIt(12); }
            const passed = (hero.x - this.x) * this.face < -150 || Math.abs(this.x - this.dashFrom) > 900;
            if (passed || this.x <= ARENA_L + 40 || this.x >= ARENA_R - 40) { this.vx = 0; this.setState('recover'); this.wait = 34; }
          }
          break;
        }
        case 'slam': {
          const wind = Math.round(L.slam.wind / sm);
          if (this.t < wind) { targetArm = -2.8; targetBack = -2.8; this.telegraph = true; this.vx = 0; }
          else if (this.t === wind) { this.vy = -17; this.onGround = false; this.vx = clamp((hero.x - this.x) / 40, -8, 8); }
          else if (this.onGround) {
            shakeIt(18); sfx.boom();
            burst(this.x, GROUND, 30, '#ffb366', 9, 5, 0.3, 30);
            for (const d of [-1, 1]) game.waves.push({ x: this.x + d * 50 * this.k, dir: d, speed: 9 * sm, life: 80, h: 40 + 20 * this.s, dmg: L.slam.dmg, hit: false });
            this.setState('recover'); this.wait = 40;
          } else { targetArm = -2.2; targetBack = -2.2; }
          break;
        }
        case 'grenade': {
          if (this.t < 26) { targetArm = -2.7; this.telegraph = true; this.vx = 0; }
          else if (this.t === 26) {
            const n = L.grenades + (this.enraged ? 1 : 0);
            for (let i = 0; i < n; i++) {
              const tx = hero.x + (i - (n - 1) / 2) * 90 + rand(-20, 20);
              const flight = 48;
              const sx = this.x + this.face * 50 * this.k, sy = this.y - 120 * this.k;
              // lands on tx after `flight` frames under gravity 0.45
              const vy = ((GROUND - 10) - sy - 0.5 * 0.45 * flight * flight) / flight;
              game.grenades.push({ x: sx, y: sy, vx: (tx - sx) / flight, vy, fuse: -1, landed: false, reflected: false, dmg: L.grenadeDmg, spin: 0 });
            }
            sfx.whoosh();
          } else { targetArm = -0.8; if (this.t > 50) this.setState('idle'); }
          break;
        }
        case 'laser': {
          const lz = L.laser, charge = Math.round(lz.charge / sm);
          this.vx = 0; this.face = this.t < charge * 0.6 ? Math.sign(hero.x - this.x) || this.face : this.face;
          targetArm = -1.5; targetBack = -1.5;
          if (this.t < charge) { this.telegraph = true; if (this.t % 3 === 0) burst(this.eyeX(), this.eyeY(), 1, '#ff3b3b', 2, 3, 0, 12); }
          else if (this.t < charge + lz.fire) {
            if (this.t === charge) { sfx.boom(); shakeIt(10); }
            if (this.t % 6 === 0) sfx.laser();
            shakeIt(4);
            if (this.t % 4 === 0) {
              const beam = this.beamBox();
              if (overlap(beam, hero.hurtbox)) hero.takeHit(lz.dmg, this.x, 'tick');
            }
          } else if (this.t > charge + lz.fire + 26) this.setState('idle');
          break;
        }
        case 'recover':
          this.vx *= 0.85;
          if (this.t > this.wait) this.setState('idle');
          break;
        case 'shove': // anti-mash: a quick energy burst that throws the hero back
          this.vx = 0; targetArm = -1.4; targetBack = -1.4; this.telegraph = this.t < 12;
          if (this.t === 12) {
            sfx.heavy(); shakeIt(10);
            game.rings.push({ x: this.x, y: this.y - 90 * this.k, r: 20, life: 20, color: '255,80,60' });
            burst(this.x, this.y - 90 * this.k, 24, '#ff6b4a', 9, 4, 0.1, 22);
            if (Math.abs(hero.x - this.x) < 60 * this.k + 90) hero.takeHit(6 + this.level * 3, this.x, 'blast');
          }
          if (this.t > 34) this.setState('idle');
          break;
        case 'stagger':
          this.vx *= 0.9; targetArm = 0.8; targetBack = 0.8;
          if (this.t % 6 === 0) burst(this.x + rand(-30, 30) * this.k, this.y - rand(60, 160) * this.k, 3, '#ffd166', 4, 3, 0.2, 20);
          if (this.t > 70) this.setState('idle');
          break;
        case 'gloat':
          this.vx = 0; targetArm = Math.sin(this.t * 0.2) * 0.4 - 2.4;
          break;
      }
      if (!['punch', 'dash', 'slam', 'grenade', 'laser', 'shove'].includes(this.state)) this.telegraph = false;

      // physics
      if (!this.onGround) this.vy += 0.8;
      this.x += this.vx; this.y += this.vy;
      if (this.y >= GROUND) { this.y = GROUND; this.vy = 0; this.onGround = true; }
      this.x = clamp(this.x, ARENA_L + 30, ARENA_R - 30);
      this.armRot = lerp(this.armRot, targetArm, 0.35);
      this.backArmRot = lerp(this.backArmRot, targetBack, 0.25);
      this.bob = Math.sin(game.time * 0.08) * 4;
    }
    frontBox(reach, y0, y1) {
      const x0 = this.x, x1 = this.x + this.face * reach;
      return { x: Math.min(x0, x1), y: this.y + y0 * this.k, w: Math.abs(x1 - x0), h: (y1 - y0) * this.k };
    }
    eyeX() { return this.x + this.face * 14 * this.k; }
    eyeY() { return this.y - 124 * this.k; }
    beamBox() {
      const y = GROUND - 92, x0 = this.x + this.face * 40 * this.k;
      const x1 = this.face > 0 ? W + 50 : -50;
      return { x: Math.min(x0, x1), y, w: Math.abs(x1 - x0), h: 36 };
    }
    takeHit(dmg, poise, kb, hx, hy) {
      if (!this.alive) return;
      this.hp = Math.max(0, this.hp - dmg);
      this.flashT = 6;
      popText(hx, hy - 20, `${dmg}`, dmg >= 30 ? '#fde047' : '#ffffff', dmg >= 30 ? 40 : 26);
      burst(hx, hy, dmg >= 30 ? 30 : 10, '#ffd166', dmg >= 30 ? 10 : 6, 4);
      shakeIt(dmg >= 30 ? 14 : 4);
      // light flinch out of neutral, super armour during attacks
      if (['idle', 'approach', 'retreat', 'recover'].includes(this.state)) {
        this.vx = kb * 0.6;
        this.recentHits = (this.recentHits || 0) + 1;
        if (this.recentHits >= 5 - Math.min(2, this.level)) { this.recentHits = 0; this.setState('shove'); }
      }
      this.poise += poise;
      if (this.poise >= this.L.poise && this.state !== 'stagger') {
        this.poise = 0; this.setState('stagger'); this.vx = kb; popText(this.x, this.y - 200 * this.k, 'STAGGERED!', '#fde047', 30); sfx.clank();
      }
      if (this.hp <= 0) { this.alive = false; this.deathT = 0; this.state = 'dying'; sfx.roar(); game.onBossDown(); }
    }
    updateDeath() {
      this.deathT++;
      this.vx *= 0.9; this.x += this.vx;
      if (this.deathT % 7 === 0 && this.deathT < 110) {
        const ex = this.x + rand(-60, 60) * this.k, ey = this.y - rand(20, 170) * this.k;
        game.explosions.push({ x: ex, y: ey, r: rand(30, 60) * this.s, t: 0, harmless: true });
        sfx.boom(); shakeIt(10);
      }
      if (this.deathT === 115) {
        burst(this.x, this.y - 100 * this.k, 120, '#ff7a1a', 16, 7, 0.3, 60);
        burst(this.x, this.y - 100 * this.k, 60, '#2b2b2b', 12, 9, 0.35, 70);
        game.explosions.push({ x: this.x, y: this.y - 90 * this.k, r: 160 * this.s, t: 0, harmless: true });
        flash = 14; shakeIt(30); sfx.boom();
      }
    }
  }

  function drawBoss(b) {
    if (b.state === 'dying' && b.deathT > 115) return;
    const k = b.k, pal = b.L.palette;
    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(b.x, GROUND + 4, 50 * k, 10 * k * 0.6, 0, 0, Math.PI * 2); ctx.fill();

    // laser telegraph / beam (drawn in world space)
    if (b.state === 'laser') {
      const lz = b.L.laser, charge = Math.round(lz.charge / b.speedMul()), beam = b.beamBox();
      if (b.t < charge) {
        ctx.strokeStyle = `rgba(255,40,40,${0.3 + 0.5 * (b.t % 8 < 4)})`; ctx.lineWidth = 2; ctx.setLineDash([12, 10]);
        ctx.beginPath(); ctx.moveTo(beam.x, beam.y + beam.h / 2); ctx.lineTo(beam.x + beam.w, beam.y + beam.h / 2); ctx.stroke(); ctx.setLineDash([]);
      } else if (b.t < charge + lz.fire) {
        const gr = ctx.createLinearGradient(0, beam.y, 0, beam.y + beam.h);
        gr.addColorStop(0, 'rgba(255,60,60,0)'); gr.addColorStop(0.5, 'rgba(255,240,240,1)'); gr.addColorStop(1, 'rgba(255,60,60,0)');
        ctx.fillStyle = 'rgba(255,30,30,0.35)'; ctx.fillRect(beam.x, beam.y - 10, beam.w, beam.h + 20);
        ctx.fillStyle = gr; ctx.fillRect(beam.x, beam.y + rand(-2, 2), beam.w, beam.h);
      }
    }

    ctx.translate(b.x, b.y + (b.onGround ? b.bob * 0.4 : 0));
    if (b.state === 'stagger') ctx.rotate(Math.sin(b.t * 0.5) * 0.05);
    if (b.state === 'dying') { ctx.rotate(Math.sin(b.deathT * 0.9) * 0.06); ctx.translate(rand(-3, 3), rand(-3, 3)); }
    ctx.scale(b.face * k, k);
    ctx.translate(-80, -186);

    if (b.flashT > 0) ctx.filter = 'brightness(2.4)';
    else if (b.telegraph && (game.time % 10 < 5)) ctx.filter = 'brightness(1.5) saturate(1.4)';
    if (b.enraged) { ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 28 + Math.sin(game.time * 0.3) * 10; }

    const shell = ctx.createRadialGradient(54, 56, 4, 54, 56, 170);
    pal.shell.forEach((c, i) => shell.addColorStop([0, 0.45, 0.8, 1][i], c));

    // feet (step while moving)
    const stepping = Math.abs(b.vx) > 0.5 && b.onGround;
    const fl = stepping ? Math.max(0, Math.sin(b.step * 3)) * 6 : 0, fr = stepping ? Math.max(0, -Math.sin(b.step * 3)) * 6 : 0;
    ctx.fillStyle = shell;
    ctx.beginPath(); ctx.roundRect(60, 168 - fl, 16, 20, 7); ctx.fill();
    ctx.beginPath(); ctx.roundRect(86, 168 - fr, 16, 20, 7); ctx.fill();

    // back arm
    drawBossArm(40, 112, b.backArmRot, 16, shell, pal);
    // body
    ctx.fillStyle = shell; ctx.fill(P.body);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(58, 112); ctx.bezierCurveTo(66, 104, 78, 103, 86, 105); ctx.stroke();
    if (b.level === 0) { ctx.fillStyle = pal.accent; [[60, 140, 3], [100, 120, 2.5], [92, 158, 2]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }); }
    if (b.level >= 1) { // armour plates + rivets
      ctx.strokeStyle = pal.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(52, 128); ctx.lineTo(108, 128); ctx.stroke();
      ctx.fillStyle = pal.accent; [56, 68, 92, 104].forEach((x) => { ctx.beginPath(); ctx.arc(x, 128, 1.8, 0, Math.PI * 2); ctx.fill(); });
    }
    if (b.level === 2) { ctx.save(); ctx.strokeStyle = '#ff3b1a'; ctx.lineWidth = 2; ctx.shadowColor = '#ff2a00'; ctx.shadowBlur = 10; ctx.stroke(P.cracks); ctx.restore(); }
    // core
    const pulse = 1 + Math.sin(game.time * 0.15) * 0.15;
    ctx.save();
    ctx.shadowColor = pal.eye; ctx.shadowBlur = 14;
    ctx.strokeStyle = pal.eye; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -game.time * 0.5;
    ctx.beginPath(); ctx.arc(80, 140, 12, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const core = ctx.createRadialGradient(80, 140, 0, 80, 140, 7 * pulse);
    core.addColorStop(0, '#ffd6d6'); core.addColorStop(0.55, pal.eye); core.addColorStop(1, '#6a0000');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(80, 140, 7 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // shoulder cannon (medium+)
    if (b.level >= 1) {
      ctx.fillStyle = shell; ctx.beginPath(); ctx.roundRect(28, 92, 26, 16, 4); ctx.fill();
      ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.roundRect(20, 95, 12, 10, 3); ctx.fill();
      ctx.fillStyle = pal.accent; ctx.fillRect(34, 95, 3, 10);
    }

    // head
    ctx.save();
    ctx.translate(80, 86); ctx.rotate(b.state === 'intro' && b.t > 20 && b.t < 60 ? -0.15 : 0); ctx.translate(-80, -86);
    ctx.fillStyle = shell; ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.6;
    const hornL = b.level === 2 ? P.bigHornL : P.hornL, hornR = b.level === 2 ? P.bigHornR : P.hornR;
    ctx.fill(hornL); ctx.stroke(hornL); ctx.fill(hornR); ctx.stroke(hornR);
    ctx.fillStyle = shell; ctx.fill(P.head);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(50, 40); ctx.bezierCurveTo(58, 33, 70, 30, 82, 31); ctx.stroke();
    ctx.fillStyle = '#050507'; ctx.beginPath(); ctx.roundRect(46, 46, 68, 34, 17); ctx.fill();
    ctx.save();
    const eyeGlow = b.telegraph || b.enraged || b.state === 'intro';
    ctx.shadowColor = pal.eye; ctx.shadowBlur = eyeGlow ? 22 : 10;
    ctx.fillStyle = eyeGlow && game.time % 6 < 3 ? '#ffffff' : pal.eye;
    ctx.translate(3, 0); ctx.fill(P.eyeL); ctx.fill(P.eyeR);
    ctx.restore();
    ctx.strokeStyle = pal.eye; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.8; ctx.stroke(P.mouth); ctx.globalAlpha = 1;
    ctx.restore();

    // front arm (punches / throws / fires)
    drawBossArm(120, 112, b.armRot, -16, shell, pal);
    ctx.restore();
    ctx.filter = 'none';
  }

  function drawBossArm(px, py, rot, baseDeg, shell, pal) {
    ctx.save();
    ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py);
    ctx.save();
    ctx.translate(px, py + 18); ctx.rotate(baseDeg * Math.PI / 180);
    ctx.fillStyle = shell; ctx.beginPath(); ctx.ellipse(0, 0, 9, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0b0e'; ctx.beginPath(); ctx.arc(0, 22, 8, 0, Math.PI * 2); ctx.fill(); // fist
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 22, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  // ---------------------------------------------------------------- hero autopilot (attract / testing)
  function autopilot(h, b) {
    const c = {};
    if (!b || !b.alive || h.state === 'dead') return c;
    const dx = b.x - h.x, dist = Math.abs(dx);
    const threatened = b.telegraph && dist < b.reach + 120 && ['punch', 'shove'].includes(b.state);
    const wave = game.waves.find((w) => Math.abs(w.x - h.x) < 120 && Math.sign(h.x - w.x) === w.dir);
    const grenade = game.grenades.find((g) => !g.reflected && Math.abs(g.x - h.x) < 120);
    if (h.energy >= 100 && dist < 400) { c.special = true; return c; }
    if (b.state === 'laser') { c.block = true; return c; }
    if (wave) { c.jump = true; return c; }
    if (b.state === 'dash' && b.t > 10 && dist < 260) { c.dodge = true; c[dx > 0 ? 'right' : 'left'] = true; return c; }
    if (threatened) { c.block = true; return c; }
    if (grenade && grenade.landed) { c[grenade.x > h.x ? 'left' : 'right'] = true; return c; }
    if (dist > b.reach - 10) { c[dx > 0 ? 'right' : 'left'] = true; return c; }
    if (game.time % 40 < 20) c.punch = game.time % 6 === 0; else c.kick = game.time % 18 === 0;
    return c;
  }

  function keyboard() {
    return {
      left: isDown('KeyA', 'ArrowLeft'), right: isDown('KeyD', 'ArrowRight'),
      jump: wasPressed('KeyW', 'ArrowUp', 'Space'),
      punch: wasPressed('KeyJ'), kick: wasPressed('KeyK'),
      block: isDown('KeyL', 'KeyS', 'ArrowDown'),
      dodge: wasPressed('ShiftLeft', 'ShiftRight'),
      special: wasPressed('KeyI'),
    };
  }

  // ---------------------------------------------------------------- game
  const game = {
    mode: 'title', time: 0, level: 0, menuIdx: 0, modeT: 0,
    unlocked: store.get('steelbreaker.unlocked', 1),
    hero: null, boss: null, grenades: [], waves: [], explosions: [], rings: [], ambient: [], fightT: 0,

    start(level) {
      this.level = level; this.hero = new Hero(); this.boss = new Boss(level);
      this.grenades = []; this.waves = []; this.explosions = []; this.rings = [];
      particles.length = 0; texts.length = 0; this.ambient = [];
      this.mode = 'intro'; this.modeT = 0; this.fightT = 0;
    },
    onBossDown() { this.hero.setState('victory'); this.mode = 'won'; this.modeT = 0; },
    onHeroDown() { this.mode = 'lost'; this.modeT = 0; sfx.lose(); },
    click(x, y) {
      if (this.mode === 'title') {
        const i = cardIndexAt(x, y);
        if (i !== -1) { if (i < this.unlocked) { this.menuIdx = i; sfx.select(); this.start(i); } }
      } else if (this.mode === 'won' && this.modeT > 150) this.advance();
      else if (this.mode === 'lost' && this.modeT > 90) this.start(this.level);
      else if (this.mode === 'complete' && this.modeT > 120) { this.mode = 'title'; }
    },
    advance() {
      if (this.level >= 2) { this.mode = 'complete'; this.modeT = 0; sfx.win(); }
      else this.start(this.level + 1);
    },

    tick() {
      this.time++; this.modeT++;
      if (wasPressed('KeyM')) { sfx.muted = !sfx.muted; store.set('steelbreaker.muted', sfx.muted); }

      if (this.mode === 'title') {
        if (wasPressed('ArrowLeft', 'KeyA')) { this.menuIdx = (this.menuIdx + 2) % 3; sfx.select(); }
        if (wasPressed('ArrowRight', 'KeyD')) { this.menuIdx = (this.menuIdx + 1) % 3; sfx.select(); }
        if (wasPressed('Enter', 'Space', 'KeyJ') && this.menuIdx < this.unlocked) { sfx.select(); this.start(this.menuIdx); }
        this.updateAmbient(0);
        return;
      }
      if (this.mode === 'paused') {
        if (wasPressed('KeyP', 'Escape', 'Enter')) this.mode = 'fight';
        if (wasPressed('KeyQ')) this.mode = 'title';
        return;
      }
      if (this.mode === 'fight' && wasPressed('KeyP', 'Escape')) { this.mode = 'paused'; return; }
      if (this.mode === 'complete') {
        if (this.modeT % 6 === 0) burst(rand(0, W), -10, 4, ['#fde047', '#7dd3fc', '#f472b6', '#86efac'][Math.floor(rand(0, 4))], 3, 6, 0.12, 120);
        if (this.modeT > 120 && wasPressed('Enter', 'Escape', 'Space')) this.mode = 'title';
        this.updateParticles();
        return;
      }

      if (hitstop > 0) { hitstop--; this.updateParticles(); return; }

      const h = this.hero, b = this.boss;
      const ctrl = this.mode === 'fight' ? (AUTOPLAY ? autopilot(h, b) : keyboard()) : {};
      if (this.mode === 'intro') {
        if (this.modeT < 50) { h.vx = 3; h.state = 'walk'; h.walkPhase += 0.22; } else if (h.state === 'walk') h.setState('idle');
        if (this.modeT >= 150) { this.mode = 'fight'; sfx.heavy(); }
      }
      if (this.mode === 'fight') this.fightT++;
      h.update(ctrl, b.alive ? b : null);
      if (this.mode !== 'intro' || this.modeT > 40) b.update(h);

      // body blocking (the boss is heavy; the hero gets pushed)
      if (b.alive && h.state !== 'dodge' && b.state !== 'dash' && h.state !== 'dead' && h.state !== 'special') {
        const minD = 22 + 44 * b.k, d = h.x - b.x; // hero half-width + boss half-width
        if (Math.abs(d) < minD && h.y > GROUND - 150 * b.k) h.x = clamp(b.x + (Math.sign(d) || -b.face) * minD, ARENA_L, ARENA_R);
        if (h.x <= ARENA_L + 1 && Math.abs(h.x - b.x) < minD) b.x = h.x + minD;
        if (h.x >= ARENA_R - 1 && Math.abs(h.x - b.x) < minD) b.x = h.x - minD;
      }
      h.trail = Math.max(h.hp, h.trail - 0.8);

      this.updateHazards(h, b);
      this.updateParticles();
      this.updateAmbient(this.level);

      if (this.mode === 'won') {
        if (this.modeT === 130) { sfx.win(); if (this.level + 2 > this.unlocked) { this.unlocked = Math.min(3, this.level + 2); store.set('steelbreaker.unlocked', this.unlocked); } }
        if (this.modeT > 150 && wasPressed('Enter', 'Space')) this.advance();
        if (this.modeT > 150 && wasPressed('Escape')) this.mode = 'title';
      }
      if (this.mode === 'lost' && this.modeT > 90) {
        if (wasPressed('Enter', 'Space')) this.start(this.level);
        if (wasPressed('Escape')) this.mode = 'title';
      }
      if (AUTOPLAY && this.mode === 'won' && this.modeT > 260) this.advance();
      if (AUTOPLAY && this.mode === 'lost' && this.modeT > 200) this.start(this.level);
    },

    updateHazards(h, b) {
      for (const g of this.grenades) {
        g.spin += 0.3;
        if (!g.landed) {
          g.vy += 0.45; g.x += g.vx; g.y += g.vy;
          if (g.y >= GROUND - 10) {
            g.y = GROUND - 10;
            if (g.reflected) { g.fuse = 0; } else { g.landed = true; g.vx *= 0.3; g.vy = 0; if (g.fuse < 0) g.fuse = 45; }
          }
          if (g.reflected && b.alive && overlap({ x: g.x - 12, y: g.y - 12, w: 24, h: 24 }, b.hurtbox)) g.fuse = 0;
        } else { g.x += g.vx; g.vx *= 0.9; }
        if (g.fuse >= 0 && --g.fuse <= 0) {
          g.dead = true;
          this.explosions.push({ x: g.x, y: g.y, r: 105, t: 0, dmg: g.reflected ? 30 : g.dmg, reflected: g.reflected });
          sfx.boom(); shakeIt(12);
          burst(g.x, g.y, 30, '#ff8a1f', 9, 5, 0.25, 32);
        }
        if (g.x < -50 || g.x > W + 50) g.dead = true;
      }
      this.grenades = this.grenades.filter((g) => !g.dead);

      for (const e of this.explosions) {
        e.t++;
        if (e.t === 2 && !e.harmless) {
          if (e.reflected) {
            if (b.alive && Math.abs(b.x - e.x) < e.r + 40 * b.k) b.takeHit(e.dmg, 25, Math.sign(b.x - e.x) * 6, b.x, b.y - 100 * b.k);
          } else {
            const hb = h.hurtbox;
            if (hb && Math.hypot(h.x - e.x, (h.y - 80) - e.y) < e.r + 30) h.takeHit(e.dmg, e.x, 'blast');
          }
        }
      }
      this.explosions = this.explosions.filter((e) => e.t < 28);

      for (const w of this.waves) {
        w.x += w.dir * w.speed; w.life--;
        if (w.life % 3 === 0) burst(w.x, GROUND - 4, 2, '#ffb366', 3, 4, 0.3, 16);
        if (!w.hit && Math.abs(h.x - w.x) < 34 && h.y > GROUND - w.h) { w.hit = h.takeHit(w.dmg, w.x - w.dir * 10, 'blast') || w.hit; if (w.hit) w.life = 0; }
      }
      this.waves = this.waves.filter((w) => w.life > 0 && w.x > -40 && w.x < W + 40);
      for (const r of this.rings) { r.r += 18; r.life--; }
      this.rings = this.rings.filter((r) => r.life > 0);
    },
    updateParticles() {
      for (const p of particles) { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.98; p.life--; if (p.y > GROUND + 40 && p.g > 0) { p.y = GROUND + 40; p.vy *= -0.3; } }
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
      for (const t of texts) { t.y -= 1.1; t.life--; }
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].life <= 0) texts.splice(i, 1);
      if (shake > 0) shake *= 0.85;
      if (shake < 0.3) shake = 0;
      if (flash > 0) flash--;
    },
    updateAmbient(level) {
      const a = this.ambient;
      if (a.length < 40 && Math.random() < 0.3) {
        if (level === 0) a.push({ x: rand(0, W), y: rand(0, GROUND), vx: rand(-0.2, 0.2), vy: rand(-0.3, -0.1), life: 300, r: rand(1, 2.5), c: 'rgba(255,220,180,' });
        if (level === 1) a.push({ x: rand(0, W), y: GROUND - rand(80, 200), vx: rand(0.2, 0.6), vy: rand(-0.4, -0.2), life: 260, r: rand(14, 34), c: 'rgba(160,170,190,' });
        if (level === 2) a.push({ x: rand(0, W), y: GROUND + rand(0, 40), vx: rand(-0.3, 0.3), vy: rand(-1.6, -0.6), life: 240, r: rand(1.5, 3.5), c: 'rgba(255,120,40,' });
      }
      for (const p of a) { p.x += p.vx; p.y += p.vy; p.life--; }
      this.ambient = a.filter((p) => p.life > 0);
    },
  };

  // ---------------------------------------------------------------- rendering
  function text(str, x, y, size, color, align = 'center', stroke = '#000', weight = '900', font = 'Impact, "Arial Black", sans-serif') {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }

  function drawAmbient(level) {
    for (const p of game.ambient) {
      const a = Math.min(1, p.life / 60) * (level === 1 ? 0.12 : 0.8);
      ctx.fillStyle = `${p.c}${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawWorld() {
    const lv = game.mode === 'title' ? 0 : game.level;
    ctx.drawImage(makeBg(lv), 0, 0);
    drawAmbient(lv);
    if (game.mode === 'title') return;
    const h = game.hero, b = game.boss;

    for (const w of game.waves) {
      const gr = ctx.createLinearGradient(0, GROUND - w.h, 0, GROUND);
      gr.addColorStop(0, 'rgba(255,170,80,0)'); gr.addColorStop(1, 'rgba(255,150,60,0.9)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(w.x - 26, GROUND); ctx.quadraticCurveTo(w.x, GROUND - w.h * 2, w.x + 26, GROUND); ctx.fill();
    }
    // draw the bigger one first so the hero stays visible in front
    drawBoss(b);
    drawHero(h);

    for (const g of game.grenades) {
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.spin);
      ctx.fillStyle = g.reflected ? '#1e3a8a' : '#3f5a2a'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1b2a10'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-11, -3); ctx.lineTo(11, -3); ctx.moveTo(-11, 4); ctx.lineTo(11, 4); ctx.stroke();
      ctx.fillStyle = '#555'; ctx.fillRect(-4, -17, 8, 5);
      ctx.restore();
      if (g.fuse > 0 && g.fuse % 8 < 4) { ctx.fillStyle = '#ff3b1a'; ctx.beginPath(); ctx.arc(g.x, g.y - 18, 4, 0, Math.PI * 2); ctx.fill(); }
      if (g.landed && !g.reflected) { ctx.strokeStyle = `rgba(255,60,30,${0.25 + 0.25 * (g.fuse % 10 < 5)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(g.x, GROUND, 105, 16, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (const e of game.explosions) {
      const k = e.t / 28, r = e.r * (0.4 + k * 0.8);
      const gr = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      gr.addColorStop(0, `rgba(255,255,220,${1 - k})`); gr.addColorStop(0.35, `rgba(255,170,40,${0.9 * (1 - k)})`); gr.addColorStop(1, 'rgba(200,30,10,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (const r of game.rings) {
      ctx.strokeStyle = `rgba(${r.color},${r.life / 30})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const t of texts) {
      ctx.globalAlpha = clamp(t.life / 20, 0, 1);
      text(t.str, t.x, t.y, t.size, t.color);
    }
    ctx.globalAlpha = 1;
  }

  function bar(x, y, w, h, frac, trail, colA, colB, flip = false) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.roundRect(x - 3, y - 3, w + 6, h + 6, 6); ctx.fill();
    const fx = (f) => (flip ? x + w - w * f : x);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(fx(trail), y, w * trail, h);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, colA); g.addColorStop(1, colB);
    ctx.fillStyle = g; ctx.fillRect(fx(frac), y, w * frac, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(fx(frac), y, w * frac, h * 0.35);
  }

  function drawHud() {
    const h = game.hero, b = game.boss, L = b.L;
    // hero
    text('KANE', 44, 26, 22, '#fff', 'left');
    bar(44, 44, 420, 22, h.hp / h.maxHp, h.trail / h.maxHp, h.hp / h.maxHp > 0.3 ? '#4ade80' : '#f87171', h.hp / h.maxHp > 0.3 ? '#15803d' : '#b91c1c');
    const ready = h.energy >= 100;
    bar(44, 74, 300, 10, h.energy / 100, h.energy / 100, ready ? '#e0f2fe' : '#38bdf8', ready ? '#38bdf8' : '#0369a1');
    if (ready) text('SPECIAL READY  [ I ]', 356, 80, 15, game.time % 30 < 15 ? '#7dd3fc' : '#e0f2fe', 'left');
    // boss
    text(L.boss, W - 44, 26, 22, '#ff6b6b', 'right');
    bar(W - 464, 44, 420, 22, b.hp / b.maxHp, b.trail / b.maxHp, b.enraged ? '#ff5252' : '#ef4444', '#7f1d1d', true);
    // level
    text(`LEVEL ${game.level + 1}  ·  ${L.key}`, W / 2, 30, 20, '#fde68a');
    // combo
    if (h.combo >= 2) {
      const s = 1 + Math.min(0.5, h.combo * 0.03);
      text(`${h.combo} HITS`, 60, 150, 34 * s, '#fde047', 'left');
      if (h.combo >= 6) text('POWER x1.2', 62, 182, 16, '#fca5a5', 'left');
    }
  }

  function panel(x, y, w, h, alpha = 0.78) {
    ctx.fillStyle = `rgba(8,10,18,${alpha})`;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill(); ctx.stroke();
  }

  const CARD = { y: 300, w: 300, h: 210, gap: 40 };
  const cardX = (i) => W / 2 - (CARD.w * 3 + CARD.gap * 2) / 2 + i * (CARD.w + CARD.gap);
  function cardIndexAt(x, y) {
    for (let i = 0; i < 3; i++) if (x >= cardX(i) && x <= cardX(i) + CARD.w && y >= CARD.y && y <= CARD.y + CARD.h) return i;
    return -1;
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(5,5,12,0.45)'; ctx.fillRect(0, 0, W, H);
    const pulse = 1 + Math.sin(game.time * 0.05) * 0.02;
    ctx.save(); ctx.translate(W / 2, 120); ctx.scale(pulse, pulse);
    const tg = ctx.createLinearGradient(0, -50, 0, 50); tg.addColorStop(0, '#ffe08a'); tg.addColorStop(0.5, '#ff7a1a'); tg.addColorStop(1, '#c81e1e');
    ctx.shadowColor = '#ff3b1a'; ctx.shadowBlur = 30;
    text('STEEL BREAKER', 0, 0, 104, tg, 'center', '#1a0505');
    ctx.restore();
    text('ONE MAN.  THREE MACHINES.  NO MERCY.', W / 2, 200, 22, '#e5e7eb', 'center', '#000', '700', 'Arial, sans-serif');

    if (mouse) { const i = cardIndexAt(mouse.x, mouse.y); if (i !== -1) game.menuIdx = i; }
    for (let i = 0; i < 3; i++) {
      const L = LEVELS[i], x = cardX(i), sel = i === game.menuIdx, locked = i >= game.unlocked;
      ctx.save();
      if (sel) { ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 28; }
      ctx.fillStyle = sel ? 'rgba(40,14,8,0.92)' : 'rgba(10,12,20,0.85)';
      ctx.strokeStyle = sel ? '#ff9d4a' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = sel ? 3 : 2;
      ctx.beginPath(); ctx.roundRect(x, CARD.y, CARD.w, CARD.h, 16); ctx.fill(); ctx.stroke();
      ctx.restore();
      text(`LEVEL ${i + 1}`, x + 20, CARD.y + 30, 18, '#9ca3af', 'left', null, '700', 'Arial, sans-serif');
      text(L.key, x + 20, CARD.y + 66, 40, ['#4ade80', '#fbbf24', '#ef4444'][i], 'left');
      if (!locked) {
        text(L.boss, x + 20, CARD.y + 110, 22, '#fff', 'left', null, '800', 'Arial, sans-serif');
        wrapText(L.tagline, x + 20, CARD.y + 140, CARD.w - 40, 16, '#cbd5e1');
      }
      // little boss silhouette, bigger per level
      ctx.save();
      ctx.globalAlpha = locked ? 0.25 : 0.9;
      ctx.translate(x + CARD.w - 60, CARD.y + 88);
      const k = 0.22 + i * 0.07; ctx.scale(-k, k); ctx.translate(-80, -186);
      ctx.fillStyle = '#20232b'; ctx.fill(P.body); ctx.fill(P.head); ctx.fill(i === 2 ? P.bigHornL : P.hornL); ctx.fill(i === 2 ? P.bigHornR : P.hornR);
      ctx.fillStyle = '#ff2b2b'; ctx.fill(P.eyeL); ctx.fill(P.eyeR);
      ctx.restore();
      if (locked) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(x, CARD.y, CARD.w, CARD.h, 16); ctx.fill();
        // padlock
        const lx = x + CARD.w / 2, ly = CARD.y + 128;
        ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(lx, ly - 10, 12, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#9ca3af'; ctx.beginPath(); ctx.roundRect(lx - 18, ly - 10, 36, 28, 5); ctx.fill();
        text(`LOCKED · beat level ${i} first`, lx, CARD.y + 178, 15, '#9ca3af', 'center', null, '700', 'Arial, sans-serif');
      }
    }
    const blink = game.time % 60 < 40;
    if (blink) text(game.menuIdx < game.unlocked ? 'PRESS ENTER OR CLICK TO FIGHT' : 'LEVEL LOCKED', W / 2, 550, 26, '#fde68a');

    panel(W / 2 - 520, 590, 1040, 100, 0.7);
    const rows = [
      ['MOVE', 'A / D  or  ← →'], ['JUMP', 'W / ↑ / SPACE'], ['PUNCH', 'J  (tap ×3 combo)'], ['KICK', 'K'],
      ['BLOCK', 'L or S / ↓ (hold)'], ['DODGE', 'SHIFT'], ['SPECIAL', 'I (full energy)'], ['PAUSE / MUTE', 'P  ·  M'],
    ];
    rows.forEach(([k, v], i) => {
      const cx = W / 2 - 500 + (i % 4) * 255, cy = 618 + Math.floor(i / 4) * 42;
      text(k, cx, cy, 13, '#fbbf24', 'left', null, '800', 'Arial, sans-serif');
      text(v, cx, cy + 17, 15, '#e5e7eb', 'left', null, '600', 'Arial, sans-serif');
    });
    text('Tip: punch or kick a grenade to bat it back!', W / 2, 258, 16, '#93c5fd', 'center', null, '600', 'Arial, sans-serif');
  }

  function wrapText(str, x, y, maxW, size, color) {
    ctx.font = `600 ${size}px Arial, sans-serif`;
    const words = str.split(' '); let line = '', yy = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { text(line, x, yy, size, color, 'left', null, '600', 'Arial, sans-serif'); line = w; yy += size + 6; }
      else line = test;
    }
    if (line) text(line, x, yy, size, color, 'left', null, '600', 'Arial, sans-serif');
  }

  function drawOverlay() {
    const L = game.boss?.L;
    if (game.mode === 'intro') {
      const t = game.modeT;
      if (t < 120) {
        const a = Math.min(1, t / 15) * Math.min(1, (120 - t) / 15);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 230, W, 170);
        text(`LEVEL ${game.level + 1}  ·  ${L.key}`, W / 2, 275, 40, '#fde68a');
        text(L.boss, W / 2, 340, 72, '#ff4d4d', 'center', '#1a0000');
        ctx.globalAlpha = 1;
      } else {
        const k = (t - 120) / 30;
        ctx.save(); ctx.globalAlpha = 1 - k * 0.6; ctx.translate(W / 2, 300); ctx.scale(1 + k * 0.4, 1 + k * 0.4);
        text('FIGHT!', 0, 0, 120, '#fde047', 'center', '#7c2d12');
        ctx.restore();
      }
    }
    if (game.mode === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      text('PAUSED', W / 2, 300, 90, '#fff');
      text('P / ENTER to resume   ·   Q to quit to menu', W / 2, 380, 22, '#cbd5e1', 'center', null, '600', 'Arial, sans-serif');
    }
    if (game.mode === 'won' && game.modeT > 130) {
      const h = game.hero, a = Math.min(1, (game.modeT - 130) / 20);
      ctx.globalAlpha = a;
      panel(W / 2 - 330, 200, 660, 300);
      text(`${L.boss} DESTROYED`, W / 2, 255, 44, '#fde047');
      const secs = Math.round(game.fightT / 60);
      text(`Time ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}    ·    Best combo ${h.maxCombo}    ·    Damage taken ${h.damageTaken}`, W / 2, 320, 20, '#e5e7eb', 'center', null, '700', 'Arial, sans-serif');
      const rank = h.damageTaken < h.maxHp * 0.15 ? 'S' : h.damageTaken < h.maxHp * 0.4 ? 'A' : h.damageTaken < h.maxHp * 0.7 ? 'B' : 'C';
      text(`RANK ${rank}`, W / 2, 385, 54, { S: '#fde047', A: '#4ade80', B: '#7dd3fc', C: '#cbd5e1' }[rank]);
      text(game.level < 2 ? 'ENTER: next level   ·   ESC: menu' : 'ENTER: claim your title   ·   ESC: menu', W / 2, 455, 20, '#fbbf24', 'center', null, '700', 'Arial, sans-serif');
      ctx.globalAlpha = 1;
    }
    if (game.mode === 'lost' && game.modeT > 60) {
      const a = Math.min(1, (game.modeT - 60) / 20);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(60,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      text('DEFEATED', W / 2, 280, 110, '#ef4444', 'center', '#1a0000');
      text(`${L.boss} still stands. Learn its moves and try again.`, W / 2, 360, 22, '#fecaca', 'center', null, '700', 'Arial, sans-serif');
      text('ENTER: retry   ·   ESC: menu', W / 2, 420, 22, '#fbbf24', 'center', null, '700', 'Arial, sans-serif');
      ctx.globalAlpha = 1;
    }
  }

  function drawComplete() {
    ctx.drawImage(makeBg(2), 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    const tg = ctx.createLinearGradient(0, 160, 0, 260); tg.addColorStop(0, '#fff7c2'); tg.addColorStop(1, '#f59e0b');
    ctx.save(); ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 40;
    text('CHAMPION OF STEEL', W / 2, 210, 92, tg, 'center', '#3b1d00');
    ctx.restore();
    text('All three machines are scrap. The city is yours, Kane.', W / 2, 300, 26, '#fde68a', 'center', null, '700', 'Arial, sans-serif');
    // hero flexing on the podium
    const pg = ctx.createLinearGradient(0, 560, 0, GROUND);
    pg.addColorStop(0, '#f5c542'); pg.addColorStop(1, '#8a5a00');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(W / 2 - 110, 560, 220, GROUND - 560 + 6, [8, 8, 0, 0]); ctx.fill();
    text('1', W / 2, 588, 34, '#3b1d00', 'center', null);
    const h = new Hero(); h.x = W / 2; h.y = 560; h.state = 'victory'; h.pose = { ...POSES.flex };
    ctx.save(); ctx.translate(0, 0); drawHero(h); ctx.restore();
    if (game.modeT > 120 && game.time % 60 < 40) text('PRESS ENTER', W / 2, 650, 26, '#fff');
    drawParticles();
  }

  function render() {
    ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (game.mode === 'complete') { drawComplete(); return; }
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    drawWorld();
    drawParticles();
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash / 20})`; ctx.fillRect(0, 0, W, H); }
    if (game.mode === 'title') drawTitle();
    else { drawHud(); drawOverlay(); }
    if (sfx.muted) text('MUTED', W - 20, H - 20, 14, '#9ca3af', 'right', null, '700', 'Arial, sans-serif');
    if (fatalError) { ctx.fillStyle = 'rgba(120,0,0,0.9)'; ctx.fillRect(0, H - 60, W, 60); text(`ERROR: ${fatalError}`, 20, H - 30, 18, '#fff', 'left', null, '700', 'monospace'); }
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(100, now - last); last = now;
    let first = true;
    while (acc >= STEP) {
      try { game.tick(); } catch (e) { fatalError = e.message; console.error(e); }
      if (first) { pressed.clear(); first = false; }
      acc -= STEP;
    }
    try { render(); } catch (e) { fatalError = e.message; console.error(e); }
    requestAnimationFrame(frame);
  }

  if (params.has('level')) game.start(clamp(parseInt(params.get('level'), 10) || 0, 0, 2));
  if (params.has('complete')) { game.mode = 'complete'; game.modeT = 200; } // debug: ending screen
  // debug: fast-forward N frames of simulation (for screenshots / balance testing)
  if (params.has('ff')) { const n = parseInt(params.get('ff'), 10) || 0; for (let i = 0; i < n; i++) { game.tick(); pressed.clear(); } }
  window.__game = game; // handy for debugging in the console
  canvas.focus();
  requestAnimationFrame(frame);
})();
