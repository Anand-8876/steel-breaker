/*
 * STEEL BREAKER 3D
 * One jacked hero vs three evil robots (Easy / Medium / Hard), each bigger and nastier.
 * The fight runs on a 2D side-on simulation; Three.js renders it as a 3D arena. Web Audio for sound.
 *
 * Controls: A/D or arrows move, W/Up/Space jump, J punch, K kick (chain them into combos),
 *           S/Down block (hold), Shift dodge-roll, L dragon god slash (one-shot kill), P/Esc pause, M mute.
 * Specials (full energy bar): U body slam, I kamehameha, O hulk smash.
 * Combos: J J J, J J K, J J J K, J K K, K K, K J J K, jump + J (meteor fist), jump + K (flying kick).
 * Story: every chapter has dialogue before and after its fight (ENTER next, ESC skip), and every monster
 * goes down in a finishing cutscene: one slash through, a huge blast, then WIN.
 * Debug URL params: &nostory skips the dialogue scenes, ?level=0..2 jump straight into a level, &autoplay lets the hero fight by himself,
 *                   &sp=kame|hulk|slam fires that special early in the fight, &die knocks the hero out early
 *                   (to see the defeat screen), &knight starts armored, &key=fire|water|thunder drops that key
 *                   next to the hero, &saga jumps to level 4's giant cutscene, &zord to the megazord fight,
 *                   &shadowsaga / &darkzord do the same for level 5, &ff=N fast-forwards N frames.
 * Power-up: 5 seconds into each fight the White Wolf runs down a moonbeam and becomes Kane's armor (see chapter 10).
 * (Before that it was this dragon armor, still in the code: a dragon key unlocks a black-and-white armored suit and a sword (x1.5 damage,
 * tougher, sword reach, finishers launch crescent slashes). Armored, U/I/O become flame slash, water tornado and
 * thunder judgment (lightning dash through the monster, thunderstorm, blast behind him).
 * Level 4: beat the Abyss King and it rises again building-sized, one-shots Kane; press R and he summons a giant
 * dragon that becomes the Dragon Megazord for round two in a miniature city.
 * Level 5: the Shadow Knight, a dark mirror who guards, counters and clashes blades (mash J). Beat him and
 * he summons a shadow dragon: dark megazord vs dragon megazord above the clouds.
 * Chapter 6: Emperor Nox himself (orbs, void rain, teleport palm, void beam, barrier). Beat him and he absorbs
 * the fallen monsters into the giant Nox Titan; the Shadow Knight joins Kane and both dragons become the Ultimate
 * Megazord.
 * Chapter 7: the Behemoth, King of Monsters, rises from the sea and Kane cannot hurt it. It knocks him flat; press T and
 * he summons the Black Lion, rides it into battle, and (T again at full energy) it becomes the Lion Megazord.
 * Chapter 8: Vorath the Soul Reaver tears the lion spirit out of Kane and corrupts it. Beat the lion to win it back.
 * Chapter 9: Vorath's legion of four evil megazords wrecks the city. Kane forms the dragon megazord and starts losing;
 * the lion joins it (dragon lion megazord) and the whole legion piles on; then a fire eagle, the Phoenix, burns one
 * of them out of the sky (Phoenix Flash) and joins them as the Phoenix Megazord: fire sword, burning wings, and F for
 * the Mega Phoenix Splash. The other three come at it one at a time.
 * Chapter 10: Vorath's ten shade imps on a moonlit rooftop (small, quick to kill, a few at a time). Kane fights them
 * bare-handed until the White Wolf runs down a moonbeam, howls, leaps into him and becomes the White Wolf Armor:
 * claws instead of a sword, U lunar howl, I moon claw, O phantom fang (three shadow Kanes slash, then Kane).
 * Then the ending and the credits.
 * Summons: once unlocked (dragon after chapter 4, lion after chapter 7) press R for the dragon or T for the lion,
 * once each per fight.
 * Element keys drop into the arena mid-fight: FIRE burns, WATER heals + slows, THUNDER calls lightning.
 * More debug params: &lionsaga, &ride, &lionzord (chapter 7's three beats), &steal, &spirit (chapter 8's two cutscenes),
 *                   &legion, &unite, &phoenix, &phoenixzord (chapter 9), &wolfup (the white wolf arrives),
 *                   &wolf (start chapter 10 already in the wolf armor).
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- setup
  const W = 1280, H = 720, GROUND = 612, ARENA_L = 70, ARENA_R = 1210;
  const STEP = 1000 / 60;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById('game'); // 2D HUD layer, on top, takes the mouse
  const glCanvas = document.getElementById('gl'); // 3D world underneath
  const stage = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const THREE = window.THREE;
  let dpr = 1, viewScale = 1;

  let fatalError = null;
  window.addEventListener('error', (e) => { fatalError = e.message || String(e); });

  if (!THREE) {
    canvas.width = W; canvas.height = H;
    ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif';
    ctx.fillText('Could not load vendor/three.min.js - the 3D engine is missing.', 40, 80);
    return;
  }

  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, W / H, 10, 12000);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewScale = Math.min(window.innerWidth / W, window.innerHeight / H);
    const cw = W * viewScale, ch = H * viewScale;
    stage.style.width = `${cw}px`; stage.style.height = `${ch}px`;
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    canvas.width = Math.round(W * dpr * viewScale);
    canvas.height = Math.round(H * dpr * viewScale);
    renderer.setPixelRatio(dpr);
    renderer.setSize(cw, ch, false);
    glCanvas.style.width = `${cw}px`; glCanvas.style.height = `${ch}px`;
  }
  window.addEventListener('resize', resize);
  resize();

  const params = new URLSearchParams(location.search);
  const AUTOPLAY = params.has('autoplay');
  const DEBUG_SP = params.get('sp');
  const DEBUG_DIE = params.has('die');
  const DEBUG_KEY = params.get('key'); // drop that element key right next to the hero
  const DEBUG_KNIGHT = params.has('knight'); // start already armored
  const NO_STORY = params.has('nostory'); // skip the dialogue scenes
  const DEBUG_SUMMON = params.has('summon'); // both summons available without beating chapters 4 and 7
  const DEBUG_WOLF = params.has('wolf'); // start chapter 10 already in the white wolf armor
  const DEBUG_ARMOR = params.get('armor'); // &armor=wolf|lion|phoenix: start any fight already in that armor
  const DEBUG_SWAP = params.get('swap'); // &swap=wolf|lion|phoenix: swap to that armor half a second into the fight

  // ---------------------------------------------------------------- helpers
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const ease = (t) => t * t * (3 - 2 * t);
  const overlap = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
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
  // simulation space (x right, y down, ground at GROUND) -> world space (x right, y up, ground at 0)
  const X = (x) => x - W / 2;
  const Y = (y) => GROUND - y;

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
    roar() { this.tone(90, 0.8, 'sawtooth', 0.14, 45); this.noise(0.6, 0.2, 700); },
    chant(i) { this.tone(260 + i * 70, 0.22, 'triangle', 0.12, 300 + i * 80); },
    kame() { this.noise(1.2, 0.4, 1600); this.tone(90, 1.1, 'sawtooth', 0.2, 45); this.tone(440, 0.9, 'square', 0.04, 990); },
    beam() { this.tone(rand(170, 230), 0.14, 'sawtooth', 0.05, 160); },
    grab() { this.tone(140, 0.15, 'square', 0.12, 90); this.noise(0.1, 0.3, 1200); },
    servo() { this.tone(260, 0.22, 'square', 0.05, 820); this.tone(110, 0.2, 'sawtooth', 0.05, 180); },
    zap() { this.noise(0.1, 0.3, 6000); this.tone(1800, 0.08, 'square', 0.05, 300); },
    blip(who) { const v = { kane: [520, 'triangle'], elder: [380, 'sine'], nox: [150, 'sawtooth'], boss: [110, 'square'], shadow: [200, 'sawtooth'], vorath: [95, 'sawtooth'], lion: [70, 'sawtooth'], wolf: [180, 'sine'] }[who] || [400, 'sine']; this.tone(v[0] + rand(-20, 20), 0.045, v[1], 0.035); },
    slash() { this.noise(0.12, 0.35, 5200); this.tone(1500, 0.14, 'triangle', 0.08, 500); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.12), i * 130)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.12), i * 180)); },
    select() { this.tone(660, 0.07, 'triangle', 0.1); },
    howl() { // a long rising wolf howl that falls away
      this.tone(330, 0.5, 'triangle', 0.12, 640); this.tone(334, 0.5, 'sine', 0.06, 650);
      setTimeout(() => { this.tone(640, 1.1, 'triangle', 0.11, 420); this.tone(646, 1.1, 'sine', 0.05, 430); }, 480);
    },
    screech() { this.tone(2200, 0.6, 'sawtooth', 0.07, 900); this.tone(1500, 0.5, 'square', 0.04, 2600); this.noise(0.4, 0.15, 5000); },
  };

  // ---------------------------------------------------------------- effects
  const particles = [];
  const texts = [];
  let shake = 0, hitstop = 0, flash = 0;

  function burst(x, y, n, color, speed = 6, size = 4, gravity = 0.25, life = 30, z = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(speed * 0.3, speed);
      particles.push({
        x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, vz: rand(-0.7, 0.7) * s,
        life: rand(life * 0.6, life), max: life, color, size: rand(size * 0.5, size), g: gravity,
      });
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
    {
      key: 'FINAL', boss: 'ABYSS KING', tagline: 'Winged demon of the neon city. Beating it is only the beginning...',
      scale: 2.1, hp: 1500, speed: 3.3, think: [16, 32], poise: 140,
      punch: { wind: 16, dmg: 18, chain: 0.6 }, dash: { wind: 28, dmg: 22, speed: 18 },
      grenades: 3, grenadeDmg: 22, slam: { wind: 18, dmg: 20 }, laser: { charge: 60, fire: 44, dmg: 3 }, enrageAt: 0.4,
      palette: { shell: ['#4c2a7a', '#2a1048', '#150727', '#05010a'], eye: '#d8b4fe', accent: '#a855f7' },
    },
    {
      key: 'DUEL', boss: 'SHADOW KNIGHT', tagline: 'Your dark mirror. He blocks, counters and clashes blades. Mash J!',
      scale: 0.62, hp: 1250, speed: 4.2, think: [14, 28], poise: 90,
      punch: { wind: 0, dmg: 0, chain: 0.55 }, dash: { wind: 0, dmg: 0, speed: 0 },
      grenades: 0, slam: null, laser: null, enrageAt: 0.35,
      palette: { shell: ['#7f1d1d', '#3f0d0d', '#1c0606', '#000000'], eye: '#ef4444', accent: '#dc2626' },
    },
    {
      key: 'FINALE', boss: 'EMPEROR NOX', tagline: 'The mastermind himself. Then the true final battle.',
      scale: 0.62, hp: 1100, speed: 2.8, think: [16, 30], poise: 110,
      punch: { wind: 0, dmg: 0, chain: 0 }, dash: { wind: 0, dmg: 0, speed: 0 },
      grenades: 0, slam: null, laser: { charge: 50, fire: 40, dmg: 3 }, enrageAt: 0.4,
      palette: { shell: ['#2a1446', '#170a2a', '#0b0514', '#000000'], eye: '#e879f9', accent: '#d4a017' },
    },
    {
      key: 'KAIJU', boss: 'BEHEMOTH', tagline: 'The King of Monsters rises from the sea. You cannot win alone.',
      scale: 2.8, hp: 2400, speed: 1.8, think: [30, 55], poise: 320, tier: 6,
      punch: { wind: 0, dmg: 0, chain: 0 }, dash: { wind: 44, dmg: 24, speed: 12 },
      grenades: 0, slam: { wind: 30, dmg: 18 }, laser: null, breath: { charge: 70, fire: 50, dmg: 22 }, enrageAt: 0,
      palette: { shell: ['#2b3328', '#1a2019', '#0e120d', '#000000'], eye: '#fde047', accent: '#38bdf8' },
    },
    {
      key: 'SPIRIT', boss: 'CORRUPTED LION', tagline: 'Vorath stole your lion spirit. Beat it to bring it home.', defeat: 'PURIFIED',
      scale: 1.5, hp: 1400, speed: 4.0, think: [16, 30], poise: 120, tier: 7,
      punch: { wind: 12, dmg: 14, chain: 0.5 }, dash: { wind: 26, dmg: 20, speed: 18 },
      grenades: 0, slam: null, laser: null, enrageAt: 0.4,
      palette: { shell: ['#1a0a0a', '#0f0505', '#070202', '#000000'], eye: '#ff2020', accent: '#b91c1c' },
    },
    { // chapter 9's menu card; the fights themselves are against the four legion zords at the end of this table
      key: 'PHOENIX', boss: "VORATH'S LEGION", tagline: 'Four evil megazords are tearing the city apart. Rise from the ashes.',
      scale: 0.62, hp: 1000, speed: 3.4, think: [14, 26], poise: 120, tier: 8,
      punch: { wind: 0, dmg: 0, chain: 0.55 }, dash: { wind: 0, dmg: 0, speed: 0 },
      grenades: 0, slam: null, laser: null, enrageAt: 0.35,
      palette: { shell: ['#3f3f46', '#27272a', '#18181b', '#000000'], eye: '#ff2020', accent: '#f97316' },
    },
    { // chapter 10: ten of vorath's shade imps, small and quick to kill, a few on the roof at a time
      key: 'WOLF', boss: 'SHADE IMPS', tagline: 'Ten imps under a full moon. Something is coming down the moonbeam...',
      scale: 0.6, hp: 40, speed: 3.4, think: [26, 52], poise: 30, tier: 2,
      punch: { wind: 22, dmg: 7, chain: 0.3 }, dash: { wind: 36, dmg: 9, speed: 12 },
      grenades: 0, slam: null, laser: null, enrageAt: 0,
      palette: { shell: ['#24302a', '#141c17', '#0a0f0c', '#000000'], eye: '#4ade80', accent: '#15803d' },
    },
    { // level 4, round 2: only reached through the giant saga, fought by the megazord in a miniature city
      key: 'GIANT', boss: 'GIANT ABYSS KING', tagline: '',
      scale: 2.0, hp: 1400, speed: 2.6, think: [22, 42], poise: 200, tier: 6,
      punch: { wind: 22, dmg: 20, chain: 0.4 }, dash: { wind: 34, dmg: 24, speed: 15 },
      grenades: 3, grenadeDmg: 24, slam: { wind: 22, dmg: 24 }, laser: { charge: 64, fire: 50, dmg: 4 }, enrageAt: 0.35,
      palette: { shell: ['#4c2a7a', '#2a1048', '#150727', '#05010a'], eye: '#d8b4fe', accent: '#a855f7' },
    },
    { // level 5, final round: the dark megazord above the clouds
      key: 'SKY', boss: 'DARK MEGAZORD', tagline: '',
      scale: 0.62, hp: 1100, speed: 3.6, think: [14, 26], poise: 120, tier: 7,
      punch: { wind: 0, dmg: 0, chain: 0.6 }, dash: { wind: 0, dmg: 0, speed: 0 },
      grenades: 0, slam: null, laser: null, enrageAt: 0.35,
      palette: { shell: ['#7f1d1d', '#3f0d0d', '#1c0606', '#000000'], eye: '#ef4444', accent: '#dc2626' },
    },
    { // chapter 6, round 2: nox swollen with the fallen monsters
      key: 'TITAN', boss: 'NOX TITAN', tagline: '',
      scale: 2.1, hp: 1800, speed: 2.8, think: [20, 38], poise: 220, tier: 8,
      punch: { wind: 20, dmg: 22, chain: 0.5 }, dash: { wind: 30, dmg: 26, speed: 16 },
      grenades: 4, grenadeDmg: 24, slam: { wind: 20, dmg: 26 }, laser: { charge: 56, fire: 50, dmg: 5 }, enrageAt: 0.4,
      palette: { shell: ['#2a1446', '#170a2a', '#0b0514', '#000000'], eye: '#e879f9', accent: '#d4a017' },
    },
    { // chapter 7, final round: the behemoth against the lion megazord in the miniature city
      key: 'KAIJU', boss: 'BEHEMOTH', tagline: '',
      scale: 2.0, hp: 2200, speed: 2.2, think: [24, 44], poise: 260, tier: 8,
      punch: { wind: 0, dmg: 0, chain: 0 }, dash: { wind: 34, dmg: 24, speed: 14 },
      grenades: 0, slam: { wind: 26, dmg: 24 }, laser: null, breath: { charge: 64, fire: 50, dmg: 26 }, enrageAt: 0.4,
      palette: { shell: ['#2b3328', '#1a2019', '#0e120d', '#000000'], eye: '#fde047', accent: '#38bdf8' },
    },
    ...[ // chapter 9: vorath's legion, four evil megazords (sword fighters on the shadow knight's machinery)
      ['RAVAGER', 'ravager', 0xdc2626, '#ff2020'], ['VENOMAX', 'venom', 0x84cc16, '#a3e635'],
      ['FROSTFANG', 'frost', 0x67e8f9, '#67e8f9'], ['VOLTRIX', 'volt', 0xfacc15, '#fde047'],
    ].map(([name, style, tint, eye]) => ({
      key: 'PHOENIX', boss: name, tagline: '', style, tint,
      scale: 0.62, hp: 950, speed: 3.4, think: [14, 26], poise: 120, tier: 8,
      punch: { wind: 0, dmg: 0, chain: 0.55 }, dash: { wind: 0, dmg: 0, speed: 0 },
      grenades: 0, slam: null, laser: null, enrageAt: 0.35,
      palette: { shell: ['#3f3f46', '#27272a', '#18181b', '#000000'], eye, accent: eye },
    })),
  ];
  const PLAYABLE = 10; // levels 0-9 are on the menu; the rest are second rounds and chapter 9's legion
  const ABYSS = 3, SHADOW = 4, NOX = 5, KAIJU = 6, SPIRIT = 7, PHOENIX = 8, WOLF = 9, GIANT = 10, DARK_ZORD = 11, NOX_GIANT = 12, KAIJU_GIANT = 13;
  const LEGION = [14, 15, 16, 17];
  // arenas: nox's throne is 7 (5 and 6 are the giant city and the sky), the harbor is 8, the eclipse plateau 9,
  // the rooftop under a full moon 10; chapter 9 is fought in the giant city
  const levelArena = (i) => (i === NOX ? 7 : i === KAIJU ? 8 : i === SPIRIT ? 9 : i === PHOENIX ? 5 : i === WOLF ? 10 : i);
  // chapter 10: how many imps in all, how many on the roof at once, and when the white wolf comes
  const HORDE_SIZE = 10, HORDE_ON_FIELD = 4, WOLF_AFTER_KILLS = 3, WOLF_AT = 1500;
  const MOON = [700, 1300, -6800]; // the full moon over the chapter 10 rooftop, in world space
  const WOLF_RUN_Z = -2600; // how far back down the moonbeam the white wolf's run starts
  const DRAGON_UNLOCK = ABYSS + 2, LION_UNLOCK = KAIJU + 2; // `unlocked` value once those chapters are beaten

  // ---------------------------------------------------------------- hero
  const HERO_MOVES = {
    punch1: { wind: 5, active: 5, rec: 11, dmg: 9, reach: [20, 100], y: [-168, -128], kb: 3, poise: 8, energy: 7, sfx: 'punch', lunge: 2.5 },
    punch2: { wind: 4, active: 5, rec: 12, dmg: 11, reach: [10, 96], y: [-168, -128], kb: 3, poise: 10, energy: 7, sfx: 'punch', lunge: 2.5 },
    upper: { wind: 7, active: 6, rec: 20, dmg: 18, reach: [10, 90], y: [-210, -120], kb: 7, poise: 30, energy: 10, sfx: 'heavy', lunge: 3, name: 'UPPERCUT' },
    kick: { wind: 9, active: 6, rec: 16, dmg: 16, reach: [20, 128], y: [-120, -70], kb: 8, poise: 22, energy: 9, sfx: 'heavy', lunge: 1.5 },
    elbow: { wind: 5, active: 5, rec: 13, dmg: 14, reach: [10, 92], y: [-185, -110], kb: 4, poise: 16, energy: 8, sfx: 'punch', lunge: 4 },
    spinkick: { wind: 8, active: 8, rec: 20, dmg: 22, reach: [-40, 135], y: [-160, -60], kb: 11, poise: 32, energy: 12, sfx: 'heavy', lunge: 3.5, name: 'TORNADO KICK' },
    axe: { wind: 12, active: 6, rec: 18, dmg: 22, reach: [20, 120], y: [-240, -20], kb: 5, poise: 40, energy: 12, sfx: 'heavy', lunge: 2, name: 'AXE KICK' },
    airkick: { wind: 4, active: 16, rec: 6, dmg: 13, reach: [10, 96], y: [-80, -10], kb: 6, poise: 16, energy: 8, sfx: 'heavy', lunge: 0, air: true },
    hammer: { wind: 8, active: 40, rec: 0, dmg: 18, reach: [-20, 95], y: [-110, 10], kb: 6, poise: 26, energy: 9, sfx: 'heavy', lunge: 0, air: true, name: 'METEOR FIST' },
    // riding the black lion (chapter 7): claws, bite, pounce, and a diving maul from a leap
    lclaw1: { wind: 5, active: 6, rec: 10, dmg: 12, reach: [40, 210], y: [-210, -50], kb: 4, poise: 12, energy: 9, sfx: 'punch', lunge: 3, name: 'CLAW' },
    lclaw2: { wind: 5, active: 6, rec: 12, dmg: 14, reach: [40, 215], y: [-210, -50], kb: 4, poise: 14, energy: 9, sfx: 'punch', lunge: 3, name: 'CROSS CLAW' },
    lbite: { wind: 8, active: 7, rec: 18, dmg: 24, reach: [60, 235], y: [-230, -70], kb: 8, poise: 30, energy: 12, sfx: 'heavy', lunge: 5, name: 'LION BITE' },
    lpounce: { wind: 10, active: 14, rec: 16, dmg: 26, reach: [20, 225], y: [-240, -20], kb: 10, poise: 40, energy: 12, sfx: 'heavy', lunge: 1, name: 'POUNCE' },
    lmaul: { wind: 4, active: 40, rec: 0, dmg: 22, reach: [-20, 210], y: [-200, 20], kb: 6, poise: 30, energy: 10, sfx: 'heavy', lunge: 0, air: true, name: 'SKY MAUL' },
  };
  // what a punch / kick pressed during each move chains into
  const COMBO_NEXT = {
    punch1: { punch: 'punch2', kick: 'kick' },
    punch2: { punch: 'upper', kick: 'spinkick' },
    upper: { kick: 'spinkick' },
    kick: { kick: 'axe', punch: 'elbow' },
    elbow: { punch: 'upper' },
    lclaw1: { punch: 'lclaw2', kick: 'lpounce' },
    lclaw2: { punch: 'lbite', kick: 'lpounce' },
  };
  const COMBO_LIST = [
    ['J  J  J', 'Jab, cross, UPPERCUT'],
    ['J  J  K', 'Jab, cross, TORNADO KICK'],
    ['J  J  J  K', 'Uppercut into TORNADO KICK'],
    ['J  K  K', 'Jab, kick, AXE KICK'],
    ['K  K', 'Kick, AXE KICK'],
    ['K  J  J  K', 'Kick, elbow, uppercut, tornado kick'],
    ['Jump + J', 'METEOR FIST (dive)'],
    ['Jump + K', 'Flying kick'],
  ];

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
    windElbow: { lean: -0.08, bob: 2, fu: 0.3, ff: 3.0, bu: 0.4, bf: 2.7, ft: 0.35, fs: 0.05, bt: -0.35, bs: -0.1, head: 0 },
    elbow: { lean: 0.32, bob: 2, fu: 1.65, ff: -1.9, bu: 0.1, bf: 2.6, ft: 0.5, fs: 0.15, bt: -0.45, bs: -0.15, head: 0.1 },
    windSpin: { lean: -0.12, bob: 4, fu: 0.9, ff: 2.2, bu: -0.5, bf: 0.4, ft: 0.4, fs: -0.3, bt: -0.3, bs: -0.1, head: 0 },
    spin: { lean: -0.38, bob: -4, fu: 1.3, ff: 2.3, bu: -1.0, bf: 0.2, ft: 1.65, fs: 1.65, bt: -0.15, bs: 0, head: 0.1 },
    windAxe: { lean: -0.22, bob: -4, fu: 0.7, ff: 2.4, bu: -0.4, bf: 0.5, ft: 2.85, fs: 3.0, bt: -0.1, bs: 0, head: -0.05 },
    axe: { lean: 0.28, bob: 6, fu: 0.4, ff: 2.4, bu: -0.5, bf: 0.2, ft: 0.95, fs: 0.55, bt: -0.4, bs: -0.1, head: 0.15 },
    jump: { lean: 0.05, bob: -10, fu: 0.9, ff: 2.6, bu: 0.6, bf: 2.6, ft: 0.95, fs: -0.3, bt: 0.4, bs: -0.6, head: 0 },
    airkick: { lean: -0.25, bob: -6, fu: 1.0, ff: 2.4, bu: -0.6, bf: 0.5, ft: 1.15, fs: 1.15, bt: 0.5, bs: -0.5, head: 0.1 },
    windHammer: { lean: -0.12, bob: -8, fu: 3.0, ff: 3.1, bu: 3.0, bf: 3.1, ft: 1.2, fs: -0.4, bt: 0.6, bs: -0.8, head: -0.1, adduct: 0.3 },
    hammer: { lean: 0.42, bob: 0, fu: 1.2, ff: 0.8, bu: 1.2, bf: 0.8, ft: 0.8, fs: -0.2, bt: -0.2, bs: -0.6, head: 0.2, adduct: 0.35 },
    block: { lean: 0.02, bob: 4, fu: 1.25, ff: 2.95, bu: 1.15, bf: 3.05, ft: 0.35, fs: 0.1, bt: -0.3, bs: -0.1, head: 0.1, adduct: 0.25 },
    hurt: { lean: -0.35, bob: 2, fu: -0.3, ff: 0.6, bu: -0.6, bf: 0.2, ft: 0.4, fs: 0.2, bt: -0.4, bs: -0.2, head: -0.3 },
    roll: { lean: 0.3, bob: 26, fu: 1.6, ff: 2.8, bu: 1.4, bf: 2.8, ft: 1.8, fs: -0.2, bt: 1.4, bs: -0.4, head: 0.3 },
    raise: { lean: -0.05, bob: -4, fu: 3.0, ff: 3.1, bu: 3.0, bf: 3.1, ft: 0.6, fs: -0.2, bt: -0.6, bs: 0.2, head: -0.2 },
    smash: { lean: 0.35, bob: 10, fu: 1.1, ff: 1.0, bu: 1.0, bf: 0.9, ft: 0.7, fs: -0.1, bt: -0.6, bs: 0.3, head: 0.2, adduct: 0.3 },
    kameCharge: { lean: -0.15, bob: 12, fu: -0.55, ff: 0.75, bu: -0.55, bf: 0.75, ft: 0.5, fs: 0.1, bt: -0.55, bs: -0.25, head: 0.05, adduct: 0.5 },
    kameFire: { lean: 0.14, bob: 6, fu: 1.5, ff: 1.6, bu: 1.5, bf: 1.6, ft: 0.55, fs: 0.15, bt: -0.6, bs: -0.2, head: 0.05, adduct: 0.52 },
    hulkRoar: { lean: -0.12, bob: 8, fu: 0.9, ff: 2.6, bu: 0.9, bf: 2.6, ft: 0.45, fs: 0.05, bt: -0.45, bs: -0.05, head: -0.35, adduct: -0.45 },
    grab: { lean: 0.32, bob: 2, fu: 1.4, ff: 1.5, bu: 1.4, bf: 1.5, ft: 0.7, fs: 0.3, bt: -0.6, bs: -0.5, head: 0.1, adduct: 0.15 },
    lift: { lean: -0.05, bob: 6, fu: 3.05, ff: 3.1, bu: 3.05, bf: 3.1, ft: 0.4, fs: 0, bt: -0.4, bs: 0, head: -0.1, adduct: -0.1 },
    flex: { lean: 0, bob: 0, fu: 1.6, ff: 3.1, bu: 1.6, bf: 3.1, ft: 0.25, fs: 0, bt: -0.25, bs: 0, head: -0.1, adduct: -0.9 },
    swordRaise: { lean: -0.06, bob: 0, fu: 3.05, ff: 3.12, bu: 0.5, bf: 2.0, ft: 0.35, fs: 0.05, bt: -0.35, bs: -0.05, head: -0.25, adduct: 0.12 },
    swordReady: { lean: 0.1, bob: 4, fu: 1.0, ff: 2.0, bu: 0.3, bf: 2.6, ft: 0.5, fs: 0.1, bt: -0.45, bs: -0.15, head: 0, adduct: 0.1 },
    swordCut: { lean: 0.38, bob: 10, fu: 0.7, ff: 1.0, bu: 0.1, bf: 2.4, ft: 0.75, fs: 0.2, bt: -0.6, bs: -0.3, head: 0.15, adduct: 0.1 },
    swordDash: { lean: 0.55, bob: 14, fu: -0.7, ff: 0.2, bu: 0.9, bf: 2.0, ft: 0.95, fs: 0.3, bt: -0.8, bs: -0.6, head: 0.2 },
    sheath: { lean: 0.02, bob: 0, fu: 0.25, ff: 0.5, bu: 0.15, bf: 1.6, ft: 0.3, fs: 0.05, bt: -0.3, bs: -0.05, head: 0.3, adduct: 0.1 },
    swordClash: { lean: 0.35, bob: 8, fu: 1.35, ff: 1.95, bu: 1.25, bf: 1.85, ft: 0.75, fs: 0.2, bt: -0.75, bs: -0.35, head: 0.1, adduct: 0.42 },
    boot: { lean: -0.04, bob: 4, fu: 0.2, ff: 0.55, bu: 0.2, bf: 0.55, ft: 0.35, fs: 0.05, bt: -0.35, bs: -0.05, head: 0.4, adduct: -0.25 },
    ride: { lean: 0.12, bob: 0, fu: 1.0, ff: 2.0, bu: 0.3, bf: 2.6, ft: 1.35, fs: 0.35, bt: 1.2, bs: 0.25, head: 0, adduct: 0.1 }, // astride the lion
    howl: { lean: -0.22, bob: 4, fu: 0.45, ff: 1.0, bu: 0.45, bf: 1.0, ft: 0.4, fs: 0.05, bt: -0.4, bs: -0.05, head: -0.6, adduct: -0.35 }, // chest out, head back to the moon
    clawReady: { lean: 0.2, bob: 12, fu: 1.15, ff: 2.1, bu: 0.75, bf: 2.3, ft: 0.65, fs: 0.15, bt: -0.6, bs: -0.3, head: 0.05, adduct: 0.2 }, // low and ready to pounce
    dead: { lean: 0, bob: 0, fu: 0.2, ff: 0.2, bu: -0.2, bf: -0.2, ft: 0.1, fs: 0.1, bt: -0.1, bs: -0.1, head: 0 },
  };
  for (const p of Object.values(POSES)) if (p.adduct === undefined) p.adduct = 0;
  const POSE_KEYS = Object.keys(POSES.idle);
  // the lion's pose: gait speed 0..1+, crouch, leap stretch, rearing on its hind legs, jaw, front-paw swipe,
  // lying on its side, head pitch. `step` is the gait phase; whoever drives the lion eases the rest toward targets.
  const LION_KEYS = ['speed', 'crouch', 'leap', 'rear', 'jaw', 'swipe', 'fallen', 'pitch'];
  const newLionPose = () => ({ step: 0, speed: 0, crouch: 0, leap: 0, rear: 0, jaw: 0.1, swipe: 0, fallen: 0, pitch: 0 });
  const LION_REST = { speed: 0, crouch: 0, leap: 0, rear: 0, jaw: 0.1, swipe: 0, fallen: 0, pitch: 0 };
  function stepLionPose(lp, target, k) { for (const key of LION_KEYS) lp[key] = lerp(lp[key], target[key] ?? LION_REST[key], k); }

  const KAME_CHARGE = 56, KAME_FIRE = 64;
  // element keys that drop into the arena mid-fight
  const ELEMENT_TIME = 900;
  const ELEMENTS = {
    fire: { name: 'FIRE', color: '#f97316', hex: 0xf97316, rgb: '249,115,22', desc: 'hits burn  ·  +20% damage' },
    water: { name: 'WATER', color: '#38bdf8', hex: 0x38bdf8, rgb: '56,189,248', desc: 'hits heal you, push back + slow it' },
    thunder: { name: 'THUNDER', color: '#facc15', hex: 0xfacc15, rgb: '250,204,21', desc: 'every 3rd hit calls lightning' },
  };
  // sword-technique names once armored, and the finishers that launch a crescent slash
  const KNIGHT_NAMES = { punch1: 'SLASH', punch2: 'CROSS SLASH', upper: 'RISING DRAGON', elbow: 'HILT STRIKE', spinkick: 'DRAGON WHIRL', axe: 'HEAVEN SPLITTER', hammer: 'DRAGON DIVE' };
  const KNIGHT_FINISHERS = ['upper', 'spinkick', 'axe'];
  const LION_NAMES = { punch1: 'CLAW', punch2: 'CROSS CLAW', upper: 'RISING FANG', elbow: 'MANE BASH', spinkick: 'PRIDE WHIRL', axe: 'KING CLEAVER', hammer: 'LION DIVE' };
  // stages of the armor-up revive: frame it starts, how long it takes, height on the body, label
  const ARMOR_PARTS = [
    { at: 48, dur: 12, y: 210, label: 'DRAGON SWORD!' },
    { at: 60, dur: 16, y: 120, label: 'SUIT ON' },
    { at: 74, dur: 12, y: 150, label: 'ARMOR LOCKED' },
    { at: 88, dur: 10, y: 215, label: 'HELMET SEALED' },
  ];
  // states where the boss is helpless and the hero (or an effect) moves it around
  const LYING = ['down', 'getup', 'grabbed', 'tornado', 'shocked', 'floored'];
  const ARMOR_AT = 300; // frames into the fight before Kane armors up
  // what U / I / O do once armored
  const KNIGHT_SPECIALS = { slam: 'fireslash', kame: 'tornado', hulk: 'thunder' };
  // the white wolf armor: claw-technique names, U / I / O, and its stages as it locks on during the wolf's arrival
  const WOLF_NAMES = { punch1: 'CLAW', punch2: 'CROSS CLAW', upper: 'RISING FANG', kick: 'HIND KICK', elbow: 'FANG STRIKE', spinkick: 'MOON WHIRL', axe: 'LUNAR CLEAVE', hammer: 'WOLF DIVE', airkick: 'POUNCE' };
  const WOLF_SPECIALS = { slam: 'howl', kame: 'moonclaw', hulk: 'phantom' };
  const WOLF_PARTS = [
    { at: 172, dur: 10, y: 120, label: 'WOLF CLAWS!' },
    { at: 182, dur: 14, y: 120, label: 'MOON SUIT' },
    { at: 194, dur: 12, y: 150, label: 'WHITE FUR ARMOR' },
    { at: 206, dur: 10, y: 215, label: 'WOLF HELM' },
  ];
  const WOLF_MERGE = 170, WOLF_DONE = 236; // wolfup frames: the wolf leaps into Kane, and he is free to fight
  // the three beast armors Kane can swap between once armored (keys 1 / 2 / 3): how hard and how far each hits,
  // what U / I / O become, and its HUD colors
  const PHOENIX_NAMES = { punch1: 'TALON', punch2: 'CROSS TALON', upper: 'RISING FLAME', kick: 'FIRE KICK', elbow: 'EMBER STRIKE', spinkick: 'FLAME WHEEL', axe: 'SUNFALL', hammer: 'PHOENIX DROP', airkick: 'BLAZE KICK' };
  const BEASTS = {
    wolf: { name: 'WHITE WOLF ARMOR', tag: 'CLAWS x1.5', color: '#e0f2fe', dim: '#93c5fd', hex: 0x93c5fd, names: WOLF_NAMES, specials: WOLF_SPECIALS, dmg: 1.5, reach: 1.3, list: 'U  LUNAR HOWL    I  MOON CLAW    O  PHANTOM FANG' },
    lion: { name: 'BLACK LION ARMOR', tag: 'FISTS x1.7', color: '#fde68a', dim: '#d4a017', hex: 0xfacc15, names: LION_NAMES, specials: { slam: 'roar', kame: 'lionrush', hulk: 'kingbeast' }, dmg: 1.7, reach: 1.1, list: "U  KING'S ROAR    I  LION RUSH    O  KING OF BEASTS" },
    phoenix: { name: 'PHOENIX ARMOR', tag: 'BURNING TALONS  ·  ONE REBIRTH', color: '#fdba74', dim: '#f97316', hex: 0xf97316, names: PHOENIX_NAMES, specials: { slam: 'flamewings', kame: 'phoenixdive', hulk: 'flare' }, dmg: 1.4, reach: 1.2, list: 'U  FLAME WINGS    I  PHOENIX DIVE    O  PHOENIX FLARE' },
  };
  const BEAST_ORDER = ['wolf', 'lion', 'phoenix'], SWAP_T = 34;

  class Hero {
    constructor() {
      this.x = 260; this.y = GROUND; this.vx = 0; this.vy = 0; this.face = 1;
      this.maxHp = 200; this.hp = 200; this.trail = 200; this.energy = 0;
      this.state = 'idle'; this.t = 0; this.move = null; this.queued = null; this.hasHit = false;
      this.onGround = true; this.inv = 0; this.dodgeCd = 0; this.stun = 0; this.combo = 0; this.comboTimer = 0;
      this.pose = { ...POSES.idle }; this.walkPhase = 0; this.deathT = 0; this.maxCombo = 0; this.damageTaken = 0;
      this.special = null; this.phase = null; this.spin = 0; this.hulk = 0; this.orb = 0; this.needT = 0;
      this.rage = false; this.revived = false; // rage = armored dragon knight after a revive
      this.element = null; this.elementT = 0; this.thunderN = 0;
      this.mount = null; this.lp = null; // mount = 'lion' while this is the black lion with Kane on its back
      this.beast = null; this.hitList = []; // beast = which beast armor he wears (wolf/lion/phoenix); hitList = everyone this swing has hit
      this.reborn = false; // the phoenix armor's one rebirth per fight is spent
    }
    get armored() { return this.rage || !!this.beast; }
    get wolf() { return this.beast === 'wolf'; }
    get B() { return this.beast ? BEASTS[this.beast] : null; }
    get size() { return this.armored ? 1.15 : 1; } // reach / height multiplier in armored form
    get halfW() { return this.mount ? 135 : 22; } // for body blocking (the lion's head reaches well past its middle)
    get hurtbox() {
      if (this.state === 'dead') return null;
      if (this.mount) return this.state === 'dodge' ? { x: this.x - 80, y: this.y - 130, w: 160, h: 130 } : { x: this.x - 100, y: this.y - 250, w: 200, h: 250 };
      if (this.state === 'dodge') return { x: this.x - 30, y: this.y - 80, w: 60, h: 80 };
      const s = this.size;
      return { x: this.x - 30 * s, y: this.y - 190 * s, w: 60 * s, h: 190 * s };
    }
    // how far through the revive growth spurt the hero is (0..1); 1 for good once raging
    get rageK() {
      if (this.armored) return 1;
      if (this.state === 'armorup') return clamp((this.t - 40) / 60, 0, 1);
      return this.state === 'wolfup' ? clamp((this.t - WOLF_MERGE) / 40, 0, 1) : 0;
    }
    setState(s) { this.state = s; this.t = 0; }
    attack(name) {
      this.move = name; this.setState('attack'); this.hasHit = false; this.queued = null; this.hitList = [];
      const m = HERO_MOVES[name], label = (this.lion && LION_NAMES[name]) || (this.rage && KNIGHT_NAMES[name]) || (this.B && this.B.names[name]) || m.name;
      if (label) popText(this.x + this.face * 30, this.y - 240, label, this.B ? this.B.color : this.rage ? '#93c5fd' : '#fde047', 24);
      if (this.armored) sfx.slash(); else sfx.whoosh();
    }
    // a glowing crescent slash that flies across the arena (three claw marks in the wolf armor)
    launchSlash() {
      const el = this.element && ELEMENTS[this.element], y = this.y - 120 * this.size;
      if (this.wolf) for (const dy of [-26, 0, 26]) game.slashes.push({ x: this.x + this.face * 60, y: y + dy, dir: this.face, life: 40, hit: false, color: el ? el.hex : 0xbfdbfe, scale: 0.7, dmg: 8 });
      else if (this.beast === 'lion') game.slashes.push({ x: this.x + this.face * 60, y, dir: this.face, life: 40, hit: false, color: el ? el.hex : 0xfacc15, scale: 1.3, dmg: 22 });
      else if (this.beast === 'phoenix') game.slashes.push({ x: this.x + this.face * 60, y, dir: this.face, life: 44, hit: false, color: 0xf97316, scale: 1.1, dmg: 16, fire: true });
      else game.slashes.push({ x: this.x + this.face * 60, y, dir: this.face, life: 48, hit: false, color: el ? el.hex : 0xe5e7eb });
      sfx.slash(); sfx.charge(); shakeIt(4);
    }
    // element key bonus on top of a landed hit
    applyElement(boss, hx, hy) {
      if (!boss || !boss.alive) return;
      const el = this.element;
      if (el === 'fire') { boss.burn = 150; burst(hx, hy, 14, '#f97316', 7, 5, -0.15, 24); }
      if (el === 'water') {
        this.hp = Math.min(this.maxHp, this.hp + 3); boss.soak = 240;
        if (!LYING.includes(boss.state)) boss.vx += this.face * 3;
        burst(hx, hy, 16, '#38bdf8', 7, 4, 0.35, 26);
      }
      if (el === 'thunder' && ++this.thunderN % 3 === 0) {
        game.bolts.push({ x: boss.x, y: boss.hurtbox ? boss.hurtbox.y : boss.y - 150, life: 14 });
        flash = 5; sfx.zap(); sfx.boom();
        burst(boss.x, boss.y - 40, 24, '#facc15', 10, 4, 0.2, 22);
        boss.takeHit(14, 40, 0, boss.x, (boss.hurtbox ? boss.hurtbox.y : boss.y - 150) + 30);
      }
    }
    pickUpKey(k) {
      const E = ELEMENTS[k.el];
      this.element = k.el; this.elementT = ELEMENT_TIME; this.thunderN = 0;
      popText(this.x, this.y - 250, `${E.name} KEY!`, E.color, 38);
      burst(this.x, this.y - 120, 50, E.color, 10, 5, 0, 34);
      game.rings.push({ x: this.x, y: GROUND, r: 10, life: 24, color: E.rgb });
      sfx.select(); sfx.chant(2); sfx.clank();
    }
    attackBox() {
      const m = HERO_MOVES[this.move], s = this.size, sword = this.rage ? 1.45 : this.B ? this.B.reach : 1; // the blade (or claws) add reach
      const x0 = this.x + this.face * m.reach[0] * s, x1 = this.x + this.face * m.reach[1] * s * sword;
      return { x: Math.min(x0, x1), y: this.y + m.y[0] * s, w: Math.abs(x1 - x0), h: (m.y[1] - m.y[0]) * s };
    }
    addCombo() { this.combo++; this.comboTimer = 70; this.maxCombo = Math.max(this.maxCombo, this.combo); }
    update(c, boss) {
      this.t++;
      if (this.inv > 0) this.inv--;
      if (this.dodgeCd > 0) this.dodgeCd--;
      if (this.needT > 0) this.needT--;
      if (this.comboTimer > 0 && --this.comboTimer === 0) this.combo = 0;
      if (this.special !== 'hulk' && this.hulk > 0) this.hulk = Math.max(0, this.hulk - 0.02);
      if (this.element) {
        if (--this.elementT <= 0) { popText(this.x, this.y - 230, `${ELEMENTS[this.element].name} FADED`, '#9ca3af', 18); this.element = null; }
        else if (this.t % 3 === 0 && this.state !== 'dead') { // element aura around the fists
          const px = this.x + this.face * 30 * this.size, py = this.y - 140 * this.size;
          if (this.element === 'fire') burst(px, py, 1, Math.random() < 0.5 ? '#f97316' : '#fde047', 1.5, 4, -0.12, 20, 20);
          if (this.element === 'water') burst(px, py, 1, '#38bdf8', 1.5, 4, 0.3, 22, 20);
          if (this.element === 'thunder') burst(px + rand(-14, 14), py + rand(-14, 14), 1, '#fef08a', 4, 3, 0, 7, 20);
        }
      }
      const toBoss = boss ? Math.sign(boss.x - this.x) || this.face : this.face;
      const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);

      switch (this.state) {
        case 'idle': case 'walk': {
          this.face = toBoss;
          if (this.mount) { // the black lion: claws, pounce, leap; T at full energy becomes the lion megazord
            if (c.transform) {
              if (this.energy >= 100) { game.startLionZordSaga(); break; }
              if (this.needT === 0) { popText(this.x, this.y - 300, 'T NEEDS FULL ENERGY', '#fde68a', 20); this.needT = 40; }
            }
            if (c.punch) { this.attack('lclaw1'); break; }
            if (c.kick) { this.attack('lpounce'); break; }
            if (c.dodge && this.dodgeCd === 0) { this.setState('dodge'); this.inv = 22; this.vx = (dir || this.face) * 14; sfx.whoosh(); break; }
            if (c.block) { this.setState('block'); this.vx = 0; break; }
            if (c.jump) { this.vy = -19; this.onGround = false; this.setState('jump'); sfx.jump(); break; }
            this.vx = dir * 6.5;
            this.state = dir ? 'walk' : 'idle';
            break;
          }
          if ((c.summonDragon || c.summonLion) && game.canSummon(c.summonDragon ? 'dragon' : 'lion')) { this.setState('calling'); this.vx = 0; this.inv = 34; this.summonKind = c.summonDragon ? 'dragon' : 'lion'; break; }
          if (c.splash && this.style === 'phoenix') { // F: mega phoenix splash
            if (this.energy >= 100 && boss && boss.alive) { this.startSpecial('splash', boss); break; }
            if (this.needT === 0) { popText(this.x, this.y - 300, 'F NEEDS FULL ENERGY', '#fdba74', 20); this.needT = 40; }
          }
          const want = c.armor1 ? 'wolf' : c.armor2 ? 'lion' : c.armor3 ? 'phoenix' : null;
          if (want && this.beast && want !== this.beast && !this.zord) { this.swapBeast(want); break; }
          let sp = c.slam ? 'slam' : c.kame ? 'kame' : c.hulk ? 'hulk' : null;
          if (sp && this.rage) sp = KNIGHT_SPECIALS[sp];
          else if (sp && this.B) sp = this.B.specials[sp];
          if (c.oneshot && boss && boss.alive) { this.startSpecial('oneshot', boss); break; }
          if (sp && this.energy >= 100) { this.startSpecial(sp, boss); break; }
          if (sp && this.needT === 0) { popText(this.x, this.y - 230, 'NEED FULL ENERGY', '#93c5fd', 18); this.needT = 40; }
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
          this.vx = lerp(this.vx, dir * (this.mount ? 7 : 5), 0.2);
          if (this.mount && (c.punch || c.kick)) this.attack('lmaul');
          else if (c.punch) this.attack('hammer');
          else if (c.kick) this.attack('airkick');
          break;
        case 'attack': {
          const m = HERO_MOVES[this.move], next = COMBO_NEXT[this.move] || {};
          if (c.punch && next.punch) this.queued = 'punch';
          if (c.kick && next.kick) this.queued = 'kick';
          if (this.onGround && !m.air) this.vx = this.t <= m.wind + 2 ? this.face * m.lunge : this.vx * 0.7;
          if (this.move === 'lpounce' && this.t > m.wind && this.t <= m.wind + m.active) this.vx = this.face * 13; // the leap carries through
          if (this.t > m.wind && this.t <= m.wind + m.active) this.checkHit(boss, m);
          if (this.armored && this.t === m.wind + 1 && KNIGHT_FINISHERS.includes(this.move)) this.launchSlash();
          if (m.air) {
            if (this.move === 'hammer' || this.move === 'lmaul') {
              if (this.t <= m.wind) { this.vy = Math.min(this.vy, 0) * 0.5; this.vx *= 0.85; } else { this.vy = Math.max(this.vy, 17); this.vx = this.face * 3; }
            } else this.vx = lerp(this.vx, this.face * 6, 0.3);
            if (this.onGround) this.setState('idle');
            break;
          }
          if (this.t >= m.wind + m.active + m.rec || (this.queued && this.t >= m.wind + m.active + 3)) {
            if (this.queued) this.attack(next[this.queued]);
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
        case 'armorup':
          this.updateArmorUp(boss);
          break;
        case 'wolfup':
          this.updateWolfUp();
          break;
        case 'swap': // the old armor bursts off and the new beast's locks on, piece by piece
          this.vx = 0;
          if (this.t % 2 === 0) burst(this.x + rand(-30, 30), this.y - rand(30, 230), 2, this.B.color, 3, 5, -0.1, 18, rand(-40, 40));
          if (this.t >= SWAP_T) this.setState('idle');
          break;
        case 'clash':
          this.vx = 0;
          break;
        case 'victory':
          this.vx = 0;
          break;
        case 'calling': // fist raised: the dragon or the lion answers
          this.vx = 0;
          if (this.t === 1) { sfx.charge(); popText(this.x, this.y - 280, this.summonKind === 'dragon' ? 'COME, DRAGON!' : 'COME, BLACK LION!', this.summonKind === 'dragon' ? '#facc15' : '#fde68a', 34); }
          if (this.t % 3 === 0) burst(this.x + rand(-20, 20), this.y - rand(150, 260), 2, this.summonKind === 'dragon' ? '#fde047' : '#d4a017', 3, 4, -0.1, 18);
          if (this.t === 22) { game.bolts.push({ x: this.x, y: this.y - 230, life: 12, color: this.summonKind === 'dragon' ? 0xfacc15 : 0xd4a017 }); flash = 6; sfx.zap(); sfx.roar(); game.startAssist(this.summonKind); }
          if (this.t >= 30) this.setState('idle');
          break;
      }

      // physics
      if (!this.onGround) this.vy += 0.9;
      this.x += this.vx; this.y += this.vy;
      if (this.y >= GROUND) {
        this.y = GROUND; this.vy = 0;
        if (!this.onGround) {
          this.onGround = true;
          if (this.state === 'attack' && (this.move === 'hammer' || this.move === 'lmaul')) this.meteorImpact();
          if (this.state === 'jump' || (this.state === 'attack' && HERO_MOVES[this.move].air)) this.setState('idle');
        }
      }
      this.x = clamp(this.x, ARENA_L, ARENA_R);
      this.animate();
    }
    meteorImpact() {
      shakeIt(9); sfx.heavy();
      burst(this.x + this.face * 30, GROUND, 24, '#fde68a', 8, 5, 0.3, 26);
      game.rings.push({ x: this.x + this.face * 30, y: GROUND, r: 10, life: 18, color: '253,230,138' });
    }
    checkHit(boss, m) {
      const box = this.attackBox();
      // swat grenades back at the boss (any attack reaches down to the floor for this)
      const swat = { x: box.x, y: box.y, w: box.w, h: this.y + 8 - box.y };
      for (const o of game.orbs) {
        if (o.life > 0 && overlap(swat, { x: o.x - 18, y: o.y - 18, w: 36, h: 36 })) { o.life = 0; burst(o.x, o.y, 18, '#ffffff', 8, 4, 0.1, 18); popText(o.x, o.y - 30, 'SHATTERED!', '#e879f9', 20); sfx.clank(); }
      }
      for (const g of game.grenades) {
        if (!g.reflected && overlap(swat, { x: g.x - 14, y: g.y - 14, w: 28, h: 28 })) {
          g.reflected = true; g.vx = this.face * 13; g.vy = -7; g.fuse = 40; g.landed = false;
          popText(g.x, g.y - 30, 'RETURNED!', '#7dd3fc', 22); sfx.clank(); hitstop = 4;
        }
      }
      // one swing can catch every imp in reach (against a single boss this is just the one hit)
      const foes = game.horde ? game.foes() : boss && boss.alive ? [boss] : [];
      for (const foe of foes) {
        if (this.hitList.includes(foe) || !overlap(box, foe.hurtbox)) continue;
        this.hitList.push(foe); this.hasHit = true;
        const crit = (this.combo >= 6 ? 1.2 : 1) * (this.rage ? 1.5 : this.B ? this.B.dmg : 1) * (this.element === 'fire' ? 1.2 : 1);
        const hx = clamp(box.x + box.w / 2, foe.hurtbox.x, foe.hurtbox.x + foe.hurtbox.w), hy = Math.max(box.y + box.h / 2, foe.hurtbox.y + 20);
        foe.takeHit(Math.round(m.dmg * crit), m.poise, this.face * m.kb, hx, hy);
        this.applyElement(foe, hx, hy);
        this.energy = Math.min(100, this.energy + m.energy);
        this.addCombo();
        if (this.armored) { sfx.slash(); burst(hx, box.y + box.h / 2, 10, this.B ? this.B.color : '#93c5fd', 7, 4, 0.1, 18); }
        if (this.beast === 'phoenix' && foe.alive) { foe.burn = Math.max(foe.burn || 0, 90); burst(hx, box.y + box.h / 2, 8, '#f97316', 6, 5, -0.15, 20); } // burning talons
        if (!this.armored || m.sfx === 'heavy') sfx[m.sfx]();
        hitstop = m.sfx === 'heavy' ? 6 : 3;
      }
    }

    // ---- specials: body slam (U), kamehameha (I), hulk smash (O)
    startSpecial(kind, boss) {
      const keep = kind === 'oneshot' ? this.energy : 0; // the one-shot costs no energy
      this.setState('special'); this.special = kind; this.energy = keep; this.smashed = false;
      this.vx = 0; this.spin = 0; this.phase = kind === 'slam' ? 'dash' : null;
      if (kind === 'kame') sfx.charge();
      if (kind === 'hulk') { sfx.roar(); shakeIt(10); popText(this.x, this.y - 260, 'HULK SMASH!', '#86efac', 44); }
      if (kind === 'slam') { sfx.whoosh(); popText(this.x, this.y - 240, 'BODY SLAM!', '#fca5a5', 38); }
      if (kind === 'fireslash') { sfx.charge(); popText(this.x, this.y - 330, 'FLAME SLASH!', '#f97316', 44); }
      if (kind === 'tornado') { sfx.charge(); popText(this.x, this.y - 330, 'WATER TORNADO!', '#38bdf8', 44); }
      if (kind === 'oneshot') { sfx.charge(); sfx.roar(); shakeIt(8); popText(this.x, this.y - (this.zord ? 360 : 300), 'DRAGON GOD SLASH!', '#fde047', 48); }
      if (kind === 'thunder') { sfx.charge(); sfx.zap(); popText(this.x, this.y - 330, 'THUNDER DASH!', '#facc15', 44); this.phase = 'charge'; }
      if (kind === 'splash') { sfx.charge(); sfx.whoosh(); popText(this.x, this.y - 330, 'PHOENIX GRAB!', '#fb923c', 40); this.phase = 'dash'; }
      if (kind === 'howl') { sfx.charge(); popText(this.x, this.y - 330, 'LUNAR HOWL!', '#e0f2fe', 44); }
      if (kind === 'moonclaw') { sfx.charge(); popText(this.x, this.y - 330, 'MOON CLAW!', '#bfdbfe', 44); }
      if (kind === 'phantom') { sfx.charge(); sfx.howl(); popText(this.x, this.y - 330, 'PHANTOM FANG!', '#e0f2fe', 50); game.phantom = { t: 0, ghosts: [] }; }
      if (kind === 'roar') { sfx.charge(); popText(this.x, this.y - 330, "KING'S ROAR!", '#fde68a', 44); }
      if (kind === 'lionrush') { sfx.charge(); popText(this.x, this.y - 330, 'LION RUSH!', '#fde68a', 44); }
      if (kind === 'kingbeast') { sfx.charge(); sfx.roar(); popText(this.x, this.y - 330, 'KING OF BEASTS!', '#facc15', 50); this.phase = 'call'; }
      if (kind === 'flamewings') { sfx.charge(); popText(this.x, this.y - 330, 'FLAME WINGS!', '#fdba74', 44); }
      if (kind === 'phoenixdive') { sfx.jump(); sfx.whoosh(); popText(this.x, this.y - 330, 'PHOENIX DIVE!', '#fdba74', 44); this.phase = 'up'; this.vy = -26; this.onGround = false; }
      if (kind === 'flare') { sfx.charge(); sfx.screech(); popText(this.x, this.y - 330, 'PHOENIX FLARE!', '#fb923c', 50); this.phase = 'rise'; }
      this.target = boss ? boss.x : this.x;
    }
    // the closest thing to hit (an imp, or the boss)
    nearestFoe() { return game.foes().sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0] || null; }
    // ---- swapping beast armors (1 wolf / 2 lion / 3 phoenix): a flash, the new pieces lock on in half a second
    swapBeast(name) {
      const B = BEASTS[name];
      this.beast = name; this.setState('swap'); this.vx = 0; this.inv = SWAP_T + 10;
      flash = 8; shakeIt(10); sfx.servo(); sfx.clank();
      if (name === 'wolf') sfx.howl(); else if (name === 'lion') sfx.roar(); else sfx.screech();
      popText(this.x, this.y - 300, `${B.name}!`, B.color, 34);
      burst(this.x, this.y - 130, 60, B.color, 12, 5, 0, 30); burst(this.x, this.y - 130, 30, '#ffffff', 9, 4, 0, 24);
      game.rings.push({ x: this.x, y: GROUND, r: 10, life: 24, color: { wolf: '191,219,254', lion: '250,204,21', phoenix: '249,115,22' }[name] });
    }
    // ---- black lion specials: king's roar (U), lion rush (I), king of beasts (O)
    updateRoar() { // a roar that blows everything in front of him off its feet
      this.vx = 0;
      if (this.t === 12) {
        sfx.roar(); sfx.boom(); shakeIt(20); flash = 6;
        for (const [r, life] of [[20, 24], [-60, 30], [-140, 36]]) game.rings.push({ x: this.x + this.face * 120, y: this.y - 170, r, life, color: '250,204,21' });
        for (let i = 0; i < 40; i++) particles.push({ x: this.x + this.face * 60, y: this.y - 170 + rand(-40, 40), z: rand(-40, 40), vx: this.face * rand(8, 18), vy: rand(-3, 3), vz: rand(-3, 3), life: 26, max: 26, color: i % 3 ? '#fde68a' : '#ffffff', size: 7, g: 0 });
        for (const f of game.foes()) {
          const d = (f.x - this.x) * this.face;
          if (d < -40 || d > 560) continue;
          f.takeHit(24, 0, this.face * 10, f.x, f.y - 100 * f.k); this.addCombo();
          if (f.alive && !LYING.includes(f.state)) f.knockdown(this.face);
        }
      }
      if (this.t > 48) this.endSpecial();
    }
    updateLionRush() { // a golden charge straight through everything in the way
      if (this.t < 10) { this.vx = 0; return; }
      if (this.t === 10) { this.hitList = []; sfx.whoosh(); sfx.roar(); }
      if (this.t <= 30) {
        this.vx = this.face * 26;
        for (let i = 0; i < 4; i++) particles.push({ x: this.x - this.face * rand(0, 50), y: this.y - rand(20, 220), z: rand(-30, 30), vx: 0, vy: 0, vz: 0, life: 16, max: 16, color: i ? '#facc15' : '#ffffff', size: 8, g: 0 });
        for (const f of game.foes()) {
          if (this.hitList.includes(f) || Math.abs(f.x - this.x) > 70 + 40 * f.k) continue;
          this.hitList.push(f);
          f.takeHit(30, 0, this.face * 12, f.x, f.y - 100 * f.k); this.addCombo();
          if (f.alive && !LYING.includes(f.state)) f.knockdown(this.face);
          hitstop = 4; shakeIt(12); sfx.heavy(); burst(f.x, f.y - 100 * f.k, 30, '#facc15', 10, 5, 0.1, 24);
        }
        if (this.x <= ARENA_L + 1 || this.x >= ARENA_R - 1) this.t = 30;
        return;
      }
      this.vx *= 0.7;
      if (this.t > 44) this.endSpecial();
    }
    // King of Beasts: a golden spirit lion leaps out of Kane and mauls the closest foe, roars it flat, and Kane comes
    // down on it from the sky. The spirit lives in game.lionGhost (drawn with its own lion model).
    updateKingBeast() {
      const tg = this.nearestFoe(), tx = tg ? tg.x : this.x + this.face * 300;
      let L = game.lionGhost;
      switch (this.phase) {
        case 'call': // the spirit rises out of him
          this.vx = 0;
          if (this.t === 1) {
            L = game.lionGhost = { x: this.x - this.face * 40, y: GROUND, vx: 0, vy: 0, face: this.face, lp: newLionPose(), fade: 0, scale: 1.25, onGround: true, t: 0 };
            burst(this.x, this.y - 120, 50, '#facc15', 10, 6, -0.1, 30); flash = 6;
          }
          L.fade = Math.min(0.62, L.fade + 0.05); // part-faded, so it glows gold like a spirit
          game.stepSagaLion(L, { rear: 0.7, jaw: 1, pitch: -0.3 });
          if (this.t === 14) { sfx.roar(); shakeIt(14); game.rings.push({ x: L.x, y: GROUND - 200, r: 20, life: 24, color: '250,204,21' }); }
          if (this.t >= 26) { this.phase = 'leap'; this.t = 0; L.vy = -15; L.onGround = false; L.vx = (tx - L.face * 60 - L.x) / 28; L.face = Math.sign(tx - L.x) || L.face; sfx.whoosh(); }
          break;
        case 'leap':
          this.vx = 0;
          game.stepSagaLion(L, { leap: 1, jaw: 1, swipe: 0.6 });
          if (L.onGround) {
            this.phase = 'maul'; this.t = 0; L.vx = 0; shakeIt(14); sfx.heavy();
            if (tg) { tg.takeHit(20, 0, L.face * 4, tg.x, tg.y - 100 * tg.k); this.addCombo(); if (tg.alive && !LYING.includes(tg.state)) { tg.setState('shocked'); tg.vx = 0; } }
          }
          break;
        case 'maul':
          this.vx = 0;
          game.stepSagaLion(L, { swipe: this.t % 10 < 5 ? 1 : 0.3, jaw: 0.8, crouch: 0.2 });
          if (tg && this.t % 10 === 5 && this.t < 36) { tg.takeHit(12, 0, 0, tg.x, tg.y - 110 * tg.k); this.addCombo(); sfx.punch(); burst(tg.x, tg.y - 110 * tg.k, 14, '#facc15', 7, 4, 0.1, 18); }
          if (this.t >= 40) { // Kane leaps for the sky while the spirit roars
            this.phase = 'jump'; this.t = 0; this.vy = -21; this.onGround = false; sfx.jump(); sfx.roar();
            this.target = clamp(tx - this.face * 30, ARENA_L, ARENA_R);
            popText(this.x, this.y - 320, 'BOW TO THE KING!', '#fde047', 36);
          }
          break;
        case 'jump':
          if (L) { L.fade = Math.max(0, L.fade - 0.03); game.stepSagaLion(L, { rear: 0.8, jaw: 1, pitch: -0.3 }); }
          this.vx = (this.target - this.x) * 0.08;
          burst(this.x, this.y - 110, 2, '#facc15', 2, 6, 0, 18);
          if (this.onGround && this.t > 4) { // and lands fist-first in a golden shockwave
            this.phase = 'land'; this.t = 0; this.vx = 0;
            shakeIt(32); flash = 14; sfx.boom(); sfx.heavy(); sfx.roar();
            burst(this.x, GROUND, 80, '#facc15', 15, 7, 0.3, 45); burst(this.x, GROUND, 40, '#ffffff', 10, 4, 0.2, 30);
            for (const [r, c] of [[10, '250,204,21'], [-110, '255,255,255']]) game.rings.push({ x: this.x, y: GROUND, r, life: 34, color: c });
            game.cracks.push({ x: this.x, life: 360, color: '#facc15' });
            for (const f of game.foes()) {
              if (Math.abs(f.x - this.x) > 240) continue;
              const away = Math.sign(f.x - this.x) || this.face;
              f.takeHit(60, 0, away * 10, f.x, f.y - 100 * f.k); this.addCombo();
              if (f.alive && f.onGround && !LYING.includes(f.state)) f.knockdown(away);
            }
          }
          break;
        case 'land':
          this.vx = 0;
          if (this.t > 30) { game.lionGhost = null; this.endSpecial(); }
          break;
      }
    }
    // ---- phoenix specials: flame wings (U), phoenix dive (I), phoenix flare (O)
    updateFlameWings() { // the wings flare and throw a wave of fire both ways
      this.vx = 0;
      if (this.t < 14 && this.t % 2 === 0) for (const d of [-1, 1]) burst(this.x + d * 60, this.y - 170, 3, Math.random() < 0.5 ? '#f97316' : '#fde047', 4, 7, -0.2, 22);
      if (this.t === 14) {
        for (const d of [-1, 1]) for (const dy of [-50, 30]) game.slashes.push({ x: this.x + d * 70, y: this.y - 130 + dy, dir: d, life: 56, hit: false, color: 0xf97316, scale: 1.5, dmg: 22, fire: true, speed: 16 });
        sfx.boom(); sfx.screech(); shakeIt(14); flash = 6;
        burst(this.x, this.y - 150, 70, '#f97316', 14, 7, -0.1, 34); burst(this.x, this.y - 150, 30, '#fde047', 10, 5, -0.1, 28);
      }
      if (this.t > 38) this.endSpecial();
    }
    updatePhoenixDive() { // straight up wrapped in fire, then down onto the closest foe like a falling star
      const fire = (n) => { for (let i = 0; i < n; i++) particles.push({ x: this.x + rand(-30, 30), y: this.y - rand(0, 200), z: rand(-30, 30), vx: rand(-1, 1), vy: -rand(1, 4), vz: 0, life: 20, max: 20, color: ['#ff4500', '#f97316', '#fde047'][i % 3], size: 9, g: 0 }); };
      switch (this.phase) {
        case 'up':
          this.vx = 0; fire(3);
          if (this.vy >= 0) {
            const tg = this.nearestFoe();
            this.phase = 'dive'; this.target = tg ? tg.x : clamp(this.x + this.face * 300, ARENA_L, ARENA_R);
            this.face = Math.sign(this.target - this.x) || this.face; this.vy = 26; sfx.screech(); sfx.whoosh();
          }
          break;
        case 'dive':
          this.vx = clamp((this.target - this.x) * 0.2, -22, 22); this.vy = Math.max(this.vy, 26); fire(6);
          if (this.onGround) {
            this.phase = 'land'; this.t = 0; this.vx = 0;
            shakeIt(28); flash = 12; sfx.boom(); sfx.boom();
            for (const [dx, dy, r] of [[0, -40, 200], [-70, -20, 140], [70, -30, 150]]) game.explosions.push({ x: this.x + dx, y: GROUND + dy, r, t: 0, harmless: true });
            burst(this.x, GROUND - 40, 90, '#f97316', 15, 7, 0.2, 44); burst(this.x, GROUND - 40, 40, '#fde047', 12, 5, 0.2, 36);
            game.rings.push({ x: this.x, y: GROUND, r: 10, life: 30, color: '249,115,22' });
            game.cracks.push({ x: this.x, life: 360, color: '#f97316' });
            for (const f of game.foes()) {
              if (Math.abs(f.x - this.x) > 230) continue;
              const away = Math.sign(f.x - this.x) || this.face;
              f.takeHit(40, 0, away * 9, f.x, f.y - 100 * f.k); this.addCombo();
              if (f.alive) { f.burn = Math.max(f.burn || 0, 220); if (f.onGround && !LYING.includes(f.state)) f.knockdown(away); }
            }
          }
          break;
        case 'land':
          this.vx = 0;
          if (this.t > 24) this.endSpecial();
          break;
      }
    }
    // Phoenix Flare: Kane rises, bursts into a great fire eagle that sweeps the whole roof (game.fireBird), wheels
    // round high above, and comes down as Kane again in a pillar of fire
    updateFlare() {
      const t = this.t;
      this.vx = 0; this.vy = 0;
      if (t <= 24) { // lifted on fire
        this.y = GROUND - 140 * ease(t / 24); this.onGround = true;
        burst(this.x + rand(-30, 30), this.y - rand(0, 180), 3, Math.random() < 0.5 ? '#f97316' : '#fde047', 3, 8, -0.2, 22);
      }
      if (t === 24) { // and becomes the bird
        this.cloak = true; this.hitList = []; flash = 16; shakeIt(18); sfx.boom(); sfx.screech();
        burst(this.x, this.y - 100, 80, '#f97316', 14, 7, 0, 36);
        const to = this.face > 0 ? ARENA_R + 260 : ARENA_L - 260;
        game.fireBird = { x: this.x, y: this.y - 100, z: 0, face: this.face, flap: 0, scale: 1.1, bank: 0, from: this.x, to, fromY: this.y - 100 };
      }
      const fb = game.fireBird;
      if (fb) {
        fb.flap += 0.35;
        if (t > 24 && t <= 70) { // the sweep, low across the roof, burning everything it passes
          const e = (t - 24) / 46;
          fb.x = lerp(fb.from, fb.to, e); fb.y = lerp(fb.fromY, GROUND - 130, Math.sin(e * Math.PI) * 0.6 + e * 0.4); fb.bank = 0.15;
          for (let i = 0; i < 6; i++) particles.push({ x: fb.x - fb.face * rand(0, 160), y: fb.y + rand(-50, 50), z: rand(-80, 80), vx: -fb.face * rand(1, 4), vy: -rand(0, 2), vz: 0, life: 26, max: 26, color: ['#ff4500', '#f97316', '#fde047'][i % 3], size: 12, g: 0 });
          for (const f of game.foes()) {
            if (this.hitList.includes(f) || Math.abs(f.x - fb.x) > 130) continue;
            this.hitList.push(f);
            f.takeHit(45, 0, fb.face * 10, f.x, f.y - 100 * f.k); this.addCombo();
            if (f.alive) { f.burn = Math.max(f.burn || 0, 300); if (f.onGround && !LYING.includes(f.state)) f.knockdown(fb.face); }
            hitstop = 4; shakeIt(16); sfx.boom(); burst(f.x, f.y - 100 * f.k, 40, '#f97316', 12, 6, 0, 30);
          }
          if (t % 8 === 0) sfx.whoosh();
        }
        if (t === 70) { fb.face = -fb.face; fb.from = fb.x; fb.landX = clamp(this.x + this.face * 360, ARENA_L + 60, ARENA_R - 60); }
        if (t > 70 && t <= 112) { // wheels round high above the city, then dives to where Kane lands
          const e = (t - 70) / 42;
          fb.x = lerp(fb.from, fb.landX, ease(e)); fb.y = GROUND - 120 - Math.sin(e * Math.PI) * 600; fb.bank = e < 0.5 ? -0.3 : 0.5;
          if (t % 2 === 0) particles.push({ x: fb.x, y: fb.y, z: 0, vx: 0, vy: 0, vz: 0, life: 22, max: 22, color: '#f97316', size: 14, g: 0 });
        }
        if (t === 112) { // Kane again, in a pillar of fire
          this.x = fb.landX; this.y = GROUND; this.cloak = false; game.fireBird = null;
          flash = 18; shakeIt(30); sfx.boom(); sfx.kame();
          for (let i = 0; i < 60; i++) particles.push({ x: this.x + rand(-50, 50), y: GROUND - rand(0, 40), z: rand(-50, 50), vx: rand(-1, 1), vy: -rand(8, 18), vz: 0, life: 34, max: 34, color: ['#ff4500', '#f97316', '#fde047', '#ffffff'][i % 4], size: 12, g: 0 });
          game.rings.push({ x: this.x, y: GROUND, r: 10, life: 30, color: '249,115,22' });
          game.cracks.push({ x: this.x, life: 360, color: '#f97316' });
          for (const f of game.foes()) if (Math.abs(f.x - this.x) < 200) { f.takeHit(25, 0, (Math.sign(f.x - this.x) || this.face) * 8, f.x, f.y - 100 * f.k); this.addCombo(); }
        }
      }
      if (t > 132) this.endSpecial();
    }
    // ---- white wolf specials: lunar howl (U), moon claw (I), phantom fang (O)
    updateHowl() { // a howl at the moon: rings of moonlight knock every imp nearby off its feet
      this.vx = 0;
      if (this.t === 14) {
        sfx.howl(); shakeIt(16); flash = 8;
        for (const [r, c, life] of [[20, '224,242,254', 30], [-60, '191,219,254', 34], [-140, '255,255,255', 38]]) game.rings.push({ x: this.x, y: this.y - 160, r, life, color: c });
        burst(this.x, this.y - 200, 50, '#e0f2fe', 12, 5, 0, 30);
        for (const f of game.foes()) {
          if (Math.abs(f.x - this.x) > 460) continue;
          const away = Math.sign(f.x - this.x) || this.face;
          f.takeHit(18, 0, away * 8, f.x, f.y - 100 * f.k); this.addCombo();
          if (f.alive && !LYING.includes(f.state)) f.knockdown(away);
        }
      }
      if (this.t % 4 === 0 && this.t > 14 && this.t < 40) game.rings.push({ x: this.x, y: GROUND, r: 10, life: 18, color: '191,219,254' });
      if (this.t > 52) this.endSpecial();
    }
    updateMoonClaw() { // one big swipe throws three giant claw marks that cut through everything in a line
      this.vx = 0;
      if (this.t === 16) {
        for (const dy of [-60, 0, 60]) game.slashes.push({ x: this.x + this.face * 80, y: this.y - 140 + dy, dir: this.face, life: 60, hit: false, color: 0xbfdbfe, scale: 1.6, dmg: 26, speed: 17 });
        sfx.slash(); sfx.slash(); sfx.boom(); shakeIt(14); flash = 6;
        burst(this.x + this.face * 80, this.y - 140, 40, '#e0f2fe', 12, 5, 0, 30);
      }
      if (this.t > 40) this.endSpecial();
    }
    // Phantom Fang: three shadow Kanes split off and each cuts through the target (\, /, then straight down), the
    // claw mark glows, and Kane himself steps in for the last, heaviest slash. The shadows live in game.phantom.
    updatePhantom(boss) {
      const P = game.phantom, t = ++P.t;
      if (!P.target || !P.target.alive) P.target = game.foes().sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0] || null;
      const tg = P.target, tx = tg ? tg.x : this.x + this.face * 260, tk = tg ? tg.k : 1;
      const ty = GROUND - 100 * tk, dir = Math.sign(tx - this.x) || this.face;
      this.vx = 0; if (tg) this.face = dir;
      if (t < 30) { // a crouch and a howl; blue mist rolls across the floor
        if (t % 2 === 0) for (let i = 0; i < 3; i++) particles.push({ x: rand(ARENA_L, ARENA_R), y: GROUND - rand(0, 20), z: rand(-200, 200), vx: rand(-1, 1), vy: -rand(0.2, 0.6), vz: 0, life: 60, max: 60, color: i ? '#1e3a5f' : '#93c5fd', size: 16, g: 0 });
        if (t === 10) popText(this.x, this.y - 250, 'AWOOOOO!', '#bfdbfe', 34);
        return;
      }
      // the three shadows: [start frame, where it comes from, the slash's angle]
      const SHADOWS = [[30, -1, 0.7], [56, 1, -0.7], [82, 0, 0]];
      SHADOWS.forEach(([at, side, rot], i) => {
        if (t === at) { // a shadow splits off Kane
          const g = new Hero(); g.beast = 'wolf'; g.revived = true; g.state = 'ghost'; g.pose = { ...POSES.clawReady }; g.tgt = POSES.clawReady;
          g.x = side === 0 ? tx - dir * 40 : side < 0 ? this.x : clamp(tx + dir * 200, ARENA_L, ARENA_R); g.y = side === 0 ? GROUND - 420 : GROUND;
          g.from = g.x; g.fromY = g.y; g.to = side === 0 ? tx : side < 0 ? clamp(tx + dir * 170, ARENA_L, ARENA_R) : clamp(tx - dir * 170, ARENA_L, ARENA_R);
          g.face = side > 0 ? -dir : dir; g.fade = 0.9; g.born = t;
          P.ghosts[i] = g; sfx.whoosh(); sfx.zap();
          burst(g.x, g.y - 120, 24, '#93c5fd', 7, 5, 0, 24);
        }
        const g = P.ghosts[i];
        if (!g) return;
        const gt = t - g.born;
        if (gt <= 8) { // the dash (or the drop from above) straight through the target
          const e = ease(gt / 8);
          g.x = lerp(g.from, g.to, e); g.y = lerp(g.fromY, GROUND, e);
          g.tgt = side === 0 ? POSES.hammer : POSES.swordDash;
          for (let k = 0; k < 3; k++) particles.push({ x: g.x - g.face * rand(0, 40), y: g.y - rand(20, 200), z: rand(-20, 20), vx: 0, vy: 0, vz: 0, life: 14, max: 14, color: k ? '#60a5fa' : '#e0f2fe', size: 7, g: 0 });
        }
        if (gt === 8) { // the cut: three claw lines at this shadow's angle
          hitstop = 6; flash = 8; shakeIt(14 + i * 4); sfx.slash(); sfx.heavy();
          // three claw lines at this shadow's angle; they stay burning on the target until Kane's own slash
          const tilt = side === 0 ? Math.PI / 2 : rot;
          for (const off of [-22, 0, 22]) {
            const ox = Math.sin(tilt) * off, oy = Math.cos(tilt) * off;
            game.slashes.push({ x: tx + ox, y: ty + oy, dir: g.face, life: 150 - t, hit: true, fx: true, mark: true, color: 0x93c5fd, scale: 0.8 + i * 0.12, speed: 0.001, rot: -g.face * Math.PI / 2 + tilt });
          }
          burst(tx, ty, 30 + i * 10, '#bfdbfe', 10 + i * 2, 5, 0.1, 26);
          this.phantomHit(tx, 16 + i * 6);
        }
        if (gt > 8 && gt < 30) g.tgt = POSES.swordCut;
        if (gt >= 30) g.tgt = POSES.clawReady;
        if (t >= 106 && t < 126) { // the pack falls in behind Kane
          g.x = lerp(g.x, this.x - dir * (70 + i * 55), 0.2); g.y = GROUND; g.face = dir;
        }
        if (t >= 126) g.fade = Math.max(0, g.fade - 0.04);
      });
      for (const g of P.ghosts) if (g) { for (const key of POSE_KEYS) g.pose[key] = lerp(g.pose[key], g.tgt[key], 0.5); g.t++; }
      if (t === 112) popText(this.x, this.y - 260, '...HUNT\'S OVER.', '#e0f2fe', 36);
      if (t === 130) { P.from = this.x; P.to = tg ? clamp(tx + dir * (90 + 40 * tk), ARENA_L, ARENA_R) : clamp(this.x + dir * 300, ARENA_L, ARENA_R); sfx.charge(); }
      if (t > 130 && t <= 142) { // Kane steps through, slow and heavy
        this.x = lerp(P.from, P.to, ease((t - 130) / 12));
        for (let k = 0; k < 4; k++) particles.push({ x: this.x - dir * rand(0, 40), y: this.y - rand(20, 220), z: rand(-20, 20), vx: 0, vy: 0, vz: 0, life: 16, max: 16, color: k ? '#e0f2fe' : '#ffffff', size: 8, g: 0 });
      }
      if (t === 142) { // the last slash: the claw mark explodes in moonlight
        hitstop = 10; flash = 24; shakeIt(36); sfx.slash(); sfx.boom(); sfx.boom(); sfx.howl();
        game.slashes.push({ x: tx, y: ty, dir, life: 30, hit: true, fx: true, color: 0xffffff, scale: 2.2, speed: 1 });
        for (const [dx, dy, r] of [[0, 0, 220], [-60, -50, 150], [60, -40, 170]]) game.explosions.push({ x: tx + dx, y: ty + dy, r, t: 0, harmless: true, color: 0x60a5fa });
        burst(tx, ty, 120, '#bfdbfe', 16, 7, 0.2, 50); burst(tx, ty, 60, '#ffffff', 12, 5, 0.2, 40);
        for (const [r, c] of [[10, '191,219,254'], [-90, '255,255,255']]) game.rings.push({ x: tx, y: GROUND, r, life: 36, color: c });
        game.cracks.push({ x: tx, life: 360, color: '#93c5fd' });
        for (const s of game.slashes) if (s.mark) s.life = 0;
        this.phantomHit(tx, 70, true);
      }
      if (t > 178) { game.phantom = null; this.endSpecial(); }
    }
    // damage everything around the claw mark (the imps are small, so it usually takes a few with it)
    phantomHit(x, dmg, last = false) {
      for (const f of game.foes()) {
        if (Math.abs(f.x - x) > (last ? 260 : 180)) continue;
        f.takeHit(dmg, 0, last ? (Math.sign(f.x - x) || this.face) * 10 : 0, f.x, f.y - 100 * f.k); this.addCombo();
        if (f.alive && last && !LYING.includes(f.state)) f.knockdown(Math.sign(f.x - x) || this.face);
        else if (f.alive && !LYING.includes(f.state)) { f.setState('shocked'); f.vx = 0; }
      }
    }
    // ---- armored sword specials: flame slash (U), water tornado (I), thunder judgment (O)
    updateFireSlash() {
      this.vx = 0;
      if (this.t < 30) { // the blade catches fire
        if (this.t % 2 === 0) burst(this.x - this.face * 20 + rand(-14, 14), this.y - 250 - rand(0, 120), 2, Math.random() < 0.5 ? '#f97316' : '#fde047', 2, 7, -0.25, 24, 30);
        return;
      }
      if (this.t === 30) {
        game.slashes.push({ x: this.x + this.face * 80, y: this.y - 150, dir: this.face, life: 64, hit: false, color: 0xf97316, scale: 2.4, dmg: 55, fire: true, speed: 18 });
        sfx.slash(); sfx.boom(); shakeIt(16); flash = 6;
        burst(this.x + this.face * 80, this.y - 150, 50, '#f97316', 12, 7, -0.1, 34);
      }
      if (this.t > 58) this.endSpecial();
    }
    updateWaterTornado() {
      this.vx = 0;
      if (this.t < 28) { // two spins with the sword up, water swirling around him
        this.spin += TAU * 2 / 28;
        for (let i = 0; i < 3; i++) {
          const a = this.t * 0.6 + i * 2.1, r = 70;
          particles.push({ x: this.x + Math.cos(a) * r, y: this.y - 20 - this.t * 7 - i * 20, z: Math.sin(a) * r, vx: -Math.sin(a) * 4, vy: -2, vz: Math.cos(a) * 4, life: 20, max: 20, color: i ? '#38bdf8' : '#e0f2fe', size: 6, g: 0 });
        }
        return;
      }
      if (this.t === 28) {
        this.spin = 0;
        game.tornado = { x: this.x + this.face * 90, dir: this.face, t: 0, caught: false, life: 220 };
        sfx.kame(); shakeIt(10);
      }
      if (this.t > 44) this.endSpecial();
    }
    // Dragon God Slash: a short charge in a pillar of golden light, then the monster simply falls
    updateOneShot(boss) {
      this.vx = 0;
      const t = this.t, s = this.zord ? 1.5 : 1;
      if (t < 36) {
        for (let i = 0; i < 4; i++) {
          const a = t * 0.45 + i * (TAU / 4), r = (90 - t * 1.6) * s;
          particles.push({ x: this.x + Math.cos(a) * r, y: this.y - rand(0, 260) * s, z: Math.sin(a) * r, vx: 0, vy: -rand(3, 7), vz: 0, life: 20, max: 20, color: i % 2 ? '#fde047' : '#ffffff', size: 7, g: 0 });
        }
        if (t % 12 === 0) { game.rings.push({ x: this.x, y: GROUND, r: 10, life: 20, color: '253,224,71' }); shakeIt(5); }
        return;
      }
      if (t === 36) {
        flash = 14; shakeIt(24); sfx.slash(); sfx.boom();
        burst(this.x, this.y - 150 * s, 60, '#fde047', 14, 6, 0.1, 30);
        if (boss && boss.alive && boss.floorHp) { // the behemoth shrugs off even this
          popText(boss.x, boss.y - 220 * boss.k, 'IT SHRUGS IT OFF!', '#93c5fd', 44);
          boss.takeHit(boss.hp, 0, 0, boss.x, boss.y - 150 * boss.k);
        } else if (boss && boss.alive) {
          popText(boss.x, boss.y - 220 * boss.k, 'ONE SHOT!', '#fde047', 56);
          this.special = null; this.addCombo();
          boss.hp = 0; boss.die(); // straight into the finishing cutscene
          return;
        }
      }
      if (t > 44) this.endSpecial();
    }
    updateThunder(boss) {
      const alive = boss && boss.alive;
      switch (this.phase) {
        case 'charge': // the sky goes dark, lightning crawls up the blade
          this.vx = 0;
          if (this.t % 3 === 0) burst(this.x - this.face * 20 + rand(-14, 14), this.y - 250 - rand(0, 120), 2, '#fef08a', 5, 4, 0, 10, 30);
          if (this.t === 16) game.bolts.push({ x: this.x - this.face * 20, y: this.y - 330, life: 10 });
          if (this.t >= 26) {
            this.phase = 'dash'; this.t = 0; this.dashHit = false; sfx.zap(); sfx.slash();
            this.target = alive ? clamp(boss.x + this.face * (110 + 50 * boss.k), ARENA_L, ARENA_R) : clamp(this.x + this.face * 420, ARENA_L, ARENA_R);
          }
          break;
        case 'dash': { // lightning-fast slash straight through the monster
          this.vx = this.face * 32;
          for (let i = 0; i < 4; i++) particles.push({ x: this.x - this.face * rand(0, 40), y: this.y - rand(20, 210), z: rand(-20, 20), vx: 0, vy: 0, vz: 0, life: 16, max: 16, color: i ? '#fde047' : '#ffffff', size: 7, g: 0 });
          const passed = alive && (this.x - boss.x) * this.face >= -20;
          const stop = (this.x - this.target) * this.face >= 0 || this.t > 30 || this.x <= ARENA_L || this.x >= ARENA_R;
          if (alive && !this.dashHit && (passed || stop)) {
            this.dashHit = true;
            boss.takeHit(30, 0, 0, boss.x, boss.y - 110 * boss.k);
            if (boss.alive) { boss.setState('shocked'); boss.vx = 0; }
            hitstop = 8; flash = 8; shakeIt(14); sfx.slash(); sfx.zap();
            burst(boss.x, boss.y - 110 * boss.k, 40, '#fde047', 12, 5, 0.1, 26);
          }
          if (stop) { this.vx = 0; this.phase = 'pose'; this.t = 0; }
          break;
        }
        case 'pose': // back turned, sword lowered, while the storm finishes it
          this.vx = 0;
          if (this.t === 14) popText(this.x, this.y - 300, 'JUDGMENT.', '#fde047', 44);
          if (this.t % 5 === 0 && this.t < 70) game.bolts.push({ x: rand(ARENA_L, ARENA_R), y: GROUND, life: 8 });
          if (alive && this.t % 7 === 3 && this.t < 66) {
            game.bolts.push({ x: boss.x + rand(-20, 20), y: boss.y - 170 * boss.k, life: 10 });
            boss.takeHit(6, 0, 0, boss.x, boss.y - 120 * boss.k); this.addCombo();
            flash = 4; sfx.zap();
          }
          if (this.t === 72 && boss && boss.alive) { // the blast behind him
            const away = Math.sign(boss.x - this.x) || -this.face;
            for (const [dx, dy, r] of [[0, 0, 260], [-50, -60, 180], [60, -30, 200]]) game.explosions.push({ x: boss.x + dx, y: boss.y - 100 * boss.k + dy, r, t: 0, harmless: true });
            burst(boss.x, boss.y - 100 * boss.k, 90, '#fde047', 16, 7, 0.2, 50);
            burst(boss.x, boss.y - 100 * boss.k, 50, '#ffffff', 12, 5, 0.2, 40);
            game.rings.push({ x: boss.x, y: GROUND, r: 10, life: 34, color: '250,204,21' });
            boss.takeHit(50, 0, away * 8, boss.x, boss.y - 100 * boss.k);
            if (boss.alive) boss.knockdown(away);
            flash = 20; shakeIt(34); sfx.boom(); sfx.kame(); this.addCombo();
          }
          if (this.t > 104) this.endSpecial();
          break;
      }
    }
    // F as the phoenix megazord: seize the monster, carry it into the sky, hurl it into the street, then dive onto
    // it wrapped in fire, screaming
    updateSplash(boss) {
      const alive = boss && boss.alive;
      const fire = (n, spread) => { for (let i = 0; i < n; i++) particles.push({ x: this.x + rand(-spread, spread), y: this.y - rand(0, 260), z: rand(-60, 60), vx: rand(-2, 2), vy: -rand(2, 6), vz: 0, life: 22, max: 22, color: ['#ff4500', '#f97316', '#fde047'][i % 3], size: 12, g: 0 }); };
      switch (this.phase) {
        case 'dash':
          this.vx = this.face * 16; fire(2, 40);
          if (alive && !LYING.includes(boss.state) && Math.abs(boss.x - this.x) < 160) {
            this.phase = 'rise'; this.t = 0; this.vx = 0;
            boss.setState('grabbed'); boss.vx = 0; boss.telegraph = false; sfx.grab(); hitstop = 6; shakeIt(10);
            popText(this.x, this.y - 330, 'TO THE SKY!', '#fde047', 40);
          } else if (this.t > 50 || this.x <= ARENA_L || this.x >= ARENA_R) { popText(this.x, this.y - 300, 'MISSED!', '#cbd5e1', 24); this.endSpecial(); }
          break;
        case 'rise': { // up, up, out of the city, the monster held overhead
          const p = ease(Math.min(1, this.t / 45));
          this.vx = 0; this.vy = 0; this.y = GROUND - 1100 * p; fire(4, 60);
          if (alive) { boss.x = this.x + this.face * 60; boss.y = this.y - 40; boss.tilt = Math.PI / 2 * Math.min(1, this.t / 20); }
          if (this.t % 10 === 0) sfx.whoosh();
          if (this.t >= 50) { this.phase = 'throw'; this.t = 0; popText(this.x, this.y - 200, 'FALL!', '#fb923c', 46); sfx.heavy(); }
          break;
        }
        case 'throw': // hurled down into the street
          this.vy = 0; fire(2, 50);
          if (alive && this.t <= 16) { boss.y = lerp(GROUND - 1140, GROUND, (this.t / 16) ** 2); boss.x = clamp(this.x + this.face * (60 + this.t * 6), ARENA_L + 40, ARENA_R - 40); }
          if (alive && this.t === 16) {
            boss.y = GROUND; boss.knockdown(this.face); shakeIt(30); flash = 12; sfx.boom(); sfx.boom();
            burst(boss.x, GROUND, 80, '#a8a29e', 14, 9, 0.35, 50);
            game.rings.push({ x: boss.x, y: GROUND, r: 10, life: 34, color: '255,140,60' });
            game.cracks.push({ x: boss.x, life: 400, color: '#f97316' });
          }
          if (this.t >= 34) {
            this.phase = 'dive'; this.t = 0; this.from = this.x; this.target = alive ? boss.x : this.x;
            popText(this.x, GROUND - 800, 'MEGA PHOENIX SPLASH!!!', '#ff7a1a', 64); sfx.roar(); sfx.kame(); sfx.charge();
          }
          break;
        case 'dive': { // a falling sun
          const p = Math.min(1, this.t / 26);
          this.vy = 0; this.x = lerp(this.from, this.target - this.face * 40, p); this.y = lerp(GROUND - 1100, GROUND, p * p);
          fire(8, 80);
          if (this.t === 26) {
            this.y = GROUND; flash = 30; shakeIt(46); sfx.boom(); sfx.boom(); sfx.kame();
            const bx = this.target;
            for (const [dx, dy, r] of [[0, -60, 320], [-120, -40, 240], [120, -50, 260], [0, -200, 240]]) game.explosions.push({ x: bx + dx, y: GROUND + dy, r, t: 0, dur: 60, harmless: true });
            burst(bx, GROUND - 80, 160, '#ff7a1a', 20, 9, 0.2, 70); burst(bx, GROUND - 80, 80, '#fde047', 16, 7, 0.2, 50);
            for (const [r, c] of [[10, '255,120,40'], [-90, '253,224,71'], [-200, '255,255,255']]) game.rings.push({ x: bx, y: GROUND, r, life: 40, color: c });
            game.cracks.push({ x: bx, life: 500, color: '#f97316' });
            if (alive) { popText(bx, GROUND - 440, 'PHOENIX SPLASH!', '#fde047', 56); this.addCombo(); boss.hp = 0; boss.die(); return; }
          }
          if (this.t > 46) { this.y = GROUND; this.endSpecial(); }
          break;
        }
      }
    }
    endSpecial() {
      if (this.special === 'phantom') game.phantom = null;
      if (this.special === 'kingbeast') game.lionGhost = null;
      if (this.special === 'flare') { game.fireBird = null; this.cloak = false; this.y = Math.min(this.y, GROUND); }
      this.special = null; this.phase = null; this.orb = 0; this.spin = 0; game.beam = null;
      this.setState('idle'); this.inv = 16;
    }
    updateSpecial(boss) {
      if (this.special === 'kame') this.updateKame(boss);
      else if (this.special === 'hulk') this.updateHulk(boss);
      else if (this.special === 'fireslash') this.updateFireSlash();
      else if (this.special === 'tornado') this.updateWaterTornado();
      else if (this.special === 'thunder') this.updateThunder(boss);
      else if (this.special === 'oneshot') this.updateOneShot(boss);
      else if (this.special === 'splash') this.updateSplash(boss);
      else if (this.special === 'howl') this.updateHowl();
      else if (this.special === 'moonclaw') this.updateMoonClaw();
      else if (this.special === 'phantom') this.updatePhantom();
      else if (this.special === 'roar') this.updateRoar();
      else if (this.special === 'lionrush') this.updateLionRush();
      else if (this.special === 'kingbeast') this.updateKingBeast();
      else if (this.special === 'flamewings') this.updateFlameWings();
      else if (this.special === 'phoenixdive') this.updatePhoenixDive();
      else if (this.special === 'flare') this.updateFlare();
      else this.updateSlam(boss);
    }
    handPos() { return { x: this.x - this.face * 26, y: this.y - 92 }; }
    updateKame(boss) {
      this.vx = 0;
      if (this.t < KAME_CHARGE) {
        this.orb = this.t / KAME_CHARGE;
        const chant = { 1: 'KA', 14: 'ME', 28: 'HA', 42: 'ME' }[this.t];
        if (chant) { popText(this.x - this.face * 30, this.y - 250 - this.t, chant, '#7dd3fc', 32); sfx.chant(this.t / 14); }
        if (this.t % 2 === 0) { // energy gets pulled into the cupped hands
          const hp = this.handPos(), a = rand(0, TAU), r = rand(70, 140), life = 14;
          particles.push({ x: hp.x + Math.cos(a) * r, y: hp.y + Math.sin(a) * r, z: rand(-80, 80), vx: -Math.cos(a) * r / life, vy: -Math.sin(a) * r / life, vz: 0, life, max: life, color: '#bae6fd', size: 5, g: 0 });
        }
        return;
      }
      const ft = this.t - KAME_CHARGE;
      if (ft < KAME_FIRE) {
        if (ft === 0) { popText(this.x, this.y - 280, 'HAAAAA!', '#e0f2fe', 50); sfx.kame(); shakeIt(14); flash = 6; }
        this.orb = 1;
        const x0 = this.x + this.face * 70, x1 = this.face > 0 ? W + 400 : -400;
        const beam = game.beam = { x0, x1, y: this.y - 118, t: ft, dir: this.face };
        shakeIt(5);
        if (ft % 8 === 0) sfx.beam();
        for (const g of game.grenades) {
          if ((g.x - x0) * this.face > 0 && Math.abs(g.y - beam.y) < 70) { g.dead = true; game.explosions.push({ x: g.x, y: g.y, r: 70, t: 0, harmless: true }); }
        }
        const box = { x: Math.min(x0, x1), y: beam.y - 50, w: Math.abs(x1 - x0), h: 100 };
        if (boss && boss.alive && overlap(box, boss.hurtbox)) {
          if (!LYING.includes(boss.state)) boss.x = clamp(boss.x + this.face * 1.6, ARENA_L + 30, ARENA_R - 30);
          if (ft % 6 === 3) { boss.takeHit(6, 4, 0, boss.x - this.face * 30 * boss.k, beam.y); this.addCombo(); }
          if (ft === KAME_FIRE - 1 && boss.alive) {
            boss.takeHit(26, 0, this.face * 8, boss.x - this.face * 30 * boss.k, beam.y);
            boss.knockdown(this.face);
            burst(boss.x, beam.y, 50, '#bae6fd', 14, 6, 0.2, 40);
            shakeIt(18); sfx.boom(); this.addCombo();
          }
        }
        return;
      }
      game.beam = null;
      this.orb = Math.max(0, this.orb - 0.1);
      if (ft > KAME_FIRE + 16) this.endSpecial();
    }
    updateHulk(boss) {
      if (this.t < 26) {
        this.vx = 0; this.hulk = this.t / 26;
        if (this.t % 3 === 0) burst(this.x, this.y - 110, 3, '#86efac', 5, 5, 0, 22);
        return;
      }
      this.hulk = 1;
      if (this.t === 26) {
        this.vy = -24; this.onGround = false; sfx.jump(); sfx.whoosh();
        this.target = boss && boss.alive ? clamp(boss.x - this.face * 70, ARENA_L, ARENA_R) : this.x;
        return;
      }
      if (!this.onGround && !this.smashed) {
        this.vx = (this.target - this.x) * 0.07;
        if (this.vy > 0) this.vy += 1.1;
        burst(this.x, this.y - 110, 2, '#4ade80', 2, 6, 0, 20);
        return;
      }
      if (!this.smashed) {
        this.smashed = true; this.smashT = this.t; this.vx = 0;
        shakeIt(28); flash = 12; sfx.boom(); sfx.heavy();
        burst(this.x, GROUND, 70, '#86efac', 15, 7, 0.3, 45);
        burst(this.x, GROUND, 45, '#7c5a3a', 12, 10, 0.55, 55);
        burst(this.x, GROUND, 25, '#ffffff', 10, 4, 0.2, 30);
        game.rings.push({ x: this.x, y: GROUND, r: 10, life: 30, color: '134,239,172' });
        game.rings.push({ x: this.x, y: GROUND, r: -120, life: 36, color: '255,255,255' });
        game.cracks.push({ x: this.x, life: 300, color: '#22c55e' });
        if (boss && boss.alive && boss.state !== 'grabbed' && Math.abs(boss.x - this.x) < 260 + 50 * boss.s && boss.y >= GROUND - 200) {
          boss.takeHit(75, 0, this.face * 12, boss.x, boss.y - 100 * boss.k);
          if (boss.alive && boss.onGround) boss.knockdown(this.face);
          this.addCombo();
        }
      }
      if (this.t - this.smashT > 34) this.endSpecial();
    }
    // keep a grabbed boss on the hero's raised hands; p: 0 = on the ground, 1 = overhead
    holdBoss(b, p) {
      const e = ease(p), k = b.k;
      const overhead = this.y - 242 - 34 * k;
      const center = lerp(b.grabY0 - 93 * k, overhead, e);
      b.x = this.x; b.y = center + 93 * k; b.vx = 0; b.tilt = Math.PI / 2 * e;
    }
    updateSlam(boss) {
      const holding = boss && boss.alive && boss.state === 'grabbed';
      if (this.phase !== 'dash' && this.phase !== 'slammed' && !holding) { this.endSpecial(); return; }
      switch (this.phase) {
        case 'dash':
          this.vx = this.face * 13;
          if (this.t % 3 === 0) burst(this.x - this.face * 20, GROUND - 4, 2, '#cbd5e1', 2, 4, 0.1, 14);
          if (boss && boss.alive && boss.onGround && !LYING.includes(boss.state) && Math.abs(boss.x - this.x) < 40 + 44 * boss.k) {
            this.phase = 'lift'; this.t = 0; this.vx = 0;
            boss.grab(); sfx.grab(); hitstop = 6; shakeIt(8);
          } else if (this.t > 48 || (this.x <= ARENA_L || this.x >= ARENA_R)) { popText(this.x, this.y - 220, 'MISSED!', '#cbd5e1', 22); this.endSpecial(); }
          break;
        case 'lift':
          this.vx = 0;
          this.holdBoss(boss, Math.min(1, this.t / 24));
          if (this.t >= 24) { this.phase = 'spin'; this.t = 0; }
          break;
        case 'spin': // airplane spin
          this.spin += Math.min(0.45, 0.06 + this.t * 0.012);
          this.holdBoss(boss, 1);
          if (this.t % 10 === 0) sfx.whoosh();
          if (this.t >= 40) { this.phase = 'jump'; this.t = 0; this.vy = -15; this.onGround = false; sfx.jump(); }
          break;
        case 'jump':
          this.spin += 0.3;
          this.holdBoss(boss, 1);
          if (this.onGround && this.t > 2) {
            this.phase = 'slammed'; this.t = 0; this.vx = 0; this.spin = 0;
            const k = boss.k;
            boss.face = -this.face;
            boss.x = clamp(this.x + this.face * (30 + 70 * k), ARENA_L + 30, ARENA_R - 30);
            boss.tilt = Math.PI / 2; boss.y = GROUND + 59 * k;
            boss.knockdown(this.face);
            boss.takeHit(90, 0, this.face * 6, boss.x, GROUND - 60 * k);
            shakeIt(30); flash = 14; sfx.boom(); sfx.heavy(); hitstop = 8;
            burst(boss.x, GROUND, 60, '#fca5a5', 14, 7, 0.3, 45);
            burst(boss.x, GROUND, 40, '#7c5a3a', 12, 10, 0.55, 55);
            game.rings.push({ x: boss.x, y: GROUND, r: 10, life: 30, color: '252,165,165' });
            game.cracks.push({ x: boss.x, life: 300, color: '#f97316' });
            this.addCombo();
          }
          break;
        case 'slammed':
          if (this.t > 34) this.endSpecial();
          break;
      }
    }
    // armor-up power-up, a few seconds into every fight: light pillars, a key unlocks the sword,
    // the black suit spreads, white armor flies on, helmet seals, then a sword shockwave
    startArmorUp() {
      this.revived = true; this.setState('armorup'); this.vx = 0; this.special = null; this.spin = 0;
    }
    // progress of each armor stage (0 sword, 1 suit, 2 armor plates, 3 helmet), 0..1
    armorPart(i) {
      if (this.rage) return 1;
      if (this.state !== 'armorup') return 0;
      const p = ARMOR_PARTS[i];
      return clamp((this.t - p.at) / p.dur, 0, 1);
    }
    updateArmorUp(boss) {
      const t = this.t;
      this.vx = 0;
      if (t < 50 && t % 2 === 0) { // pillars of white light rising around him
        for (const dx of [-60, 60]) particles.push({ x: this.x + dx + rand(-8, 8), y: GROUND, z: rand(-50, 50), vx: 0, vy: -rand(7, 12), vz: 0, life: 26, max: 26, color: t % 4 ? '#e5e7eb' : '#ffffff', size: 6, g: 0 });
      }
      if (t === 2) { sfx.charge(); shakeIt(4); popText(this.x, this.y - 290, 'POWER UP!', '#ffffff', 40); }
      if (t === 22) { sfx.zap(); sfx.chant(3); shakeIt(8); popText(this.x, this.y - 160, 'TRANSFORM!', '#e5e7eb', 34); }
      if (t === 34) { sfx.chant(1); popText(this.x + this.face * 30, this.y - 300, 'DRAGON KEY', '#e5e7eb', 26); }
      if (t === 56) { sfx.clank(); sfx.select(); flash = 4; popText(this.x + this.face * 70, this.y - 230, 'KEY IN — UNLOCK!', '#ffffff', 22); burst(this.x + this.face * 30, this.y - 230, 20, '#ffffff', 6, 4, 0, 20, 30); }
      if (t >= 30 && t < 110 && t % 3 === 0) burst(this.x + rand(-30, 30), this.y - rand(40, 230), 1, '#f3f4f6', 4, 3, 0.1, 14, rand(-40, 60));
      for (const p of ARMOR_PARTS) {
        if (t === p.at) { // a stage locks into place
          sfx.servo(); sfx.clank(); shakeIt(5); hitstop = 2;
          burst(this.x + this.face * 10, this.y - p.y, 24, '#ffffff', 8, 4, 0.2, 22, 40);
          burst(this.x + this.face * 10, this.y - p.y, 14, '#4b5563', 6, 4, 0, 20, 40);
          popText(this.x + this.face * 70, this.y - p.y - 20, p.label, '#e5e7eb', 20);
        }
      }
      if (t === 98) { sfx.slash(); flash = 6; popText(this.x, this.y - 290, 'ARMOR UP!', '#ffffff', 54); }
      if (t === 110) { // sword shockwave
        shakeIt(28); flash = 14; sfx.boom(); sfx.slash(); sfx.kame();
        popText(this.x, this.y - 240, 'DRAGON KNIGHT!', '#e5e7eb', 40);
        burst(this.x, this.y - 150, 80, '#ffffff', 16, 6, 0.1, 50);
        burst(this.x, this.y - 150, 40, '#6b7280', 12, 4, 0.1, 35);
        game.rings.push({ x: this.x, y: GROUND, r: 10, life: 34, color: '255,255,255' });
        game.rings.push({ x: this.x, y: GROUND, r: -150, life: 40, color: '156,163,175' });
        game.rings.push({ x: this.x, y: this.y - 150, r: 20, life: 26, color: '229,231,235' });
        game.cracks.push({ x: this.x, life: 360, color: '#e5e7eb' });
        if (boss && boss.alive && !LYING.includes(boss.state)) {
          boss.takeHit(30, 0, Math.sign(boss.x - this.x) * 10, boss.x, boss.y - 100 * boss.k);
          if (boss.alive && boss.onGround) boss.knockdown(Math.sign(boss.x - this.x) || this.face);
        }
      }
      if (t >= 135) { this.rage = true; this.energy = 100; this.inv = 60; this.setState('idle'); }
    }
    // chapter 10: the white wolf runs down a moonbeam, howls, leaps into Kane, and becomes his armor
    startWolfUp() {
      this.revived = true; this.setState('wolfup'); this.vx = 0; this.special = null; this.spin = 0;
      const land = clamp(this.x + this.face * 300, ARENA_L + 140, ARENA_R - 140); // between Kane and the imps
      // it starts its run partway down the beam from the moon to where it lands
      const k = (0 - WOLF_RUN_Z) / (0 - MOON[2]), sx = W / 2 + lerp(X(land), MOON[0], k), sy = GROUND - MOON[1] * k;
      game.wolfSpirit = { x: sx, y: sy, z: WOLF_RUN_Z, sx, sy, land, face: Math.sign(land - sx) || this.face, lp: newLionPose(), fade: 1, scale: 1.7 };
    }
    // progress of each stage (0 claws/fists/talons, 1 suit, 2 plates, 3 helm) of one beast armor, 0..1: the wolf's
    // locks on during its arrival, and a swapped-in armor snaps on piece by piece
    beastPart(i, name) {
      if (this.state === 'wolfup') {
        if (name !== 'wolf') return 0;
        const p = WOLF_PARTS[i];
        return clamp((this.t - p.at) / p.dur, 0, 1);
      }
      if (this.beast !== name) return 0;
      return this.state === 'swap' ? clamp((this.t - i * 6) / 8, 0, 1) : 1;
    }
    updateWolfUp() {
      const t = this.t, w = game.wolfSpirit;
      this.vx = 0;
      if (t === 2) { sfx.charge(); popText(this.x, this.y - 290, game.level === WOLF ? 'THE MOON IS FULL...' : 'WHITE WOLF, I NEED YOU!', '#e0f2fe', 34); }
      if (t === 26) { sfx.howl(); popText(W / 2, 120, 'AWOOOOOOO...', '#bfdbfe', 30); }
      if (w) {
        const tg = {};
        if (t >= 20 && t < 90) { // down the moonbeam at a dead run
          const e = (t - 20) / 70;
          w.x = lerp(w.sx, w.land, e); w.y = lerp(w.sy, GROUND, e); w.z = lerp(WOLF_RUN_Z, 0, e);
          tg.speed = 1.3; tg.jaw = 0.4; tg.pitch = 0.12; w.lp.step += 0.45;
          if (t % 2 === 0) particles.push({ x: w.x + rand(-60, 60), y: w.y - rand(20, 160), z: w.z + rand(-40, 40), vx: 0, vy: rand(-0.5, 0.5), vz: 0, life: 24, max: 24, color: Math.random() < 0.5 ? '#e0f2fe' : '#93c5fd', size: 9, g: 0 });
        }
        if (t === 90) { // lands on the roof, between Kane and the imps, and turns on them
          shakeIt(18); sfx.heavy(); sfx.boom(); w.face = this.face;
          burst(w.x, GROUND, 40, '#e0f2fe', 9, 6, 0.3, 30);
          game.rings.push({ x: w.x, y: GROUND, r: 10, life: 26, color: '224,242,254' });
          game.cracks.push({ x: w.x, life: 300, color: '#bfdbfe' });
        }
        if (t >= 90 && t < 145) { // rears up and howls at the moon
          const up = t > 98;
          tg.rear = up ? 0.55 : 0; tg.jaw = up ? 1 : 0.3; tg.pitch = -0.35;
          if (t === 100) {
            sfx.howl(); flash = 6; shakeIt(14);
            popText(w.x, GROUND - 360, 'AWOOOOOOOOO!', '#ffffff', 46);
            for (const [r, life] of [[20, 26], [-80, 32], [-180, 38]]) game.rings.push({ x: w.x, y: GROUND - 260, r, life, color: '224,242,254' });
          }
        }
        if (t >= 145 && t < 156) tg.crouch = 1;
        if (t === 156) { w.from = w.x; sfx.whoosh(); sfx.roar(); }
        if (t >= 156 && t < WOLF_MERGE) { // and leaps into Kane
          const e = (t - 156) / (WOLF_MERGE - 156);
          w.x = lerp(w.from, this.x, e); w.y = GROUND - Math.sin(e * Math.PI) * 170; w.face = Math.sign(this.x - w.from) || w.face;
          tg.leap = 1; tg.jaw = 1; w.fade = 1 - e * 0.5;
        }
        stepLionPose(w.lp, tg, 0.25);
        if (t === WOLF_MERGE) { // the wolf breaks into moonlight around him
          game.wolfSpirit = null; flash = 22; shakeIt(22); sfx.boom(); sfx.zap(); sfx.chant(3);
          burst(this.x, this.y - 130, 120, '#e0f2fe', 14, 6, 0, 40); burst(this.x, this.y - 130, 60, '#60a5fa', 10, 5, 0, 34);
          popText(this.x, this.y - 320, 'WHITE WOLF — BECOME MY ARMOR!', '#e0f2fe', 34);
        }
      }
      if (t > WOLF_MERGE && t < 214 && t % 2 === 0) { // moonlight spirals in as the pieces lock on
        const a = t * 0.5, r = 90 - (t - WOLF_MERGE) * 1.6;
        particles.push({ x: this.x + Math.cos(a) * r, y: this.y - rand(20, 240), z: Math.sin(a) * r, vx: 0, vy: -rand(1, 3), vz: 0, life: 20, max: 20, color: t % 4 ? '#e0f2fe' : '#93c5fd', size: 7, g: 0 });
      }
      for (const p of WOLF_PARTS) {
        if (t === p.at) {
          sfx.servo(); sfx.clank(); shakeIt(5); hitstop = 2;
          burst(this.x + this.face * 10, this.y - p.y, 24, '#ffffff', 8, 4, 0.2, 22, 40);
          burst(this.x + this.face * 10, this.y - p.y, 14, '#93c5fd', 6, 4, 0, 20, 40);
          popText(this.x + this.face * 70, this.y - p.y - 20, p.label, '#e0f2fe', 20);
        }
      }
      if (t === 214) { // a howl from inside the helm: every imp on the roof gets knocked flat
        shakeIt(30); flash = 16; sfx.boom(); sfx.howl(); sfx.slash();
        popText(this.x, this.y - 300, 'WHITE WOLF ARMOR!', '#ffffff', 54);
        burst(this.x, this.y - 150, 80, '#ffffff', 16, 6, 0.1, 50); burst(this.x, this.y - 150, 50, '#93c5fd', 12, 5, 0.1, 40);
        for (const [r, c] of [[10, '255,255,255'], [-150, '147,197,253']]) game.rings.push({ x: this.x, y: GROUND, r, life: 38, color: c });
        game.rings.push({ x: this.x, y: this.y - 150, r: 20, life: 26, color: '224,242,254' });
        game.cracks.push({ x: this.x, life: 360, color: '#bfdbfe' });
        for (const f of game.foes()) {
          if (Math.abs(f.x - this.x) > 520 || LYING.includes(f.state)) continue;
          const away = Math.sign(f.x - this.x) || this.face;
          f.takeHit(22, 0, away * 10, f.x, f.y - 100 * f.k);
          if (f.alive) f.knockdown(away);
        }
      }
      if (t >= WOLF_DONE) { this.beast = 'wolf'; this.energy = 100; this.inv = 60; this.setState('idle'); popText(this.x, this.y - 280, 'O: PHANTOM FANG!', '#bfdbfe', 26); }
    }
    takeHit(dmg, fromX, kind = 'hit') {
      if (['dead', 'victory', 'special', 'armorup', 'wolfup', 'swap', 'clash', 'calling'].includes(this.state)) return false;
      if (this.armored) dmg = Math.max(1, Math.round(dmg * 0.75)); // tougher hide
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
      if (this.hp <= 0 && this.beast === 'phoenix' && !this.reborn) { // the phoenix armor rises once from its own ashes
        this.reborn = true; this.hp = Math.round(this.maxHp * 0.5); this.setState('idle'); this.vx = 0; this.inv = 90;
        flash = 16; shakeIt(20); sfx.screech(); sfx.boom();
        popText(this.x, this.y - 300, 'REBIRTH!', '#fde047', 54);
        for (let i = 0; i < 70; i++) particles.push({ x: this.x + rand(-60, 60), y: GROUND - rand(0, 40), z: rand(-60, 60), vx: rand(-1, 1), vy: -rand(6, 16), vz: 0, life: 34, max: 34, color: ['#ff4500', '#f97316', '#fde047'][i % 3], size: 12, g: 0 });
        game.rings.push({ x: this.x, y: GROUND, r: 10, life: 30, color: '253,224,71' });
        return true;
      }
      if (this.hp <= 0) { this.hp = 0; this.setState('dead'); this.inv = 0; game.onHeroDown(); }
      return true;
    }
    specialPose() {
      if (this.special === 'kame') return this.t < KAME_CHARGE ? POSES.kameCharge : this.t < KAME_CHARGE + KAME_FIRE ? POSES.kameFire : POSES.idle;
      if (this.special === 'hulk') {
        if (this.t < 26) return POSES.hulkRoar;
        if (!this.smashed) return this.vy < 0 ? POSES.raise : POSES.smash;
        return POSES.smash;
      }
      if (this.special === 'oneshot') return POSES.swordRaise;
      if (this.special === 'howl') return this.t < 10 ? POSES.clawReady : POSES.howl;
      if (this.special === 'moonclaw') return this.t < 16 ? POSES.windAxe : POSES.swordCut;
      if (this.special === 'roar') return this.t < 10 ? POSES.clawReady : POSES.hulkRoar;
      if (this.special === 'lionrush') return this.t < 10 ? POSES.clawReady : this.t <= 30 ? POSES.swordDash : POSES.punch;
      if (this.special === 'kingbeast') return { call: POSES.raise, leap: POSES.clawReady, maul: POSES.clawReady, jump: this.vy < 0 ? POSES.windHammer : POSES.hammer, land: POSES.smash }[this.phase] || POSES.idle;
      if (this.special === 'flamewings') return this.t < 14 ? POSES.hulkRoar : POSES.flex;
      if (this.special === 'phoenixdive') return this.phase === 'up' ? POSES.jump : this.phase === 'dive' ? POSES.airkick : POSES.smash;
      if (this.special === 'flare') return this.t < 24 ? POSES.raise : POSES.clawReady;
      if (this.special === 'phantom') {
        const t = game.phantom ? game.phantom.t : 0;
        if (t < 30) return t < 8 ? POSES.clawReady : POSES.howl;
        if (t < 130) return POSES.clawReady;
        return t <= 142 ? POSES.swordDash : POSES.sheath;
      }
      if (this.special === 'splash') return { dash: POSES.grab, rise: POSES.lift, throw: POSES.smash, dive: POSES.swordDash }[this.phase] || POSES.idle;
      if (this.special === 'fireslash') return this.t < 30 ? POSES.swordRaise : POSES.swordCut;
      if (this.special === 'tornado') return POSES.swordRaise;
      if (this.special === 'thunder') return this.phase === 'charge' ? POSES.swordRaise : this.phase === 'dash' ? POSES.swordDash : POSES.sheath;
      if (this.phase === 'dash') return POSES.grab;
      if (this.phase === 'slammed') return POSES.smash;
      return POSES.lift;
    }
    animate() {
      if (this.mount) { this.driveLion(); return; }
      let target;
      const m = this.move && HERO_MOVES[this.move];
      switch (this.state) {
        case 'ride': { // legs astride the lion, arms follow what the lion is doing
          const up = { cut: POSES.swordCut, dash: POSES.swordDash, raise: POSES.swordRaise, hurt: POSES.hurt }[this.ridePose] || POSES.ride;
          target = { ...up, ft: POSES.ride.ft, fs: POSES.ride.fs, bt: POSES.ride.bt, bs: POSES.ride.bs, bob: 0 };
          break;
        }
        case 'calling': target = POSES.raise; break;
        case 'kneel': target = POSES.boot; break;
        case 'walk': target = Math.sin(this.walkPhase) > 0 ? POSES.walkA : POSES.walkB; break;
        case 'jump': target = POSES.jump; break;
        case 'attack': {
          const winding = this.t <= m.wind;
          target = {
            punch1: winding ? POSES.windPunch : POSES.punch,
            punch2: winding ? POSES.windPunch : POSES.cross,
            upper: winding ? POSES.windUpper : POSES.upper,
            kick: winding ? POSES.windKick : POSES.kick,
            elbow: winding ? POSES.windElbow : POSES.elbow,
            spinkick: winding ? POSES.windSpin : POSES.spin,
            axe: winding ? POSES.windAxe : POSES.axe,
            airkick: POSES.airkick,
            hammer: winding ? POSES.windHammer : POSES.hammer,
          }[this.move];
          break;
        }
        case 'block': target = POSES.block; break;
        case 'hurt': target = POSES.hurt; break;
        case 'dodge': target = POSES.roll; break;
        case 'special': target = this.specialPose(); break;
        case 'victory': target = POSES.flex; break;
        case 'clash': target = POSES.swordClash; break;
        case 'finish': target = this.t < 17 ? POSES.swordDash : this.t < 26 ? POSES.swordCut : POSES.sheath; break;
        case 'dead': target = POSES.dead; break;
        case 'summon': target = this.t < 30 ? POSES.boot : POSES.swordRaise; break;
        case 'armorup': target = this.t < 46 ? POSES.boot : this.t < 104 ? POSES.swordRaise : POSES.swordReady; break;
        case 'swap': target = this.t < 18 ? POSES.raise : POSES.clawReady; break;
        case 'wolfup': target = this.t < 150 ? POSES.howl : this.t < WOLF_PARTS[3].at ? POSES.block : this.t < 214 ? POSES.raise : POSES.clawReady; break;
        default: target = POSES.idle;
      }
      const k = this.state === 'attack' || this.state === 'special' ? 0.5 : 0.3;
      for (const key of POSE_KEYS) this.pose[key] = lerp(this.pose[key], target[key], k);
    }
    // the black lion's body language while Kane rides it
    driveLion() {
      const lp = this.lp || (this.lp = newLionPose());
      const s = this.state, m = this.move && HERO_MOVES[this.move], tg = {};
      if (s === 'walk') tg.speed = Math.min(1, Math.abs(this.vx) / 7);
      else if (s === 'dodge') { tg.speed = 1.3; tg.crouch = 0.4; }
      else if (s === 'jump') tg.leap = 0.8;
      else if (s === 'block') { tg.crouch = 0.7; tg.pitch = 0.2; tg.jaw = 0.4; }
      else if (s === 'hurt') { tg.rear = 0.25; tg.jaw = 0.6; }
      else if (s === 'dead') tg.fallen = 1;
      else if (s === 'victory') { tg.rear = 0.7; tg.jaw = 1; }
      else if (s === 'attack') {
        const winding = this.t <= m.wind;
        if (this.move === 'lclaw1' || this.move === 'lclaw2') { tg.swipe = winding ? 0.4 : 1; tg.jaw = 0.5; tg.crouch = 0.2; }
        else if (this.move === 'lbite') { tg.jaw = winding ? 1 : 0.2; tg.pitch = winding ? -0.2 : 0.35; tg.crouch = 0.3; }
        else if (this.move === 'lpounce') { if (winding) tg.crouch = 1; else tg.leap = 1; tg.jaw = 0.8; }
        else { tg.leap = 1; tg.jaw = 1; tg.swipe = 1; } // sky maul
      }
      lp.step += Math.abs(this.vx) * 0.035;
      stepLionPose(lp, tg, s === 'attack' ? 0.4 : 0.2);
    }
  }

  // ---------------------------------------------------------------- boss
  // 2D silhouettes, only used for the little pictures on the level cards
  const P = {
    body: new Path2D('M80 100 C110 100 120 130 114 152 C108 174 52 174 46 152 C40 130 50 100 80 100 Z'),
    head: new Path2D('M80 26 C114 26 128 46 126 64 C124 84 104 92 80 92 C56 92 36 84 34 64 C32 46 46 26 80 26 Z'),
    hornL: new Path2D('M54 36 L44 10 L68 30 Z'),
    hornR: new Path2D('M106 36 L116 10 L92 30 Z'),
    bigHornL: new Path2D('M52 38 L30 0 L70 28 Z'),
    bigHornR: new Path2D('M108 38 L130 0 L90 28 Z'),
    eyeL: new Path2D('M57 56 L76 63 Q75 69 67 69 Q58 68 57 56 Z'),
    eyeR: new Path2D('M103 56 L84 63 Q85 69 93 69 Q102 68 103 56 Z'),
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
      this.tilt = 0; this.tiltFrom = 0; this.yFrom = GROUND; this.grabY0 = GROUND;
      this.burn = 0; this.soak = 0; // fire / water key effects
    }
    get k() { return this.s * 1.1; } // model scale: ~255 / 330 / 410 px tall
    get hurtbox() {
      if (!this.alive || this.state === 'grabbed') return null;
      const k = this.k;
      if (this.tilt > 0.8) return { x: this.x - 93 * k, y: GROUND - 68 * k, w: 186 * k, h: 68 * k }; // lying down
      return { x: this.x - 44 * k, y: this.y - 176 * k, w: 88 * k, h: 176 * k };
    }
    get reach() { return 70 * this.k + 40; }
    setState(s) { this.state = s; this.t = 0; this.hasHit = false; }
    speedMul() { return (this.enraged ? 1.3 : 1) * (this.soak > 0 ? 0.7 : 1); }
    die() { this.alive = false; this.deathT = 0; this.state = 'dying'; sfx.roar(); game.onBossDown(); }
    grab() { this.setState('grabbed'); this.grabY0 = this.y; this.vx = 0; this.telegraph = false; }
    knockdown(dir) {
      if (!this.alive) return;
      this.setState('down'); this.vx = dir * 5; this.vy = 0; this.onGround = true;
      this.tiltFrom = this.tilt; this.yFrom = this.y;
    }

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
      if (this.soak > 0) { this.soak--; if (this.soak % 10 === 0) burst(this.x + rand(-40, 40) * this.k, this.y - rand(40, 150) * this.k, 1, '#7dd3fc', 1, 4, 0.35, 20); }
      if (this.burn > 0) { // fire key damage over time
        this.burn--;
        if (this.t % 3 === 0) burst(this.x + rand(-40, 40) * this.k, this.y - rand(20, 160) * this.k, 1, Math.random() < 0.5 ? '#f97316' : '#fde047', 2, 6, -0.2, 22, 30);
        if (this.burn % 20 === 0) {
          this.hp = Math.max(0, this.hp - 3); this.flashT = 2;
          popText(this.x + rand(-30, 30), this.y - 170 * this.k, '3', '#fb923c', 18);
          if (this.hp <= 0) { this.die(); return; }
        }
      }
      if (!this.enraged && L.enrageAt && this.hp <= this.maxHp * L.enrageAt) {
        this.enraged = true; popText(this.x, this.y - 210 * this.k, 'ENRAGED!', '#ff3b3b', 40); sfx.roar(); shakeIt(14);
      }
      if (hero.state === 'dead' && this.state !== 'gloat' && !LYING.includes(this.state)) this.setState('gloat');

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
            if (Math.abs(hero.x - this.x) < 60 * this.k + 90) hero.takeHit(6 + (this.L.tier ?? this.level) * 3, this.x, 'blast');
          }
          if (this.t > 34) this.setState('idle');
          break;
        case 'stagger':
          this.vx *= 0.9; targetArm = 0.8; targetBack = 0.8;
          if (this.t % 6 === 0) burst(this.x + rand(-30, 30) * this.k, this.y - rand(60, 160) * this.k, 3, '#ffd166', 4, 3, 0.2, 20);
          if (this.t > 70) this.setState('idle');
          break;
        case 'down': { // knocked flat on its back
          const e = 1 - (1 - Math.min(1, this.t / 18)) ** 2;
          this.tilt = lerp(this.tiltFrom, Math.PI / 2, e);
          this.y = lerp(this.yFrom, GROUND + 59 * this.k, e);
          this.vx *= 0.88; targetArm = -2.6; targetBack = -2.6;
          if (this.t === 18 && this.tiltFrom < 1) { shakeIt(14); sfx.heavy(); burst(this.x, GROUND, 30, '#9ca3af', 8, 6, 0.3, 30); }
          if (this.t % 9 === 0) burst(this.x + rand(-60, 60) * this.k, GROUND - 40 * this.k, 2, '#ffd166', 4, 3, 0.2, 18);
          if (this.t > 100) this.setState('getup');
          break;
        }
        case 'getup': {
          const e = ease(Math.min(1, this.t / 26));
          this.tilt = lerp(Math.PI / 2, 0, e);
          this.y = lerp(GROUND + 59 * this.k, GROUND, e);
          targetArm = 0.6; targetBack = 0.6;
          if (this.t >= 26) { this.tilt = 0; this.y = GROUND; this.setState('shove'); }
          break;
        }
        case 'tornado': // caught in the water tornado: lifted and spun
          this.y = lerp(this.yFrom, GROUND - 170, ease(Math.min(1, this.t / 30)));
          targetArm = -2.9 + Math.sin(this.t * 0.7) * 0.6; targetBack = -2.6 - Math.sin(this.t * 0.7) * 0.6;
          if (this.t > 150) this.knockdown(this.face); // safety: never get stuck up there
          break;
        case 'shocked': // frozen by the thunder slash
          this.vx = 0; this.y = GROUND;
          targetArm = 0.9 + Math.sin(this.t * 1.9) * 0.3; targetBack = 0.7 - Math.sin(this.t * 1.7) * 0.3;
          if (this.t > 130) this.setState('idle');
          break;
        case 'grabbed': // the hero moves us around
          targetArm = -2.9 + Math.sin(this.t * 0.6) * 0.4; targetBack = -2.6 - Math.sin(this.t * 0.6) * 0.4;
          break;
        case 'gloat':
          this.vx = 0; targetArm = Math.sin(this.t * 0.2) * 0.4 - 2.4;
          if (hero.state !== 'dead') this.setState('idle'); // the hero got back up
          break;
      }
      if (!['punch', 'dash', 'slam', 'grenade', 'laser', 'shove'].includes(this.state)) this.telegraph = false;

      // physics
      if (LYING.includes(this.state)) {
        this.x += this.vx;
      } else {
        if (this.tilt > 0) this.tilt = Math.max(0, this.tilt - 0.1);
        if (!this.onGround) this.vy += 0.8;
        this.x += this.vx; this.y += this.vy;
        if (this.y >= GROUND) { this.y = GROUND; this.vy = 0; this.onGround = true; }
      }
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
      const helpless = LYING.includes(this.state);
      // light flinch out of neutral, super armour during attacks
      if (!helpless && ['idle', 'approach', 'retreat', 'recover'].includes(this.state)) {
        this.vx = kb * 0.6;
        this.recentHits = (this.recentHits || 0) + 1;
        if (this.recentHits >= 5 - Math.min(2, this.level)) { this.recentHits = 0; this.setState('shove'); }
      }
      if (!helpless) this.poise += poise;
      if (!helpless && this.poise >= this.L.poise && this.state !== 'stagger') {
        this.poise = 0; this.setState('stagger'); this.vx = kb; popText(this.x, this.y - 200 * this.k, 'STAGGERED!', '#fde047', 30); sfx.clank();
      }
      if (this.hp <= 0) this.die();
    }
    updateDeath() {
      this.deathT++;
      this.vx *= 0.9; this.x += this.vx;
      const cy = this.tilt > 0.8 ? GROUND - 40 * this.k : this.y - 100 * this.k;
      if (this.deathT % 7 === 0 && this.deathT < 110) {
        const ex = this.x + rand(-60, 60) * this.k, ey = cy + rand(-70, 70) * this.k * (this.tilt > 0.8 ? 0.4 : 1);
        game.explosions.push({ x: ex, y: ey, r: rand(30, 60) * this.s, t: 0, harmless: true });
        sfx.boom(); shakeIt(10);
      }
      if (this.deathT === 115) {
        burst(this.x, cy, 120, '#ff7a1a', 16, 7, 0.3, 60);
        burst(this.x, cy, 60, '#2b2b2b', 12, 9, 0.35, 70);
        game.explosions.push({ x: this.x, y: cy, r: 160 * this.s, t: 0, harmless: true });
        flash = 14; shakeIt(30); sfx.boom();
      }
    }
  }

  // ---------------------------------------------------------------- the shadow knight (level 5)
  // A dark mirror of Kane: hero-sized, sword fighter, guards and counters, throws crescents, uses dark
  // versions of the three sword specials. Rides on the Boss machinery (timers, physics, helpless states,
  // death) and is drawn with a recolored hero rig (or the dark megazord rig for the final round).
  const SHADOW_SPECIALS = ['darkflame', 'darktornado', 'darkthunder'];
  const SHADOW_NAMES = { darkflame: 'DARK FLAME SLASH!', darktornado: 'SHADOW TORNADO!', darkthunder: 'BLACK THUNDER!' };
  class ShadowKnight extends Boss {
    constructor(levelIdx) {
      super(levelIdx);
      this.isShadow = true; this.zord = levelIdx === DARK_ZORD;
      this.pose = { ...POSES.swordReady }; this.energy = 40; this.spIdx = 0; this.comboN = 0;
      this.fallen = 0; this.hulk = 0; this.element = null; this.inv = 0; this.orb = 0; this.special = null; this.spin = 0;
      this.dmgMul = this.zord ? 1.3 : 1; this.blockChance = this.zord ? 0.4 : 0.38;
    }
    get rage() { return true; }
    get rageK() { return 1; }
    armorPart() { return 1; }
    get reach() { return 135; }
    get hurtbox() {
      if (!this.alive || this.state === 'grabbed') return null;
      if (this.state === 'floored' || this.fallen > 0.6) return { x: this.x - 70, y: GROUND - 50, w: 140, h: 50 };
      return { x: this.x - 32, y: this.y - 195, w: 64, h: 195 };
    }
    // is the blade live right now (for sword clashes and the trail)
    attackActive() {
      if (this.state !== 'slash') return false;
      const w = this.slashWind();
      return this.t >= w - 3 && this.t <= w + 8;
    }
    get slashing() { return this.attackActive() || (this.state === 'dashslash' && this.t > this.dashWind()) || (this.state === 'darkthunder' && this.phase === 'dash'); }
    slashWind() { return Math.round((this.comboN ? 7 : 11) / this.speedMul()); }
    dashWind() { return Math.round(18 / this.speedMul()); }
    think(hero) {
      const dx = hero.x - this.x, dist = Math.abs(dx);
      this.face = Math.sign(dx) || this.face;
      if (this.energy >= 100) {
        this.energy = 0;
        const sp = SHADOW_SPECIALS[this.spIdx++ % SHADOW_SPECIALS.length];
        this.setState(sp); this.phase = 'charge';
        popText(this.x, this.y - 280, SHADOW_NAMES[sp], '#f87171', 38); sfx.charge();
        return;
      }
      const opts = dist < 160
        ? [['slash', 6], ['guard', 2], ['backstep', 1]]
        : [['approach', 5], ...(dist > 260 ? [['dashslash', 2]] : []), ...(dist > 200 ? [['crescent', 2]] : [])];
      let total = opts.reduce((s, o) => s + o[1], 0), r = Math.random() * total, pick = opts[0][0];
      for (const [name, w] of opts) { if ((r -= w) <= 0) { pick = name; break; } }
      this.setState(pick); this.comboN = 0;
      if (pick === 'approach') this.wait = Math.round(rand(30, 60));
    }
    // sword hit on the hero; turns into a clash if the hero's blade is live too
    strike(hero, dmg, reach, kind = 'hit') {
      const box = { x: Math.min(this.x, this.x + this.face * reach), y: this.y - 190, w: reach, h: 175 };
      if (!overlap(box, hero.hurtbox)) return false;
      if (heroBladeLive(hero) && game.canClash()) { game.startClash(); return true; }
      if (hero.takeHit(Math.round(dmg * this.dmgMul), this.x, kind)) {
        hitstop = 5; sfx.slash(); this.energy = Math.min(100, this.energy + 10);
        burst(hero.x, hero.y - 120, 12, '#ef4444', 7, 4, 0.1, 18);
      }
      return true;
    }
    takeHit(dmg, poise, kb, hx, hy) {
      if (!this.alive) return;
      if (this.attackActive() && game.canClash()) { game.startClash(); return; } // blades meet mid-swing
      if (this.state === 'guard' && Math.sign(hx - this.x) === this.face) { // guarded: chip damage, maybe a counter
        this.hp = Math.max(0, this.hp - Math.max(1, Math.round(dmg * 0.1))); this.flashT = 2;
        sfx.block(); burst(this.x + this.face * 30, this.y - 140, 10, '#fca5a5', 5, 3);
        popText(this.x, this.y - 220, 'BLOCKED', '#fca5a5', 18);
        if (this.hp <= 0) { this.die(); return; }
        if (Math.random() < 0.35) { this.setState('slash'); this.comboN = 1; popText(this.x, this.y - 250, 'COUNTER!', '#f87171', 24); }
        return;
      }
      this.energy = Math.min(100, this.energy + 6);
      super.takeHit(dmg, poise, kb, hx, hy);
    }
    knockdown(dir) {
      if (!this.alive) return;
      this.setState('floored'); this.vx = dir * 5; this.vy = 0; this.onGround = true; this.yFrom = this.y;
    }
    update(hero) {
      super.update(hero); // timers, burn/soak, enrage, physics, helpless states, think() from idle
      if (!this.alive) { this.fallen = Math.min(1, this.deathT / 24); this.animate(); return; }
      const sm = this.speedMul(), dist = Math.abs(hero.x - this.x);
      if (!LYING.includes(this.state)) this.fallen = Math.max(0, this.fallen - 0.08);
      // reads your attacks: sometimes raises a guard as you swing
      if (['idle', 'approach'].includes(this.state) && hero.state === 'attack' && hero.t === 1 && dist < 190 && Math.random() < this.blockChance) this.setState('guard');
      switch (this.state) {
        case 'slash': { // up to a 3-hit sword string
          const wind = this.slashWind(), act = 6, rec = 12;
          this.telegraph = this.t < wind;
          if (this.t < wind) this.vx *= 0.7;
          else if (this.t === wind) { this.vx = this.face * 6; sfx.slash(); }
          else if (this.t <= wind + act) { this.vx *= 0.8; if (!this.hasHit) this.hasHit = this.strike(hero, [10, 12, 16][this.comboN], 140); }
          else if (this.t > wind + act + rec) {
            if (this.comboN < 2 && Math.random() < this.L.punch.chain + 0.2) { this.comboN++; this.setState('slash'); }
            else { this.comboN = 0; this.setState('idle'); }
          }
          break;
        }
        case 'dashslash': {
          const wind = this.dashWind();
          if (this.t < wind) { this.telegraph = true; this.vx = -this.face * 0.8; }
          else if (this.t === wind) { this.vx = this.face * 20; this.dashFrom = this.x; sfx.slash(); sfx.whoosh(); }
          else {
            if (this.t % 2 === 0) burst(this.x - this.face * 20, this.y - rand(40, 180), 3, '#ef4444', 1, 6, 0, 14);
            if (!this.hasHit) this.hasHit = this.strike(hero, 18, 90, 'blast');
            const passed = (hero.x - this.x) * this.face < -120 || Math.abs(this.x - this.dashFrom) > 700;
            if (passed || this.t > wind + 26 || this.x <= ARENA_L + 31 || this.x >= ARENA_R - 31) { this.vx = 0; this.setState('recover'); this.wait = 24; }
          }
          break;
        }
        case 'crescent':
          this.vx = 0; this.telegraph = this.t < 16;
          if (this.t === 16) { game.slashes.push({ x: this.x + this.face * 60, y: this.y - 120, dir: this.face, life: 50, hit: false, color: this.tint ?? 0xdc2626, enemy: true, dmg: Math.round(14 * this.dmgMul) }); sfx.slash(); }
          if (this.t > 36) this.setState('idle');
          break;
        case 'guard':
          this.vx = 0; this.face = Math.sign(hero.x - this.x) || this.face;
          if (this.t > 50) this.setState('idle');
          break;
        case 'backstep':
          if (this.t === 1) { this.vx = -this.face * 11; this.vy = -6; this.onGround = false; sfx.whoosh(); }
          this.vx *= 0.92;
          if (this.t > 18 && this.onGround) this.setState('idle');
          break;
        case 'darkflame':
          this.vx = 0; this.telegraph = this.t < 30;
          if (this.t < 30 && this.t % 2 === 0) burst(this.x - this.face * 20 + rand(-14, 14), this.y - 250 - rand(0, 120), 2, Math.random() < 0.5 ? '#dc2626' : '#1f0a0a', 2, 7, -0.25, 24, 30);
          if (this.t === 30) {
            game.slashes.push({ x: this.x + this.face * 80, y: this.y - 150, dir: this.face, life: 64, hit: false, color: this.tint ?? 0xb91c1c, scale: 2.2, dmg: Math.round(26 * this.dmgMul), speed: 17, enemy: true, fire: true });
            sfx.slash(); sfx.boom(); shakeIt(14);
          }
          if (this.t > 56) this.setState('idle');
          break;
        case 'darktornado':
          this.vx = 0; this.telegraph = this.t < 28;
          if (this.t < 28) this.spin += TAU * 2 / 28;
          if (this.t === 28) { this.spin = 0; game.darkTornado = { x: this.x + this.face * 90, dir: this.face, t: 0, life: 140 }; sfx.kame(); shakeIt(10); }
          if (this.t > 44) this.setState('idle');
          break;
        case 'darkthunder':
          if (this.phase === 'charge') {
            this.vx = 0; this.telegraph = true;
            if (this.t % 3 === 0) burst(this.x - this.face * 20, this.y - 250 - rand(0, 100), 2, '#f87171', 5, 4, 0, 10, 30);
            if (this.t >= 28) { this.phase = 'dash'; this.t = 0; this.hasHit = false; this.target = clamp(hero.x + this.face * 140, ARENA_L, ARENA_R); sfx.zap(); sfx.slash(); }
          } else if (this.phase === 'dash') {
            this.vx = this.face * 28;
            for (let i = 0; i < 3; i++) particles.push({ x: this.x - this.face * rand(0, 40), y: this.y - rand(20, 210), z: rand(-20, 20), vx: 0, vy: 0, vz: 0, life: 14, max: 14, color: i ? '#ef4444' : '#ffffff', size: 7, g: 0 });
            if (!this.hasHit) this.hasHit = this.strike(hero, 16, 80, 'blast');
            if ((this.x - this.target) * this.face >= 0 || this.t > 30 || this.x <= ARENA_L + 31 || this.x >= ARENA_R - 31) { this.vx = 0; this.phase = 'pose'; this.t = 0; this.boltX = hero.x; }
          } else { // back turned while red lightning hunts you down
            this.vx = 0;
            if (this.t % 12 === 0 && this.t < 50) { this.boltX = hero.x; game.strikes.push({ x: hero.x, t: 0, fuse: 16, dmg: Math.round(9 * this.dmgMul), color: 0xef4444 }); }
            if (this.t === 56) popText(this.x, this.y - 280, 'FALL.', '#f87171', 36);
            if (this.t > 70) this.setState('idle');
          }
          break;
        case 'floored': { // knocked down
          const e = 1 - (1 - Math.min(1, this.t / 14)) ** 2;
          this.y = lerp(this.yFrom, GROUND, e); this.tilt = 0;
          this.fallen = Math.max(this.fallen, e); this.vx *= 0.88;
          if (this.t > 70) { this.setState('rising'); }
          break;
        }
        case 'rising':
          this.vx = 0; this.fallen = Math.max(0, 1 - this.t / 20);
          if (this.t > 22) this.setState(Math.random() < 0.5 ? 'backstep' : 'idle');
          break;
        case 'clash':
          this.vx = 0;
          break;
      }
      if (this.state === 'grabbed') this.fallen = this.tilt / (Math.PI / 2);
      this.animate();
    }
    animate() {
      const s = this.state, t = this.t;
      let target = POSES.swordReady;
      if (s === 'approach' || s === 'retreat') target = Math.sin(this.step * 3) > 0 ? POSES.walkA : POSES.walkB;
      else if (s === 'slash') target = t < this.slashWind() ? (this.comboN === 2 ? POSES.windUpper : POSES.windPunch) : [POSES.punch, POSES.cross, POSES.upper][this.comboN];
      else if (s === 'dashslash') target = t < this.dashWind() ? POSES.windSpin : POSES.swordDash;
      else if (s === 'crescent' || s === 'darkflame') target = t < (s === 'crescent' ? 16 : 30) ? POSES.swordRaise : POSES.swordCut;
      else if (s === 'guard') target = POSES.block;
      else if (s === 'backstep') target = POSES.jump;
      else if (s === 'darktornado') target = POSES.swordRaise;
      else if (s === 'darkthunder') target = this.phase === 'charge' ? POSES.swordRaise : this.phase === 'dash' ? POSES.swordDash : POSES.sheath;
      else if (['stagger', 'shocked', 'tornado', 'grabbed', 'shove'].includes(s)) target = s === 'shove' ? POSES.hulkRoar : POSES.hurt;
      else if (s === 'floored' || s === 'dying') target = POSES.dead;
      else if (s === 'rising') target = POSES.boot;
      else if (s === 'clash') target = POSES.swordClash;
      else if (s === 'gloat') target = POSES.flex;
      for (const key of POSE_KEYS) this.pose[key] = lerp(this.pose[key], target[key], 0.4);
    }
  }
  // is the hero's sword mid-swing (a clash can only happen blade against blade)
  function heroBladeLive(h) {
    if (h.state !== 'attack') return false;
    const m = HERO_MOVES[h.move];
    return !m.air && h.t > m.wind - 3 && h.t <= m.wind + m.active + 3;
  }

  // ---------------------------------------------------------------- vorath's legion (chapter 9)
  // Four evil megazords, each the shadow knight's sword-and-specials fighter in its own colors. While the story
  // needs Kane to be losing, the one he's fighting has a floor it can't be beaten past (floorHp).
  class LegionZord extends ShadowKnight {
    constructor(levelIdx) {
      super(levelIdx);
      this.zord = true; this.style = this.L.style; this.tint = this.L.tint;
      this.dmgMul = 1.2; this.floorHp = 0; this.floorHit = false;
    }
    takeHit(dmg, poise, kb, hx, hy) {
      if (this.alive && this.floorHp && this.hp - dmg <= this.floorHp) {
        dmg = Math.round(this.hp - this.floorHp); this.floorHit = true;
        if (dmg <= 0) { this.flashT = 2; burst(hx, hy, 6, '#ffffff', 5, 3, 0.2, 14); return; }
      }
      super.takeHit(dmg, poise, kb, hx, hy);
    }
    update(hero) {
      super.update(hero);
      if (this.floorHp && this.hp < this.floorHp) this.hp = this.floorHp;
    }
  }

  // ---------------------------------------------------------------- emperor nox (chapter 6)
  // A floating sorcerer: homing void orbs, void rain, teleport-and-palm, a void beam (the boss laser), and a
  // barrier that soaks blows. Rides on the Boss machinery; drawn as the hologram's robes made solid.
  class Nox extends Boss {
    constructor(levelIdx) {
      super(levelIdx);
      this.isNox = true; this.fade = 1;
    }
    get hurtbox() {
      if (!this.alive || this.state === 'grabbed' || this.fade < 0.5) return null;
      return { x: this.x - 36, y: this.y - 240, w: 72, h: 240 };
    }
    get reach() { return 130; }
    think(hero) {
      const dist = Math.abs(hero.x - this.x);
      this.face = Math.sign(hero.x - this.x) || this.face;
      const opts = dist < 170
        ? [['teleport', 4], ['barrier', 2], ['palm', 3]]
        : [['orbs', 4], ['meteor', 3], ['approach', 2], ['teleport', 2], ...(this.cd.laser <= 0 ? [['laser', 3]] : [])];
      if (this.enraged) opts.push(['meteor', 2], ['orbs', 2]);
      let total = opts.reduce((s, o) => s + o[1], 0), r = Math.random() * total, pick = opts[0][0];
      for (const [name, w] of opts) { if ((r -= w) <= 0) { pick = name; break; } }
      this.setState(pick);
      if (pick === 'approach') this.wait = 40;
      if (pick === 'laser') { this.cd.laser = this.enraged ? 240 : 360; sfx.charge(); popText(this.x, this.y - 280, 'VOID BEAM', '#e879f9', 26); }
    }
    takeHit(dmg, poise, kb, hx, hy) {
      if (!this.alive || this.fade < 0.5) return;
      if (this.state === 'barrier') { // the barrier soaks the blow
        this.hp = Math.max(0, this.hp - Math.max(1, Math.round(dmg * 0.1))); this.flashT = 2;
        sfx.block(); burst(hx, hy, 10, '#e879f9', 6, 3, 0, 16);
        popText(this.x, this.y - 280, 'BARRIER', '#e879f9', 20);
        if (this.hp <= 0) this.die();
        return;
      }
      super.takeHit(dmg, poise, kb, hx, hy);
    }
    knockdown(dir) { // he doesn't fall over; he reels and drops back to the floor
      if (!this.alive) return;
      this.setState('stagger'); this.vx = dir * 6; this.onGround = false; this.vy = 0; this.tilt = 0;
    }
    update(hero) {
      super.update(hero);
      if (!this.alive) return;
      const t = this.t;
      switch (this.state) {
        case 'orbs': // three homing void orbs
          this.vx = 0; this.telegraph = t < 18;
          if (t === 18 || t === 30 || t === 42) {
            const a = Math.atan2((hero.y - 120) - (this.y - 150), hero.x - this.x);
            game.orbs.push({ x: this.x + this.face * 40, y: this.y - 150, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, life: 130, dmg: 12 });
            sfx.laser();
          }
          if (t > 64) this.setState('idle');
          break;
        case 'meteor': // void lightning rains down around the hero
          this.vx = 0; this.telegraph = t < 20;
          if (t === 20) {
            const n = this.enraged ? 5 : 4;
            for (let i = 0; i < n; i++) game.strikes.push({ x: clamp(hero.x + (i - (n - 1) / 2) * 110 + rand(-20, 20), ARENA_L, ARENA_R), t: -i * 8, fuse: 44, dmg: 14, color: 0xa855f7 });
            popText(this.x, this.y - 280, 'VOID RAIN!', '#e879f9', 28); sfx.roar();
          }
          if (t > 76) this.setState('idle');
          break;
        case 'teleport': // fades out, reappears behind the hero, then strikes
          this.vx = 0;
          if (t < 12) this.fade = 1 - t / 12;
          else if (t === 12) { this.x = clamp(hero.x - hero.face * 140, ARENA_L + 30, ARENA_R - 30); this.face = Math.sign(hero.x - this.x) || this.face; sfx.whoosh(); burst(this.x, this.y - 120, 20, '#a855f7', 6, 5, 0, 20); }
          else if (t < 22) this.fade = (t - 12) / 10;
          else { this.fade = 1; this.setState('palm'); }
          break;
        case 'palm': // a point-blank void palm
          this.vx = 0; this.telegraph = t < 14;
          if (t === 14) {
            sfx.heavy(); burst(this.x + this.face * 60, this.y - 140, 24, '#e879f9', 9, 5, 0, 20);
            game.rings.push({ x: this.x + this.face * 60, y: this.y - 140, r: 20, life: 18, color: '232,121,249' });
            const box = { x: Math.min(this.x, this.x + this.face * 150), y: this.y - 220, w: 150, h: 200 };
            if (overlap(box, hero.hurtbox)) hero.takeHit(16, this.x, 'blast');
          }
          if (t > 34) this.setState('idle');
          break;
        case 'barrier':
          this.vx = 0; this.face = Math.sign(hero.x - this.x) || this.face;
          if (t > 60) this.setState('idle');
          break;
      }
    }
  }

  // ---------------------------------------------------------------- the behemoth (chapter 7)
  // The King of Monsters: too heavy to lift, grab or knock flat. Stomps send shockwaves, the tail sweeps both
  // sides (jump it), the bite lunges, and the atomic breath charges its dorsal plates then sweeps the ground.
  // In the first two rounds it has a floor (floorHp) it cannot be beaten past: Kane is meant to lose alone.
  class Kaiju extends Boss {
    constructor(levelIdx) {
      super(levelIdx);
      this.isKaiju = true; this.charge = 0; this.spin = 0; this.lunge = 0; this.stompLeg = 0; this.beamX = 0;
      this.floorHp = 0; this.floorHit = false; this.cd.breath = 240; this.wallT = 0;
    }
    get halfW() { return 40 * this.k; }
    setState(s) { // nothing lifts it, grabs it, or lays it flat
      if (s === 'tornado' || s === 'grabbed' || s === 'down') { if (this.alive) popText(this.x, this.y - 200 * this.k, 'TOO HEAVY!', '#93c5fd', 30); s = 'stagger'; }
      super.setState(s);
    }
    grab() { this.setState('grabbed'); this.takeHit(35, 0, 0, this.x, this.y - 100 * this.k); }
    takeHit(dmg, poise, kb, hx, hy) {
      if (!this.alive) return;
      if (this.floorHp && this.hp - dmg <= this.floorHp) {
        dmg = Math.round(this.hp - this.floorHp);
        if (!this.floorHit) { this.floorHit = true; game.onKaijuWall(); }
        if (dmg <= 0) { // nothing gets through its hide
          this.flashT = 2; burst(hx, hy, 6, '#93c5fd', 5, 3, 0.2, 14);
          if (this.wallT <= 0) { popText(hx, hy - 30, 'NO EFFECT', '#93c5fd', 22); this.wallT = 30; }
          return;
        }
      }
      super.takeHit(dmg, poise, kb, hx, hy);
    }
    think(hero) {
      const dist = Math.abs(hero.x - this.x), k = this.k;
      this.face = Math.sign(hero.x - this.x) || this.face;
      const opts = dist < 90 * k + 80
        ? [['bite', 4], ['tail', 3], ['stomp', 2], ['retreat', 1]]
        : [['approach', 4], ['stomp', 2], ...(this.cd.breath <= 0 ? [['breath', 4]] : []), ...(dist > 420 ? [['dash', 1]] : [])];
      let total = opts.reduce((s, o) => s + o[1], 0), r = Math.random() * total, pick = opts[0][0];
      for (const [name, w] of opts) { if ((r -= w) <= 0) { pick = name; break; } }
      this.setState(pick);
      if (pick === 'approach') this.wait = Math.round(rand(40, 80));
      if (pick === 'retreat') this.wait = 30;
      if (pick === 'breath') { this.cd.breath = this.enraged ? 260 : 380; sfx.charge(); }
    }
    update(hero) {
      super.update(hero);
      if (this.floorHp && this.hp < this.floorHp) this.hp = this.floorHp; // burn ticks can't push it past the floor either
      if (this.wallT > 0) this.wallT--;
      this.lunge = lerp(this.lunge, 0, 0.15);
      if (this.state !== 'breath') this.charge = Math.max(0, this.charge - 0.03);
      if (this.state !== 'tail') this.spin = 0;
      if (this.state !== 'stomp') this.stompLeg = Math.max(0, this.stompLeg - 0.1);
      if (!this.alive) return;
      const t = this.t, k = this.k, sm = this.speedMul();
      switch (this.state) {
        case 'stomp': { // one leg up, then down: shockwaves both ways
          const wind = Math.round(this.L.slam.wind / sm);
          this.vx = 0; this.telegraph = t < wind;
          this.stompLeg = t < wind ? Math.min(1, t / 12) : Math.max(0, 1 - (t - wind) / 6);
          if (t === wind) {
            shakeIt(22); sfx.boom(); sfx.heavy();
            burst(this.x + this.face * 30 * k, GROUND, 40, '#a8a29e', 10, 7, 0.3, 34);
            game.rings.push({ x: this.x + this.face * 30 * k, y: GROUND, r: 10, life: 26, color: '214,211,209' });
            for (const d of [-1, 1]) game.waves.push({ x: this.x + d * 50 * k, dir: d, speed: 10 * sm, life: 90, h: 60, dmg: this.L.slam.dmg, hit: false });
          }
          if (t > wind + 30) this.setState('idle');
          break;
        }
        case 'tail': { // a full turn: the tail sweeps everything near it on both sides
          const wind = Math.round(24 / sm);
          this.vx = 0; this.telegraph = t < wind;
          if (t >= wind && t < wind + 22) {
            this.spin = ease((t - wind) / 22) * TAU;
            if (t === wind) { sfx.whoosh(); sfx.roar(); }
            if (!this.hasHit && t > wind + 4 && t < wind + 18 && Math.abs(hero.x - this.x) < 110 * k && hero.y > GROUND - 150) {
              this.hasHit = true;
              if (hero.takeHit(24, this.x, 'blast')) { hitstop = 6; shakeIt(14); sfx.heavy(); }
            }
          } else this.spin = 0;
          if (t > wind + 44) this.setState('idle');
          break;
        }
        case 'bite': {
          const wind = Math.round(22 / sm);
          this.telegraph = t < wind;
          if (t < wind) { this.vx *= 0.7; this.lunge = -0.3; }
          else if (t < wind + 12) {
            this.lunge = 1;
            if (t === wind) { this.vx = this.face * 8; sfx.whoosh(); }
            const reach = 60 * k + 110, box = { x: Math.min(this.x, this.x + this.face * reach), y: GROUND - 300, w: reach, h: 300 };
            if (!this.hasHit && overlap(box, hero.hurtbox)) { this.hasHit = true; if (hero.takeHit(22, this.x)) { hitstop = 6; sfx.heavy(); shakeIt(10); } }
          } else { this.vx *= 0.8; if (t > wind + 36) this.setState('idle'); }
          break;
        }
        case 'breath': { // plates light up tail to head, then a blue beam rakes the ground away from it
          const B = this.L.breath, charge = Math.round(B.charge / sm);
          this.vx = 0;
          if (t < charge) {
            this.telegraph = true; this.charge = t / charge;
            if (t < charge * 0.6) this.face = Math.sign(hero.x - this.x) || this.face;
            if (t % 3 === 0) burst(this.x - this.face * rand(20, 60) * k, this.y - rand(60, 170) * k, 1, '#7dd3fc', 2, 5, -0.1, 16);
            this.beamX = this.x + this.face * 50 * k;
          } else if (t < charge + B.fire) {
            this.charge = 1;
            if (t === charge) { sfx.kame(); shakeIt(12); popText(this.x, this.y - 210 * k, 'ATOMIC BREATH!', '#7dd3fc', 36); }
            this.beamX = clamp(this.beamX + this.face * 14, ARENA_L - 40, ARENA_R + 40);
            if (t % 2 === 0) burst(this.beamX, GROUND - 6, 4, Math.random() < 0.5 ? '#38bdf8' : '#e0f2fe', 7, 6, -0.15, 22);
            if (t % 8 === 0) sfx.beam();
            shakeIt(4);
            if (!this.hasHit && hero.hurtbox && Math.abs(hero.x - this.beamX) < 60 && hero.y > GROUND - 140) { this.hasHit = true; hero.takeHit(B.dmg, this.x, 'blast'); }
          } else { this.charge = 0; if (t > charge + B.fire + 26) this.setState('idle'); }
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- the corrupted lion (chapter 8)
  // Kane's own lion spirit, twisted by Vorath: claw strings, a leaping pounce, a roar that sends shockwaves both
  // ways, charges, and crimson claw waves. Knocked down it rolls onto its side; beaten, it is purified, not destroyed.
  class LionBoss extends Boss {
    constructor(levelIdx) {
      super(levelIdx);
      this.isLion = true; this.lp = newLionPose(); this.corrupt = 1; this.fade = 1; this.hidden = false; this.fallen = 0;
      this.comboN = 0; this.cd.roar = 200; this.cd.wave = 120;
    }
    get k() { return this.s; }
    get halfW() { return 120; }
    get reach() { return 190; }
    get hurtbox() {
      if (!this.alive || this.state === 'grabbed' || this.hidden) return null;
      if (this.state === 'floored' || this.fallen > 0.6) return { x: this.x - 120, y: GROUND - 90, w: 240, h: 90 };
      return { x: this.x - 125, y: this.y - 215, w: 250, h: 215 };
    }
    knockdown(dir) {
      if (!this.alive) return;
      this.setState('floored'); this.vx = dir * 5; this.vy = 0; this.onGround = true; this.yFrom = this.y; this.tilt = 0;
    }
    think(hero) {
      const dist = Math.abs(hero.x - this.x);
      this.face = Math.sign(hero.x - this.x) || this.face; this.comboN = 0;
      const opts = dist < 240
        ? [['claw', 6], ['retreat', 1], ...(this.cd.roar <= 0 ? [['roar', 2]] : [])]
        : [['approach', 4], ...(dist < 700 ? [['pounce', 3]] : []), ...(dist > 320 ? [['dash', 2]] : []), ...(this.cd.wave <= 0 && (this.enraged || dist > 420) ? [['clawwave', 3]] : [])];
      let total = opts.reduce((s, o) => s + o[1], 0), r = Math.random() * total, pick = opts[0][0];
      for (const [name, w] of opts) { if ((r -= w) <= 0) { pick = name; break; } }
      this.setState(pick);
      if (pick === 'approach') this.wait = Math.round(rand(30, 60));
      if (pick === 'retreat') this.wait = 24;
      if (pick === 'roar') this.cd.roar = 300;
      if (pick === 'clawwave') this.cd.wave = this.enraged ? 90 : 180;
    }
    update(hero) {
      super.update(hero);
      if (!this.alive) { this.driveLp(); return; }
      if (!LYING.includes(this.state)) this.fallen = Math.max(0, this.fallen - 0.08);
      if (this.corrupt > 0.5 && game.time % 3 === 0) burst(this.x + rand(-90, 90), this.y - rand(80, 200), 1, Math.random() < 0.5 ? '#7f1d1d' : '#1c0a0a', 1.5, 7, -0.15, 26); // dark flames
      const t = this.t, sm = this.speedMul();
      switch (this.state) {
        case 'claw': { // up to three swipes
          const wind = Math.round((this.comboN ? 8 : 12) / sm);
          this.telegraph = t < wind;
          if (t < wind) this.vx *= 0.7;
          else if (t === wind) { this.vx = this.face * 7; sfx.whoosh(); }
          else if (t <= wind + 6) {
            this.vx *= 0.85;
            const box = { x: Math.min(this.x, this.x + this.face * 210), y: this.y - 200, w: 210, h: 170 };
            if (!this.hasHit && overlap(box, hero.hurtbox)) { this.hasHit = true; if (hero.takeHit([12, 14, 18][this.comboN], this.x)) { hitstop = 5; sfx.heavy(); burst(hero.x, hero.y - 120, 12, '#ef4444', 7, 4, 0.1, 18); } }
          } else if (t > wind + 20) {
            if (this.comboN < 2 && Math.random() < this.L.punch.chain) { this.comboN++; this.setState('claw'); }
            else { this.comboN = 0; this.setState('idle'); }
          }
          break;
        }
        case 'pounce': {
          const wind = Math.round(20 / sm);
          if (t < wind) { this.telegraph = true; this.vx = 0; }
          else if (t === wind) { this.vy = -15; this.onGround = false; this.vx = clamp((hero.x - this.x) / 34, -15, 15); sfx.roar(); sfx.whoosh(); }
          else {
            if (!this.hasHit && overlap(this.hurtbox, hero.hurtbox)) { this.hasHit = true; if (hero.takeHit(20, this.x - this.face * 20, 'blast')) { hitstop = 6; shakeIt(12); sfx.heavy(); } }
            if (this.onGround) { shakeIt(8); burst(this.x, GROUND, 20, '#57534e', 7, 6, 0.3, 26); this.vx = 0; this.setState('recover'); this.wait = 28; }
          }
          break;
        }
        case 'roar': {
          this.vx = 0; this.telegraph = t < 22;
          if (t === 22) {
            sfx.roar(); sfx.boom(); shakeIt(16); popText(this.x, this.y - 260, 'ROOOAAAR!', '#f87171', 34);
            game.rings.push({ x: this.x, y: GROUND, r: 10, life: 30, color: '239,68,68' });
            game.rings.push({ x: this.x + this.face * 80, y: this.y - 150, r: 20, life: 22, color: '127,29,29' });
            for (const d of [-1, 1]) game.waves.push({ x: this.x + d * 120, dir: d, speed: 10 * sm, life: 70, h: 50, dmg: 12, hit: false });
            if (Math.abs(hero.x - this.x) < 230) hero.takeHit(10, this.x, 'blast');
          }
          if (t > 60) this.setState('idle');
          break;
        }
        case 'clawwave': // a crimson claw crescent that flies at you
          this.vx = 0; this.telegraph = t < 16;
          if (t === 16) { game.slashes.push({ x: this.x + this.face * 90, y: this.y - 110, dir: this.face, life: 50, hit: false, color: 0xb91c1c, enemy: true, dmg: 14, scale: 1.2 }); sfx.slash(); }
          if (t > 36) this.setState('idle');
          break;
        case 'floored': {
          const e = 1 - (1 - Math.min(1, t / 14)) ** 2;
          this.y = lerp(this.yFrom, GROUND, e); this.tilt = 0;
          this.fallen = Math.max(this.fallen, e); this.vx *= 0.88;
          if (t > 80) this.setState('rising');
          break;
        }
        case 'rising':
          this.vx = 0; this.fallen = Math.max(0, 1 - t / 20);
          if (t > 22) this.setState(Math.random() < 0.5 ? 'roar' : 'idle');
          break;
      }
      this.driveLp();
    }
    driveLp() {
      const s = this.state, tg = {};
      switch (s) {
        case 'approach': case 'retreat': tg.speed = 0.75; break;
        case 'dash': if (Math.abs(this.vx) > 3) { tg.speed = 1.4; tg.jaw = 0.8; } else tg.crouch = 0.8; break;
        case 'claw': tg.swipe = this.telegraph ? 0.4 : 1; tg.jaw = 0.6; tg.crouch = 0.2; break;
        case 'pounce': if (this.onGround) tg.crouch = 1; else { tg.leap = 1; tg.jaw = 1; tg.swipe = 0.6; } break;
        case 'roar': case 'intro': tg.rear = this.telegraph || s === 'intro' ? 0.8 : 0.3; tg.jaw = 1; tg.pitch = -0.3; break;
        case 'clawwave': tg.swipe = 1; tg.rear = 0.3; tg.jaw = 0.7; break;
        case 'stagger': case 'shocked': case 'shove': tg.rear = 0.25; tg.jaw = 0.6; break;
        case 'gloat': tg.rear = 0.6; tg.jaw = 1; break;
        case 'recover': tg.crouch = 0.3; break;
      }
      tg.fallen = this.fallen;
      this.lp.step += Math.abs(this.vx) * 0.035;
      stepLionPose(this.lp, tg, 0.3);
    }
  }
  // ---------------------------------------------------------------- shade imps (chapter 10)
  // Small winged imps, a few hits each. Only the two closest press in on Kane; the rest prowl at a distance waiting
  // their turn (front / slot are set by game.updateHorde). New ones drop out of the night sky. Dying is a quick pop.
  class Imp extends Boss {
    constructor(n) {
      super(WOLF);
      this.isImp = true; this.n = n; this.onField = false; this.front = true; this.slot = 0; this.modelIdx = 0;
    }
    get hurtbox() { // reaches up past the horns and wings, so Kane's punches (thrown at head height) still connect
      const hb = super.hurtbox;
      if (!hb || this.tilt > 0.8) return hb;
      return { x: hb.x, y: this.y - 185, w: hb.w, h: 185 };
    }
    think(hero) {
      if (!this.front) { this.face = Math.sign(hero.x - this.x) || this.face; this.setState('lurk'); this.wait = Math.round(rand(40, 80)); return; }
      super.think(hero);
    }
    update(hero) {
      super.update(hero);
      if (!this.alive) return;
      if (this.state === 'drop' && this.onGround) { // landed on the roof
        burst(this.x, GROUND, 14, '#4ade80', 5, 4, 0.3, 20); sfx.clank();
        if (Math.random() < 0.5) popText(this.x, this.y - 160, 'HEE HEE!', '#86efac', 18);
        this.setState('idle'); this.t = 999;
      }
      if (this.state === 'lurk') { // keep a distance, sidle back and forth, cackle
        const want = clamp(hero.x - this.face * (250 + this.slot * 80), ARENA_L + 40, ARENA_R - 40), d = want - this.x;
        this.face = Math.sign(hero.x - this.x) || this.face;
        this.vx = Math.abs(d) > 12 ? Math.sign(d) * this.L.speed * 0.8 : this.vx * 0.8; this.step += 0.18;
        if (this.t > this.wait) { this.vx = 0; this.setState('idle'); }
      }
      if (this.state === 'flinch') { this.vx *= 0.85; if (this.t > 14) this.setState('idle'); }
      if (this.state === 'shove') this.setState('idle'); // too small for the big monsters' anti-mash burst
    }
    takeHit(dmg, poise, kb, hx, hy) {
      if (!this.alive) return;
      this.hp = Math.max(0, this.hp - dmg); this.flashT = 6;
      popText(hx, hy - 20, `${dmg}`, dmg >= 30 ? '#fde047' : '#ffffff', dmg >= 30 ? 34 : 24);
      burst(hx, hy, 8, '#4ade80', 6, 4); shakeIt(dmg >= 30 ? 8 : 3);
      if (this.hp <= 0) { this.die(Math.sign(kb) || -this.face); return; }
      if (!LYING.includes(this.state) && this.state !== 'shocked') { this.setState('flinch'); this.vx = kb * 0.9; }
    }
    die(dir = 1) { // knocked flying, then a puff of green fire
      this.alive = false; this.deathT = 0; this.state = 'dying'; this.telegraph = false;
      this.vx = dir * 9; this.vy = -8; this.onGround = false;
      sfx.heavy(); popText(this.x, this.y - 170 * this.k, 'POP!', '#86efac', 26);
      game.onImpDown(this);
    }
    updateDeath() {
      this.deathT++;
      this.vy += 0.8; this.x += this.vx; this.y += this.vy; this.vx *= 0.96;
      if (this.y >= GROUND) { this.y = GROUND; this.vy = 0; }
      this.x = clamp(this.x, ARENA_L, ARENA_R);
      this.tilt = Math.min(Math.PI / 2, this.tilt + 0.12);
      if (this.deathT === 16) {
        const cy = this.y - 60 * this.k;
        game.explosions.push({ x: this.x, y: cy, r: 70, t: 0, harmless: true });
        burst(this.x, cy, 40, '#4ade80', 10, 6, 0.2, 30); burst(this.x, cy, 20, '#111827', 8, 8, 0.3, 36);
        sfx.boom(); shakeIt(8);
        this.deathT = 200; // gone
      }
    }
  }
  const makeBoss = (i) => (i === WOLF ? new Imp(0) : i === SHADOW ? new ShadowKnight(i) : i === NOX ? new Nox(i) : i === KAIJU || i === KAIJU_GIANT ? new Kaiju(i) : i === SPIRIT ? new LionBoss(i)
    : i === PHOENIX ? new LegionZord(LEGION[0]) : LEGION.includes(i) ? new LegionZord(i) : new Boss(i));

  // ---------------------------------------------------------------- hero autopilot (attract / testing)
  function autopilot(h, b) {
    const c = {};
    if (!b || !b.alive || h.state === 'dead') return c;
    const dx = b.x - h.x, dist = Math.abs(dx);
    const threatened = b.telegraph && dist < b.reach + 120 && ['punch', 'shove', 'slash', 'dashslash', 'palm'].includes(b.state);
    const wave = game.waves.find((w) => Math.abs(w.x - h.x) < 120 && Math.sign(h.x - w.x) === w.dir);
    const grenade = game.grenades.find((g) => !g.reflected && Math.abs(g.x - h.x) < 120);
    if (h.mount && h.energy >= 100) { c.transform = true; return c; }
    if (h.style === 'phoenix' && h.energy >= 100 && !LYING.includes(b.state)) { c.splash = true; return c; }
    if (game.canSummon('dragon') && game.fightT > 500) { c.summonDragon = true; return c; }
    if (game.canSummon('lion') && game.fightT > 700) { c.summonLion = true; return c; }
    if (h.energy >= 100 && !LYING.includes(b.state) && !h.mount) {
      if (dist < b.reach + 30 && b.onGround) c.slam = true; else if (dist > 380) c.kame = true; else c.hulk = true;
      return c;
    }
    if (b.state === 'laser') { c.block = true; return c; }
    if (wave) { c.jump = true; return c; }
    if (b.state === 'dash' && b.t > 10 && dist < 260) { c.dodge = true; c[dx > 0 ? 'right' : 'left'] = true; return c; }
    if (threatened) { c.block = true; return c; }
    if (grenade && grenade.landed) { c[grenade.x > h.x ? 'left' : 'right'] = true; return c; }
    const key = game.keys.find((k) => k.landed);
    if (key && Math.abs(key.x - h.x) > 20) { c[key.x > h.x ? 'right' : 'left'] = true; return c; }
    if (dist > b.reach - 10) { c[dx > 0 ? 'right' : 'left'] = true; return c; }
    if (b.state === 'down') { c.kick = game.time % 8 === 0; return c; }
    if (game.time % 40 < 20) c.punch = game.time % 6 === 0; else c.kick = game.time % 18 === 0;
    return c;
  }

  function keyboard() {
    return {
      left: isDown('KeyA', 'ArrowLeft'), right: isDown('KeyD', 'ArrowRight'),
      jump: wasPressed('KeyW', 'ArrowUp', 'Space'),
      punch: wasPressed('KeyJ'), kick: wasPressed('KeyK'),
      block: isDown('KeyS', 'ArrowDown'),
      oneshot: wasPressed('KeyL'),
      dodge: wasPressed('ShiftLeft', 'ShiftRight'),
      slam: wasPressed('KeyU'), kame: wasPressed('KeyI'), hulk: wasPressed('KeyO'),
      armor1: wasPressed('Digit1', 'Numpad1'), armor2: wasPressed('Digit2', 'Numpad2'), armor3: wasPressed('Digit3', 'Numpad3'),
      summonDragon: wasPressed('KeyR'), summonLion: wasPressed('KeyT'), transform: wasPressed('KeyT'), splash: wasPressed('KeyF'),
    };
  }

  // ---------------------------------------------------------------- level 4 finale: the giant dragon's flight
  // World-space position of the dragon's head. d = { t, phase: 'fly' | 'form', bossX, kaneX } (sim x).
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function dragonHead(d) {
    const bx = X(d.bossX), kx = X(d.kaneX), t = d.t;
    if (d.phase === 'assist') { // summoned mid-fight: dive in, skim low over the monster breathing fire, climb away
      const dir = d.dir, from = [bx - dir * 2600, 1200, -1600], low0 = [bx - dir * 520, 460, 160], low1 = [bx + dir * 420, 420, 120], to = [bx + dir * 2600, 1400, -1800];
      if (t < 45) return lerp3(from, low0, ease(t / 45));
      if (t < 95) return lerp3(low0, low1, (t - 45) / 50);
      return lerp3(low1, to, ease(Math.min(1, (t - 95) / 50)));
    }
    const circle = (tt) => { const a = Math.PI + (tt - 50) / 60 * TAU * 0.9; return [bx + Math.cos(a) * 430, 430 + Math.sin(tt * 0.1) * 40, Math.sin(a) * 300]; };
    if (d.phase === 'fly') {
      if (t < 50) return lerp3([-2200, 1600, -1400], circle(50), ease(t / 50));
      if (t < 110) return circle(t);
      return lerp3(circle(110), [kx, 620, 160], ease(Math.min(1, (t - 110) / 40)));
    }
    const p = Math.min(1, t / 60), a = t * 0.28, r = 440 * (1 - p); // spiral into the megazord's spot
    return [kx + Math.cos(a) * r, 140 + 480 * (1 - p), Math.sin(a) * r];
  }
  // which arena is showing: second rounds have their own
  function arenaIndex() { return game.sky ? 6 : game.giant ? 5 : levelArena(game.level); }
  const ZORD_HP = { dragon: 320, dragonlion: 400, phoenix: 520 };
  const ZORD_NAMES = { dragonlion: 'DRAGON LION MEGAZORD', phoenix: 'PHOENIX MEGAZORD' };
  function makeZordHero(x, style = 'dragon') {
    const z = new Hero();
    z.zord = true; z.rage = true; z.revived = true; z.style = style;
    z.maxHp = z.hp = z.trail = ZORD_HP[style]; z.x = x; z.face = 1; z.state = 'victory'; z.pose = { ...POSES.flex };
    return z;
  }
  // the black lion with Kane on its back (chapter 7, round 2); Kane himself rides along as a posed-only hero
  function makeRideLion(x, kane) {
    const l = new Hero();
    l.mount = 'lion'; l.revived = true; l.lp = newLionPose();
    l.maxHp = l.hp = l.trail = 260; l.x = x; l.face = 1;
    const r = new Hero();
    r.rage = kane.rage; r.beast = kane.beast; r.revived = true; r.state = 'ride'; r.pose = { ...POSES.ride };
    return [l, r];
  }

  // ---------------------------------------------------------------- story
  // Who can speak, and the colour of their name tag. 'boss' is whichever monster this level has.
  const CAST = {
    kane: { name: 'KANE', color: '#fde68a' },
    elder: { name: 'ELDER SHIN', color: '#fcd34d' },
    nox: { name: 'EMPEROR NOX', color: '#c084fc' },
    boss: { name: null, color: '#f87171' },
    shadow: { name: 'SHADOW KNIGHT', color: '#ef4444' },
    vorath: { name: 'VORATH', color: '#4ade80' },
    lion: { name: 'BLACK LION', color: '#d4a017' },
    wolf: { name: 'WHITE WOLF', color: '#bfdbfe' },
  };
  const HOLO_CAST = ['elder', 'nox', 'vorath']; // speakers shown as holograms at the back of the arena
  // One chapter per level: dialogue before the fight, and after the win. [speaker, line]
  const STORY = [
    {
      title: 'THE ROOFTOP',
      intro: [
        ['elder', 'Kane... the machines have come to your city, just as I foresaw.'],
        ['kane', 'Who said that? Show yourself!'],
        ['elder', 'I am Shin, last guardian of the Dragon Order. I give you the Dragon Key. When your spirit burns hottest, it will answer.'],
        ['nox', 'A dusty old ghost and a street brawler. How touching.'],
        ['nox', 'I am Emperor Nox. This city is my forge, and its people will be my fuel. Sentinel - scrap him.'],
        ['boss', 'TARGET ACQUIRED. COMMENCING TERMINATION.'],
        ['kane', 'Come on then, tin can.'],
      ],
      outro: [
        ['nox', 'A rusty prototype. Enjoy your little victory while it lasts.'],
        ['elder', 'Nox has many more. His foundry lies to the east - that is where he builds them.'],
        ['kane', 'Then that is where I am going.'],
      ],
    },
    {
      title: 'THE FOUNDRY',
      intro: [
        ['kane', 'So this is where you make them.'],
        ['boss', 'IRON WARLORD ONLINE. INTRUDER WILL BE MELTED DOWN FOR PARTS.'],
        ['elder', 'Its grenades can be struck back, Kane. Turn its weapons against it.'],
        ['kane', 'Batting practice. Got it.'],
      ],
      outro: [
        ['nox', 'You break my toys, I build bigger ones. The reactor core awaits you, little hero.'],
        ['elder', 'The keys that fall in battle carry the elements of the old Order - fire, water, thunder. Seize them.'],
      ],
    },
    {
      title: 'THE REACTOR',
      intro: [
        ['nox', 'Welcome to the heart of my empire. Meet my masterpiece.'],
        ['boss', 'OMEGA TITAN. ALL LIFE IN THIS SECTOR WILL BE ERASED.'],
        ['elder', 'Its death laser cannot pierce a true guard. Hold firm, or roll through the light.'],
        ['kane', 'Masterpiece? It will make a nice paperweight.'],
      ],
      outro: [
        ['nox', 'ENOUGH! If machines cannot stop you... something older will.'],
        ['elder', 'He means to open the Abyss. Kane - the city!'],
      ],
    },
    {
      title: 'NIGHT OF THE ABYSS',
      intro: [
        ['kane', 'The whole city is dark... what is that thing?'],
        ['boss', 'I AM THE ABYSS KING. TEN THOUSAND YEARS I HAVE WAITED FOR THIS NIGHT.'],
        ['nox', 'My oldest ally. Crush him, my king, and the city is ours.'],
        ['elder', 'Do not falter, Kane. Even the Abyss can be cut.'],
      ],
      outro: [
        ['elder', 'The Dragon answered you... After a thousand years, the Order lives again.'],
        ['nox', 'Impossible! ...But every light casts a shadow, Kane. Even yours.'],
        ['kane', 'What is that supposed to mean?'],
        ['elder', 'Come to the old temple in the mountains. You will need to see this for yourself.'],
      ],
    },
    {
      title: 'THE SHADOW WITHIN',
      intro: [
        ['elder', 'This is the Temple of the Dragon Order. Something stirs inside... something wearing your face.'],
        ['boss', 'I am everything you buried, Kane. Every doubt. Every fear.'],
        ['kane', 'You are wearing my armor.'],
        ['boss', 'No. YOU are wearing MINE.'],
        ['nox', 'My finest creation. Your own shadow, given a blade.'],
        ['elder', 'When your blades meet, push with all your heart! Mash it, Kane!'],
      ],
      outro: [
        ['shadow', '...You won. So the light was stronger after all.'],
        ['elder', 'Your shadow is a part of you, Kane. Now it is at peace.'],
        ['nox', 'NO! My monsters... my shadow... This is not over! I will come for you MYSELF!'],
        ['kane', 'I will be waiting. Bring an army.'],
        ['elder', 'Rest now, champion. The city sleeps safely tonight... for now.'],
      ],
    },
    {
      title: 'THE VOID THRONE',
      intro: [
        ['elder', 'This is it, Kane. The Void Throne, beyond the edge of the world.'],
        ['nox', 'So the street brawler finally comes to my door. Do you even know what I am?'],
        ['kane', 'A coward who sends monsters to do his work.'],
        ['nox', 'I am the emptiness between the stars. And tonight... I fight you MYSELF.'],
        ['elder', 'His magic is strong, but his body is not. Slash his orbs apart, break through his barrier, and strike!'],
        ['kane', "Let's end this."],
      ],
      outro: [
        ['nox', 'No... NO! The void... cannot... be...'],
        ['shadow', 'It is over, Kane. The darkness is gone. And so... am I.'],
        ['kane', 'Thank you. For standing with me at the end.'],
        ['elder', 'You have done what no guardian could in ten thousand years. The Dragon Order is reborn - in you.'],
        ['kane', 'Then the city has a protector. Always.'],
      ],
    },
    {
      title: 'KING OF MONSTERS',
      intro: [
        ['elder', 'Kane... wake up. The sea itself is boiling.'],
        ['kane', 'Nox is gone. What could possibly be left?'],
        ['elder', 'Something older than Nox. Older than the Order. His fall woke it from the deep.'],
        ['boss', 'GRRRRROOOOOOAAAAAAR!'],
        ['kane', '...That is the biggest thing I have ever seen.'],
        ['elder', 'The Behemoth. The King of Monsters. You cannot face it alone, Kane. Fight - and the old blood will answer.'],
        ['kane', 'Alone is all I know. Here goes nothing.'],
      ],
      outro: [
        ['kane', 'We did it... partner.'],
        ['lion', 'RRRRROOOOOAAAAR!'],
        ['elder', 'The Black Lion of the Order has chosen you. The Dragon and the Lion both answer your call now.'],
        ['elder', 'In any battle, raise your fist: R calls the Dragon, T calls the Lion.'],
        ['kane', 'The city has two guardians now. Three, counting me.'],
      ],
    },
    {
      title: 'THE STOLEN SPIRIT',
      intro: [
        ['kane', 'Quiet night. Even the lion is resting... I can feel it, right here.'],
        ['vorath', 'How touching. A man... and the beast that lives in his soul.'],
        ['kane', 'Who said that? Show yourself!'],
        ['vorath', 'I am Vorath, the Soul Reaver. I feed on spirits - and yours burns so very bright.'],
        ['elder', 'Kane, get away from it! That creature devours souls!'],
        ['vorath', 'Too late, old ghost. Your beast... is MINE.'],
      ],
      outro: [
        ['kane', 'Welcome back, partner. Nobody takes you from me.'],
        ['lion', 'Rrrrrr...'],
        ['vorath', 'Enjoy your little reunion, Dragon Knight. I have tasted your soul now.'],
        ['vorath', 'Next time... I take ALL of it.'],
        ['elder', 'He will return, Kane. But tonight, the Lion is home.'],
        ['kane', 'Let him come. We will be ready.'],
      ],
    },
    {
      title: 'RISE OF THE PHOENIX',
      intro: [
        ['kane', 'That noise... explosions. The whole city is shaking!'],
        ['elder', 'Kane! Four giant machines are tearing the city apart, block by block!'],
        ['vorath', 'Do you like my legion, Dragon Knight? Ravager. Venomax. Frostfang. Voltrix.'],
        ['vorath', 'Built from the scrap of every monster you ever broke. Four of them... and only one of you.'],
        ['kane', "Then I'd better start with the biggest. Dragon - I need you!"],
      ],
      outro: [
        ['vorath', 'My legion... burned to slag. What IS that bird?!'],
        ['elder', 'The Phoenix. The third guardian of the Order, lost for ten thousand years. It chose you, Kane.'],
        ['vorath', 'Burn all you like. Spirits do not die... and neither do I.'],
        ['kane', 'Dragon, Lion, and Phoenix. Run while you can, Vorath.'],
      ],
    },
    {
      title: 'THE WHITE WOLF',
      intro: [
        ['kane', 'Back where it all started. Same rooftop... but I have never seen the moon this big.'],
        ['vorath', 'Your guardians are too strong for my legion, Dragon Knight. So I will bury you in numbers instead.'],
        ['vorath', 'Shade Imps. Ten of them, born from the souls I have eaten. Tear him to pieces!'],
        ['boss', 'HEE HEE HEE! KILL THE KNIGHT! KILL HIM!'],
        ['elder', 'They are weak alone, Kane, but they never stop coming. Keep moving... and look to the moon.'],
        ['kane', 'Ten little monsters? I fought a king of monsters. Bring them on.'],
      ],
      outro: [
        ['kane', 'That was incredible... Who are you?'],
        ['wolf', 'AWOOOOOOOOO!'],
        ['elder', 'The White Wolf of the moon. The old Order said it answers only a warrior who never gives up.'],
        ['vorath', 'A dragon, a lion, a phoenix... and now a WOLF?! This is not over, Dragon Knight!'],
        ['kane', 'Run, Vorath. The pack is hunting now.'],
      ],
    },
  ];

  // ---------------------------------------------------------------- game
  const game = {
    mode: 'title', time: 0, level: 0, menuIdx: 0, modeT: 0,
    unlocked: store.get('steelbreaker.unlocked', 1),
    hero: null, boss: null, grenades: [], waves: [], explosions: [], rings: [], cracks: [], beam: null, ambient: [], fightT: 0,
    keys: [], slashes: [], bolts: [], keyTimer: 0, tornado: null, storm: 0, orbs: [],
    display: null, champion: null,

    start(level, skipStory = false) {
      this.level = level; this.hero = new Hero(); this.boss = makeBoss(level);
      this.grenades = []; this.waves = []; this.explosions = []; this.rings = []; this.cracks = []; this.beam = null;
      this.keys = []; this.slashes = []; this.bolts = []; this.keyTimer = DEBUG_KEY ? 10 : 360; this.tornado = null; this.storm = 0;
      this.orbs = []; this.ally = null; this.dragon2 = null;
      this.sky = false; this.clash = null; this.clashCd = 0; this.strikes = []; this.strikeTimer = 240; this.darkTornado = null;
      this.giant = false; this.saga = null; this.dragon = null; this.sagaBeam = -1; this.zordHero = null;
      // chapter 7 rounds (1 on foot, 2 riding the lion, 3 the lion megazord), summons, and the chapter 8 cutscene ghost
      this.round = 1; this.ride = false; this.rider = null; this.sagaLion = null; this.pending = null; this.vorathA = 0;
      this.assist = null; this.summonUsed = { dragon: false, lion: false };
      if (level === KAIJU) this.boss.floorHp = Math.round(this.boss.maxHp * 0.8);
      this.legion = null; this.legionIdx = 0; this.eagle = null;
      if (level === PHOENIX) this.setupLegion();
      this.horde = null; this.wolfSpirit = null; this.phantom = null; this.lionGhost = null; this.fireBird = null;
      if (level === WOLF) this.setupHorde();
      if (DEBUG_KNIGHT) { this.hero.rage = true; this.hero.revived = true; }
      if (DEBUG_WOLF && level === WOLF) { this.hero.beast = 'wolf'; this.hero.revived = true; }
      if (BEASTS[DEBUG_ARMOR]) { this.hero.beast = DEBUG_ARMOR; this.hero.revived = true; }
      particles.length = 0; texts.length = 0; this.ambient = [];
      this.mode = 'intro'; this.modeT = 0; this.fightT = 0;
      if (!skipStory && !NO_STORY && STORY[level]) {
        if (level === SPIRIT) this.boss.hidden = true; // still inside Kane, until vorath tears it out
        this.startStory(STORY[level].intro, 'intro');
      } else if (level === PHOENIX) this.startLegionSaga();
    },
    onBossDown() {
      if (this.level === ABYSS && !this.giant) { this.startFinisher('saga'); return; }
      if (this.level === SHADOW && !this.sky) { this.startFinisher('shadowsaga'); return; }
      if (this.level === NOX && !this.giant) { this.startFinisher('noxsaga'); return; }
      if (this.level === SPIRIT) { this.startFinisher('spirit'); return; }
      if (this.level === PHOENIX) { this.startLegionDown(); return; }
      this.startFinisher('won');
    },
    // ---- chapter 10: the shade imp horde. game.boss is always the imp closest to Kane (the one he faces, the
    // camera frames, the finisher hits); every swing and slash checks the whole horde through foes().
    setupHorde() {
      this.horde = Array.from({ length: HORDE_SIZE }, (_, i) => new Imp(i));
      this.hordeSpawned = 0; this.hordeKills = 0; this.spawnT = 120;
      for (const x of [900, 1080, 740]) this.spawnImp(x);
      this.boss = this.horde[0];
      for (const m of this.horde.slice(1)) m.state = 'idle';
    },
    spawnImp(x) {
      const m = this.horde[this.hordeSpawned++], h = this.hero;
      const used = this.horde.filter((o) => o.onField).map((o) => o.modelIdx);
      m.modelIdx = [0, 1, 2, 3, 4, 5, 6, 7].find((i) => !used.includes(i));
      m.onField = true;
      if (x !== undefined) { m.x = x; return; } // already on the roof when the chapter opens
      const side = h.x < W / 2 ? 1 : h.x > W / 2 ? -1 : Math.random() < 0.5 ? -1 : 1;
      m.x = clamp(h.x + side * rand(300, 520), ARENA_L + 60, ARENA_R - 60); m.face = -side;
      m.y = GROUND - 620; m.onGround = false; m.vy = 0; m.state = 'drop'; m.t = 0;
      popText(m.x, 150, 'ANOTHER ONE!', '#86efac', 22);
    },
    foes() {
      if (this.horde) return this.horde.filter((m) => m.alive && m.onField);
      const b = this.boss;
      return b && b.alive ? [b] : [];
    },
    onImpDown(m) {
      this.hordeKills++;
      const left = HORDE_SIZE - this.hordeKills;
      if (left > 0) popText(m.x, m.y - 230 * m.k, `${left} LEFT`, '#bbf7d0', 22);
      else { m.vx = 0; m.vy = 0; m.y = GROUND; m.onGround = true; this.boss = m; this.onBossDown(); } // the last one takes the finishing blow
    },
    updateHorde(h) {
      const field = this.horde.filter((m) => m.onField && m.alive);
      if (this.mode === 'fight' && this.hordeSpawned < HORDE_SIZE && field.length < HORDE_ON_FIELD && h.state !== 'wolfup' && --this.spawnT <= 0) {
        this.spawnImp(); this.spawnT = Math.round(rand(50, 90));
      }
      for (const m of this.horde) if (m.onField && !m.alive && m.deathT >= 200) m.onField = false; // the puff is gone
      field.sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x));
      field.forEach((m, i) => { m.front = i < 2; m.slot = i - 2; });
      if (field.length) this.boss = field[0];
      // imps don't stand inside each other
      for (const a of field) for (const b of field) {
        if (a === b || LYING.includes(a.state) || LYING.includes(b.state)) continue;
        const d = a.x - b.x;
        if (Math.abs(d) < 50) { a.x = clamp(a.x + (Math.sign(d) || 1) * 1.5, ARENA_L + 30, ARENA_R - 30); }
      }
    },
    // shared tail of every cutscene frame: bolts, rings, particles, ambience
    sagaTail() {
      for (const bolt of this.bolts) bolt.life--;
      this.bolts = this.bolts.filter((bolt) => bolt.life > 0);
      for (const e of this.explosions) e.t++;
      this.explosions = this.explosions.filter((e) => e.t < (e.dur || 28));
      for (const r of this.rings) { r.r += 18; r.life--; }
      this.rings = this.rings.filter((r) => r.life > 0);
      this.updateLegionBg();
      this.updateParticles();
      this.updateAmbient(arenaIndex());
    },
    // a cutscene's lion (not a fighter): leaps under gravity, eases its pose toward `tg`
    stepSagaLion(L, tg) {
      if (!L.onGround) L.vy += 1;
      L.x += L.vx; L.y += L.vy;
      if (L.y >= GROUND) { L.y = GROUND; L.vy = 0; if (!L.onGround) { L.onGround = true; L.vx = 0; } }
      L.lp.step += Math.abs(L.vx) * 0.035;
      stepLionPose(L.lp, tg, 0.25);
    },

    // ---- chapter 7: the behemoth can't be hurt past its floor. When Kane hits it (or falls, or time runs out)
    // its breath flattens him; press T and the black lion answers, mauls it, and Kane rides into round two.
    onKaijuWall() {
      if (this.round === 1) this.pending = 'lion';
      else if (this.round === 2) popText(this.boss.x, GROUND - 540, 'TOO TOUGH! FILL ENERGY AND PRESS T!', '#fde68a', 28);
    },
    startLionSaga() {
      this.pending = null;
      this.mode = 'saga'; this.modeT = 0; this.saga = { kind: 'lion', stage: 'breath', t: 0 };
      this.beam = null; this.tornado = null; this.storm = 0; this.slashes = []; this.keys = []; this.waves = []; this.grenades = []; this.strikes = []; this.assist = null;
      const h = this.hero, b = this.boss;
      if (h.state === 'wolfup') { h.beast = 'wolf'; h.energy = 100; this.wolfSpirit = null; }
      h.special = null; h.spin = 0; h.orb = 0; h.hulk = 0; h.vx = 0; h.vy = 0; h.y = GROUND; h.onGround = true;
      if (h.state !== 'dead') { h.setState('idle'); h.face = Math.sign(b.x - h.x) || 1; }
      b.setState('idle'); b.vx = 0; b.telegraph = false; b.spin = 0; b.face = Math.sign(h.x - b.x) || -1;
    },
    updateLionSaga() {
      const s = this.saga, h = this.hero, b = this.boss, t = ++s.t, L = this.sagaLion;
      switch (s.stage) {
        case 'breath': // its plates light up, and the breath lands square on Kane
          b.charge = Math.min(1, t / 50); b.telegraph = t < 50;
          if (t === 1) { sfx.charge(); popText(b.x, b.y - 210 * b.k, 'ITS HIDE IS TOO THICK...', '#93c5fd', 30); }
          if (t % 3 === 0 && t < 50) burst(b.x - b.face * rand(20, 60) * b.k, b.y - rand(60, 170) * b.k, 2, '#7dd3fc', 2, 5, -0.1, 16);
          if (t === 50) {
            sfx.kame(); sfx.boom(); flash = 16; shakeIt(30);
            if (h.state !== 'dead') { h.hp = 0; h.trail = 0; h.setState('dead'); h.deathT = 0; }
            popText(h.x, h.y - 160, 'ATOMIC BREATH!', '#7dd3fc', 40);
            burst(h.x, h.y - 30, 60, '#bae6fd', 12, 5, 0.2, 40);
          }
          this.sagaBeam = t >= 50 && t < 82 ? t - 50 : -1;
          if (h.state === 'dead') h.deathT++; else h.animate();
          if (t >= 110) { this.sagaStage('down'); b.charge = 0; b.telegraph = false; }
          break;
        case 'down': // waiting on the player
          h.deathT++;
          if ((t > 30 && wasPressed('KeyT', 'Enter', 'Space')) || (AUTOPLAY && t > 90)) { this.sagaStage('summon'); h.setState('summon'); sfx.charge(); }
          break;
        case 'summon': // up on one knee, then a fist to the sky
          h.t++; h.animate();
          h.hp = Math.min(h.maxHp, h.hp + 4); h.trail = h.hp;
          if (t === 5) popText(h.x, h.y - 120, 'NOT... YET!', '#ffffff', 34);
          if (t === 40) { popText(h.x, h.y - 170, 'COME FORTH, BLACK LION!', '#fde68a', 40); this.bolts.push({ x: h.x, y: h.y - 80, life: 16, color: 0xd4a017 }); flash = 10; shakeIt(12); sfx.zap(); sfx.roar(); }
          if (t >= 64) { this.sagaStage('lion'); this.sagaLion = { x: ARENA_L - 260, y: GROUND, vx: 0, vy: 0, face: 1, lp: newLionPose(), scale: 2, fade: 1, onGround: true }; sfx.roar(); }
          break;
        case 'lion': { // it bounds in, leaps on the behemoth, rakes it, bounds back to Kane's side and roars
          const tg = {};
          h.animate();
          if (t === 1) popText(380, 150, 'THE BLACK LION ANSWERS!', '#fde68a', 38);
          if (t < 40) { L.vx = 17; tg.speed = 1.3; tg.jaw = 0.4; if (t % 4 === 0) burst(L.x - 90, GROUND, 3, '#a8a29e', 3, 5, 0.2, 20); }
          if (t === 40) { L.vy = -22; L.onGround = false; L.vx = (b.x - b.halfW - 80 - L.x) / 44; sfx.roar(); sfx.whoosh(); }
          if (t > 40 && t < 84) { tg.leap = 1; tg.jaw = 1; tg.swipe = 0.6; }
          if (t === 84) { L.vx = 0; flash = 8; shakeIt(22); sfx.heavy(); sfx.boom(); popText(b.x, b.y - 230 * b.k, 'MAULED!', '#fde68a', 40); }
          if (t >= 84 && t < 120) {
            tg.swipe = t % 12 < 6 ? 1 : 0.3; tg.jaw = 0.8; tg.rear = 0.3;
            b.armRot = Math.sin(t * 0.5) * 0.8; b.flashT = t % 12 === 4 ? 4 : b.flashT - 1;
            if (t % 12 === 4) { b.hp = Math.max(b.hp - 30, Math.round(b.maxHp * 0.7)); b.trail = Math.max(b.trail, b.hp); sfx.punch(); burst(b.x - b.face * 30 * b.k, b.y - 140 * b.k, 16, '#fde68a', 8, 5, 0.2, 20); popText(b.x + rand(-40, 40), b.y - 180 * b.k, '30', '#fde68a', 26); }
          }
          if (t === 120) { L.vy = -16; L.onGround = false; L.vx = (h.x + 190 - L.x) / 32; sfx.whoosh(); }
          if (t > 120 && t < 152) tg.leap = 0.6;
          if (t >= 160) { tg.rear = 0.85; tg.jaw = 1; tg.pitch = -0.3; }
          if (t === 166) { sfx.roar(); shakeIt(20); popText(L.x, GROUND - 380, 'ROOOOAAAAR!', '#fde68a', 40); this.rings.push({ x: L.x + 120, y: GROUND - 200, r: 20, life: 26, color: '253,230,138' }, { x: L.x, y: GROUND, r: 10, life: 30, color: '212,160,23' }); }
          if (t > 166 && t < 190) b.x = Math.min(ARENA_R - 60, b.x + 2.5);
          this.stepSagaLion(L, tg);
          if (t >= 205) { this.sagaStage('mount'); s.from = h.x; h.setState('jump'); sfx.jump(); }
          break;
        }
        case 'mount': { // Kane leaps onto its back
          const p = Math.min(1, t / 24), seat = L.x - 5;
          h.x = lerp(s.from, seat, ease(p)); h.y = GROUND - (Math.sin(p * Math.PI) * 160 + p * 100);
          if (t === 24) { h.state = 'ride'; h.face = 1; shakeIt(6); sfx.heavy(); }
          h.animate();
          this.stepSagaLion(L, { crouch: t > 20 && t < 34 ? 0.5 : 0 });
          if (t === 30) popText(L.x, GROUND - 440, 'KANE RIDES THE BLACK LION!', '#fde047', 38);
          if (t >= 70) this.beginRide();
          break;
        }
      }
      this.sagaTail();
    },
    beginRide() {
      const kane = this.hero, L = this.sagaLion;
      const [l, r] = makeRideLion(L ? L.x : 360, kane);
      if (L) l.lp = L.lp;
      this.hero = l; this.rider = r; this.ride = true; this.round = 2; this.sagaLion = null; this.sagaBeam = -1;
      const b = this.boss;
      b.floorHp = Math.round(b.maxHp * 0.5); b.floorHit = false; b.setState('idle'); b.telegraph = false; b.charge = 0; b.face = -1;
      if (b.x < l.x + 360) b.x = Math.min(ARENA_R - 60, l.x + 420);
      this.mode = 'fight'; this.modeT = 0; this.fightT = ARMOR_AT + 1; this.keyTimer = 300; this.summonUsed = { dragon: true, lion: true };
      popText(l.x, GROUND - 400, 'RIDE!', '#fde047', 52); sfx.heavy(); sfx.roar();
    },
    // T at full energy while riding: the lion rears, Kane rises into it, and it becomes the lion megazord
    startLionZordSaga() {
      this.mode = 'saga'; this.modeT = 0; this.saga = { kind: 'lionzord', stage: 'rear', t: 0 };
      this.beam = null; this.tornado = null; this.storm = 0; this.slashes = []; this.keys = []; this.waves = []; this.grenades = []; this.strikes = [];
      const l = this.hero; l.vx = 0; l.vy = 0; l.y = GROUND; l.onGround = true; l.setState('idle');
      const b = this.boss; b.setState('idle'); b.vx = 0; b.telegraph = false; b.charge = 0;
      this.sagaLion = { x: l.x, y: GROUND, vx: 0, vy: 0, face: l.face, lp: l.lp, scale: 2, fade: 1, onGround: true };
    },
    updateLionZordSaga() {
      const s = this.saga, t = ++s.t, L = this.sagaLion, r = this.rider;
      switch (s.stage) {
        case 'rear': // it rears in a pillar of gold light, and Kane rises up out of the saddle into its heart
          this.stepSagaLion(L, { rear: 1, jaw: 1, pitch: -0.3 });
          if (r) { r.ridePose = 'raise'; r.animate(); }
          if (t === 6) { popText(L.x, GROUND - 440, 'BLACK LION — TRANSFORM!', '#fde68a', 42); sfx.chant(3); sfx.roar(); shakeIt(10); }
          if (t % 2 === 0 && t < 70) for (const dx of [-110, 110]) particles.push({ x: L.x + dx + rand(-10, 10), y: GROUND, z: rand(-60, 60), vx: 0, vy: -rand(9, 14), vz: 0, life: 30, max: 30, color: t % 4 ? '#fde68a' : '#ffffff', size: 8, g: 0 });
          if (t === 44) { burst(L.x, GROUND - 300, 30, '#ffffff', 6, 4, -0.2, 30); sfx.zap(); this.rider = null; }
          if (t === 70) { // cut wide: it stands as tall as the monster
            flash = 26; shakeIt(24); sfx.boom(); sfx.clank();
            this.giant = true; particles.length = 0; this.ambient = [];
            const old = this.boss, g = this.boss = new Kaiju(KAIJU_GIANT);
            g.hp = g.trail = Math.round(g.maxHp * clamp(old.hp / old.maxHp, 0.3, 1)); g.x = 930; g.face = -1; g.state = 'idle';
            const z = this.zordHero = makeZordHero(360); z.lion = true; z.build = 0;
            this.sagaLion = null; this.hero.gone = true; this.sagaStage('build');
          }
          break;
        case 'build': { // the robot assembles, spinning in
          const z = this.zordHero;
          z.build = clamp((t - 10) / 60, 0, 1); z.animate();
          if (t === 60) { flash = 18; shakeIt(18); sfx.boom(); sfx.clank(); }
          if (t === 80) { popText(z.x, GROUND - 420, 'LION MEGAZORD!', '#fde047', 52); sfx.slash(); sfx.roar(); }
          if (t >= 120) { z.build = undefined; this.beginZordFight(); }
          break;
        }
      }
      this.sagaTail();
    },
    beginLionZordRound() { // retry straight into the megazord round
      this.giant = true;
      const g = this.boss = new Kaiju(KAIJU_GIANT); g.x = 930; g.state = 'idle'; g.hp = g.trail = Math.round(g.maxHp * 0.6);
      const z = this.zordHero = makeZordHero(360); z.lion = true;
      this.beginZordFight();
    },

    // ---- chapter 8: vorath tears the lion spirit out of Kane and corrupts it; win, and it comes home
    startStealSaga() {
      this.mode = 'saga'; this.modeT = 0; this.saga = { kind: 'steal', stage: 'strike', t: 0 };
      const h = this.hero, b = this.boss;
      h.x = 360; h.face = 1; h.setState('idle');
      b.hidden = true; b.x = 900; b.face = -1; b.corrupt = 0; b.fade = 0; b.state = 'idle'; b.fallen = 0;
      this.vorathA = 0;
    },
    updateStealSaga() {
      const s = this.saga, h = this.hero, b = this.boss, t = ++s.t;
      switch (s.stage) {
        case 'strike': // vorath looms over the arena, and a green bolt rips into Kane
          this.vorathA = Math.min(1, this.vorathA + 0.04);
          if (h.state === 'dead') h.deathT++; else h.animate();
          if (t === 24) popText(640, 120, 'VORATH: Come out, little beast...', '#4ade80', 28);
          if (t === 60) {
            this.bolts.push({ x: h.x, y: h.y - 120, life: 18, color: 0x22c55e }); flash = 14; shakeIt(22); sfx.zap(); sfx.boom();
            h.setState('dead'); h.deathT = 0; burst(h.x, h.y - 120, 40, '#4ade80', 10, 5, 0.1, 30);
            popText(h.x, h.y - 230, 'AAARGH!', '#fde68a', 34);
          }
          if (t >= 100) { this.sagaStage('rip'); b.hidden = false; b.x = h.x + 40; b.fade = 0; sfx.roar(); }
          break;
        case 'rip': { // the lion spirit is torn out of his chest and dragged across the arena
          h.deathT++;
          const p = ease(Math.min(1, t / 70));
          b.x = lerp(h.x + 40, 900, p); b.y = GROUND - Math.sin(p * Math.PI) * 140; b.fade = Math.min(1, t / 30);
          stepLionPose(b.lp, { leap: 0.7, jaw: 0.6 }, 0.2);
          if (t % 2 === 0) {
            const sx = h.x + rand(-20, 20), sy = h.y - rand(20, 60), life = 22;
            particles.push({ x: sx, y: sy, z: rand(-30, 30), vx: (b.x - sx) / life, vy: (b.y - 120 - sy) / life, vz: 0, life, max: life, color: Math.random() < 0.5 ? '#fde68a' : '#d4a017', size: 7, g: 0 });
          }
          if (t === 10) popText(h.x + 160, GROUND - 320, 'THE LION SPIRIT IS TORN AWAY!', '#fde68a', 32);
          if (t >= 80) { b.y = GROUND; this.sagaStage('corrupt'); }
          break;
        }
        case 'corrupt': // vorath's power pours into it, black and green
          h.deathT++;
          b.corrupt = Math.min(1, t / 70);
          stepLionPose(b.lp, t < 60 ? { crouch: 0.6, jaw: 0.4, pitch: 0.3 } : { rear: 0.9, jaw: 1, pitch: -0.3 }, 0.12);
          if (t < 64 && t % 2 === 0) for (let i = 0; i < 3; i++) {
            const a = rand(0, TAU), r = rand(160, 280), life = 18;
            particles.push({ x: b.x + Math.cos(a) * r, y: b.y - 120 + Math.sin(a) * r, z: rand(-80, 80), vx: -Math.cos(a) * r / life, vy: -Math.sin(a) * r / life, vz: 0, life, max: life, color: i ? '#22c55e' : '#111111', size: 7, g: 0 });
          }
          if (t === 16) popText(b.x, GROUND - 340, 'VORATH: Now... destroy your master.', '#4ade80', 26);
          if (t === 64) { sfx.roar(); sfx.boom(); shakeIt(24); flash = 10; popText(b.x, GROUND - 300, 'CORRUPTED!', '#ef4444', 46); this.rings.push({ x: b.x, y: GROUND, r: 10, life: 30, color: '239,68,68' }); }
          if (t > 70) this.vorathA = Math.max(0, this.vorathA - 0.04);
          if (t >= 110) { this.sagaStage('rise'); h.setState('summon'); sfx.charge(); }
          break;
        case 'rise': // Kane gets back up
          h.t++; h.animate(); this.vorathA = Math.max(0, this.vorathA - 0.05);
          stepLionPose(b.lp, { crouch: 0.4, jaw: 0.3 }, 0.1);
          if (t === 24) popText(h.x, h.y - 250, "KANE: Hang on, partner. I'm bringing you home.", '#fde68a', 24);
          if (t >= 76) {
            h.setState('idle'); h.hp = h.trail = h.maxHp; this.vorathA = 0;
            b.state = 'intro'; b.t = 0; b.wait = 70;
            this.mode = 'intro'; this.modeT = 50;
          }
          break;
      }
      this.sagaTail();
    },
    startSpiritSaga() {
      this.mode = 'saga'; this.modeT = 0;
      const h = this.hero, b = this.boss;
      this.saga = { kind: 'spirit', stage: 'purify', t: 0, from: h.x };
      h.setState('idle'); h.vx = 0; h.face = Math.sign(b.x - h.x) || 1;
      b.fallen = 1; b.vx = 0; b.y = GROUND; b.tilt = 0;
    },
    updateSpiritSaga() {
      const s = this.saga, h = this.hero, b = this.boss, t = ++s.t;
      switch (s.stage) {
        case 'purify': { // Kane kneels at its side, and the corruption burns off it
          const goal = clamp(b.x - h.face * 230, ARENA_L, ARENA_R);
          if (t < 40) { h.x = lerp(s.from, goal, ease(t / 40)); h.state = 'walk'; h.walkPhase += 0.2; }
          else if (t === 40) h.setState('kneel');
          h.animate();
          b.corrupt = t < 40 ? 1 : Math.max(0, 1 - (t - 40) / 80);
          if (t > 40 && t % 2 === 0) {
            burst(b.x + rand(-100, 100), GROUND - rand(10, 90), 1, Math.random() < 0.5 ? '#111111' : '#22c55e', 2, 7, -0.25, 30);
            burst(b.x + rand(-100, 100), GROUND - rand(10, 90), 1, '#fde68a', 2, 4, -0.15, 24);
          }
          if (t === 60) { popText(b.x, GROUND - 260, 'THE CORRUPTION BURNS AWAY!', '#fde68a', 32); flash = 8; sfx.chant(2); }
          stepLionPose(b.lp, { fallen: 1 }, 0.2);
          if (t >= 130) this.sagaStage('rise');
          break;
        }
        case 'rise': // it stands, golden-eyed again
          h.animate();
          b.fallen = Math.max(0, 1 - t / 30);
          stepLionPose(b.lp, t < 50 ? { fallen: b.fallen } : { rear: 0.5, jaw: 0.9, pitch: -0.2 }, 0.15);
          if (t === 30) h.setState('idle');
          if (t === 50) { sfx.roar(); shakeIt(14); popText(b.x, GROUND - 330, 'THE BLACK LION REMEMBERS!', '#fde047', 36); this.rings.push({ x: b.x, y: GROUND, r: 10, life: 30, color: '253,224,71' }); }
          if (t >= 100) this.sagaStage('return');
          break;
        case 'return': // it dissolves into gold light and flows back into Kane
          h.animate();
          b.fade = Math.max(0, 1 - t / 60); b.x += (h.x - b.x) * 0.03;
          stepLionPose(b.lp, { speed: 0.4 }, 0.1); b.lp.step += 0.15;
          if (t < 60 && t % 2 === 0) for (let i = 0; i < 3; i++) {
            const sx = b.x + rand(-100, 100), sy = GROUND - rand(30, 200), life = 20;
            particles.push({ x: sx, y: sy, z: rand(-40, 40), vx: (h.x - sx) / life, vy: (h.y - 120 - sy) / life, vz: 0, life, max: life, color: i ? '#fde68a' : '#ffffff', size: 7, g: 0 });
          }
          if (t === 60) { flash = 16; sfx.win(); popText(h.x, h.y - 290, 'SPIRIT RESTORED!', '#fde047', 50); this.rings.push({ x: h.x, y: GROUND, r: 10, life: 34, color: '253,224,71' }); h.setState('victory'); }
          if (t >= 110) { b.hidden = true; b.deathT = 200; this.mode = 'won'; this.modeT = 0; }
          break;
      }
      this.sagaTail();
    },

    // ---- chapter 9: vorath's legion of four megazords. Kane forms the dragon megazord and starts losing; the lion
    // joins it as the dragon lion megazord and the whole legion piles on; then the phoenix arrives, burns one out of
    // the sky, and joins them as the phoenix megazord. The other three come at it one at a time.
    setupLegion() {
      this.giant = true;
      const legion = this.legion = LEGION.map((i) => new LegionZord(i));
      legion.forEach((e, i) => { e.bgX = [930, 280, 680, 1060][i]; e.x = e.bgX; e.face = -1; e.state = 'idle'; });
      const b = this.boss = legion[0];
      b.floorHp = Math.round(b.maxHp * 0.5);
      const h = this.hero; h.x = 300; h.renderScale = 0.26;
    },
    clearFx() {
      this.beam = null; this.tornado = null; this.darkTornado = null; this.storm = 0; this.clash = null; this.assist = null;
      this.slashes = []; this.keys = []; this.waves = []; this.grenades = []; this.strikes = []; this.orbs = [];
    },
    // the legion stands at the back of the city, idling, and turning to fire when it's their turn
    updateLegionBg() {
      if (!this.legion) return;
      for (const e of this.legion) {
        if (e === this.boss || !e.alive) continue;
        e.t++; e.x = e.bgX; e.face = Math.sign((this.hero ? this.hero.x : 600) - e.x) || -1;
        if (e.state === 'crescent' && e.t > 36) e.setState('idle');
        e.animate();
      }
    },
    startLegionSaga() { // Kane, tiny in the burning street, calls the dragon
      this.mode = 'saga'; this.modeT = 0; this.saga = { kind: 'legion', stage: 'call', t: 0 };
      const h = this.hero; h.setState('idle'); h.face = 1;
    },
    updateLegionSaga() {
      const s = this.saga, h = this.hero, b = this.boss, t = ++s.t;
      b.animate();
      switch (s.stage) {
        case 'call':
          h.state = 'calling'; h.animate();
          if (t === 12) { popText(h.x, GROUND - 110, 'COME FORTH, DRAGON!', '#facc15', 30); this.bolts.push({ x: h.x, y: GROUND - 60, life: 16 }); flash = 10; shakeIt(10); sfx.zap(); sfx.roar(); }
          if (t >= 56) { this.sagaStage('dragon'); this.dragon = { phase: 'fly', t: 0, bossX: b.x, kaneX: h.x }; sfx.roar(); }
          break;
        case 'dragon': { // it circles the legion's champion, scorching it, then comes for Kane
          const d = this.dragon; d.t++;
          h.animate();
          if (d.t === 20) popText(b.x - 260, 140, 'THE DRAGON ANSWERS!', '#facc15', 36);
          if (d.t >= 55 && d.t < 108) {
            const [hx, hy, hz] = dragonHead(d), sx = hx + W / 2, sy = GROUND - hy, tx = b.x, ty = b.y - 150;
            for (let i = 0; i < 3; i++) { const k = rand(0.03, 0.06); particles.push({ x: sx, y: sy, z: hz, vx: (tx - sx) * k + rand(-3, 3), vy: (ty - sy) * k + rand(-3, 3), vz: -hz * k, life: 22, max: 22, color: Math.random() < 0.5 ? '#f97316' : '#fde047', size: 12, g: 0 }); }
            if (d.t % 6 === 0) { b.flashT = 3; sfx.heavy(); }
            shakeIt(4);
          }
          if (d.t >= 150) { this.sagaStage('form'); d.phase = 'form'; d.t = 0; this.zordHero = makeZordHero(h.x); popText(h.x + 120, 130, 'DRAGON MEGAZORD — TRANSFORM!', '#facc15', 40); sfx.chant(3); }
          break;
        }
        case 'form': // the dragon spirals in and becomes the megazord, just like the first time
          this.dragon.t++; this.zordHero.animate();
          if (t < 40) h.animate();
          if (t === 40) { burst(h.x, GROUND - 40, 30, '#ffffff', 6, 4, -0.2, 30); sfx.zap(); }
          if (t === 60) { flash = 20; shakeIt(20); sfx.boom(); sfx.clank(); }
          if (t === 100) { popText(h.x, GROUND - 340, 'MEGAZORD ASSEMBLED!', '#ffffff', 46); sfx.slash(); }
          if (t >= 120) { this.beginZordFight(); this.round = 1; }
          break;
      }
      this.sagaTail();
    },
    // the dragon megazord buckles; the lion answers and the two become one
    startUniteSaga() {
      this.pending = null; this.mode = 'saga'; this.modeT = 0; this.saga = { kind: 'unite', stage: 'falter', t: 0 };
      this.clearFx();
      const h = this.hero, b = this.boss;
      h.special = null; h.phase = null; h.vx = 0; h.vy = 0; h.y = GROUND; h.onGround = true; h.hp = Math.max(1, h.hp); h.setState('kneel');
      b.setState('gloat'); b.vx = 0; b.telegraph = false; b.y = GROUND; b.fallen = 0;
    },
    updateUniteSaga() {
      const s = this.saga, h = this.hero, b = this.boss, t = ++s.t, L = this.sagaLion;
      if (b.alive) b.animate();
      switch (s.stage) {
        case 'falter':
          h.animate();
          if (t === 10) popText(h.x, GROUND - 330, 'THE DRAGON MEGAZORD IS FALTERING!', '#f87171', 34);
          if (t === 50) { popText(h.x, GROUND - 380, 'KANE: I need you... BLACK LION!', '#fde68a', 30); sfx.roar(); }
          if (t >= 80) { this.sagaStage('lion'); this.sagaLion = { x: ARENA_L - 260, y: GROUND, vx: 0, vy: 0, face: 1, lp: newLionPose(), scale: 1.6, fade: 1, onGround: true }; }
          break;
        case 'lion': { // it races in, roars at the legion, and leaps for the megazord
          h.animate();
          const tg = {};
          if (t < 60 && L.x < h.x - 260) { L.vx = 16; tg.speed = 1.3; tg.jaw = 0.4; } else if (t < 85) { L.vx = 0; tg.rear = 0.8; tg.jaw = 1; tg.pitch = -0.3; }
          if (t === 62) { sfx.roar(); shakeIt(18); popText(L.x, GROUND - 330, 'ROOOAAAR!', '#fde68a', 36); }
          if (t === 85) { L.vy = -20; L.onGround = false; L.vx = (h.x - L.x) / 40; sfx.whoosh(); popText(h.x, GROUND - 420, 'DRAGON AND LION — UNITE!', '#fde047', 42); }
          if (t > 85) { tg.leap = 1; L.fade = Math.max(0, 1 - (t - 105) / 15); }
          this.stepSagaLion(L, tg);
          if (t >= 125) {
            this.sagaStage('merge'); this.sagaLion = null;
            flash = 24; shakeIt(24); sfx.boom(); sfx.clank(); sfx.chant(3);
            const z = makeZordHero(h.x, 'dragonlion'); z.build = 0; z.face = h.face; this.hero = z;
          }
          break;
        }
        case 'merge':
          h.build = clamp((t - 6) / 60, 0, 1); h.animate();
          if (t === 80) { popText(h.x, GROUND - 400, 'DRAGON LION MEGAZORD!', '#fde047', 48); sfx.slash(); sfx.roar(); }
          if (t === 105) { popText(640, 110, 'THE WHOLE LEGION ATTACKS!', '#f87171', 38); sfx.roar(); }
          if (t >= 125) { // round two: the other three fire on you from the back of the city
            h.build = undefined; h.setState('idle'); h.energy = 100; h.inv = 60;
            b.setState('idle'); b.floorHp = Math.round(b.maxHp * 0.25); b.floorHit = false;
            this.round = 2; this.strikeTimer = 90; this.mode = 'fight'; this.modeT = 0; this.fightT = ARMOR_AT + 1;
            popText(h.x, GROUND - 320, 'FIGHT ON!', '#fde047', 48); sfx.heavy();
          }
          break;
      }
      this.sagaTail();
    },
    // still losing... until a red fire eagle tears out of the sky
    startPhoenixSaga() {
      this.pending = null; this.mode = 'saga'; this.modeT = 0; this.saga = { kind: 'phoenix', stage: 'falter', t: 0 };
      this.clearFx();
      const h = this.hero, b = this.boss;
      h.special = null; h.phase = null; h.vx = 0; h.vy = 0; h.y = GROUND; h.onGround = true; h.hp = Math.max(1, h.hp); h.setState('kneel');
      b.setState('gloat'); b.vx = 0; b.telegraph = false; b.y = GROUND; b.fallen = 0;
      if (b.x < h.x + 300) b.x = Math.min(ARENA_R - 60, h.x + 380);
    },
    updatePhoenixSaga() {
      const s = this.saga, h = this.hero, b = this.boss, t = ++s.t, E = this.eagle;
      h.animate();
      if (b.alive) b.animate();
      const fire = (x, y, n) => { for (let i = 0; i < n; i++) particles.push({ x: x + rand(-90, 90), y: y + rand(-40, 60), z: rand(-80, 80), vx: rand(-2, 2), vy: -rand(1, 4), vz: 0, life: 24, max: 24, color: ['#ff4500', '#f97316', '#fde047'][i % 3], size: 13, g: 0 }); };
      if (E) { E.flap += E.flapSpeed || 0.25; fire(E.x, E.y, 4); }
      switch (s.stage) {
        case 'falter':
          if (t === 10) popText(h.x, GROUND - 360, 'KANE: There are too many of them...', '#fde68a', 30);
          if (t === 50) { popText(b.x, GROUND - 360, `${b.L.boss}: END OF THE LINE, KNIGHT.`, '#f87171', 28); sfx.roar(); }
          if (t >= 90) {
            this.sagaStage('cry'); flash = 20; shakeIt(16); sfx.screech();
            this.eagle = { x: ARENA_L - 500, y: GROUND - 1050, z: -300, face: 1, flap: 0, scale: 1.7, bank: 0.35 };
            popText(640, 100, 'SKRAAAAAAAW!', '#fb923c', 50);
          }
          break;
        case 'cry': { // it sweeps in over the city, wings ablaze
          const p = ease(Math.min(1, t / 70));
          E.x = lerp(ARENA_L - 500, b.x - 320, p); E.y = lerp(GROUND - 1050, GROUND - 650, p); E.z = lerp(-300, 0, p); E.bank = 0.35 * (1 - p);
          if (t === 30) popText(640, 140, 'A PHOENIX!?', '#fde047', 40);
          if (t >= 75) { this.sagaStage('grab'); s.from = [E.x, E.y]; }
          break;
        }
        case 'grab': // dives, seizes the monster in its talons, and hauls it up into the sky
          if (t <= 24) { const p = ease(t / 24); E.x = lerp(s.from[0], b.x, p); E.y = lerp(s.from[1], GROUND - 300, p); E.bank = -0.4 * p; E.flapSpeed = 0.1; }
          if (t === 24) { b.setState('grabbed'); b.tilt = 0.5; sfx.grab(); shakeIt(14); popText(b.x, GROUND - 480, 'PHOENIX FLASH!', '#ff7a1a', 52); sfx.screech(); }
          if (t > 24) { const p = ease(Math.min(1, (t - 24) / 46)); E.y = lerp(GROUND - 300, GROUND - 760, p); E.bank = 0; E.flapSpeed = 0.35; b.x = E.x; b.y = E.y + 230; }
          if (t >= 74) { this.sagaStage('strike'); s.by = b.y; }
          break;
        case 'strike': { // it lets go, the monster hangs in a pillar of flame, and the wings cut through it three times
          const k = Math.min(2, Math.floor(t / 30)), u = (t % 30) / 30, side = k % 2 ? -1 : 1;
          b.y = s.by + Math.sin(t * 0.2) * 6; b.tilt = 0.3;
          fire(b.x, b.y - 100, 3);
          E.face = side; E.x = lerp(b.x - side * 420, b.x + side * 420, ease(u)); E.y = b.y - 120 - Math.sin(u * Math.PI) * 80; E.flapSpeed = 0.15; E.bank = -0.3;
          if (t % 30 === 15 && t < 90) {
            flash = 10; shakeIt(18); sfx.slash(); sfx.boom(); b.flashT = 6;
            game.explosions.push({ x: b.x, y: b.y - 110, r: 150, t: 0, harmless: true });
            burst(b.x, b.y - 110, 50, '#ff7a1a', 14, 7, 0.1, 30); burst(b.x, b.y - 110, 30, '#fde047', 10, 5, 0.1, 24);
            popText(b.x, b.y - 300, ['ONE!', 'TWO!', 'THREE!'][k], '#fde047', 48);
          }
          if (t >= 95) this.sagaStage('boom');
          break;
        }
        case 'boom': // it bursts apart in the sky
          E.x = lerp(E.x, b.x - 300, 0.05); E.y = lerp(E.y, b.y - 200, 0.05); E.face = 1; E.flapSpeed = 0.25;
          if (t === 5) {
            for (const [dx, dy, r] of [[0, 0, 340], [-90, -60, 240], [100, -40, 260], [0, -150, 220]]) game.explosions.push({ x: b.x + dx, y: b.y - 110 + dy, r, t: 0, dur: 60, harmless: true });
            burst(b.x, b.y - 110, 160, '#ff7a1a', 18, 8, 0.25, 70); burst(b.x, b.y - 110, 70, '#3f3f46', 12, 10, 0.35, 80);
            flash = 18; shakeIt(40); sfx.boom(); sfx.boom(); sfx.kame();
            b.alive = false; b.state = 'dying'; b.deathT = 200;
            popText(b.x, GROUND - 640, `${b.L.boss} DESTROYED!`, '#fde047', 44);
          }
          if (t === 40) { sfx.screech(); popText(640, 120, 'SKRAAAAAW!', '#fb923c', 40); }
          if (t >= 70) { this.sagaStage('merge'); s.from = [E.x, E.y]; }
          break;
        case 'merge': // it folds its burning wings and joins the dragon and the lion
          if (t <= 40) { const p = ease(t / 40); E.x = lerp(s.from[0], h.x, p); E.y = lerp(s.from[1], GROUND - 300, p); E.face = Math.sign(h.x - s.from[0]) || 1; }
          if (t === 40) {
            this.eagle = null; flash = 26; shakeIt(26); sfx.boom(); sfx.clank(); sfx.chant(3);
            const z = makeZordHero(h.x, 'phoenix'); z.build = 0; z.face = 1; this.hero = z;
            popText(z.x, GROUND - 420, 'DRAGON, LION, PHOENIX — UNITE!', '#fde047', 42);
          }
          if (t > 40) { const z = this.hero; z.build = clamp((t - 46) / 60, 0, 1); fire(z.x, GROUND - 150, 3); }
          if (t === 110) { popText(h.x, GROUND - 420, 'PHOENIX MEGAZORD!', '#ff7a1a', 54); sfx.slash(); sfx.screech(); }
          if (t === 128) popText(h.x, GROUND - 340, 'FIRE SWORD!  F: MEGA PHOENIX SPLASH', '#fde047', 30);
          if (t >= 150) { this.hero.build = undefined; this.hero.energy = 100; this.startLegionRound(this.legion.findIndex((e) => e.alive)); }
          break;
      }
      this.sagaTail();
    },
    startLegionRound(idx) { // the next legion zord steps down from the back of the city
      this.legionIdx = idx;
      const b = this.boss = this.legion[idx], h = this.hero;
      b.x = clamp(Math.max(h.x + 420, 900), ARENA_L + 60, ARENA_R - 60); b.y = GROUND; b.setState('intro'); b.wait = 70; b.face = -1; b.floorHp = 0; b.fallen = 0;
      h.setState('idle'); h.y = GROUND; h.onGround = true; h.vx = 0; h.special = null; h.phase = null;
      h.hp = h.trail = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.3)); // the phoenix flames heal
      this.clearFx(); this.round = 3; this.mode = 'fight'; this.modeT = 0; this.fightT = ARMOR_AT + 1;
      popText(b.x, GROUND - 340, `${b.L.boss} STEPS IN!`, b.L.palette.eye, 40); sfx.roar(); sfx.heavy();
    },
    beginPhoenixRound(idx) { // retrying: straight back in as the phoenix megazord against the same enemy
      idx = Math.max(1, idx);
      this.legion.forEach((e, i) => { if (i < idx) { e.alive = false; e.state = 'dying'; e.deathT = 200; } });
      const z = this.hero = makeZordHero(360, 'phoenix'); z.energy = 100;
      this.startLegionRound(idx);
    },
    startLegionDown() { // a legion zord falls: it shudders, bursts, and the next one comes
      this.mode = 'saga'; this.modeT = 0; this.saga = { kind: 'legiondown', stage: 'burst', t: 0 };
      this.clearFx();
      const h = this.hero; h.special = null; h.phase = null; h.vx = 0; h.vy = 0; h.y = GROUND; h.onGround = true; h.setState('idle');
    },
    updateLegionDown() {
      const s = this.saga, h = this.hero, b = this.boss, t = ++s.t;
      h.animate();
      if (b.deathT < 200) { b.fallen = Math.min(1, b.fallen + 0.05); b.animate(); }
      if (t % 7 === 0 && t < 60) { game.explosions.push({ x: b.x + rand(-60, 60), y: GROUND - rand(30, 180), r: rand(50, 90), t: 0, harmless: true }); sfx.boom(); shakeIt(10); }
      if (t === 64) {
        for (const [dx, dy, r] of [[0, -80, 280], [-80, -140, 200], [90, -60, 220]]) game.explosions.push({ x: b.x + dx, y: GROUND + dy, r, t: 0, dur: 60, harmless: true });
        burst(b.x, GROUND - 100, 120, '#ff7a1a', 16, 7, 0.3, 60); burst(b.x, GROUND - 100, 60, '#2b2b2b', 12, 9, 0.35, 70);
        flash = 14; shakeIt(34); sfx.boom(); sfx.boom();
        b.deathT = 200; popText(b.x, GROUND - 380, `${b.L.boss} DESTROYED!`, '#fde047', 44);
      }
      if (t >= 116) {
        const next = this.legion.findIndex((e) => e.alive);
        if (next >= 0) this.startLegionRound(next);
        else { b.L = LEVELS[PHOENIX]; this.mode = 'won'; this.modeT = 0; h.setState('victory'); }
      }
      this.sagaTail();
    },

    // ---- summons: R calls the dragon (a fire-breathing pass), T the lion (pounce, maul, roar), once each per fight
    canSummon(kind) {
      const h = this.hero, b = this.boss;
      if (this.mode !== 'fight' || !h || !b || !b.alive || h.zord || h.mount || this.giant || this.sky || this.assist || this.summonUsed[kind]) return false;
      if (kind === 'dragon') return this.unlocked >= DRAGON_UNLOCK || DEBUG_SUMMON;
      return (this.unlocked >= LION_UNLOCK || DEBUG_SUMMON) && this.level !== KAIJU && this.level !== SPIRIT;
    },
    summonUnlocked(kind) {
      if (kind === 'dragon') return this.unlocked >= DRAGON_UNLOCK || DEBUG_SUMMON;
      return (this.unlocked >= LION_UNLOCK || DEBUG_SUMMON) && this.level !== KAIJU && this.level !== SPIRIT;
    },
    startAssist(kind) {
      const h = this.hero, b = this.boss;
      if (!b || !b.alive || this.assist) return;
      this.summonUsed[kind] = true;
      const dir = Math.sign(b.x - h.x) || 1;
      if (kind === 'dragon') { this.assist = { kind, phase: 'assist', t: 0, dir, bossX: b.x }; popText(b.x, 130, 'THE DRAGON ANSWERS!', '#facc15', 34); }
      else this.assist = { kind, phase: 'run', t: 0, x: dir > 0 ? ARENA_L - 220 : ARENA_R + 220, y: GROUND, vx: 0, vy: 0, face: dir, lp: newLionPose(), scale: 1.4, fade: 1, onGround: true };
    },
    updateAssist(b) {
      const a = this.assist; a.t++;
      const alive = b && b.alive;
      if (a.kind === 'dragon') {
        if (a.t >= 45 && a.t < 95) {
          const [hx, hy, hz] = dragonHead(a), sx = hx + W / 2, sy = GROUND - hy, tx = b.x, ty = b.y - 120 * b.k;
          for (let i = 0; i < 3; i++) {
            const k = rand(0.04, 0.07);
            particles.push({ x: sx, y: sy, z: hz, vx: (tx - sx) * k + rand(-3, 3), vy: (ty - sy) * k + rand(-3, 3), vz: -hz * k, life: 18, max: 18, color: Math.random() < 0.5 ? '#f97316' : '#fde047', size: 11, g: 0 });
          }
          if (alive && a.t % 6 === 0) { b.takeHit(7, 6, 0, b.x, b.y - 120 * b.k); b.burn = Math.max(b.burn, 120); }
          shakeIt(3);
        }
        if (a.t === 50) sfx.roar();
        if (a.t >= 150 && this.assist === a) this.assist = null;
        return;
      }
      const tg = {};
      switch (a.phase) {
        case 'run': // charges in from behind Kane
          a.vx = a.face * 17; tg.speed = 1.3; tg.jaw = 0.4;
          if (a.t === 1) popText(a.face > 0 ? 260 : W - 260, 140, 'THE BLACK LION ANSWERS!', '#fde68a', 32);
          if (!alive || Math.abs(b.x - a.x) < 330 || a.t > 140) { a.phase = 'leap'; a.t = 0; a.vy = -14; a.onGround = false; a.vx = alive ? (b.x - a.face * 70 - a.x) / 28 : a.face * 8; sfx.roar(); sfx.whoosh(); }
          break;
        case 'leap':
          tg.leap = 1; tg.jaw = 1; tg.swipe = 0.6;
          if (a.onGround) {
            a.phase = 'maul'; a.t = 0; a.vx = 0; shakeIt(12); sfx.heavy();
            if (alive) { b.takeHit(28, 40, a.face * 4, b.x, b.y - 100 * b.k); popText(b.x, b.y - 200 * b.k, 'LION POUNCE!', '#fde68a', 30); }
          }
          break;
        case 'maul':
          tg.swipe = a.t % 12 < 6 ? 1 : 0.3; tg.jaw = 0.8; tg.crouch = 0.2;
          if (alive && a.t % 12 === 6) { b.takeHit(10, 12, 0, b.x, b.y - 110 * b.k); sfx.punch(); }
          if (a.t >= 36) { a.phase = 'roar'; a.t = 0; }
          break;
        case 'roar':
          tg.rear = 0.8; tg.jaw = 1; tg.pitch = -0.3;
          if (a.t === 14) {
            sfx.roar(); shakeIt(16); popText(a.x, GROUND - 300, 'ROOOAAAR!', '#fde68a', 32);
            this.rings.push({ x: a.x + a.face * 100, y: GROUND - 150, r: 20, life: 24, color: '253,230,138' });
            if (alive) { b.takeHit(16, 0, a.face * 8, b.x, b.y - 100 * b.k); if (b.alive && !LYING.includes(b.state)) b.knockdown(a.face); }
          }
          if (a.t >= 40) { a.phase = 'leave'; a.t = 0; }
          break;
        case 'leave': // fades back into Kane's spirit
          a.fade = Math.max(0, 1 - a.t / 30); tg.rear = 0.2;
          if (a.t % 2 === 0) burst(a.x + rand(-80, 80), GROUND - rand(30, 160), 2, '#fde68a', 2, 5, -0.2, 24);
          if (a.t >= 30 && this.assist === a) this.assist = null;
          break;
      }
      this.stepSagaLion(a, tg);
    },
    // ---- level 4: the monster rises again as a giant, one-shots Kane, Kane summons the dragon megazord
    startSaga() {
      this.mode = 'saga'; this.modeT = 0; this.saga = { stage: 'explode', t: 0 };
      this.beam = null; this.tornado = null; this.storm = 0; this.slashes = []; this.keys = []; this.waves = []; this.grenades = [];
      const h = this.hero; h.special = null; h.spin = 0; h.orb = 0; h.vx = 0; h.setState('victory');
    },
    sagaStage(stage) { this.saga.stage = stage; this.saga.t = 0; },
    updateSaga() {
      const kind = this.saga.kind;
      if (kind === 'shadow') { this.updateShadowSaga(); return; }
      if (kind === 'nox') { this.updateNoxSaga(); return; }
      if (kind === 'lion') { this.updateLionSaga(); return; }
      if (kind === 'lionzord') { this.updateLionZordSaga(); return; }
      if (kind === 'steal') { this.updateStealSaga(); return; }
      if (kind === 'spirit') { this.updateSpiritSaga(); return; }
      if (kind === 'legion') { this.updateLegionSaga(); return; }
      if (kind === 'unite') { this.updateUniteSaga(); return; }
      if (kind === 'phoenix') { this.updatePhoenixSaga(); return; }
      if (kind === 'legiondown') { this.updateLegionDown(); return; }
      const s = this.saga, h = this.hero, b = this.boss, t = ++s.t;
      switch (s.stage) {
        case 'explode': // the first form blows apart as usual...
          b.update(h); h.animate();
          if (t === 70) popText(h.x, h.y - 260, 'IS IT OVER...?', '#e9d5ff', 30);
          if (t >= 135) {
            this.sagaStage('rise');
            flash = 22; shakeIt(20); sfx.boom(); sfx.roar();
            this.giant = true; particles.length = 0; this.explosions = []; this.cracks = [];
            const g = this.boss = new Boss(GIANT);
            g.x = 930; g.face = -1; g.state = 'idle'; g.grow = 0.05;
            h.x = 360; h.y = GROUND; h.vy = 0; h.face = 1; h.state = 'idle'; h.renderScale = 0.26;
          }
          break;
        case 'rise': // ...then purple lightning drags it back up, building-sized
          b.grow = 0.05 + 0.95 * ease(Math.min(1, t / 90));
          b.armRot = lerp(b.armRot, t > 70 ? -2.6 : 0.4, 0.1); b.backArmRot = lerp(b.backArmRot, t > 70 ? -2.4 : 0.4, 0.1);
          if (t % 6 === 0 && t < 90) { this.bolts.push({ x: b.x + rand(-60, 60), y: b.y - 330 * b.grow, life: 8, color: 0xa855f7 }); sfx.zap(); }
          if (t % 15 === 0 && t < 90) shakeIt(10);
          if (t === 10) popText(b.x, 160, 'THE ABYSS KING RISES AGAIN!', '#c084fc', 40);
          if (t === 80) { sfx.roar(); shakeIt(26); }
          h.animate();
          if (t >= 120) this.sagaStage('beam');
          break;
        case 'beam': // its eyes charge and fire: one shot
          b.telegraph = t < 40;
          b.armRot = lerp(b.armRot, -1.2, 0.1); b.backArmRot = lerp(b.backArmRot, -1.2, 0.1);
          if (t === 1) { sfx.charge(); popText(b.x, 200, 'GRRRAAAH!', '#f0abfc', 34); }
          if (t === 40) {
            sfx.kame(); sfx.boom(); flash = 16; shakeIt(30);
            h.hp = 0; h.trail = 0; h.setState('dead'); h.deathT = 0;
            popText(h.x, h.y - 140, 'ONE SHOT!', '#f0abfc', 40);
            burst(h.x, h.y - 30, 60, '#e9d5ff', 12, 5, 0.2, 40);
          }
          this.sagaBeam = t >= 40 && t < 72 ? t - 40 : -1;
          if (h.state === 'dead') h.deathT++; else h.animate();
          if (t >= 100) this.sagaStage('down');
          break;
        case 'down': // waiting on the player
          h.deathT++;
          if ((t > 30 && wasPressed('KeyR', 'Enter', 'Space')) || (AUTOPLAY && t > 90)) { this.sagaStage('summon'); h.setState('summon'); sfx.charge(); }
          break;
        case 'summon': // rise again and call the dragon
          h.t++; h.animate();
          h.hp = Math.min(h.maxHp, h.hp + 4); h.trail = h.hp;
          if (t === 5) popText(h.x, h.y - 120, 'RISE, KANE!', '#ffffff', 34);
          if (t === 40) {
            popText(h.x, h.y - 170, 'COME FORTH, DRAGON!', '#facc15', 40);
            this.bolts.push({ x: h.x, y: h.y - 80, life: 16 }); flash = 10; shakeIt(12); sfx.zap(); sfx.roar();
          }
          if (t >= 64) { this.sagaStage('dragon'); this.dragon = { phase: 'fly', t: 0, bossX: b.x, kaneX: h.x }; sfx.roar(); }
          break;
        case 'dragon': { // the dragon flies in and torches the monster
          const d = this.dragon; d.t++;
          h.t++; h.animate();
          if (d.t === 20) popText(b.x - 260, 140, 'THE DRAGON ARRIVES!', '#facc15', 36);
          if (d.t >= 55 && d.t < 108) {
            const [hx, hy, hz] = dragonHead(d);
            const sx = hx + W / 2, sy = GROUND - hy, tx = b.x, ty = b.y - 200;
            for (let i = 0; i < 4; i++) {
              const k = rand(0.03, 0.06);
              particles.push({ x: sx, y: sy, z: hz, vx: (tx - sx) * k + rand(-3, 3), vy: (ty - sy) * k + rand(-3, 3), vz: -hz * k, life: 22, max: 22, color: Math.random() < 0.5 ? '#f97316' : '#fde047', size: 12, g: 0 });
            }
            if (d.t % 6 === 0) { b.hp = Math.max(1, b.hp - 8); b.flashT = 3; popText(b.x + rand(-60, 60), 240, '8', '#fb923c', 22); sfx.heavy(); }
            b.armRot = lerp(b.armRot, 0.8, 0.1); b.backArmRot = lerp(b.backArmRot, 0.8, 0.1); b.telegraph = false;
            shakeIt(4);
          }
          if (d.t >= 150) {
            this.sagaStage('form'); d.phase = 'form'; d.t = 0;
            this.zordHero = makeZordHero(h.x);
            popText(h.x + 120, 130, 'DRAGON MEGAZORD — TRANSFORM!', '#facc15', 40); sfx.chant(3);
          }
          break;
        }
        case 'form': // 2 seconds: the dragon spirals in and becomes the megazord
          this.dragon.t++;
          this.zordHero.animate();
          if (t < 40) { h.t++; h.animate(); }
          if (t === 40) { burst(h.x, h.y - 40, 30, '#ffffff', 6, 4, -0.2, 30); sfx.zap(); } // Kane beams up into the cockpit
          if (t === 60) { flash = 20; shakeIt(20); sfx.boom(); sfx.clank(); }
          if (t === 100) { popText(h.x, h.y - 340, 'MEGAZORD ASSEMBLED!', '#ffffff', 46); sfx.slash(); }
          if (t >= 120) this.beginZordFight();
          break;
      }
      for (const bolt of this.bolts) bolt.life--;
      this.bolts = this.bolts.filter((bolt) => bolt.life > 0);
      for (const e of this.explosions) e.t++;
      this.explosions = this.explosions.filter((e) => e.t < (e.dur || 28));
      for (const r of this.rings) { r.r += 18; r.life--; }
      this.rings = this.rings.filter((r) => r.life > 0);
      this.updateParticles();
      this.updateAmbient(arenaIndex());
    },
    // retry after a loss: the megazord round restarts on its own, everything else from the top
    retry() {
      const giant = this.giant, sky = this.sky, round = this.round, legionIdx = this.legionIdx;
      this.start(this.level, true);
      if (this.level === PHOENIX) { this.beginPhoenixRound(legionIdx); return; } // back in as the phoenix, same enemy
      if (this.level === KAIJU) { // chapter 7 picks up at the round that was lost
        if (round === 2) { this.hero.beast = 'wolf'; this.boss.hp = this.boss.trail = Math.round(this.boss.maxHp * 0.8); this.beginRide(); }
        if (round === 3) this.beginLionZordRound();
        return;
      }
      if (!giant && !sky) return;
      this.giant = giant; this.sky = sky;
      const g = this.boss = sky ? new ShadowKnight(DARK_ZORD) : new Boss(this.level === NOX ? NOX_GIANT : GIANT); g.x = 930; g.state = 'idle';
      this.zordHero = makeZordHero(360);
      if (this.level === NOX) { this.zordHero.ultimate = true; this.zordHero.maxHp = this.zordHero.hp = this.zordHero.trail = 450; }
      this.beginZordFight();
    },
    beginZordFight() {
      const z = this.zordHero;
      this.hero = z; z.state = 'idle'; z.t = 0; z.energy = 100; z.y = GROUND;
      this.dragon = null; this.sagaBeam = -1; this.zordHero = null;
      this.ride = false; this.rider = null; this.sagaLion = null; this.assist = null;
      if (this.level === KAIJU) this.round = 3;
      const b = this.boss; b.grow = 1; b.setState('idle'); b.telegraph = false; b.x = Math.max(b.x, z.x + 320);
      this.mode = 'fight'; this.modeT = 0; this.fightT = ARMOR_AT + 1; this.keyTimer = 300;
      popText(z.x, z.y - 320, 'FIGHT ON!', '#fde047', 48); sfx.heavy();
    },
    // ---- sword clash (shadow knight fights): blades lock, mash J to push through
    canClash() { return !this.clash && !(this.clashCd > 0) && this.mode === 'fight'; },
    startClash() {
      const h = this.hero, b = this.boss, d = Math.sign(b.x - h.x) || 1, mid = clamp((h.x + b.x) / 2, ARENA_L + 80, ARENA_R - 80);
      this.clash = { t: 0, meter: 0.5, x: mid };
      h.setState('clash'); h.vx = 0; h.x = mid - d * 70; h.face = d;
      b.setState('clash'); b.vx = 0; b.x = mid + d * 70; b.face = -d;
      hitstop = 8; flash = 8; shakeIt(12); sfx.clank(); sfx.slash();
      popText(mid, GROUND - 320, 'CLASH!', '#fde047', 52);
    },
    updateClash(h, b) {
      const c = this.clash; c.t++;
      if (wasPressed('KeyJ') || (AUTOPLAY && this.time % 3 === 0)) {
        c.meter += 0.07; sfx.clank();
        burst(c.x, GROUND - 150, 6, '#ffffff', 7, 3, 0.1, 12);
      }
      c.meter -= (b.zord ? 0.013 : 0.011) * (b.enraged ? 1.25 : 1);
      if (c.t % 2 === 0) burst(c.x, GROUND - 150, 2, Math.random() < 0.5 ? '#fde047' : '#ef4444', 6, 3, 0.2, 14);
      shakeIt(3);
      if (c.meter >= 1 || (c.t > 200 && c.meter >= 0.5)) {
        this.clash = null; this.clashCd = 90;
        h.setState('idle'); h.energy = Math.min(100, h.energy + 15);
        b.setState('idle');
        b.takeHit(28, 0, h.face * 8, b.x, b.y - 140);
        if (b.alive) { b.setState('stagger'); b.vx = h.face * 8; }
        popText(c.x, GROUND - 330, 'CLASH WON!', '#fde047', 40); flash = 10; shakeIt(16); sfx.heavy(); h.addCombo();
      } else if (c.meter <= 0 || c.t > 200) {
        this.clash = null; this.clashCd = 90;
        b.setState('idle'); h.setState('idle'); h.inv = 0;
        h.takeHit(Math.round(20 * (b.dmgMul || 1)), b.x, 'blast');
        popText(c.x, GROUND - 330, 'OVERPOWERED!', '#f87171', 40); flash = 8; shakeIt(16);
      }
    },

    // ---- level 5 finale: the shadow knight summons his dragon; megazord vs dark megazord above the clouds
    startShadowSaga() {
      this.mode = 'saga'; this.modeT = 0; this.saga = { kind: 'shadow', stage: 'laugh', t: 0 };
      this.clash = null; this.beam = null; this.tornado = null; this.darkTornado = null; this.storm = 0;
      this.slashes = []; this.keys = []; this.strikes = [];
      const h = this.hero; h.special = null; h.spin = 0; h.orb = 0; h.vx = 0; h.setState('idle');
      const b = this.boss; b.alive = true; b.hp = 1; b.state = 'floored'; b.t = 0; b.fallen = 1; b.vx = 0; b.y = GROUND;
    },
    updateShadowSaga() {
      const s = this.saga, h = this.hero, b = this.boss, t = ++s.t;
      h.animate();
      switch (s.stage) {
        case 'laugh': // on one knee, laughing
          b.state = 'rising'; b.t = 10; b.fallen = 0.35; b.animate();
          if (t === 10) popText(b.x, b.y - 250, 'HAHAHA... YOU THINK THIS IS OVER?', '#f87171', 30);
          if (t % 20 === 0) burst(b.x, b.y - 100, 12, '#7f1d1d', 5, 6, -0.1, 30);
          if (t >= 90) this.sagaStage('call');
          break;
        case 'call': // stands and raises his sword to the storm
          b.fallen = Math.max(0, b.fallen - 0.05); b.state = 'darkflame'; b.t = 5; b.animate();
          if (t === 20) { popText(b.x, b.y - 280, 'SHADOW DRAGON, COME FORTH!', '#ef4444', 38); this.bolts.push({ x: b.x, y: b.y - 260, life: 16, color: 0xef4444 }); flash = 10; shakeIt(12); sfx.zap(); sfx.roar(); }
          if (t >= 50) { this.sagaStage('darkdragon'); this.dragon = { phase: 'fly', t: 0, bossX: h.x, kaneX: b.x, dark: true }; sfx.roar(); }
          break;
        case 'darkdragon': { // the shadow dragon circles Kane, then sweeps its master up
          const d = this.dragon; d.t++;
          if (d.t >= 55 && d.t < 108) {
            const [hx, hy, hz] = dragonHead(d);
            for (let i = 0; i < 2; i++) particles.push({ x: hx + W / 2, y: GROUND - hy, z: hz, vx: rand(-2, 2), vy: rand(-2, 2), vz: rand(-2, 2), life: 26, max: 26, color: Math.random() < 0.5 ? '#7f1d1d' : '#ef4444', size: 10, g: 0 });
            shakeIt(3);
          }
          if (d.t === 20) popText(h.x, 150, 'A SHADOW DRAGON!?', '#f87171', 34);
          if (d.t >= 150) { // up above the clouds
            this.sagaStage('darkform'); flash = 24; shakeIt(18); sfx.boom();
            this.sky = true; particles.length = 0;
            d.phase = 'form'; d.t = 0; d.kaneX = 930;
            const z = this.boss = new ShadowKnight(DARK_ZORD); z.x = 930; z.face = -1; z.state = 'idle'; z.build = 0; z.pose = { ...POSES.flex };
            h.x = 360; h.y = GROUND; h.face = 1; h.state = 'idle'; h.renderScale = 0.26;
          }
          break;
        }
        case 'darkform': // the dark megazord assembles out of the dragon
          this.dragon.t++;
          b.build = clamp((t - 50) / 50, 0, 1); b.animate();
          if (t === 60) { flash = 18; shakeIt(18); sfx.boom(); sfx.clank(); }
          if (t === 100) { popText(b.x, b.y - 360, 'DARK MEGAZORD ARISES!', '#ef4444', 44); sfx.roar(); }
          if (t >= 120) { this.dragon = null; this.sagaStage('kanecall'); }
          break;
        case 'kanecall': // Kane answers with his own megazord
          b.animate();
          if (t === 10) { popText(h.x, h.y - 120, 'DRAGON MEGAZORD — TRANSFORM!', '#facc15', 38); sfx.chant(3); }
          if (t === 30) { flash = 20; shakeIt(14); sfx.boom(); burst(h.x, h.y - 40, 30, '#ffffff', 6, 4, -0.2, 30); this.zordHero = makeZordHero(h.x); this.zordHero.build = 0; }
          if (this.zordHero) { this.zordHero.build = clamp((t - 30) / 50, 0, 1); this.zordHero.animate(); }
          if (t === 84) { popText(h.x, h.y - 340, 'MEGAZORD VS MEGAZORD!', '#ffffff', 44); sfx.slash(); }
          if (t >= 110) {
            const z = this.zordHero;
            this.hero = z; z.state = 'idle'; z.t = 0; z.energy = 100; z.y = GROUND; z.build = undefined;
            this.zordHero = null; b.build = undefined; b.setState('idle');
            this.mode = 'fight'; this.modeT = 0; this.fightT = ARMOR_AT + 1; this.keyTimer = 300;
            popText(z.x, z.y - 320, 'FINAL ROUND!', '#fde047', 48); sfx.heavy();
          }
          break;
      }
      for (const bolt of this.bolts) bolt.life--;
      this.bolts = this.bolts.filter((bolt) => bolt.life > 0);
      for (const r of this.rings) { r.r += 18; r.life--; }
      this.rings = this.rings.filter((r) => r.life > 0);
      this.updateParticles();
      this.updateAmbient(arenaIndex());
    },
    // ---- story scenes: dialogue before and after each fight
    startStory(lines, then) {
      this.mode = 'story'; this.modeT = 0;
      this.story = { lines, i: 0, chars: 0, t: 0, then, holo: { elder: 0, nox: 0, vorath: 0 } };
    },
    updateStory() {
      const st = this.story, line = st.lines[st.i], h = this.hero, b = this.boss, who = line[0];
      st.t++;
      const before = st.chars;
      st.chars = Math.min(line[1].length, st.chars + 1.25);
      if (Math.floor(st.chars / 3) !== Math.floor(before / 3) && st.chars < line[1].length) sfx.blip(who);
      for (const k of HOLO_CAST) st.holo[k] = clamp(st.holo[k] + (who === k ? 0.08 : -0.06), 0, 1);
      // everyone keeps breathing; whoever talks moves a little
      h.animate();
      if (this.rider) this.rider.animate();
      if (b && b.alive) {
        if (b.isShadow) b.animate();
        else if (b.isLion) stepLionPose(b.lp, who === 'boss' ? { jaw: 0.4 + Math.sin(st.t * 0.3) * 0.4 } : {}, 0.2);
        else {
          const talk = who === 'boss';
          b.bob = Math.sin(this.time * 0.08) * 4;
          b.armRot = lerp(b.armRot, talk ? -0.6 + Math.sin(st.t * 0.3) * 0.4 : 0, 0.15);
          b.backArmRot = lerp(b.backArmRot, talk ? -0.4 : 0, 0.15);
          b.telegraph = talk && st.t % 20 < 10;
        }
      }
      if (wasPressed('Escape')) { this.endStory(); return; }
      if (wasPressed('Enter', 'Space', 'KeyJ') || (AUTOPLAY && st.t > 100)) {
        if (st.chars < line[1].length) st.chars = line[1].length;
        else if (++st.i >= st.lines.length) { this.endStory(); return; }
        else { st.t = 0; st.chars = 0; sfx.select(); }
      }
      this.updateParticles();
      this.updateAmbient(arenaIndex());
    },
    endStory() {
      const then = this.story.then;
      this.story = null;
      if (this.boss) this.boss.telegraph = false;
      if (then === 'intro' && this.level === SPIRIT && this.boss.hidden) this.startStealSaga();
      else if (then === 'intro' && this.level === PHOENIX) this.startLegionSaga();
      else if (then === 'intro') { this.mode = 'intro'; this.modeT = 0; } else this.advanceLevel();
    },

    // ---- the finishing blow: dash in, one slash straight through, back turned while it cracks apart, huge blast
    startFinisher(next) {
      const h = this.hero, b = this.boss, dir = Math.sign(b.x - h.x) || h.face;
      this.mode = 'finish'; this.modeT = 0;
      this.fin = { t: 0, next, blast: next !== 'shadowsaga' && next !== 'noxsaga' && next !== 'spirit', from: h.x, dir, bx: b.x };
      this.beam = null; this.tornado = null; this.darkTornado = null; this.clash = null; this.storm = 0; this.assist = null; this.pending = null;
      this.grenades = []; this.waves = []; this.slashes = []; this.strikes = []; this.keys = []; this.phantom = null; this.wolfSpirit = null; this.lionGhost = null; this.fireBird = null; h.cloak = false;
      h.special = null; h.spin = 0; h.orb = 0; h.vx = 0; h.vy = 0; h.y = GROUND; h.onGround = true; h.face = dir; h.setState('finish');
      b.vx = 0; b.telegraph = false; b.deathT = 0;
      hitstop = 0; flash = 10; sfx.charge();
      popText(h.x, h.y - (h.zord ? 330 : 260), 'FINAL STRIKE!', '#ffffff', 44);
    },
    updateFinisher() {
      const f = this.fin, h = this.hero, b = this.boss, t = ++f.t, k = b.k;
      h.t = t; h.animate();
      if (b.isShadow) { b.animate(); if (!f.blast && t > 30) b.fallen = Math.min(0.35, b.fallen + 0.03); }
      if (b.isLion) { if (t > 26) b.fallen = Math.min(1, b.fallen + 0.05); b.driveLp(); }
      const near = f.bx - f.dir * (70 + 44 * k), past = clamp(f.bx + f.dir * (120 + 44 * k), ARENA_L, ARENA_R);
      if (t <= 16) { // the dash in
        h.x = lerp(f.from, near, ease(t / 16));
        for (let i = 0; i < 3; i++) particles.push({ x: h.x - f.dir * rand(0, 40), y: h.y - rand(20, 200), z: rand(-20, 20), vx: 0, vy: 0, vz: 0, life: 12, max: 12, color: i ? '#e5e7eb' : '#ffffff', size: 6, g: 0 });
      }
      if (t === 18) { // one slash, straight through
        h.x = past; hitstop = 10; flash = 16; shakeIt(22); sfx.slash(); sfx.slash(); sfx.heavy();
        this.slashes.push({ x: f.bx, y: GROUND - 100 * k, dir: f.dir, life: 26, hit: true, fx: true, color: 0xffffff, scale: 1.4 * Math.max(1, k / 1.4), speed: 1 });
        burst(f.bx, GROUND - 100 * k, 50, '#ffffff', 14, 5, 0.1, 30);
      }
      if (t > 18 && t < 72) { // it shudders, light bursting out of the cut
        b.flashT = t % 6 < 3 ? 4 : 0;
        if (t % 4 === 0) burst(f.bx + rand(-40, 40) * k, GROUND - rand(40, 170) * k, 4, Math.random() < 0.5 ? '#fde047' : '#ffffff', 6, 4, 0.1, 18);
        if (f.blast && t % 10 === 0) { this.explosions.push({ x: f.bx + rand(-50, 50) * k, y: GROUND - rand(40, 160) * k, r: 40 * k, t: 0, harmless: true }); sfx.boom(); shakeIt(8); }
      }
      if (f.blast && t === 72) { // the huge blast
        const cy = GROUND - 100 * k, s = Math.max(1, k / 1.6);
        for (const [dx, dy, r] of [[0, 0, 300], [-80, -60, 220], [90, -40, 240], [0, -130, 200]]) this.explosions.push({ x: f.bx + dx * s, y: cy + dy * s, r: r * s, t: 0, dur: 60, harmless: true });
        burst(f.bx, cy, 160, '#ff7a1a', 18, 8, 0.25, 70);
        burst(f.bx, cy, 80, '#ffffff', 14, 6, 0.2, 50);
        burst(f.bx, cy, 70, '#2b2b2b', 12, 10, 0.35, 80);
        for (const [r, c] of [[10, '255,170,60'], [-90, '255,255,255'], [-200, '253,224,71']]) this.rings.push({ x: f.bx, y: GROUND, r, life: 40, color: c });
        this.cracks.push({ x: f.bx, life: 400, color: '#f97316' });
        flash = 12; shakeIt(40); sfx.boom(); sfx.boom(); sfx.kame();
        b.deathT = 200; // nothing left
      }
      if (f.blast && t > 72 && t < 150 && t % 3 === 0) particles.push({ x: f.bx + rand(-90, 90) * k, y: GROUND - rand(0, 80), z: rand(-60, 60), vx: rand(-0.5, 0.5), vy: -rand(1, 2.5), vz: 0, life: 70, max: 70, color: Math.random() < 0.5 ? '#3f3f46' : '#71717a', size: 14, g: -0.01 });
      for (const e of this.explosions) e.t++;
      this.explosions = this.explosions.filter((e) => e.t < (e.dur || 28));
      for (const r of this.rings) { r.r += 18; r.life--; }
      this.rings = this.rings.filter((r) => r.life > 0);
      for (const s of this.slashes) { s.x += s.dir * s.speed; s.life--; }
      this.slashes = this.slashes.filter((s) => s.life > 0);
      this.updateParticles();
      this.updateAmbient(arenaIndex());
      if (t >= (f.blast ? 165 : 100)) {
        const next = f.next;
        this.fin = null;
        if (next === 'won') { this.mode = 'won'; this.modeT = 0; h.setState('victory'); }
        else if (next === 'saga') { this.startSaga(); this.saga.t = 69; }
        else if (next === 'noxsaga') this.startNoxSaga();
        else if (next === 'spirit') this.startSpiritSaga();
        else this.startShadowSaga();
      }
    },
    // ---- chapter 6 finale: nox absorbs the fallen monsters, the shadow knight joins Kane, two dragons become one
    startNoxSaga() {
      this.mode = 'saga'; this.modeT = 0; this.saga = { kind: 'nox', stage: 'rage', t: 0 };
      this.clash = null; this.beam = null; this.tornado = null; this.darkTornado = null; this.storm = 0;
      this.slashes = []; this.keys = []; this.strikes = []; this.orbs = [];
      const h = this.hero; h.special = null; h.spin = 0; h.orb = 0; h.vx = 0; h.setState('idle');
      const b = this.boss; b.alive = true; b.hp = 1; b.state = 'idle'; b.t = 0; b.vx = 0; b.fade = 1; b.tilt = 0; b.deathT = 0; b.flashT = 0;
    },
    updateNoxSaga() {
      const s = this.saga, h = this.hero, b = this.boss, t = ++s.t;
      h.animate();
      switch (s.stage) {
        case 'rage': // he rises, laughing
          b.y = lerp(b.y, GROUND - 70, 0.04); b.telegraph = t % 20 < 10;
          if (t === 10) popText(b.x, b.y - 300, 'YOU THINK YOU HAVE WON?', '#c084fc', 34);
          if (t === 55) { popText(b.x, b.y - 340, 'I AM EVERY MONSTER YOU DESTROYED!', '#e879f9', 36); sfx.roar(); shakeIt(14); }
          if (t >= 100) this.sagaStage('absorb');
          break;
        case 'absorb': { // the spirits of the four fallen monsters pour into him
          const i = Math.min(3, Math.floor(t / 34)), L = LEVELS[i], from = [[-200, 100], [W + 200, 80], [-200, 420], [W + 200, 380]][i];
          if (t % 34 === 1 && t < 136) { popText(b.x, b.y - 300 - i * 12, `${L.boss}...`, L.palette.eye, 30); sfx.roar(); flash = 6; shakeIt(10 + i * 3); }
          if (t < 136) for (let k = 0; k < 4; k++) {
            const f = rand(0.025, 0.045), sx = from[0] + rand(-40, 40), sy = from[1] + rand(-40, 40);
            particles.push({ x: sx, y: sy, z: rand(-200, 200), vx: (b.x - sx) * f, vy: (b.y - 150 - sy) * f, vz: 0, life: 40, max: 40, color: Math.random() < 0.5 ? L.palette.eye : L.palette.accent, size: 9, g: 0 });
          }
          b.telegraph = true;
          if (t >= 150) { // he swells past all reason: cut to the city
            this.sagaStage('grow'); flash = 26; shakeIt(24); sfx.boom(); sfx.roar();
            this.giant = true; particles.length = 0;
            const g = this.boss = new Boss(NOX_GIANT);
            g.x = 930; g.face = -1; g.state = 'idle'; g.grow = 0.05;
            h.x = 340; h.y = GROUND; h.face = 1; h.state = 'idle'; h.renderScale = 0.26;
          }
          break;
        }
        case 'grow':
          b.grow = 0.05 + 0.95 * ease(Math.min(1, t / 90));
          b.armRot = lerp(b.armRot, t > 70 ? -2.6 : 0.4, 0.1); b.backArmRot = lerp(b.backArmRot, t > 70 ? -2.4 : 0.4, 0.1);
          if (t % 6 === 0 && t < 90) { this.bolts.push({ x: b.x + rand(-60, 60), y: b.y - 330 * b.grow, life: 8, color: 0xe879f9 }); sfx.zap(); }
          if (t % 15 === 0 && t < 90) shakeIt(10);
          if (t === 10) popText(b.x, 150, 'NOX TITAN!', '#e879f9', 48);
          if (t === 80) { sfx.roar(); shakeIt(26); }
          if (t >= 120) this.sagaStage('ally');
          break;
        case 'ally': // red lightning: the shadow knight returns - on Kane's side
          b.armRot = lerp(b.armRot, 0, 0.05); b.backArmRot = lerp(b.backArmRot, 0, 0.05);
          if (t === 10) {
            this.bolts.push({ x: 520, y: GROUND - 60, life: 16, color: 0xef4444 }); flash = 10; sfx.zap(); shakeIt(10);
            const a = this.ally = new ShadowKnight(SHADOW);
            a.x = 520; a.face = 1; a.state = 'intro'; a.renderScale = 0.26;
          }
          if (this.ally) this.ally.animate();
          if (t === 24) popText(520, GROUND - 120, 'SHADOW KNIGHT: Your fight is my fight now, Kane.', '#f87171', 24);
          if (t === 70) popText(h.x, GROUND - 160, "KANE: Then let's finish this - together!", '#fde68a', 24);
          if (t >= 112) {
            this.sagaStage('dragons'); sfx.roar();
            this.dragon = { phase: 'fly', t: 0, bossX: b.x, kaneX: h.x };
            this.dragon2 = { phase: 'fly', t: -24, bossX: b.x, kaneX: h.x, dark: true };
            popText(b.x - 260, 140, 'TWIN DRAGONS!', '#facc15', 40);
          }
          break;
        case 'dragons': // both dragons torch the titan
          this.ally.animate();
          for (const d of [this.dragon, this.dragon2]) {
            d.t++;
            if (d.t >= 55 && d.t < 108) {
              const [hx, hy, hz] = dragonHead(d), sx = hx + W / 2, sy = GROUND - hy, tx = b.x, ty = b.y - 200;
              for (let i = 0; i < 3; i++) {
                const k = rand(0.03, 0.06);
                particles.push({ x: sx, y: sy, z: hz, vx: (tx - sx) * k + rand(-3, 3), vy: (ty - sy) * k + rand(-3, 3), vz: -hz * k, life: 22, max: 22, color: d.dark ? (Math.random() < 0.5 ? '#ef4444' : '#7f1d1d') : (Math.random() < 0.5 ? '#f97316' : '#fde047'), size: 12, g: 0 });
              }
              if (d.t % 6 === 0) { b.hp = Math.max(1, b.hp - 6); b.flashT = 3; sfx.heavy(); }
              shakeIt(4);
            }
          }
          if (this.dragon2.t >= 150) {
            this.sagaStage('ultimate');
            for (const d of [this.dragon, this.dragon2]) { d.phase = 'form'; d.t = 0; }
            const z = this.zordHero = makeZordHero(h.x);
            z.ultimate = true; z.maxHp = z.hp = z.trail = 450; z.build = 0;
            popText(h.x + 120, 130, 'DRAGONS, UNITE!', '#facc15', 44); sfx.chant(3);
          }
          break;
        case 'ultimate': // two dragons spiral into one: the ultimate megazord
          for (const d of [this.dragon, this.dragon2]) d.t++;
          this.zordHero.build = clamp((t - 50) / 50, 0, 1); this.zordHero.animate();
          if (t < 40) this.ally.animate();
          if (t === 40) { burst(h.x, h.y - 40, 30, '#ffffff', 6, 4, -0.2, 30); burst(520, GROUND - 40, 30, '#ef4444', 6, 4, -0.2, 30); sfx.zap(); }
          if (t === 60) { flash = 22; shakeIt(22); sfx.boom(); sfx.clank(); }
          if (t === 102) { popText(h.x, GROUND - 400, 'ULTIMATE MEGAZORD!', '#fde047', 52); sfx.slash(); sfx.roar(); }
          if (t >= 130) { this.ally = null; this.dragon2 = null; this.zordHero.build = undefined; this.beginZordFight(); }
          break;
      }
      for (const bolt of this.bolts) bolt.life--;
      this.bolts = this.bolts.filter((bolt) => bolt.life > 0);
      for (const r of this.rings) { r.r += 18; r.life--; }
      this.rings = this.rings.filter((r) => r.life > 0);
      this.updateParticles();
      this.updateAmbient(arenaIndex());
    },

    // ---- the end: credits roll above the clouds, then the champion
    startCredits() {
      this.mode = 'credits'; this.modeT = 0; particles.length = 0; texts.length = 0;
      const h = this.champion = new Hero(); h.x = W / 2; h.y = GROUND; h.state = 'victory'; h.pose = { ...POSES.flex }; h.beast = 'wolf'; h.revived = true;
      sfx.win();
    },
    finishGame() {
      this.mode = 'complete'; this.modeT = 0; sfx.win(); particles.length = 0; texts.length = 0;
      const h = this.champion = new Hero(); h.x = W / 2; h.y = GROUND - 52; h.state = 'victory'; h.pose = { ...POSES.flex }; h.beast = 'wolf'; h.revived = true; // crowned in his white wolf armor
    },
    onHeroDown() {
      if (this.level === KAIJU && this.round === 1) { this.pending = 'lion'; return; } // losing round one is the story
      if (this.level === PHOENIX && this.round <= 2) { this.pending = this.round === 1 ? 'unite' : 'phoenix'; return; } // so are chapter 9's first two
      this.mode = 'lost'; this.modeT = 0; sfx.lose();
    },
    click(x, y) {
      if (this.mode === 'title') {
        const i = cardIndexAt(x, y);
        if (i !== -1) { if (i < this.unlocked) { this.menuIdx = i; sfx.select(); this.start(i); } }
      } else if (this.mode === 'won' && this.modeT > 150) this.advance();
      else if (this.mode === 'lost' && this.modeT > 90) this.retry();
      else if (this.mode === 'complete' && this.modeT > 120) { this.mode = 'title'; }
    },
    advance() {
      const ch = STORY[this.level];
      if (ch && ch.outro && !NO_STORY) this.startStory(ch.outro, 'next'); else this.advanceLevel();
    },
    advanceLevel() {
      if (this.level >= PLAYABLE - 1) {
        this.startCredits();
      } else this.start(this.level + 1);
    },
    // idle hero + boss shown behind the title menu
    updateDisplay() {
      if (!this.display) {
        const hero = new Hero(); hero.x = 470;
        const bosses = Array.from({ length: PLAYABLE }, (_, i) => { const b = makeBoss(i); b.x = 860; b.state = 'idle'; if (b.isKaiju) { b.grow = 0.55; b.x = 900; } return b; });
        this.display = { hero, bosses };
      }
      this.display.hero.animate();
      const b = this.display.bosses[this.menuIdx];
      b.bob = Math.sin(this.time * 0.08) * 4;
      b.armRot = Math.sin(this.time * 0.05) * 0.15;
      b.backArmRot = -b.armRot;
      if (b.isShadow) b.animate();
      if (b.isLion) stepLionPose(b.lp, { jaw: 0.2 + Math.max(0, Math.sin(this.time * 0.03)) * 0.5 }, 0.1);
    },

    tick() {
      this.time++; this.modeT++;
      if (wasPressed('KeyM')) { sfx.muted = !sfx.muted; store.set('steelbreaker.muted', sfx.muted); }

      if (this.mode === 'title') {
        if (wasPressed('ArrowLeft', 'KeyA')) { this.menuIdx = (this.menuIdx + PLAYABLE - 1) % PLAYABLE; sfx.select(); }
        if (wasPressed('ArrowRight', 'KeyD')) { this.menuIdx = (this.menuIdx + 1) % PLAYABLE; sfx.select(); }
        if (wasPressed('Enter', 'Space', 'KeyJ') && this.menuIdx < this.unlocked) { sfx.select(); this.start(this.menuIdx); return; }
        this.updateDisplay();
        this.updateAmbient(levelArena(this.menuIdx));
        return;
      }
      if (this.mode === 'paused') {
        if (wasPressed('KeyP', 'Escape', 'Enter')) this.mode = 'fight';
        if (wasPressed('KeyQ')) this.mode = 'title';
        return;
      }
      if (this.mode === 'fight' && wasPressed('KeyP', 'Escape')) { this.mode = 'paused'; return; }
      if (this.mode === 'credits') {
        this.champion.animate();
        if ((this.modeT > 60 && wasPressed('Enter', 'Escape', 'Space')) || this.modeT > CREDITS.length * 70 + 700) this.finishGame();
        this.updateParticles(); this.updateAmbient(6);
        return;
      }
      if (this.mode === 'complete') {
        if (this.modeT % 6 === 0) burst(rand(0, W), -10, 4, ['#fde047', '#7dd3fc', '#f472b6', '#86efac'][Math.floor(rand(0, 4))], 3, 6, 0.12, 120, rand(-300, 300));
        if (this.modeT > 120 && wasPressed('Enter', 'Escape', 'Space')) this.mode = 'title';
        this.champion.animate();
        this.updateParticles();
        this.updateAmbient(2);
        return;
      }

      if (this.mode === 'story') { this.updateStory(); return; }
      if (this.mode === 'finish') { if (hitstop > 0) { hitstop--; this.updateParticles(); } else this.updateFinisher(); return; }
      if (this.mode === 'saga') { if (hitstop > 0) hitstop--; else this.updateSaga(); return; }
      if (hitstop > 0) { hitstop--; this.updateParticles(); return; }

      if (this.horde) this.updateHorde(this.hero);
      const h = this.hero, b = this.boss;
      if (this.clashCd > 0) this.clashCd--;
      if (this.clash) this.updateClash(h, b);
      const ctrl = this.mode === 'fight' ? (AUTOPLAY ? autopilot(h, b) : keyboard()) : {};
      if (DEBUG_SP && this.mode === 'fight' && this.fightT === 40) { h.energy = 100; ctrl[DEBUG_SP] = true; }
      if (BEASTS[DEBUG_SWAP] && this.mode === 'fight' && this.fightT === 30 && h.beast && h.state !== 'swap') h.swapBeast(DEBUG_SWAP); // debug: &swap=lion
      if (DEBUG_DIE && this.mode === 'fight' && this.fightT === 20 && !h.revived) { h.state = 'idle'; h.inv = 0; h.takeHit(999, b.x); }
      if (this.mode === 'intro') {
        if (this.modeT < 50) { h.vx = 3; h.state = 'walk'; h.walkPhase += 0.22; } else if (h.state === 'walk') h.setState('idle');
        if (this.modeT >= 150) { this.mode = 'fight'; sfx.heavy(); }
      }
      if (this.mode === 'fight') this.fightT++;
      // armor-up power-up a few seconds in, as soon as he is free to transform
      // the white wolf answers in every chapter (in chapter 10, once a few imps are down or the fight drags on)
      const free = this.mode === 'fight' && !h.revived && ['idle', 'walk', 'block'].includes(h.state) && h.onGround;
      const wolfTime = this.level === WOLF ? this.hordeKills >= WOLF_AFTER_KILLS || this.fightT >= WOLF_AT : this.fightT >= ARMOR_AT;
      if (free && wolfTime) h.startWolfUp();
      const storming = (h.state === 'special' && h.special === 'thunder') || (b.state === 'darkthunder' && b.alive);
      this.storm = storming ? Math.min(1, this.storm + 0.05) : Math.max(0, this.storm - 0.015);
      if (this.storm > 0.3 ) for (let i = 0; i < 3; i++) particles.push({ x: rand(-100, W + 100), y: rand(-100, 300), z: rand(-400, 300), vx: -2, vy: 26, vz: 0, life: 28, max: 28, color: '#94a3b8', size: 2.5, g: 0 });
      h.update(ctrl, b.alive ? b : null);
      if (this.mode === 'saga') return; // T on the lion's back just started its transformation
      if (this.rider) this.updateRider(h);
      // the robot stands frozen in shock while the hero transforms (and the imps hold still for the wolf and its fang)
      const frozen = (this.mode === 'intro' && this.modeT <= 40) || (h.state === 'armorup' && h.t < 110) || (h.state === 'wolfup' && h.t < 214) || this.phantom;
      if (!frozen || !b.alive) b.update(h);
      if (this.horde) for (const m of this.horde) if (m !== b && m.onField && (!frozen || !m.alive)) m.update(h); // the dead still pop

      // body blocking (the boss is heavy; the hero gets pushed)
      if (b.alive && h.state !== 'dodge' && b.state !== 'dash' && h.state !== 'dead' && h.state !== 'special' && !LYING.includes(b.state)) {
        const minD = h.halfW + (b.halfW ?? 44 * b.k), d = h.x - b.x; // hero half-width + boss half-width
        if (Math.abs(d) < minD && h.y > GROUND - 150 * b.k) h.x = clamp(b.x + (Math.sign(d) || -b.face) * minD, ARENA_L, ARENA_R);
        if (h.x <= ARENA_L + 1 && Math.abs(h.x - b.x) < minD) b.x = h.x + minD;
        if (h.x >= ARENA_R - 1 && Math.abs(h.x - b.x) < minD) b.x = h.x - minD;
      }
      h.trail = Math.max(h.hp, h.trail - 0.8);

      this.updateHazards(h, b);
      if (this.assist) this.updateAssist(b);
      this.updateParticles();
      this.updateAmbient(arenaIndex());
      // chapter 7, round one: it ends when the behemoth proves untouchable, Kane falls, or 45 seconds pass
      if (this.level === KAIJU && this.round === 1 && this.mode === 'fight' && this.fightT > 2700) this.pending = 'lion';
      if (this.pending === 'lion' && this.mode === 'fight') { this.startLionSaga(); return; }
      // chapter 9: the dragon megazord holds out until it's battered (or the legion's champion is), then the lion joins;
      // the dragon lion megazord holds out until the phoenix comes
      if (this.level === PHOENIX && this.mode === 'fight') {
        if (this.round === 1 && (h.hp <= h.maxHp * 0.35 || b.floorHit || this.fightT > ARMOR_AT + 2400)) this.pending = 'unite';
        if (this.round === 2 && (h.hp <= h.maxHp * 0.3 || b.floorHit || this.fightT > ARMOR_AT + 1800)) this.pending = 'phoenix';
      }
      if (this.pending === 'unite' && this.mode === 'fight') { this.startUniteSaga(); return; }
      if (this.pending === 'phoenix' && this.mode === 'fight') { this.startPhoenixSaga(); return; }

      if (this.mode === 'won') {
        if (this.modeT === 130) {
          sfx.win();
          if (this.level + 2 > this.unlocked) { this.unlocked = Math.min(PLAYABLE, this.level + 2); store.set('steelbreaker.unlocked', this.unlocked); }
          if (this.level === KAIJU) popText(this.hero.x, GROUND - 480, 'SUMMONS UNLOCKED: R DRAGON · T LION', '#fde68a', 30);
        }
        if (this.modeT > 150 && wasPressed('Enter', 'Space')) this.advance();
        if (this.modeT > 150 && wasPressed('Escape')) this.mode = 'title';
      }
      if (this.mode === 'lost' && this.modeT > 90) {
        if (wasPressed('Enter', 'Space')) this.retry();
        if (wasPressed('Escape')) this.mode = 'title';
      }
      if (AUTOPLAY && this.mode === 'won' && this.modeT > 260) this.advance();
      if (AUTOPLAY && this.mode === 'lost' && this.modeT > 200) this.retry();
    },

    updateRider(l) { // Kane's arms follow what the lion under him is doing
      const r = this.rider, m = l.move;
      r.ridePose = l.state === 'attack' ? (m === 'lpounce' || m === 'lmaul' ? 'dash' : 'cut') : l.state === 'victory' ? 'raise' : l.state === 'hurt' ? 'hurt' : null;
      r.face = l.face; r.element = l.element;
      r.animate();
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
      this.explosions = this.explosions.filter((e) => e.t < (e.dur || 28));

      for (const w of this.waves) {
        w.x += w.dir * w.speed; w.life--;
        if (w.life % 3 === 0) burst(w.x, GROUND - 4, 2, '#ffb366', 3, 4, 0.3, 16);
        if (!w.hit && Math.abs(h.x - w.x) < 34 && h.y > GROUND - w.h) { w.hit = h.takeHit(w.dmg, w.x - w.dir * 10, 'blast') || w.hit; if (w.hit) w.life = 0; }
      }
      this.waves = this.waves.filter((w) => w.life > 0 && w.x > -40 && w.x < W + 40);
      for (const r of this.rings) { r.r += 18; r.life--; }
      this.rings = this.rings.filter((r) => r.life > 0);
      for (const c of this.cracks) c.life--;
      this.cracks = this.cracks.filter((c) => c.life > 0);

      // element keys: one at a time drops from the sky, floats, and blinks out if ignored
      if (this.mode === 'fight' && !this.keys.length && --this.keyTimer <= 0) {
        const pool = Object.keys(ELEMENTS).filter((e) => e !== h.element);
        const el = ELEMENTS[DEBUG_KEY] ? DEBUG_KEY : pool[Math.floor(Math.random() * pool.length)];
        const x = DEBUG_KEY ? h.x + h.face * 120 : clamp(rand(ARENA_L + 80, ARENA_R - 80), ARENA_L + 60, ARENA_R - 60);
        this.keys.push({ x, y: -80, el, life: 720, t: 0, landed: false });
        this.keyTimer = Math.round(rand(540, 780));
        popText(x, 140, `${ELEMENTS[el].name} KEY INCOMING`, ELEMENTS[el].color, 22);
      }
      for (const k of this.keys) {
        k.t++; k.life--;
        if (!k.landed) { k.y += 9; if (k.y >= GROUND - 70) { k.y = GROUND - 70; k.landed = true; burst(k.x, GROUND, 14, ELEMENTS[k.el].color, 5, 4, 0.2, 20); sfx.clank(); } }
        if (h.state !== 'dead' && h.state !== 'armorup' && Math.abs(h.x - k.x) < 55 && h.y > k.y - 80) { h.pickUpKey(k); k.life = 0; }
      }
      this.keys = this.keys.filter((k) => k.life > 0);

      // crescent sword slashes
      for (const s of this.slashes) {
        const sc = s.scale || 1;
        s.x += s.dir * (s.speed || 16); s.life--;
        if (s.fire && s.life % 2 === 0) burst(s.x - s.dir * 20, GROUND - 4, 2, s.enemy ? (Math.random() < 0.5 ? '#b91c1c' : '#1f0a0a') : (Math.random() < 0.5 ? '#f97316' : '#fde047'), 3, 8, -0.3, 34, rand(-60, 60));
        if (s.enemy) { // the shadow knight's crescents hit the hero; two crescents meeting cancel out
          if (!s.hit && h.hurtbox && overlap({ x: s.x - 30 * sc, y: s.y - 80 * sc, w: 60 * sc, h: 160 * sc }, h.hurtbox)) {
            s.hit = true; s.life = Math.min(s.life, 4);
            h.takeHit(s.dmg, s.x - s.dir * 10, 'blast'); burst(s.x, s.y, 20, '#ef4444', 9, 5, 0.1, 22);
          }
          for (const o of this.slashes) if (!o.enemy && o.life > 0 && s.life > 0 && Math.abs(o.x - s.x) < 50 * sc) {
            o.life = 0; s.life = 0; burst(s.x, s.y, 30, '#ffffff', 10, 5, 0.1, 24); sfx.clank(); popText(s.x, s.y - 80, 'CANCEL', '#e5e7eb', 22);
          }
          continue;
        }
        if (s.fx) continue; // just for show (finishers, phantom fang's claw marks)
        for (const f of this.foes()) { // a crescent cuts through everything in its path, once each
          if ((s.hits || (s.hits = [])).includes(f) || !overlap({ x: s.x - 30 * sc, y: s.y - 80 * sc, w: 60 * sc, h: 160 * sc }, f.hurtbox)) continue;
          s.hits.push(f); s.hit = true;
          f.takeHit(s.dmg || 20, 25, s.dir * 6, s.x, s.y);
          if (s.fire) { f.burn = 240; burst(s.x, s.y, 60, '#f97316', 14, 7, -0.1, 36); shakeIt(18); }
          h.applyElement(f, s.x, s.y);
          h.addCombo(); h.energy = Math.min(100, h.energy + 5);
          burst(s.x, s.y, 24, '#bfdbfe', 10, 5, 0.1, 24); hitstop = 4; sfx.heavy();
        }
      }
      this.slashes = this.slashes.filter((s) => s.life > 0 && s.x > -100 && s.x < W + 100);
      // water tornado: travels until it catches the monster, spins it in the air, then drops it
      // nox's void orbs home in on the hero; any attack or crescent shatters them
      for (const o of this.orbs) {
        o.life--;
        o.vx = clamp(o.vx + clamp(h.x - o.x, -1, 1) * 0.12, -7, 7); o.vy = clamp(o.vy + clamp((h.y - 110) - o.y, -1, 1) * 0.1, -6, 6);
        o.x += o.vx; o.y += o.vy;
        if (o.life % 2 === 0) particles.push({ x: o.x, y: o.y, z: 0, vx: 0, vy: 0, vz: 0, life: 12, max: 12, color: '#a855f7', size: 6, g: 0 });
        if (h.hurtbox && overlap({ x: o.x - 14, y: o.y - 14, w: 28, h: 28 }, h.hurtbox)) { h.takeHit(o.dmg, o.x, 'blast'); o.life = 0; burst(o.x, o.y, 16, '#e879f9', 7, 4, 0.1, 18); }
        for (const sl of this.slashes) if (!sl.enemy && Math.abs(sl.x - o.x) < 50) { o.life = 0; burst(o.x, o.y, 16, '#ffffff', 7, 4, 0.1, 18); }
      }
      this.orbs = this.orbs.filter((o) => o.life > 0);
      // temple lightning: a warning ring, then a strike
      if (this.level === SHADOW && !this.sky && this.mode === 'fight' && --this.strikeTimer <= 0) {
        this.strikes.push({ x: clamp(h.x + rand(-160, 160), ARENA_L, ARENA_R), t: 0, fuse: 50, dmg: 12, color: 0x93c5fd });
        this.strikeTimer = Math.round(rand(220, 360));
      }
      // chapter 9, round two: the rest of the legion fires on you from the back of the city
      if (this.level === PHOENIX && this.round === 2 && this.mode === 'fight' && --this.strikeTimer <= 0) {
        const shooters = this.legion.filter((e) => e.alive && e !== b), e = shooters[Math.floor(Math.random() * shooters.length)];
        if (e) {
          e.setState('crescent'); popText(e.bgX, GROUND - 440, `${e.L.boss} FIRES!`, e.L.palette.eye, 22); sfx.laser();
          for (let i = 0; i < 2; i++) this.strikes.push({ x: clamp(h.x + rand(-150, 150), ARENA_L, ARENA_R), t: -i * 10, fuse: 44, dmg: 14, color: e.tint });
        }
        this.strikeTimer = Math.round(rand(90, 150));
      }
      // vorath watches from the eclipse, and now and then throws a bolt of his own
      if (this.level === SPIRIT && this.mode === 'fight' && --this.strikeTimer <= 0) {
        this.strikes.push({ x: clamp(h.x + rand(-160, 160), ARENA_L, ARENA_R), t: 0, fuse: 50, dmg: 10, color: 0x22c55e });
        this.strikeTimer = Math.round(rand(320, 480));
      }
      for (const st of this.strikes) {
        st.t++;
        if (st.t === st.fuse) {
          this.bolts.push({ x: st.x, y: GROUND, life: 12, color: st.color }); flash = Math.max(flash, 4); sfx.zap();
          burst(st.x, GROUND - 10, 20, '#e0f2fe', 9, 4, 0.2, 20);
          if (h.hurtbox && Math.abs(h.x - st.x) < 60) h.takeHit(st.dmg, st.x, 'blast');
        }
      }
      this.strikes = this.strikes.filter((st) => st.t < st.fuse + 4);
      // the shadow tornado sweeps across and grinds the hero
      const dt = this.darkTornado;
      if (dt) {
        dt.t++; dt.life--; dt.x += dt.dir * 7;
        if (Math.abs(h.x - dt.x) < 70 && dt.t % 6 === 0) h.takeHit(Math.round(5 * (b.dmgMul || 1)), dt.x - dt.dir * 10, 'tick');
        if (dt.t % 2 === 0) for (let i = 0; i < 2; i++) {
          const a = dt.t * 0.5 + i * 3, hgt = rand(0, 380), r = 30 + hgt * 0.25;
          particles.push({ x: dt.x + Math.cos(a) * r, y: GROUND - hgt, z: Math.sin(a) * r, vx: -Math.sin(a) * 5, vy: -1.5, vz: Math.cos(a) * 5, life: 16, max: 16, color: i ? '#7f1d1d' : '#ef4444', size: 6, g: 0 });
        }
        if (dt.life <= 0 || dt.x < ARENA_L - 60 || dt.x > ARENA_R + 60) this.darkTornado = null;
      }
      const tw = this.tornado;
      if (tw) {
        tw.t++; tw.life--;
        if (!tw.caught) {
          tw.x += tw.dir * 8;
          if (b.alive && !LYING.includes(b.state) && Math.abs(b.x - tw.x) < 40 + 30 * b.k) {
            tw.caught = true; tw.x = b.x;
            b.setState('tornado'); b.yFrom = b.y; b.tilt = 0; b.vx = 0; b.onGround = true;
            sfx.whoosh(); sfx.heavy(); shakeIt(8);
          }
          if (tw.x < ARENA_L - 60 || tw.x > ARENA_R + 60) tw.life = 0;
        } else if (b.alive && b.state === 'tornado') {
          tw.x = b.x;
          if (b.t % 8 === 4) { b.takeHit(6, 0, 0, b.x, b.y - 100 * b.k); h.addCombo(); sfx.whoosh(); }
          if (b.t >= 84) {
            b.takeHit(20, 0, tw.dir * 6, b.x, b.y - 100 * b.k);
            if (b.alive) b.knockdown(tw.dir);
            burst(b.x, GROUND, 60, '#38bdf8', 12, 6, 0.4, 40); sfx.boom(); shakeIt(16);
            tw.life = Math.min(tw.life, 24);
          }
        } else tw.life = Math.min(tw.life, 24);
        if (tw.t % 2 === 0) for (let i = 0; i < 3; i++) {
          const a = tw.t * 0.5 + i * 2.1, hgt = rand(0, 420), r = 30 + hgt * 0.28;
          particles.push({ x: tw.x + Math.cos(a) * r, y: GROUND - hgt, z: Math.sin(a) * r, vx: -Math.sin(a) * 5, vy: -1.5, vz: Math.cos(a) * 5, life: 16, max: 16, color: i ? '#7dd3fc' : '#ffffff', size: 6, g: 0 });
        }
        if (tw.life <= 0) this.tornado = null;
      }
      for (const bolt of this.bolts) bolt.life--;
      this.bolts = this.bolts.filter((bolt) => bolt.life > 0);
    },
    updateParticles() {
      for (const p of particles) {
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.z += p.vz; p.vx *= 0.98; p.vz *= 0.98; p.life--;
        if (p.y > GROUND && p.g > 0) { p.y = GROUND; p.vy *= -0.3; }
      }
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
      for (const t of texts) { t.y -= 1.1; t.life--; }
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].life <= 0) texts.splice(i, 1);
      if (shake > 0) shake *= 0.85;
      if (shake < 0.3) shake = 0;
      if (flash > 0) flash--;
    },
    updateAmbient(level) {
      const a = this.ambient;
      if (a.length < 50 && Math.random() < 0.3) {
        const z = rand(-700, 250);
        if (level === 0 || level === 10) a.push({ x: rand(-200, W + 200), y: rand(200, GROUND), z, vx: rand(-0.2, 0.2), vy: rand(-0.3, -0.1), life: 300 });
        if (level === 1) a.push({ x: rand(-200, W + 200), y: GROUND - rand(60, 220), z, vx: rand(0.2, 0.6), vy: rand(-0.4, -0.2), life: 260 });
        if (level === 2) a.push({ x: rand(-200, W + 200), y: GROUND + rand(-20, 10), z, vx: rand(-0.3, 0.3), vy: rand(-1.6, -0.6), life: 240 });
        if (level === 4 || level === 8) for (let i = 0; i < 2; i++) a.push({ x: rand(-200, W + 300), y: rand(-200, 300), z, vx: -3, vy: 16, life: 60 }); // rain
        if (level === 7 || level === 9) a.push({ x: rand(-200, W + 200), y: GROUND - rand(0, 500), z, vx: rand(-0.3, 0.3), vy: rand(-0.6, -0.2), life: 260 }); // void motes / soul embers
        if (level === 5 && this.level === PHOENIX) a.push({ x: rand(-300, W + 300), y: GROUND - rand(0, 200), z, vx: rand(0.2, 0.6), vy: rand(-1.4, -0.6), life: 260 }); // smoke over the burning city
        if (level === 6) a.push({ x: rand(-300, W + 300), y: GROUND + rand(-60, 80), z, vx: rand(0.4, 1), vy: 0, life: 300 }); // cloud wisps
      }
      for (const p of a) { p.x += p.vx; p.y += p.vy; p.life--; }
      this.ambient = a.filter((p) => p.life > 0);
    },
  };

  // ================================================================ 3D world
  const G = {
    sphere: new THREE.SphereGeometry(1, 28, 18),
    lowSphere: new THREE.SphereGeometry(1, 14, 10),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 22),
    taper: new THREE.CylinderGeometry(1, 0.62, 1, 22),
    cone: new THREE.ConeGeometry(1, 1, 18),
    beam: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).rotateZ(Math.PI / 2), // unit length along x
    halfSphere: new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2),
    ring: new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2),
    plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  };
  const capsules = {};
  const capsule = (r, len) => capsules[`${r}/${len}`] || (capsules[`${r}/${len}`] = new THREE.CapsuleGeometry(r, len, 6, 14));

  const std = (color, rough = 0.6, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const glowMat = (color, opacity = 1, additive = true) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  function part(parent, geo, mat, pos, scale, rot, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (scale !== undefined && scale !== null) { if (typeof scale === 'number') m.scale.setScalar(scale); else m.scale.set(...scale); }
    if (rot) m.rotation.set(...rot);
    m.castShadow = shadow; m.receiveShadow = shadow;
    parent.add(m);
    return m;
  }
  const group = (parent, pos) => { const g = new THREE.Group(); if (pos) g.position.set(...pos); parent.add(g); return g; };
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  const dotTex = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  const crackTex = canvasTex(256, 256, (g) => {
    const R = mulberry(7);
    g.translate(128, 128); g.lineCap = 'round';
    for (const [col, lw] of [['rgba(255,255,255,0.9)', 7], ['rgba(0,0,0,0.95)', 3.5]]) {
      const R2 = mulberry(11);
      g.strokeStyle = col; g.lineWidth = lw;
      for (let i = 0; i < 11; i++) {
        let a = i / 11 * TAU + R2() * 0.3, r = 10, x = 0, y = 0;
        g.beginPath(); g.moveTo(0, 0);
        while (r < 120) { r += 14 + R2() * 16; a += (R2() - 0.5) * 0.5; x = Math.cos(a) * r; y = Math.sin(a) * r; g.lineTo(x, y); }
        g.stroke();
      }
    }
    R();
  });

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6);
  scene.add(hemi);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  Object.assign(keyLight.shadow.camera, { left: -1000, right: 1000, top: 800, bottom: -400, near: 100, far: 3500 });
  keyLight.shadow.bias = -0.0008;
  scene.add(keyLight, keyLight.target);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
  scene.add(rimLight, rimLight.target);
  // a fixed set of point lights for effects (a fixed count avoids shader recompiles)
  const fxLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 900, 1.5); scene.add(l); return l; });

  // ---------------------------------------------------------------- arenas
  const SCENES = [
    { // rooftop at sunset
      sky: ['#140f35', '#5b1d4f', '#f2793b'], below: '#2a1230', fog: [0x4a1c48, 1800, 6000],
      hemi: [0xb79cff, 0x2a1730, 0.6], key: [0xffd2b0, 0.95, [-500, 900, 900]], rim: [0xff8a50, 0.9, [1200, 500, -1200]],
      ambient: { color: 0xffd8b0, size: 6, opacity: 0.8, additive: true },
    },
    { // foundry
      sky: ['#0b1220', '#25344a', '#5f6f86'], below: '#1b2433', fog: [0x25344a, 1500, 4800],
      hemi: [0x9fb4d6, 0x1a1f28, 0.6], key: [0xdfe8ff, 0.85, [-600, 900, 800]], rim: [0xff9a40, 0.9, [600, 400, -1000]],
      ambient: { color: 0xa0aabe, size: 70, opacity: 0.1, additive: false },
    },
    { // reactor core
      sky: ['#120000', '#3d0707', '#8b1a10'], below: '#2a0505', fog: [0x3d0707, 1500, 5200],
      hemi: [0xff8a6a, 0x200000, 0.5], key: [0xffc8b0, 0.75, [-400, 900, 900]], rim: [0xff3010, 1.3, [0, 600, -1200]],
      ambient: { color: 0xff7a28, size: 9, opacity: 0.9, additive: true },
    },
    { // neon city street at night
      sky: ['#05010f', '#1e0b3a', '#5b2a86'], below: '#0b0614', fog: [0x1e0b3a, 1800, 6500],
      hemi: [0x8b5cf6, 0x0b0614, 0.6], key: [0xe9d5ff, 0.85, [-500, 900, 900]], rim: [0xff2bd6, 1.0, [800, 500, -1200]],
      ambient: { color: 0xd8b4fe, size: 5, opacity: 0.8, additive: true },
    },
    { // stormy mountain temple
      sky: ['#0b1220', '#334155', '#64748b'], below: '#1e293b', fog: [0x334155, 1500, 5500],
      hemi: [0xa5b4fc, 0x1e293b, 0.55], key: [0xdbeafe, 0.8, [-500, 900, 900]], rim: [0x93c5fd, 0.9, [600, 600, -1200]],
      ambient: { color: 0xcbd5e1, size: 4, opacity: 0.55, additive: false },
    },
    { // the giant fight: miniature downtown
      sky: ['#05010f', '#1e0b3a', '#5b2a86'], below: '#0b0614', fog: [0x1e0b3a, 1600, 5200],
      hemi: [0x8b5cf6, 0x0b0614, 0.6], key: [0xe9d5ff, 0.85, [-500, 900, 900]], rim: [0xff2bd6, 1.1, [800, 500, -1200]],
      ambient: { color: 0x94a3b8, size: 60, opacity: 0.08, additive: false },
    },
    { // above the clouds at sunset
      sky: ['#1e3a8a', '#c2410c', '#fbbf24'], below: '#fde7c4', fog: [0xd98f4e, 3200, 12000],
      hemi: [0xffe0b8, 0x5a4030, 0.5], key: [0xffd9a0, 0.8, [-600, 900, 900]], rim: [0xff8a3c, 1.0, [1200, 500, -1200]],
      ambient: { color: 0xffffff, size: 90, opacity: 0.1, additive: false },
    },
    { // nox's void throne
      sky: ['#000000', '#1e0b36', '#581c87'], below: '#0b0514', fog: [0x1e0b36, 1800, 7000],
      hemi: [0xc4b5fd, 0x0b0514, 0.55], key: [0xe9d5ff, 0.8, [-500, 900, 900]], rim: [0xe879f9, 1.2, [600, 600, -1200]],
      ambient: { color: 0xe879f9, size: 6, opacity: 0.85, additive: true },
    },
    { // storm over the harbor, the city burning across the bay
      sky: ['#020617', '#0f2a3d', '#2a5560'], below: '#06121a', fog: [0x0f2a3d, 1600, 6200],
      hemi: [0x7dd3fc, 0x06121a, 0.55], key: [0xcfe8ff, 0.8, [-500, 900, 900]], rim: [0xff8a3c, 1.1, [900, 500, -1200]],
      ambient: { color: 0xbfdbfe, size: 4, opacity: 0.55, additive: false },
    },
    { // a rock plateau under a black eclipse
      sky: ['#030706', '#24260f', '#a16207'], below: '#120d05', fog: [0x3a2a12, 1700, 6500],
      hemi: [0xe8d8a8, 0x120d05, 0.55], key: [0xfef3c7, 0.85, [-500, 900, 900]], rim: [0x22c55e, 0.7, [700, 600, -1200]],
      ambient: { color: 0x4ade80, size: 6, opacity: 0.8, additive: true },
    },
    { // the rooftop again, at midnight under a full moon
      sky: ['#02040d', '#0b1736', '#2b4a7a'], below: '#0a1020', fog: [0x0b1736, 1800, 6500],
      hemi: [0x9fb8e8, 0x0a1020, 0.6], key: [0xdbeafe, 0.95, [-500, 900, 900]], rim: [0x93c5fd, 1.1, [1200, 500, -1200]],
      ambient: { color: 0xdbeafe, size: 5, opacity: 0.7, additive: true },
    },
  ];
  const arenas = [];
  const animated = []; // per-frame callbacks for moving scenery

  function skyTexture(cfg, lv) {
    return canvasTex(64, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h / 2);
      gr.addColorStop(0, cfg.sky[0]); gr.addColorStop(0.6, cfg.sky[1]); gr.addColorStop(1, cfg.sky[2]);
      g.fillStyle = gr; g.fillRect(0, 0, w, h / 2);
      const b = g.createLinearGradient(0, h / 2, 0, h);
      b.addColorStop(0, cfg.sky[2]); b.addColorStop(0.08, cfg.below); b.addColorStop(1, '#000');
      g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2);
      if (lv === 2) { g.fillStyle = 'rgba(255,60,20,0.25)'; g.fillRect(0, h * 0.3, w, h * 0.2); }
    });
  }
  function windowsTex(lit, tint) {
    return canvasTex(128, 128, (g) => {
      const R = mulberry(lit * 1000);
      g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
      for (let y = 6; y < 128; y += 16) for (let x = 6; x < 128; x += 14) {
        if (R() < lit) { g.fillStyle = R() < 0.6 ? tint : 'rgba(140,200,255,0.8)'; g.fillRect(x, y, 6, 9); }
      }
    }, [1, 1]);
  }
  function scaledBox(w, h, d, uvScale) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (uvScale) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / uvScale, uv.getY(i) * h / uvScale); }
    return geo;
  }
  function floorTexture(lv) {
    return canvasTex(512, 512, (g) => {
      const R = mulberry(lv * 31 + 5);
      const base = ['#3a2440', '#3a414c', '#1e0909', '#1c1a24', '#3a3f47', '#14121c', '#8a8079', '#140b22', '#3b3f45', '#5a4632', '#262d3d'][lv];
      g.fillStyle = base; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${R() * 0.06})`; g.fillRect(R() * 512, R() * 512, 2 + R() * 4, 2 + R() * 4); }
      if (lv === 0 || lv === 10) { // rooftop slabs
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4;
        for (let i = 0; i <= 512; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
        for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(R() * 512, R() * 512, 30 + R() * 50, 20 + R() * 30, R() * 3, 0, TAU); g.fill(); }
      } else if (lv === 1) { // tread plate
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 3;
        for (let y = 8; y < 512; y += 24) for (let x = (y / 24) % 2 ? 8 : 20; x < 512; x += 24) { g.beginPath(); g.moveTo(x - 5, y + 3); g.lineTo(x + 5, y - 3); g.stroke(); }
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 5;
        for (let i = 0; i <= 512; i += 256) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
      } else if (lv === 7) { // obsidian tiles with glowing rune circles
        g.strokeStyle = 'rgba(168,85,247,0.35)'; g.lineWidth = 3;
        for (let i = 0; i <= 512; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
        g.strokeStyle = 'rgba(232,121,249,0.45)'; g.beginPath(); g.arc(256, 256, 90, 0, TAU); g.stroke(); g.beginPath(); g.arc(256, 256, 70, 0, TAU); g.stroke();
      } else if (lv === 8) { // wet dock concrete, a painted safety line
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 3;
        for (let i = 0; i <= 512; i += 170) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); }
        g.fillStyle = 'rgba(250,204,21,0.5)'; g.fillRect(0, 40, 512, 10);
        for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(120,170,200,0.08)'; g.beginPath(); g.ellipse(R() * 512, R() * 512, 30 + R() * 60, 10 + R() * 20, 0, 0, TAU); g.fill(); } // puddles
      } else if (lv === 9) { // dry earth, split into plates
        g.strokeStyle = 'rgba(20,12,4,0.7)'; g.lineWidth = 3;
        for (let i = 0; i < 26; i++) { let x = R() * 512, y = R() * 512; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 90; y += (R() - 0.5) * 90; g.lineTo(x, y); } g.stroke(); }
      } else if (lv === 4 || lv === 6) { // stone slabs
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 4;
        for (let y = 0; y <= 512; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); for (let x = (y / 128) % 2 ? 64 : 0; x <= 512; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 128); g.stroke(); } }
        for (let i = 0; i < 10; i++) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; let x = R() * 512, y = R() * 512; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 60; y += (R() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
      } else if (lv >= 3) { // asphalt with lane markings (city blocks of road at giant scale)
        g.fillStyle = 'rgba(250,204,21,0.55)';
        if (lv === 3) for (let x = 0; x < 512; x += 128) g.fillRect(x + 16, 250, 64, 8);
        else { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 512, 40); g.fillRect(0, 0, 40, 512); g.fillStyle = 'rgba(250,204,21,0.5)'; for (let x = 0; x < 512; x += 64) g.fillRect(x, 18, 24, 3); }
      } else { // basalt
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.2 + R() * 0.3})`; g.beginPath(); g.arc(R() * 512, R() * 512, 10 + R() * 40, 0, TAU); g.fill(); }
      }
    }, [1, 1]);
  }
  function lavaCracksTex() {
    return canvasTex(512, 512, (g) => {
      const R = mulberry(99);
      g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = '#ff5a1a'; g.lineWidth = 3; g.shadowColor = '#ff3a00'; g.shadowBlur = 10; g.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        let x = R() * 512, y = R() * 512;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 120; y += (R() - 0.5) * 120; g.lineTo(x, y); }
        g.stroke();
      }
    }, [1, 1]);
  }

  function buildArena(lv) {
    const cfg = SCENES[lv], R = mulberry(lv * 97 + 13);
    const root = new THREE.Group(); root.visible = false; scene.add(root);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(cfg, lv), side: THREE.BackSide, fog: false, depthWrite: false }));
    root.add(sky);

    // floor
    const floorTex = floorTexture(lv);
    const edge = lv === 0 || lv === 8 || lv === 10; // the rooftop and the dock end in a drop
    const floorDepth = edge ? 1650 : 3600, floorZ = edge ? 1200 - floorDepth / 2 : -600;
    floorTex.repeat.set(6000 / 300, floorDepth / 300);
    const floorMat = std(0xffffff, 0.85, 0.1, { map: floorTex });
    if (lv === 2) { const em = lavaCracksTex(); em.repeat.set(6000 / 500, floorDepth / 500); Object.assign(floorMat, { emissive: new THREE.Color(0xff5a1a), emissiveMap: em, emissiveIntensity: 1 }); animated.push((t) => { floorMat.emissiveIntensity = 0.7 + Math.sin(t * 0.04) * 0.3; }); }
    if (lv !== 6) { // the sky arena stands on a floating platform instead
      const floor = part(root, new THREE.PlaneGeometry(6000, floorDepth).rotateX(-Math.PI / 2), floorMat, [0, 0, floorZ]);
      floor.castShadow = false;
    }

    // arena edge markers so the walls are readable
    const edgeMat = glowMat(lv === 0 ? 0xff78c8 : lv === 1 ? 0xffc93a : lv === 10 ? 0x93c5fd : 0xff5a1a, 0.9, false);
    for (const sx of [-1, 1]) {
      const px = sx * (ARENA_R - W / 2 + 50);
      for (const z of [-170, 170]) {
        part(root, G.cyl, std(0x1a1a22, 0.5, 0.7), [px, 60, z], [12, 120, 12]);
        part(root, G.lowSphere, edgeMat, [px, 126, z], 10, null, false);
      }
      part(root, G.box, edgeMat, [px, 1, 0], [10, 2, 340], null, false);
    }

    if (lv === 0 || lv === 10) {
      // the rooftop: parapet, AC units, water tower, antenna, painted circle; the city far below
      // (10 is the same roof at midnight: colder colors, and a full moon where the sun was)
      const night = lv === 10;
      const wall = std(night ? 0x1d2538 : 0x2e1d38, 0.9);
      part(root, G.box, wall, [0, 22, -430], [6000, 44, 30]);
      part(root, G.box, std(night ? 0x34405a : 0x553a5e, 0.8), [0, 46, -430], [6000, 6, 36]);
      part(root, G.ring, glowMat(night ? 0x93c5fd : 0xff78c8, 0.25, false), [0, 1, 0], 260, null, false);
      for (const [x, z] of [[-820, -280], [840, -240], [-1100, -150]]) {
        part(root, G.box, std(0x6b6f7d, 0.5, 0.5), [x, 40, z], [130, 80, 100]);
        part(root, G.cyl, std(0x2b2d36, 0.4, 0.6), [x, 82, z], [36, 6, 36]);
      }
      const tower = group(root, [-980, 0, -360]);
      for (const [dx, dz] of [[-45, -45], [45, -45], [-45, 45], [45, 45]]) part(tower, G.cyl, std(0x3b2a2a, 0.7, 0.4), [dx, 110, dz], [5, 220, 5]);
      part(tower, G.cyl, std(0x6b4a3a, 0.9), [0, 290, 0], [80, 140, 80]);
      part(tower, G.cone, std(0x4a3228, 0.9), [0, 385, 0], [86, 50, 86]);
      part(root, G.cyl, std(0x333333, 0.5, 0.8), [1100, 260, -380], [4, 520, 4]);
      const beacon = part(root, G.lowSphere, glowMat(0xff2020, 1, false), [1100, 525, -380], 9, null, false);
      animated.push((t) => { beacon.visible = t % 60 < 30; });
      const winTex = windowsTex(night ? 0.22 : 0.35, night ? 'rgba(190,220,255,0.85)' : 'rgba(255,200,120,0.9)');
      for (let i = 0; i < 70; i++) {
        const w = 160 + R() * 260, d = 160 + R() * 220, h = 700 + R() * 1500, x = (R() - 0.5) * 9000, z = -1100 - R() * 3600;
        const top = -500 + R() * 1300;
        const mat = std(night ? (R() < 0.5 ? 0x131a2c : 0x0c1222) : R() < 0.5 ? 0x24142e : 0x1a0e24, 0.9, 0, { emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9 });
        const m = part(root, scaledBox(w, h, d, 90), mat, [x, top - h / 2, z], null, null, false);
        m.receiveShadow = false;
      }
      if (night) { // the full moon: a pale disc with darker seas, in a wide cold halo
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xbfdbfe, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
        glow.position.set(MOON[0], MOON[1], MOON[2] - 100); glow.scale.set(3400, 3400, 1); root.add(glow);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(480, 48), new THREE.MeshBasicMaterial({ color: 0xf1f5f9, fog: false }));
        disc.position.set(...MOON); root.add(disc);
        for (const [dx, dy, r] of [[-140, 90, 120], [120, -60, 90], [40, 170, 60], [-60, -180, 80], [200, 120, 50]]) {
          const sea = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: 0xcbd5e1, fog: false }));
          sea.position.set(MOON[0] + dx, MOON[1] + dy, MOON[2] + 2); root.add(sea);
        }
        animated.push((t) => { glow.scale.setScalar(3400 + Math.sin(t * 0.02) * 120); });
      } else {
        const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffb070, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
        sun.position.set(2600, 300, -7000); sun.scale.set(3600, 3600, 1); root.add(sun);
      }
    }

    if (lv === 1) {
      // foundry: back wall, chimneys, gantry, spinning gears, furnace glow, molten pour, hazard stripes
      const wallMat = std(0x161e2b, 0.85, 0.3);
      part(root, G.box, wallMat, [0, 700, -1000], [7000, 1400, 40]);
      const glow = glowMat(0xff8a2a, 0.9, false);
      part(root, G.box, glow, [0, 30, -975], [7000, 50, 6], null, false);
      for (let i = 0; i < 9; i++) {
        const x = -2400 + i * 600 + R() * 120, h = 900 + R() * 600;
        part(root, G.cyl, std(0x1f2a3a, 0.7, 0.4), [x, h / 2, -900], [45, h, 45]);
        part(root, G.cyl, std(0x2c3a50, 0.6, 0.5), [x, h, -900], [55, 20, 55]);
      }
      for (const y of [720, 820]) part(root, G.box, std(0x2c3a50, 0.5, 0.6), [0, y, -450], [7000, 26, 26]);
      for (let i = -6; i <= 6; i++) part(root, G.box, std(0x2c3a50, 0.5, 0.6), [i * 300, 770, -450], [10, 100, 10]);
      for (const [gx, gy, r, sp] of [[-700, 420, 120, 0.004], [-440, 300, 70, -0.007], [650, 380, 150, -0.003], [960, 540, 80, 0.006]]) {
        const gear = group(root, [gx, gy, -970]);
        part(gear, new THREE.TorusGeometry(r, r * 0.16, 10, 40), std(0x33445e, 0.5, 0.7), null, null, null, false);
        part(gear, G.cyl, std(0x33445e, 0.5, 0.7), null, [r * 0.25, 20, r * 0.25], [Math.PI / 2, 0, 0], false);
        for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; part(gear, G.box, std(0x33445e, 0.5, 0.7), [Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, 0], [r * 0.2, r * 0.2, 20], [0, 0, a], false); }
        animated.push(() => { gear.rotation.z += sp; });
      }
      const crucible = group(root, [-1250, 620, -700]);
      part(crucible, G.cyl, std(0x2a2a30, 0.6, 0.6), null, [110, 120, 110]);
      part(crucible, G.cyl, glowMat(0xffa030, 1, false), [0, 58, 0], [95, 6, 95], null, false);
      const pour = part(root, G.cyl, glowMat(0xffb040, 0.95, false), [-1150, 280, -700], [16, 560, 16], null, false);
      part(root, G.cyl, glowMat(0xff7a20, 0.9, false), [-1150, 2, -700], [160, 4, 160], null, false);
      animated.push((t) => { pour.scale.x = pour.scale.z = 14 + Math.sin(t * 0.3) * 3; });
      const stripe = canvasTex(64, 64, (g) => { g.fillStyle = '#111'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#d4a017'; g.beginPath(); g.moveTo(0, 0); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(64, 64); g.closePath(); g.fill(); g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 64); g.lineTo(0, 64); g.fill(); }, [1, 12]);
      for (const sx of [-1, 1]) part(root, G.plane, std(0xffffff, 0.7, 0.2, { map: stripe }), [sx * (ARENA_R - W / 2 + 90), 0.6, 0], [60, 1, 720], null, false).receiveShadow = true;
      for (const [x, z] of [[-860, -260], [-800, -190], [900, -300], [960, -230], [880, -160]]) {
        part(root, G.cyl, std(R() < 0.5 ? 0x8a2a1a : 0x2a5a8a, 0.6, 0.4), [x, 55, z], [32, 110, 32]);
      }
      part(root, G.box, std(0x5a4a32, 0.9), [-1050, 60, -150], [120, 120, 120]);
      part(root, G.box, std(0x5a4a32, 0.9), [-1050, 160, -150], [80, 80, 80], [0, 0.4, 0]);
    }

    if (lv === 2) {
      // reactor: giant ring around a pulsing core, pillars, lava moat
      const ringG = group(root, [0, 650, -1500]);
      part(ringG, new THREE.TorusGeometry(560, 55, 16, 80), std(0x2a0808, 0.5, 0.7), null, null, null, false);
      part(ringG, new THREE.TorusGeometry(560, 9, 8, 80), glowMat(0xff5a2a, 1, false), [0, 0, 40], null, null, false);
      const inner = group(ringG);
      part(inner, new THREE.TorusGeometry(380, 14, 8, 60), std(0x3a0a0a, 0.5, 0.7), null, null, null, false);
      for (let k = 0; k < 8; k++) part(inner, G.box, std(0x3a0a0a, 0.5, 0.7), [0, 0, 0], [20, 760, 20], [0, 0, k / 8 * Math.PI], false);
      const core = part(ringG, G.sphere, glowMat(0xff3010, 1, false), null, 200, null, false);
      const halo = part(ringG, G.sphere, glowMat(0xff6a20, 0.35), null, 290, null, false);
      animated.push((t) => { const s = 1 + Math.sin(t * 0.06) * 0.06; core.scale.setScalar(200 * s); halo.scale.setScalar(290 * (2 - s)); inner.rotation.z += 0.004; });
      for (let i = 0; i < 9; i++) {
        const x = -2400 + i * 600;
        part(root, G.box, std(0x1a0404, 0.7, 0.5), [x, 700, -1000], [110, 1400, 110]);
        part(root, G.box, std(0x2a0606, 0.6, 0.5), [x, 1400, -1000], [150, 40, 150]);
        part(root, G.box, glowMat(0xff3a10, 0.9, false), [x, 700, -943], [8, 1400, 4], null, false);
      }
      const lavaTex = canvasTex(256, 256, (g) => {
        const R2 = mulberry(5);
        g.fillStyle = '#ff4a10'; g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${R2() < 0.5 ? '255,220,90' : '120,10,0'},${0.3 + R2() * 0.4})`; g.beginPath(); g.arc(R2() * 256, R2() * 256, 8 + R2() * 30, 0, TAU); g.fill(); }
      }, [10, 1]);
      const lava = part(root, G.plane, new THREE.MeshBasicMaterial({ map: lavaTex, toneMapped: false }), [0, 0.8, -700], [6000, 1, 380], null, false);
      animated.push(() => { lavaTex.offset.x += 0.0006; lavaTex.offset.y += 0.0004; });
      lava.receiveShadow = false;
      part(root, G.box, std(0x140303, 0.6, 0.6), [0, 8, -490], [6000, 16, 40]);
    }

    if (lv === 3) {
      // neon city street at night: sidewalk, close skyscrapers, flickering neon signs, lamps, parked cars
      part(root, G.box, std(0x2a2a33, 0.9), [0, 8, -330], [7000, 16, 160]);
      part(root, G.box, std(0x3a3a46, 0.8), [0, 17, -252], [7000, 4, 6]);
      const winTex = windowsTex(0.45, 'rgba(216,180,254,0.9)');
      const neonCols = [0xff2bd6, 0x22d3ee, 0xa855f7, 0xfacc15, 0x4ade80];
      for (let i = 0; i < 16; i++) {
        const w = 260 + R() * 260, d = 260 + R() * 200, h = 900 + R() * 1900, x = -3600 + i * 470 + R() * 80, z = -560 - d / 2 - R() * 500;
        part(root, scaledBox(w, h, d, 90), std(R() < 0.5 ? 0x150b24 : 0x0f0a1a, 0.85, 0.1, { emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.8 }), [x, h / 2, z], null, null, false);
        if (R() < 0.75) { // neon sign on the facade
          const col = neonCols[Math.floor(R() * neonCols.length)], sw = 90 + R() * 160, sy = 140 + R() * 420;
          const sign = part(root, G.box, glowMat(col, 1, false), [x + (R() - 0.5) * w * 0.4, sy, z + d / 2 + 6], [sw, 26 + R() * 30, 6], null, false);
          part(root, G.box, glowMat(col, 0.25), [sign.position.x, sy, z + d / 2 + 12], [sw + 40, 70, 4], null, false);
          const rate = 0.05 + R() * 0.1, phase = R() * 100;
          animated.push((t) => { sign.material.opacity = Math.sin(t * rate + phase) > -0.85 ? 1 : 0.2; });
        }
      }
      for (const x of [-900, -300, 300, 900]) { // street lamps
        part(root, G.cyl, std(0x1f2937, 0.5, 0.7), [x, 160, -230], [5, 320, 5]);
        part(root, G.box, std(0x1f2937, 0.5, 0.7), [x + 30, 318, -230], [70, 6, 8]);
        part(root, G.sphere, glowMat(0xfde68a, 1, false), [x + 58, 310, -230], 9, null, false);
      }
      for (const [x, z, col] of [[-1050, -180, 0x7c3aed], [-760, 260, 0x0e7490], [980, -170, 0xbe123c], [820, 240, 0x334155]]) {
        const car = group(root, [x, 0, z]);
        part(car, G.box, std(col, 0.3, 0.6), [0, 26, 0], [180, 34, 80]);
        part(car, G.box, std(0x0b1020, 0.1, 0.8), [-10, 56, 0], [100, 28, 72]);
        for (const dx of [-60, 60]) for (const dz of [-40, 40]) part(car, G.cyl, std(0x111111, 0.8), [dx, 14, dz], [16, 8, 16], [Math.PI / 2, 0, 0]);
        for (const dz of [-26, 26]) part(car, G.box, glowMat(0xfef3c7, 1, false), [91, 30, dz], [2, 8, 16], null, false);
      }
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xe9d5ff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      moon.position.set(-1800, 2600, -6500); moon.scale.set(1400, 1400, 1); root.add(moon);
    }

    if (lv === 5) {
      // the same city seen at giant scale: a miniature downtown around the fighters
      const winTex = windowsTex(0.5, 'rgba(216,180,254,0.95)');
      const blocks = [];
      for (let i = 0; i < 260; i++) {
        const x = (R() - 0.5) * 7000, z = -170 - R() * 3600;
        if (Math.abs(x) < 700 && z > -260) continue;
        blocks.push([x, z]);
      }
      for (let i = 0; i < 60; i++) { const x = (R() < 0.5 ? -1 : 1) * (720 + R() * 2600), z = -150 + R() * 700; blocks.push([x, z]); }
      for (const [x, z] of blocks) {
        const w = 40 + R() * 90, d = 40 + R() * 90, h = (Math.abs(z) < 400 ? 40 : 70) + R() * (Math.abs(z) < 400 ? 110 : 330);
        part(root, scaledBox(w, h, d, 22), std(R() < 0.5 ? 0x1b1030 : 0x120a20, 0.8, 0.1, { emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9 }), [x, h / 2, z], null, null, false);
        if (R() < 0.15) part(root, G.box, glowMat([0xff2bd6, 0x22d3ee, 0xa855f7][Math.floor(R() * 3)], 1, false), [x, h + 4, z], [w * 0.8, 6, 4], null, false);
      }
      const carMat = [0xfef3c7, 0xef4444].map((c) => glowMat(c, 1, false));
      const cars = [];
      for (let i = 0; i < 26; i++) { // tiny traffic on the cross streets
        const car = part(root, G.box, std([0x7c3aed, 0x0e7490, 0xbe123c, 0xe5e7eb][i % 4], 0.4, 0.5), [(R() - 0.5) * 6000, 4, [-300, -700, -1100][i % 3]], [16, 7, 8], null, false);
        part(car, G.box, carMat[i % 2], [i % 2 ? -0.5 : 0.5, 0, 0], [0.1, 0.5, 0.8], null, false);
        car.userData.v = (i % 2 ? -1 : 1) * (0.6 + R());
        cars.push(car);
      }
      animated.push(() => { for (const c of cars) { c.position.x += c.userData.v; if (Math.abs(c.position.x) > 3000) c.position.x *= -0.99; } });
      for (let i = 0; i < 40; i++) part(root, G.cone, std(0x14532d, 0.9), [(R() - 0.5) * 5000, 12, -200 - R() * 1500], [7, 24, 7], null, false);
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xe9d5ff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      moon.position.set(-1800, 2600, -6500); moon.scale.set(1400, 1400, 1); root.add(moon);
      // chapter 9: the city burning around the legion (hidden otherwise)
      const fires = group(root); fires.visible = false; root.userData.fires = fires;
      const flames = [];
      for (let i = 0; i < 22; i++) {
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: R() < 0.5 ? 0xff5a1a : 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        const sc = 160 + R() * 360; f.position.set((R() - 0.5) * 6000, sc * 0.3, -250 - R() * 2600); f.scale.set(sc, sc * 0.8, 1);
        f.userData.base = sc; f.userData.ph = R() * 10; fires.add(f); flames.push(f);
      }
      animated.push((t) => { if (fires.visible) for (const f of flames) { const k = 1 + Math.sin(t * 0.15 + f.userData.ph) * 0.12; f.scale.set(f.userData.base * k, f.userData.base * 0.8 * k, 1); } });
    }

    if (lv === 4) {
      // storm-lashed mountain temple: broken pillars, dragon statues, stone lanterns, peaks behind
      const stone = std(0x4b5563, 0.9, 0.05), darkStone = std(0x2d333b, 0.9, 0.05);
      part(root, G.box, darkStone, [0, 10, -340], [2600, 20, 120]);
      for (let i = 0; i < 10; i++) {
        const x = -1500 + i * 330, h = 220 + R() * 480, broken = R() < 0.4;
        part(root, G.cyl, stone, [x, h / 2, -420], [34, h, 34]);
        part(root, G.box, darkStone, [x, h + 8, -420], [90, 16, 90]);
        if (broken) part(root, G.cyl, stone, [x + 120, 26, -320 + R() * 60], [30, 260, 30], [Math.PI / 2, R() * 2, 0]);
      }
      part(root, G.box, std(0x7f1d1d, 0.6), [0, 520, -560], [900, 40, 40]); // gate lintel
      part(root, G.box, std(0x7f1d1d, 0.6), [0, 470, -560], [760, 20, 30]);
      for (const x of [-360, 360]) part(root, G.cyl, std(0x7f1d1d, 0.6), [x, 260, -560], [26, 520, 26]);
      for (const sx of [-1, 1]) { // dragon statues guarding the arena
        const st = group(root, [sx * 820, 0, -260]);
        part(st, G.box, darkStone, [0, 40, 0], [120, 80, 120]);
        part(st, G.box, stone, [0, 150, 0], [70, 140, 80]);
        part(st, G.box, stone, [-sx * 30, 240, 0], [90, 60, 70]);
        for (const z of [-1, 1]) part(st, G.cone, stone, [sx * 10, 290, z * 22], [8, 50, 8], [z * 0.4, 0, sx * 0.6]);
        part(st, G.box, glowMat(0xef4444, 1, false), [-sx * 76, 250, 0], [3, 8, 40], null, false);
      }
      for (const x of [-600, -250, 250, 600]) { // stone lanterns
        part(root, G.box, darkStone, [x, 40, -250], [36, 80, 36]);
        part(root, G.box, stone, [x, 96, -250], [52, 30, 52]);
        const flame = part(root, G.sphere, glowMat(0xfbbf24, 0.9, false), [x, 96, -224], 7, null, false);
        animated.push((t) => { flame.scale.setScalar(6 + Math.sin(t * 0.4 + x) * 1.5); });
        part(root, G.cone, darkStone, [x, 130, -250], [40, 34, 40]);
      }
      for (let i = 0; i < 9; i++) { // mountain peaks
        const x = -4200 + i * 1050 + R() * 300, h = 1600 + R() * 1600, r = 900 + R() * 500;
        part(root, G.cone, std(0x1f2937, 0.95), [x, h / 2 - 200, -3400 - R() * 1200], [r, h, r], null, null, false);
        part(root, G.cone, std(0xe5e7eb, 0.8), [x, h - 200 - h * 0.12, -3400 - R() * 0], [r * 0.25, h * 0.25, r * 0.25], null, null, false);
      }
    }

    if (lv === 6) {
      // high above the clouds at sunset: a floating stone platform among cloud banks and drifting rocks
      const platform = std(0x6b625b, 0.85, 0.05);
      part(root, G.cyl, platform, [0, -40, 0], [1000, 80, 520]).receiveShadow = true;
      part(root, G.cone, std(0x78716c, 0.95), [0, -380, 0], [900, 600, 460], [Math.PI, 0, 0], false);
      part(root, new THREE.TorusGeometry(1, 0.02, 8, 80), std(0xd4a017, 0.25, 0.9), [0, 1, 0], [1000, 520, 1], [Math.PI / 2, 0, 0], false);
      const cloud = new THREE.MeshStandardMaterial({ color: 0xf5e1c8, roughness: 1, metalness: 0, emissive: 0xf59e0b, emissiveIntensity: 0.12 });
      const puffs = [];
      for (let i = 0; i < 70; i++) {
        const far = i > 40, x = (R() - 0.5) * (far ? 12000 : 7000), z = far ? -2500 - R() * 5000 : (R() < 0.5 ? -1 : 1) * (700 + R() * 1600);
        const y = far ? -600 + R() * 900 : -260 - R() * 260;
        const c = group(root, [x, y, z]);
        for (let k = 0; k < 5; k++) part(c, G.sphere, cloud, [(k - 2) * 120 + R() * 60, R() * 50, R() * 80], 110 + R() * 90, null, false);
        c.userData.v = 0.2 + R() * 0.5;
        puffs.push(c);
      }
      animated.push(() => { for (const c of puffs) { c.position.x += c.userData.v; if (c.position.x > 6500) c.position.x = -6500; } });
      for (let i = 0; i < 6; i++) { // floating rocks
        const rock = group(root, [(R() - 0.5) * 6000, 200 + R() * 900, -1500 - R() * 2500]);
        part(rock, G.cone, std(0x78716c, 0.95), [0, 0, 0], [140 + R() * 200, 300, 140 + R() * 200], [Math.PI, 0, 0], false);
        const by = rock.position.y, ph = R() * 10;
        animated.push((t) => { rock.position.y = by + Math.sin(t * 0.01 + ph) * 30; });
      }
      const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffd28a, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      sun.position.set(2400, 700, -7500); sun.scale.set(4200, 4200, 1); root.add(sun);
    }

    if (lv === 7) {
      // nox's void throne: an obsidian platform adrift in a purple void, a throne before a swirling portal,
      // floating crystals, and a broken moon
      const obsidian = std(0x140b22, 0.3, 0.7), gold = std(0xd4a017, 0.25, 0.9);
      const throne = group(root, [0, 0, -620]);
      part(throne, G.box, obsidian, [0, 40, 0], [300, 80, 160]);
      part(throne, G.box, obsidian, [0, 260, -60], [220, 420, 50]);
      for (const x of [-120, 120]) { part(throne, G.box, obsidian, [x, 130, 20], [40, 100, 120]); part(throne, G.cone, gold, [x, 520, -60], [16, 120, 16]); }
      part(throne, G.cone, gold, [0, 540, -60], [22, 180, 22]);
      part(throne, G.box, glowMat(0xa855f7, 0.9, false), [0, 260, -33], [10, 360, 2], null, false);
      const portal = group(root, [0, 520, -1300]);
      part(portal, new THREE.TorusGeometry(520, 34, 12, 80), obsidian, null, null, null, false);
      const swirl = part(portal, new THREE.CircleGeometry(500, 64), new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (g) => {
        const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        r.addColorStop(0, '#ffffff'); r.addColorStop(0.15, '#e879f9'); r.addColorStop(0.5, '#6b21a8'); r.addColorStop(1, '#0b0514');
        g.fillStyle = r; g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 4;
        for (let i = 0; i < 6; i++) { g.beginPath(); for (let a = 0; a < 6; a += 0.1) { const rr = a * 20; g.lineTo(128 + Math.cos(a + i) * rr, 128 + Math.sin(a + i) * rr); } g.stroke(); }
      }), toneMapped: false, fog: false }), [0, 0, -5], null, null, false);
      animated.push(() => { swirl.rotation.z += 0.01; });
      const crystals = [];
      for (let i = 0; i < 16; i++) {
        const c = part(root, new THREE.OctahedronGeometry(1), std(0x7e22ce, 0.15, 0.4, { emissive: 0xa855f7, emissiveIntensity: 0.7 }), [(R() - 0.5) * 3600, 200 + R() * 900, -500 - R() * 2000], [40 + R() * 60, 90 + R() * 120, 40 + R() * 60], null, false);
        c.userData.by = c.position.y; c.userData.ph = R() * 10;
        crystals.push(c);
      }
      animated.push((t) => { for (const c of crystals) { c.rotation.y += 0.01; c.position.y = c.userData.by + Math.sin(t * 0.02 + c.userData.ph) * 30; } });
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xf0abfc, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      moon.position.set(-2600, 2200, -7000); moon.scale.set(2200, 2200, 1); root.add(moon);
    }

    if (lv === 8) {
      // the harbor in a storm: the dock ends in black water, cargo stacks, gantry cranes, a lighthouse sweeping
      // the bay, and the city burning on the far shore
      part(root, G.box, std(0x2a2d33, 0.9), [0, -40, -458], [6000, 80, 16]); // the dock wall
      for (let x = -2000; x <= 2000; x += 260) {
        part(root, G.cyl, std(0x1f2937, 0.5, 0.6), [x, 14, -425], [12, 28, 12]); // bollards
        part(root, G.cyl, std(0x1f2937, 0.5, 0.6), [x, 30, -425], [16, 5, 16]);
      }
      const waveTex = canvasTex(256, 256, (g) => {
        const R2 = mulberry(21);
        g.fillStyle = '#0a2a36'; g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${R2() < 0.6 ? '125,211,252' : '255,255,255'},${0.05 + R2() * 0.12})`; g.fillRect(R2() * 256, R2() * 256, 20 + R2() * 50, 2); }
      }, [16, 10]);
      part(root, G.plane, std(0xffffff, 0.25, 0.5, { map: waveTex }), [0, -60, -4400], [14000, 1, 8000], null, false).receiveShadow = false;
      animated.push(() => { waveTex.offset.x += 0.0008; waveTex.offset.y += 0.0015; });
      const boxCols = [0x9f1239, 0x1d4ed8, 0xc2410c, 0x15803d, 0x52525b];
      for (const [x, z, n] of [[-1040, -330, 3], [-760, -360, 2], [880, -340, 3], [1120, -300, 2], [-1150, 220, 2], [1180, 240, 1]]) {
        for (let i = 0; i < n; i++) {
          const c = part(root, G.box, std(boxCols[Math.floor(R() * boxCols.length)], 0.6, 0.3), [x + (R() - 0.5) * 20, 52 + i * 104, z], [250, 100, 104], [0, (R() - 0.5) * 0.1, 0]);
          for (let r = -4; r <= 4; r++) part(c, G.box, std(0x111111, 0.7, 0.3), [r * 0.11, 0, 0.51], [0.02, 0.9, 0.02], null, false); // ridges
        }
      }
      for (const sx of [-1, 1]) { // gantry cranes reaching out over the water
        const cr = group(root, [sx * 1450, 0, -360]), steel = std(0xd97706, 0.5, 0.6);
        for (const [dx, dz] of [[-90, -70], [90, -70], [-90, 70], [90, 70]]) part(cr, G.box, steel, [dx, 420, dz], [22, 840, 22]);
        part(cr, G.box, steel, [0, 850, 0], [240, 40, 180]);
        part(cr, G.box, steel, [0, 860, -700], [50, 36, 1500]);
        part(cr, G.box, std(0x1f2937, 0.5, 0.6), [0, 920, 0], [140, 80, 140]);
        part(cr, G.cyl, std(0x111111, 0.6), [0, 640, -900], [3, 420, 3]);
        const blink = part(cr, G.lowSphere, glowMat(0xff2020, 1, false), [0, 890, -1440], 10, null, false);
        animated.push((t) => { blink.visible = (t + sx * 20) % 70 < 35; });
      }
      const lh = group(root, [2300, 0, -2600]);
      for (let i = 0; i < 6; i++) part(lh, G.cyl, std(i % 2 ? 0xb91c1c : 0xe5e7eb, 0.6), [0, 60 + i * 120, 0], [110 - i * 8, 120, 110 - i * 8], null, false);
      part(lh, G.cyl, glowMat(0xfef3c7, 1, false), [0, 790, 0], [50, 60, 50], null, false);
      const sweep = group(lh, [0, 790, 0]);
      part(sweep, new THREE.ConeGeometry(260, 2400, 24, 1, true).rotateZ(Math.PI / 2).translate(1200, 0, 0), glowMat(0xfef3c7, 0.12), null, null, null, false);
      animated.push(() => { sweep.rotation.y += 0.012; });
      const winTex = windowsTex(0.4, 'rgba(255,170,90,0.9)');
      for (let i = 0; i < 60; i++) { // the far shore
        const w = 140 + R() * 220, h = 300 + R() * 1300, x = (R() - 0.5) * 11000, z = -5600 - R() * 900;
        part(root, scaledBox(w, h, w, 90), std(0x0b0f14, 0.9, 0, { emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.6 }), [x, h / 2 - 60, z], null, null, false);
      }
      const fires = [];
      for (let i = 0; i < 7; i++) { // the city burning
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xff6a1a, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
        f.position.set(-4000 + i * 1300 + R() * 400, 200 + R() * 300, -5300); f.scale.set(1400, 900, 1); root.add(f); fires.push(f);
      }
      animated.push((t) => { fires.forEach((f, i) => { f.material.opacity = 0.55 + Math.sin(t * 0.05 + i * 1.7) * 0.2; }); });
    }

    if (lv === 9) {
      // a rock plateau under a black eclipse: a great jutting rock behind, spires, dead trees, and vorath's
      // standing stones glowing green
      const rock = std(0x4a3a2a, 0.95, 0.02), dark = std(0x2a2118, 0.95, 0.02);
      const pride = group(root, [-1150, 0, -1150]);
      part(pride, G.cone, rock, [0, 300, 0], [520, 600, 420], null, false);
      part(pride, G.box, dark, [260, 560, 40], [620, 70, 260], [0, 0, 0.12], false); // the ledge
      part(pride, G.cone, dark, [-260, 200, 160], [300, 400, 260], null, false);
      for (let i = 0; i < 10; i++) { // spires and boulders
        const x = (R() < 0.5 ? -1 : 1) * (700 + R() * 2600), z = -500 - R() * 2600, h = 160 + R() * 620;
        part(root, G.cone, R() < 0.5 ? rock : dark, [x, h / 2, z], [70 + R() * 140, h, 70 + R() * 140], [0, R() * 3, 0], false);
      }
      for (const [x, z] of [[-820, -330], [940, -380], [1500, -900], [-1700, -800]]) { // dead acacia trees
        const tr = group(root, [x, 0, z]);
        part(tr, G.cyl, dark, [0, 110, 0], [10, 220, 10], [0, 0, 0.08]);
        for (const a of [-0.7, 0.6]) part(tr, G.cyl, dark, [a * 50, 230, 0], [5, 110, 5], [0, 0, -a]);
        part(tr, G.cyl, std(0x1a1610, 0.95), [10, 285, 0], [140, 14, 90], null, false);
      }
      for (const x of [-560, -200, 220, 600]) { // standing stones with glowing runes
        part(root, G.box, dark, [x, 90, -300], [70, 180, 40], [0, 0, (R() - 0.5) * 0.15]);
        const rune = part(root, G.box, glowMat(0x22c55e, 0.9, false), [x, 100, -278], [10, 110, 2], null, false);
        animated.push((t) => { rune.material.opacity = 0.5 + Math.sin(t * 0.06 + x) * 0.4; });
      }
      const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xbef264, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      corona.position.set(1500, 2200, -6800); corona.scale.set(2600, 2600, 1); root.add(corona);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(560, 48), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
      disc.position.set(1500, 2200, -6700); root.add(disc);
      animated.push((t) => { corona.scale.setScalar(2600 + Math.sin(t * 0.03) * 120); });
    }

    arenas[lv] = { root, cfg, sky };
    return arenas[lv];
  }

  const envMaps = [];
  function envFor(lv) {
    if (envMaps[lv]) return envMaps[lv];
    const pm = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(SCENES[lv], lv), side: THREE.BackSide })));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    panel.position.set(-40, 70, 40); panel.lookAt(0, 0, 0); s.add(panel);
    envMaps[lv] = pm.fromScene(s, 0.04).texture;
    pm.dispose();
    return envMaps[lv];
  }

  let activeLevel = -1;
  function setArena(lv) {
    if (lv === activeLevel) return;
    activeLevel = lv;
    if (!arenas[lv]) buildArena(lv);
    arenas.forEach((a, i) => { if (a) a.root.visible = i === lv; });
    const c = SCENES[lv];
    scene.fog = new THREE.Fog(c.fog[0], c.fog[1], c.fog[2]);
    scene.background = new THREE.Color(c.sky[1]);
    scene.environment = envFor(lv);
    hemi.color.set(c.hemi[0]); hemi.groundColor.set(c.hemi[1]); hemi.intensity = c.hemi[2];
    keyLight.color.set(c.key[0]); keyLight.intensity = c.key[1]; keyLight.position.set(...c.key[2]);
    rimLight.color.set(c.rim[0]); rimLight.intensity = c.rim[1]; rimLight.position.set(...c.rim[2]);
    ambientPts.material.color.set(c.ambient.color);
    ambientPts.material.size = c.ambient.size;
    ambientPts.material.opacity = c.ambient.opacity;
    ambientPts.material.blending = c.ambient.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    ambientPts.material.needsUpdate = true;
  }

  // ---------------------------------------------------------------- hero model
  const YAW_TURN = 0.45; // fighters turn a little toward the camera so we see their faces
  const SKIN = new THREE.Color(0xc98a52), HULK_SKIN = new THREE.Color(0x4f9a2c);
  const PANTS = new THREE.Color(0x26334d), SUIT = new THREE.Color(0x121318), SUIT_DARK = new THREE.Color(0x09090b);

  const LIGHT_THEME = { plate: 0xf1f3f6, trim: 0x16181d, helmet: 0x0d0e12, visor: 0xe5e7eb, gem: 0xffffff, blade: 0xffffff, trail: '#e5e7eb' };
  const SHADOW_THEME = { plate: 0x7f1d1d, trim: 0x0b0b0d, helmet: 0x0b0b0d, visor: 0xff2020, gem: 0xff2020, blade: 0xff2a2a, trail: '#ef4444' };
  function buildHeroModel(theme = LIGHT_THEME) {
    const M = {
      skin: std(SKIN.getHex(), 0.5, 0.05), pants: std(0x26334d, 0.8), boot: std(0x151515, 0.55, 0.1), glove: std(0x1c1c1c, 0.4, 0.1),
      band: std(0xe53935, 0.6), hair: std(0x1b1210, 0.9), belt: std(0x4a2f1d, 0.7), gold: std(0xd4a017, 0.3, 0.9),
      wrap: std(0xf5f5f5, 0.8), white: std(0xffffff, 0.3), dark: std(0x111111, 0.6),
    };
    const root = new THREE.Group(); scene.add(root);
    const yawG = group(root), poseG = group(yawG), rig = group(poseG);
    const hip = group(rig, [0, 96, 0]);
    part(hip, G.cyl, M.pants, [0, -6, 0], [19, 26, 28]);
    const torso = group(hip);
    part(torso, G.taper, M.skin, [0, 42, 0], [27, 84, 46]);
    for (const z of [-17, 17]) part(torso, G.sphere, M.skin, [13, 61, z], [14, 15, 19]);
    for (const y of [18, 30, 42]) for (const z of [-7, 7]) part(torso, G.sphere, M.skin, [16.5 + y * 0.12 + 2, y, z], [4, 5, 6]);
    part(torso, G.sphere, M.skin, [-3, 80, 0], [16, 11, 32]);
    part(torso, G.cyl, M.belt, [0, 4, 0], [19, 12, 30]);
    part(torso, G.box, M.gold, [19.5, 4, 0], [4, 10, 14]);
    part(torso, G.cyl, M.skin, [2, 88, 0], [10, 16, 10]);

    const head = group(torso, [4, 84, 0]);
    part(head, G.box, M.skin, [2, 26, 0], [30, 38, 32]);
    part(head, G.box, M.hair, [0, 47, 0], [33, 10, 34]);
    part(head, G.box, M.hair, [-11, 34, 0], [12, 24, 34]);
    part(head, G.box, M.band, [2, 37, 0], [31.5, 7, 33.5]);
    part(head, G.box, M.skin, [18, 22, 0], [5, 8, 6]);
    for (const z of [-8, 8]) {
      part(head, G.box, M.white, [17.2, 28, z], [2, 4, 7], null, false);
      part(head, G.box, M.dark, [17.6, 28, z * 1.15], [2, 4, 3], null, false);
      part(head, G.box, M.dark, [17.6, 33, z], [3, 2.6, 10], [z > 0 ? 0.3 : -0.3, 0, 0], false);
    }
    part(head, G.box, M.dark, [17.2, 14, 0], [2, 2, 10], null, false);
    const tail = group(head, [-14, 37, 0]);
    part(tail, G.box, M.band, [-12, -2, 4], [24, 5, 2]);
    part(tail, G.box, M.band, [-10, -6, -4], [20, 5, 2]);

    const arm = (side) => {
      const sh = group(torso, [0, 66, side * 44]);
      const ad = group(sh);
      part(ad, G.sphere, M.skin, [0, -2, 0], [18, 19, 17]);
      part(ad, capsule(13, 18), M.skin, [0, -20, 0]);
      part(ad, G.sphere, M.skin, [6, -19, 0], [12, 14, 11]);
      part(ad, G.sphere, M.skin, [-5, -17, 0], [10, 14, 10]);
      const el = group(ad, [0, -38, 0]);
      part(el, capsule(11, 18), M.skin, [0, -16, 0]);
      part(el, G.sphere, M.skin, [2, -8, 0], [12, 12, 11]);
      part(el, G.cyl, M.wrap, [0, -32, 0], [11.5, 8, 11.5]);
      const fist = part(el, G.sphere, M.glove, [0, -44, 0], [13, 12, 12]);
      return { sh, ad, el, fist };
    };
    const leg = (side) => {
      const hj = group(hip, [0, 0, side * 15]);
      part(hj, capsule(17, 16), M.pants, [0, -23, 0]);
      part(hj, G.sphere, M.pants, [4, -18, 0], [17, 22, 16]);
      const kn = group(hj, [0, -46, 0]);
      part(kn, capsule(13, 22), M.pants, [0, -20, 0]);
      part(kn, G.box, M.boot, [8, -40, 0], [40, 18, 22]);
      part(kn, G.box, M.dark, [8, -50, 0], [42, 4, 23]);
      return { hj, kn };
    };
    const model = { root, yawG, poseG, rig, hip, torso, head, tail, M, armF: arm(1), armB: arm(-1), legF: leg(1), legB: leg(-1), yaw: -YAW_TURN };
    model.headBase = head.children.filter((c) => c !== tail); // his bare head, hidden under the (rounded) wolf helm
    model.armor = buildArmorParts(model, theme);
    model.beastArmor = buildBeastArmors(model);
    model.flames = model.beastArmor.phoenix.flames; // flickered every frame by poseHero
    model.bladeColor = theme.blade; model.trailColor = theme.trail;
    model.reviveKey = buildKeyMesh(0xe5e7eb); scene.add(model.reviveKey); model.reviveKey.visible = false;
    // kamehameha orb + hulk aura
    model.orb = part(scene, G.sphere, glowMat(0x7dd3fc, 0.9), null, 1, null, false);
    model.orbCore = part(model.orb, G.sphere, glowMat(0xffffff, 1), null, 0.5, null, false);
    model.orb.visible = false;
    return model;
  }

  // Dragon-knight armor for the revive, by stage: [0] the sword, [1] the bodysuit (a recolor, no meshes),
  // [2] armor plates, [3] helmet. Each mesh scales in (and plates fly in from outside) as its stage locks on.
  function buildArmorParts(model, theme) {
    // black and white: black suit + helmet, white plates, black-chrome trim (named gold/blue for where they sit)
    const white = std(theme.plate, 0.28, 0.3), silver = std(0xc3cad6, 0.18, 0.9), gold = std(theme.trim, 0.2, 0.9);
    const blue = std(theme.helmet, 0.3, 0.6), visor = std(0x050506, 0.05, 0.9, { emissive: theme.visor, emissiveIntensity: theme.visor === 0xe5e7eb ? 0.35 : 0.9 });
    const gem = new THREE.MeshBasicMaterial({ color: theme.gem, toneMapped: false });
    const bladeGlow = glowMat(theme.blade, 0.6);
    const { armF, armB, legF, legB, torso, head, hip } = model;
    const parts = [[], [], [], []];
    const add = (i, parent, geo, mat, pos, scale, rot, fly = 26) => {
      const m = part(parent, geo, mat, pos, scale, rot, !!mat.isMeshStandardMaterial);
      m.visible = false;
      m.userData.base = m.scale.clone(); m.userData.basePos = m.position.clone();
      m.userData.fly = m.position.clone().normalize().multiplyScalar(fly);
      parts[i].push(m);
      return m;
    };

    // [0] the dragon sword, held in the front fist, blade continuing past the knuckles
    const sword = group(armF.el, [0, -44, 0]); sword.rotation.z = 0.55;
    part(sword, G.cyl, std(0x1a1a22, 0.6), [0, 2, 0], [3.4, 26, 3.4]);
    part(sword, G.sphere, white, [0, 16, 0], 4.5);
    part(sword, G.box, gold, [0, -12, 0], [9, 6, 34]);
    for (const z of [-1, 1]) part(sword, G.cone, white, [0, -8, z * 19], [3.5, 13, 3.5], [z * 1.1, 0, 0]);
    part(sword, G.sphere, glowMat(0xffffff, 1, false), [4.8, -12, 0], 3, null, false);
    part(sword, G.box, silver, [0, -70, 0], [3, 106, 10]);
    part(sword, G.box, bladeGlow, [0, -66, 0], [3.8, 88, 3.4], null, false);
    part(sword, G.cone, silver, [0, -130, 0], [1.6, 14, 5], [Math.PI, 0, 0]);
    const tip = group(sword, [0, -136, 0]);
    const keySlot = group(sword, [6, -12, 0]);
    sword.visible = false; sword.userData.base = sword.scale.clone(); parts[0].push(sword);

    // [2] armor plates
    for (const z of [-17, 17]) add(2, torso, G.sphere, white, [14.5, 61, z], [16, 17, 21]);
    add(2, torso, G.box, gold, [30, 60, 0], [3, 12, 12], [Math.PI / 4, 0, 0]);
    add(2, torso, G.sphere, silver, [-2, 82, 0], [18, 8, 33]);
    add(2, torso, G.cyl, silver, [0, 4, 0], [20.5, 10, 31.5]);
    add(2, torso, G.box, gold, [22, 4, 0], [4, 11, 11]);
    for (const z of [-9, 9]) add(2, torso, G.sphere, gem, [21.5, 6, z], 2.6);
    for (const z of [-1, 1]) add(2, hip, G.box, white, [2, -12, z * 27], [12, 22, 5], [z * 0.15, 0, 0]);
    for (const [a, side] of [[armF, 1], [armB, -1]]) {
      add(2, a.ad, G.box, white, [0, 10, side * 6], [36, 14, 32], [side * 0.35, 0, 0]);
      add(2, a.ad, G.box, white, [0, 0, side * 13], [30, 9, 26], [side * 0.75, 0, 0]);
      add(2, a.ad, G.box, gold, [0, 13, side * 21], [9, 9, 3], [side * 0.35, 0, Math.PI / 4]);
      add(2, a.el, G.cyl, white, [0, -24, 0], [13.5, 22, 13.5]);
      add(2, a.el, new THREE.TorusGeometry(13.5, 1.6, 8, 24), gold, [0, -14, 0], null, [Math.PI / 2, 0, 0]);
    }
    for (const l of [legF, legB]) {
      add(2, l.hj, G.box, white, [15, -22, 0], [10, 30, 24]);
      add(2, l.kn, G.box, gold, [13, -1, 0], [8, 12, 18]);
      add(2, l.kn, G.box, white, [10, -21, 0], [12, 34, 25]);
      add(2, l.kn, G.box, white, [4, -32, 0], [24, 8, 25]);
      add(2, l.kn, G.box, gold, [25, -42, 0], [14, 10, 24]);
    }

    // [3] helmet: blue shell, silver faceplate, glowing visor, gold crest and swept fins
    add(3, head, G.box, blue, [1, 28, 0], [34, 48, 36], null, 40);
    add(3, head, G.box, silver, [18.5, 21, 0], [4, 30, 30], null, 40);
    add(3, head, G.box, visor, [20.7, 30, 0], [2.5, 8, 28], null, 40);
    for (const z of [-1, 1]) {
      add(3, head, G.box, gold, [20.7, 36, z * 7], [2, 4, 16], [z * 0.45, 0, 0], 40);
      add(3, head, G.box, gold, [6, 49, z * 13], [22, 4, 3], [z * 0.25, 0, 0.55], 40);
      add(3, head, G.box, white, [8, 14, z * 17.5], [18, 18, 4], null, 40);
      add(3, head, G.cyl, silver, [2, 28, z * 18.5], [7, 3, 7], [Math.PI / 2, 0, 0], 40);
    }
    for (const y of [13, 16]) add(3, head, G.box, std(0x111827, 0.5, 0.5), [20.8, y, 0], [1, 1.4, 12], null, 40);
    add(3, head, G.cone, gold, [12, 58, 0], [5, 28, 3], [0, 0, 0.35], 40);
    add(3, head, G.box, silver, [19, 46, 0], [3, 18, 8], null, 40);
    return { parts, sword, tip, keySlot, bladeGlow };
  }

  // White wolf armor (chapter 10), by stage like the dragon armor: [0] claw gauntlets, [1] the bodysuit (a recolor,
  // midnight blue), [2] white fur-trimmed plates, a shoulder mantle and a tail, [3] the wolf helm.
  const BEAST_SUITS = { wolf: new THREE.Color(0x16213a), lion: new THREE.Color(0x0c0a09), phoenix: new THREE.Color(0x3b0a0a) };
  // each beast armor is built in four stages like the dragon armor; add(stage, ...) makes a mesh that starts hidden
  // and flies in from outside as its stage locks on
  function armorAdder(parts) {
    return (i, parent, geo, mat, pos, scale, rot, fly = 26) => {
      const m = part(parent, geo, mat, pos, scale, rot, !!mat.isMeshStandardMaterial);
      m.visible = false;
      m.userData.base = m.scale.clone(); m.userData.basePos = m.position.clone();
      m.userData.fly = m.position.clone().normalize().multiplyScalar(fly);
      parts[i].push(m);
      return m;
    };
  }
  const POINT_X = [0, 0, -Math.PI / 2]; // a cylinder or cone laid along +x (forward)
  // a bushy chain of tail segments off the hips (swung in poseHero)
  function armorTail(add, hip, n, size, mats, tip) {
    const segs = [];
    let parent = group(hip, [-22, -4, 0]);
    for (let i = 0; i < n; i++) {
      const seg = group(parent, i ? [-14, 0, 0] : [0, 0, 0]);
      add(2, seg, G.sphere, mats[i % mats.length], [-8, 0, 0], [12, size(i), size(i)]);
      segs.push(seg); parent = seg;
    }
    tip(parent);
    return segs;
  }
  function buildBeastArmors(model) {
    return { wolf: buildWolfArmor(model), lion: buildLionArmor(model), phoenix: buildPhoenixArmor(model) };
  }
  function buildWolfArmor(model) {
    const white = std(0xf8fafc, 0.5, 0.12), fur = std(0xe2e8f0, 0.95, 0), silver = std(0xcbd5e1, 0.22, 0.85);
    const dark = std(0x0f172a, 0.4, 0.5), ice = glowMat(0x93c5fd, 0.95, false), clawMat = std(0xe0f2fe, 0.15, 0.9, { emissive: 0x60a5fa, emissiveIntensity: 0.6 });
    const { armF, armB, legF, legB, torso, head, hip } = model;
    const parts = [[], [], [], []], add = armorAdder(parts);
    // [0] gauntlets with three long claws past the knuckles
    const clawTips = [];
    for (const a of [armF, armB]) {
      add(0, a.el, G.cyl, white, [0, -26, 0], [13.8, 26, 13.8]);
      add(0, a.el, new THREE.TorusGeometry(13.8, 2, 8, 24), silver, [0, -14, 0], null, [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 5; i++) add(0, a.el, G.cone, fur, [-4 + (i % 2) * 6, -10, -10 + i * 5], [3.5, 12, 3.5], [0, 0, Math.PI * 0.85]); // fur cuff
      add(0, a.el, G.box, silver, [6, -44, 0], [6, 12, 20]); // knuckle plate
      for (const z of [-7, 0, 7]) {
        add(0, a.el, G.cone, clawMat, [8, -66, z], [2.4, 30, 3.2], [0, 0, Math.PI - 0.18]);
        add(0, a.el, G.box, ice, [7.6, -60, z], [0.8, 18, 0.8], [0, 0, -0.18]);
      }
      const tip = group(a.el, [12, -82, 0]); clawTips.push(tip);
    }
    // [2] plates: a broad white chest with an ice-blue moon gem, a fur mantle over the shoulders, pauldrons, belt,
    // thigh and shin guards, and a big bushy tail
    for (const z of [-17, 17]) add(2, torso, G.sphere, white, [14.5, 61, z], [16.5, 17.5, 21.5]);
    add(2, torso, G.sphere, ice, [30.5, 62, 0], [3, 7, 7]);
    add(2, torso, new THREE.TorusGeometry(7, 1.2, 8, 24, Math.PI * 1.3), silver, [30.6, 62, 0], null, [0, Math.PI / 2, 0.5]);
    for (const y of [22, 36]) add(2, torso, G.box, white, [21, y, 0], [5, 10, 26]);
    add(2, torso, G.cyl, silver, [0, 4, 0], [20.5, 10, 31.5]);
    add(2, torso, G.box, ice, [22, 4, 0], [2.5, 6, 10]);
    const R = mulberry(77);
    for (let i = 0; i < 26; i++) { // the fur mantle: white tufts all round the neck and over the shoulders
      const a = (i / 26) * TAU, r = 30 + R() * 6;
      add(2, torso, G.cone, i % 3 ? fur : white, [Math.cos(a) * r * 0.55 - 4, 84 + R() * 6, Math.sin(a) * r], [6 + R() * 3, 18 + R() * 10, 6], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]);
    }
    for (const [a, side] of [[armF, 1], [armB, -1]]) {
      add(2, a.ad, G.sphere, white, [0, 6, side * 4], [21, 15, 21]);
      add(2, a.ad, G.box, silver, [0, -2, side * 14], [26, 7, 22], [side * 0.6, 0, 0]);
      for (const dx of [-8, 0, 8]) add(2, a.ad, G.cone, fur, [dx, 18, side * 10], [5, 16, 5], [side * 0.35, 0, -dx * 0.03]);
    }
    for (const z of [-1, 1]) add(2, hip, G.box, white, [2, -12, z * 27], [12, 22, 5], [z * 0.15, 0, 0]);
    for (const l of [legF, legB]) {
      add(2, l.hj, G.box, white, [14, -22, 0], [9, 30, 24]);
      add(2, l.kn, G.sphere, silver, [12, -1, 0], [8, 9, 12]);
      add(2, l.kn, G.box, white, [10, -21, 0], [12, 34, 25]);
      add(2, l.kn, G.cone, fur, [4, -4, 0], [7, 14, 7], [0, 0, Math.PI * 0.8]);
      add(2, l.kn, G.box, silver, [25, -42, 0], [14, 9, 24]);
    }
    const tailSegs = armorTail(add, hip, 6, (i) => 8 + i * 0.8, [white, fur], (end) => add(2, end, G.cone, white, [-20, 0, 0], [8, 18, 8], [0, 0, Math.PI / 2]));
    // [3] the wolf helm: a rounded white wolf's head over Kane's own, a long tapered muzzle with bared fangs, a heavy
    // brow over blazing ice-blue eyes, tall ears, fur flaring at the cheeks, and a crest of fur down the back
    add(3, head, G.sphere, white, [1, 29, 0], [20, 24, 20], null, 40); // skull
    add(3, head, G.box, dark, [14, 24, 0], [10, 12, 22], null, 40); // the shadow of the face under the muzzle
    add(3, head, G.box, white, [15, 37, 0], [12, 7, 30], [0, 0, -0.12], 40); // brow
    add(3, head, G.taper, white, [26, 27, 0], [9.5, 24, 8.5], POINT_X, 40); // muzzle
    add(3, head, G.box, white, [24, 32, 0], [18, 3, 8], [0, 0, -0.18], 40); // bridge of the nose
    add(3, head, G.sphere, dark, [38.5, 28, 0], [3.4, 3, 4.2], null, 40); // nose
    add(3, head, G.taper, fur, [23, 16, 0], [6, 18, 5.5], POINT_X, 40); // lower jaw, open a little
    add(3, head, G.box, ice, [24, 21.5, 0], [12, 2, 6], null, 40); // the glow inside the mouth
    for (const z of [-1, 1]) {
      add(3, head, G.box, ice, [18.5, 32, z * 8], [2, 3, 7], [z * 0.4, 0, -0.1], 40); // eyes
      add(3, head, G.cone, white, [-2, 56, z * 10], [7, 22, 5], [z * 0.18, 0, -0.18], 40); // ears
      add(3, head, G.cone, ice, [-0.5, 54, z * 10.4], [3, 13, 2], [z * 0.18, 0, -0.18], 40);
      add(3, head, G.cone, white, [32, 22, z * 4], [1.6, 8, 1.6], POINT_DOWN, 40); // upper fangs
      add(3, head, G.cone, white, [28, 18, z * 3.5], [1.2, 5, 1.2], null, 40); // lower fangs
      for (let i = 0; i < 3; i++) add(3, head, G.cone, fur, [2 - i * 3, 22 - i * 5, z * (17 + i)], [5, 15, 5], [z * 1.3, 0, 0.5], 40); // cheek fur
      add(3, head, G.box, silver, [6, 12, z * 15], [16, 10, 3], null, 40); // jaw guards
    }
    add(3, head, G.box, silver, [6, 49, 0], [22, 3, 5], [0, 0, 0.12], 40);
    for (let i = 0; i < 6; i++) add(3, head, G.cone, fur, [-12 - i * 2, 46 - i * 6, 0], [5, 16, 7], [0, 0, 1.2 + i * 0.1], 40); // fur crest down the back
    return { parts, clawTips, tailSegs, trail: '#93c5fd' };
  }

  // Black lion armor: black plate with gold trim, heavy gold-knuckled fists with short claws, a shaggy bronze mane
  // over the shoulders, a tufted tail, and a black lion's-head helm framed by a great mane, with burning gold eyes.
  function buildLionArmor(model) {
    const black = std(0x1c1917, 0.35, 0.6), gold = std(0xd4a017, 0.22, 0.9), bronze = std(0x92400e, 0.5, 0.5);
    const mane = std(0x3a2a14, 0.95, 0), maneTip = std(0xb45309, 0.85, 0.1, { emissive: 0x78350f, emissiveIntensity: 0.25 });
    const eye = glowMat(0xfacc15, 0.95, false), clawMat = std(0xfde68a, 0.2, 0.9, { emissive: 0xd4a017, emissiveIntensity: 0.4 });
    const { armF, armB, legF, legB, torso, head, hip } = model;
    const parts = [[], [], [], []], add = armorAdder(parts), R = mulberry(91);
    // [0] gauntlets: black forearms, gold bands, a heavy gold knuckle-duster with three short claws
    const clawTips = [];
    for (const a of [armF, armB]) {
      add(0, a.el, G.cyl, black, [0, -26, 0], [14.5, 26, 14.5]);
      for (const y of [-16, -34]) add(0, a.el, new THREE.TorusGeometry(14.5, 2.2, 8, 24), gold, [0, y, 0], null, [Math.PI / 2, 0, 0]);
      add(0, a.el, G.sphere, gold, [2, -45, 0], [15, 14, 15]);
      add(0, a.el, G.box, gold, [9, -48, 0], [8, 14, 24]);
      for (const z of [-7, 0, 7]) add(0, a.el, G.cone, clawMat, [9, -60, z], [2.6, 16, 3.4], [0, 0, Math.PI - 0.2]);
      for (let i = 0; i < 4; i++) add(0, a.el, G.cone, mane, [-6, -8, -9 + i * 6], [4, 12, 4], [0, 0, Math.PI * 0.85]); // fur cuff
      const tip = group(a.el, [11, -70, 0]); clawTips.push(tip);
    }
    // [2] plates and the mane mantle
    for (const z of [-17, 17]) add(2, torso, G.sphere, black, [14.5, 61, z], [16.5, 17.5, 21.5]);
    add(2, torso, new THREE.TorusGeometry(8, 1.8, 8, 24), gold, [30.4, 60, 0], null, [0, Math.PI / 2, 0]); // the lion crest
    add(2, torso, G.sphere, gold, [30.5, 60, 0], [3, 6, 6]);
    for (const y of [22, 36]) add(2, torso, G.box, black, [21, y, 0], [5, 10, 26]);
    for (const y of [22, 36]) add(2, torso, G.box, gold, [23.6, y, 0], [1, 2, 22]);
    add(2, torso, G.cyl, gold, [0, 4, 0], [20.5, 10, 31.5]);
    add(2, torso, G.sphere, bronze, [21.5, 4, 0], [3, 5, 5]);
    for (let i = 0; i < 30; i++) { // a shaggy mane over the shoulders and down the chest
      const a = (i / 30) * TAU, r = 30 + R() * 8;
      add(2, torso, G.cone, R() < 0.3 ? maneTip : mane, [Math.cos(a) * r * 0.6 - 2, 82 + R() * 8, Math.sin(a) * r], [7 + R() * 3, 22 + R() * 12, 7], [Math.sin(a), 0, -Math.cos(a)]);
    }
    for (const [a, side] of [[armF, 1], [armB, -1]]) {
      add(2, a.ad, G.sphere, black, [0, 6, side * 4], [22, 16, 22]);
      add(2, a.ad, new THREE.TorusGeometry(19, 2.2, 8, 28, Math.PI), gold, [0, 2, side * 4]);
      add(2, a.ad, G.cone, gold, [0, 20, side * 12], [5, 12, 5], [side * 0.4, 0, 0]);
    }
    for (const z of [-1, 1]) add(2, hip, G.box, black, [2, -12, z * 27], [12, 22, 5], [z * 0.15, 0, 0]);
    for (const l of [legF, legB]) {
      add(2, l.hj, G.box, black, [14, -22, 0], [9, 30, 24]);
      add(2, l.kn, G.sphere, gold, [12, -1, 0], [8, 9, 12]);
      add(2, l.kn, G.box, black, [10, -21, 0], [12, 34, 25]);
      add(2, l.kn, G.box, gold, [16.5, -21, 0], [1, 26, 4]);
      add(2, l.kn, G.box, gold, [25, -42, 0], [14, 9, 24]);
    }
    const tailSegs = armorTail(add, hip, 7, () => 4, [black], (end) => { // a thin tail ending in a tuft
      add(2, end, G.sphere, mane, [-14, 0, 0], [10, 7, 7]);
      add(2, end, G.cone, maneTip, [-22, 0, 0], [5, 14, 5], [0, 0, Math.PI / 2]);
    });
    // [3] the lion helm
    add(3, head, G.sphere, black, [1, 29, 0], [20, 24, 20], null, 40);
    add(3, head, G.box, gold, [15, 38, 0], [12, 6, 30], [0, 0, -0.1], 40); // brow
    for (let i = 0; i < 5; i++) add(3, head, G.cone, gold, [8 - Math.abs(i - 2) * 2, 48, (i - 2) * 7], [2.5, i === 2 ? 14 : 9, 2.5], [0, 0, -0.1], 40); // crown
    add(3, head, G.taper, black, [22, 25, 0], [11, 16, 10], POINT_X, 40); // a short broad muzzle
    add(3, head, G.sphere, gold, [30.5, 27, 0], [4, 3.5, 6], null, 40); // nose
    add(3, head, G.box, eye, [24, 18.5, 0], [10, 2, 8], null, 40); // the glow in its open mouth
    for (const z of [-1, 1]) {
      add(3, head, G.box, eye, [18.5, 32, z * 8], [2, 3.4, 8], [z * 0.4, 0, -0.1], 40);
      add(3, head, G.sphere, black, [-4, 50, z * 13], [5, 6, 3.5], null, 40); // round ears
      add(3, head, G.cone, clawMat, [28, 19, z * 5], [1.6, 7, 1.6], POINT_DOWN, 40); // fangs
    }
    for (let i = 0; i < 26; i++) { // the great mane framing the helm
      const a = (i / 26) * TAU;
      add(3, head, G.cone, i % 3 ? mane : maneTip, [-6, 28 + Math.sin(a) * 26, Math.cos(a) * 28], [8, 22 + (i % 2) * 6, 8], [Math.PI / 2 - a, 0, 0.5], 40);
    }
    add(3, head, G.sphere, mane, [-10, 28, 0], [16, 28, 28], null, 40);
    return { parts, clawTips, tailSegs, trail: '#facc15' };
  }

  // Phoenix armor: crimson plate with gold feathering and a burning core, gold talons with flames at the wrists, a
  // pair of flame-tipped wings and a fan of tail feathers, and a beaked helm under a crest of fire. Its flames flicker
  // (poseHero runs model.flames).
  function buildPhoenixArmor(model) {
    const red = std(0xb91c1c, 0.4, 0.3, { emissive: 0x7f1d1d, emissiveIntensity: 0.35 }), gold = std(0xf59e0b, 0.22, 0.85);
    const orange = std(0xf97316, 0.45, 0.2, { emissive: 0xc2410c, emissiveIntensity: 0.45 }), dark = std(0x1c0a0a, 0.4, 0.5);
    const core = glowMat(0xfde047, 1, false), eye = glowMat(0xfde047, 0.95, false);
    const { armF, armB, legF, legB, torso, head, hip } = model;
    const parts = [[], [], [], []], add = armorAdder(parts), flames = [];
    const flame = (i, parent, pos, scale, rot, color = 0xff7a1a) => { const f = add(i, parent, G.cone, glowMat(color, 0.75), pos, scale, rot); flames.push(f); return f; };
    // [0] gauntlets: crimson, a gold band, three curved gold talons, flames licking up from the wrists
    const clawTips = [];
    for (const a of [armF, armB]) {
      add(0, a.el, G.cyl, red, [0, -26, 0], [13.8, 26, 13.8]);
      add(0, a.el, new THREE.TorusGeometry(13.8, 2, 8, 24), gold, [0, -36, 0], null, [Math.PI / 2, 0, 0]);
      for (const z of [-7, 0, 7]) add(0, a.el, G.cone, gold, [8, -64, z], [2.4, 26, 3], [0, 0, Math.PI - 0.32]);
      for (let i = 0; i < 3; i++) flame(0, a.el, [-4, -14 + i * 3, -6 + i * 6], [4, 18, 4], [0, 0, 0.5], i % 2 ? 0xfde047 : 0xff6a1a);
      const tip = group(a.el, [14, -80, 0]); clawTips.push(tip);
    }
    // [2] plates, feathering, wings and tail
    for (const z of [-17, 17]) add(2, torso, G.sphere, red, [14.5, 61, z], [16.5, 17.5, 21.5]);
    add(2, torso, G.sphere, core, [30.5, 62, 0], [4, 7, 7]); // the burning core
    add(2, torso, new THREE.TorusGeometry(8, 1.6, 8, 24), gold, [30.6, 62, 0], null, [0, Math.PI / 2, 0]);
    for (let i = 0; i < 5; i++) add(2, torso, G.cone, gold, [22, 44 - i * 6, -12 + i * 6], [3, 14, 2], [0, 0, Math.PI * 0.95]); // gold feathers down the chest
    add(2, torso, G.cyl, gold, [0, 4, 0], [20.5, 10, 31.5]);
    for (const [a, side] of [[armF, 1], [armB, -1]]) { // shoulder feathers, layered gold over red
      add(2, a.ad, G.sphere, red, [0, 6, side * 4], [21, 15, 21]);
      for (let i = 0; i < 4; i++) add(2, a.ad, G.cone, i % 2 ? gold : orange, [-6 + i * 4, -2, side * (14 + i)], [4, 22, 3], [side * (1.9 - i * 0.12), 0, -0.3 + i * 0.2]);
    }
    for (const side of [-1, 1]) { // the wings: a fan of feathers, burning at the tips
      const w = group(torso, [-22, 72, side * 18]); w.rotation.set(side * 0.55, 0, 0.35); w.scale.setScalar(1.45);
      for (let i = 0; i < 6; i++) {
        const a = -0.3 + i * 0.28, len = 60 - i * 5;
        add(2, w, G.cone, i < 2 ? gold : i < 4 ? orange : red, [-Math.sin(a) * len * 0.5, len * 0.5, side * Math.cos(a) * 10], [5, len, 3], [side * 0.2, 0, a]);
        flame(2, w, [-Math.sin(a) * len, len + 6, side * Math.cos(a) * 10], [5, 22, 4], [side * 0.2, 0, a], i % 2 ? 0xfde047 : 0xff6a1a);
      }
    }
    for (const z of [-1, 1]) add(2, hip, G.box, red, [2, -12, z * 27], [12, 22, 5], [z * 0.15, 0, 0]);
    for (const l of [legF, legB]) {
      add(2, l.hj, G.box, red, [14, -22, 0], [9, 30, 24]);
      add(2, l.kn, G.sphere, gold, [12, -1, 0], [8, 9, 12]);
      add(2, l.kn, G.box, red, [10, -21, 0], [12, 34, 25]);
      add(2, l.kn, G.cone, gold, [16, -14, 0], [3, 18, 3], [0, 0, Math.PI]);
      add(2, l.kn, G.box, gold, [25, -42, 0], [14, 9, 24]);
    }
    const tailSegs = armorTail(add, hip, 2, () => 7, [red], (end) => { // a short fan of long tail feathers
      for (let i = 0; i < 5; i++) {
        const z = (i - 2) * 6;
        add(2, end, G.cone, i % 2 ? gold : red, [-30, -4, z], [4, 44, 2], [z * 0.03, 0, Math.PI / 2 + 0.3]);
        flame(2, end, [-54, -12, z], [4, 16, 3], [z * 0.03, 0, Math.PI / 2 + 0.3], i % 2 ? 0xfde047 : 0xff6a1a);
      }
    });
    // [3] the phoenix helm
    add(3, head, G.sphere, red, [1, 29, 0], [20, 24, 20], null, 40);
    add(3, head, G.box, dark, [15, 26, 0], [10, 10, 24], null, 40); // the face in shadow under the beak
    add(3, head, G.cone, gold, [26, 30, 0], [6, 24, 7], POINT_X, 40); // the beak
    add(3, head, G.cone, gold, [35, 26, 0], [2.5, 8, 2.5], POINT_DOWN, 40); // its hooked tip
    add(3, head, G.box, gold, [15, 37, 0], [10, 4, 30], [0, 0, -0.15], 40); // brow
    for (const z of [-1, 1]) {
      add(3, head, G.box, eye, [19, 33, z * 8], [2, 3, 8], [z * 0.4, 0, -0.15], 40);
      add(3, head, G.cone, gold, [2, 22, z * 19], [3, 18, 3], [z * 1.4, 0, 0.6], 40); // cheek feathers
    }
    for (let i = 0; i < 6; i++) { // a crest of fire, swept back
      add(3, head, G.cone, i % 2 ? orange : gold, [-2 - i * 4, 52 - i * 3, 0], [4, 18 - i, 3], [0, 0, 0.7 + i * 0.12], 40);
      flame(3, head, [-6 - i * 4, 60 - i * 3, 0], [5, 26 - i * 2, 4], [0, 0, 0.8 + i * 0.12], i % 2 ? 0xfde047 : 0xff4500);
    }
    return { parts, clawTips, tailSegs, flames, trail: '#f97316' };
  }

  // ---------------------------------------------------------------- megazords
  // Same joint layout as the hero rig (so they share every pose and poseHero), built from heavy armor blocks.
  // A style picks the colors and the parts: what's on the chest, what's on the back, and the weapon.
  const ZORD_STYLES = {
    dragon: { plate: 0xeef0f4, trim: 0xd4a017, eye: 0x4ade80, blade: 0xffffff, trail: '#e5e7eb', chest: 'dragon', back: 'wings', weapon: 'sword' },
    dark: { plate: 0x7f1d1d, trim: 0x3f3f46, eye: 0xff2020, blade: 0xff2a2a, trail: '#ef4444', chest: 'dragon', back: 'wings', weapon: 'sword' },
    ultimate: { plate: 0xd4a017, trim: 0xb91c1c, eye: 0x22d3ee, blade: 0xfde047, trail: '#fde047', chest: 'dragon', back: 'wings', weapon: 'sword', metal: 0.85, scale: 1.15 },
    lion: { plate: 0x2a2b33, trim: 0xd4a017, eye: 0xfacc15, blade: 0xfde047, trail: '#fde047', chest: 'lion', back: 'cape', weapon: 'claws', rough: 0.55, mane: true },
    // chapter 9: the dragon and the lion as one, then the phoenix on top of that
    dragonlion: { plate: 0xeef0f4, trim: 0xd4a017, eye: 0xfacc15, blade: 0xfde047, trail: '#fde047', chest: 'lion', back: 'wings', weapon: 'sword', mane: true, scale: 1.1 },
    phoenix: { plate: 0xb91c1c, trim: 0xf59e0b, eye: 0xfde047, blade: 0xff7a1a, trail: '#fb923c', chest: 'lion', back: 'firewings', weapon: 'firesword', crest: true, scale: 1.2 },
    // vorath's legion
    ravager: { plate: 0x3f3f46, trim: 0xdc2626, eye: 0xff2020, blade: 0xff3b3b, trail: '#ef4444', chest: 'core', back: 'spikes', weapon: 'sword', horns: true },
    venom: { plate: 0x3b0764, trim: 0x84cc16, eye: 0xa3e635, blade: 0xa3e635, trail: '#a3e635', chest: 'core', back: 'spikes', weapon: 'sword', horns: true },
    frost: { plate: 0x1e3a5f, trim: 0x67e8f9, eye: 0x67e8f9, blade: 0xa5f3fc, trail: '#a5f3fc', chest: 'core', back: 'spikes', weapon: 'sword', horns: true },
    volt: { plate: 0x27272a, trim: 0xfacc15, eye: 0xfde047, blade: 0xfde047, trail: '#fde047', chest: 'core', back: 'spikes', weapon: 'sword', horns: true },
  };
  function buildZordModel(styleName = 'dragon') {
    const S = ZORD_STYLES[styleName];
    const black = std(0x15161b, 0.3, 0.75), white = std(S.plate, S.rough ?? 0.3, S.metal ?? 0.35), gold = std(S.trim, 0.25, 0.9);
    const silver = std(0xc3cad6, 0.18, 0.9), glove = std(0x111216, 0.35, 0.7);
    const eye = new THREE.MeshBasicMaterial({ color: S.eye, toneMapped: false });
    const red = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
    const flames = []; // flickering additive fire (phoenix wings, crest, sword)
    const flame = (parent, pos, scale, rot, color = 0xff7a1a) => { const f = part(parent, G.cone, glowMat(color, 0.75), pos, scale, rot, false); f.userData.base = f.scale.clone(); flames.push(f); return f; };
    const root = new THREE.Group(); scene.add(root);
    const yawG = group(root), poseG = group(yawG), rig = group(poseG);
    const hip = group(rig, [0, 96, 0]);
    part(hip, G.box, black, [0, -6, 0], [36, 30, 54]);
    for (const z of [-1, 1]) part(hip, G.box, white, [4, -16, z * 26], [26, 30, 6], [z * 0.12, 0, 0]);
    part(hip, G.box, gold, [20, -2, 0], [4, 16, 18]);
    const torso = group(hip);
    part(torso, G.box, black, [0, 16, 0], [34, 30, 50]);
    part(torso, G.box, white, [2, 52, 0], [44, 52, 78]);
    part(torso, G.box, black, [-4, 80, 0], [36, 12, 60]);
    for (const z of [-1, 1]) part(torso, G.box, gold, [25, 64, z * 24], [3, 6, 26], [z * 0.3, 0, 0]);
    const dh = group(torso, [26, 48, 0]);
    if (S.chest === 'lion') { // a lion's face on the chest, ringed by a mane
      part(dh, G.box, black, [6, 0, 0], [22, 30, 34]);
      part(dh, G.box, black, [18, -6, 0], [16, 16, 22]);
      part(dh, G.box, gold, [24, -1, 0], [3, 6, 10]);
      for (const z of [-1, 1]) { part(dh, G.box, eye, [15, 7, z * 9], [2, 4, 7], null, false); part(dh, G.cone, silver, [25, -15, z * 6], [1.8, 7, 1.8], [Math.PI, 0, 0]); }
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; part(dh, G.cone, gold, [-2, Math.sin(a) * 22, Math.cos(a) * 24], [5, 18, 5], [Math.PI / 2 - a, 0, 0.3]); }
    } else if (S.chest === 'core') { // a glowing reactor core in a spiked frame
      part(dh, G.box, black, [4, 0, 0], [16, 34, 40]);
      part(dh, G.sphere, eye, [14, 0, 0], 11, null, false);
      part(dh, new THREE.TorusGeometry(15, 3, 8, 24), gold, [14, 0, 0], null, [0, Math.PI / 2, 0]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; part(dh, G.cone, gold, [12, Math.sin(a) * 22, Math.cos(a) * 22], [3, 12, 3], [Math.PI / 2 - a, 0, 0]); }
    } else { // the dragon's head, mounted on the chest
      part(dh, G.box, black, [6, 0, 0], [22, 26, 30]);
      part(dh, G.box, black, [18, -6, 0], [18, 14, 22]);
      part(dh, G.box, white, [18, -15, 0], [16, 4, 20]);
      for (const z of [-1, 1]) {
        part(dh, G.box, red, [16, 6, z * 9], [2, 4, 6], null, false);
        part(dh, G.cone, gold, [-2, 14, z * 12], [4, 20, 4], [z * 0.5, 0, 0.9]);
      }
      for (const z of [-6, 0, 6]) part(dh, G.cone, white, [26, -11, z], [1.6, 6, 1.6], [Math.PI, 0, 0]);
    }
    // the back: folded dragon wings, a lion's mane cape, a row of spikes, or burning phoenix wings
    if (S.back === 'cape') for (let i = 0; i < 5; i++) part(torso, G.cone, i % 2 ? gold : black, [-26, 70 - i * 8, (i - 2) * 12], [8, 50, 8], [0, 0, 2.6]);
    else if (S.back === 'spikes') for (let i = 0; i < 5; i++) part(torso, G.cone, gold, [-24, 30 + i * 13, 0], [5, 26 - i * 2, 5], [0, 0, 1.9]);
    else if (S.back === 'firewings') {
      for (const z of [-1, 1]) {
        const w = group(torso, [-26, 70, z * 30]); w.rotation.set(z * 0.55, 0, 0.45);
        for (let i = 0; i < 5; i++) { // long red-gold feathers, each wrapped in fire
          const fz = z * (8 + i * 16), len = 120 - i * 14;
          part(w, G.cone, i % 2 ? gold : white, [-6 - i * 4, len / 2, fz], [7, len, 4], [z * (0.1 + i * 0.12), 0, 0.15]);
          flame(w, [-6 - i * 4, len * 0.7, fz], [10, len * 0.9, 6], [z * (0.1 + i * 0.12), 0, 0.15], i % 2 ? 0xfde047 : 0xff6a1a);
        }
      }
    } else for (const z of [-1, 1]) part(torso, G.box, black, [-30, 60, z * 26], [10, 90, 30], [z * 0.25, 0, 0.35]);
    part(torso, G.cyl, black, [2, 90, 0], [12, 14, 12]);

    const head = group(torso, [4, 92, 0]);
    part(head, G.box, black, [0, 20, 0], [30, 34, 30]);
    part(head, G.box, white, [15.5, 16, 0], [3, 18, 22]);
    part(head, G.box, eye, [17.2, 25, 0], [1.5, 5, 22], null, false);
    for (const z of [-1, 1]) {
      part(head, G.box, gold, [10, 38, z * 9], [22, 4, 3], [z * 0.25, 0, 0.6]);
      part(head, G.box, silver, [0, 22, z * 16], [16, 20, 3]);
      if (S.horns) part(head, G.cone, gold, [2, 40, z * 14], [4, 28, 4], [z * 0.6, 0, 0.5]);
    }
    part(head, G.cone, gold, [6, 44, 0], [4, 22, 3], [0, 0, 0.3]);
    if (S.mane) for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; part(head, G.cone, i % 2 ? gold : black, [-8, 20 + Math.sin(a) * 22, Math.cos(a) * 22], [5, 22, 5], [Math.PI / 2 - a, 0, 0.5]); }
    if (S.crest) for (let i = 0; i < 4; i++) flame(head, [-4 - i * 6, 46 + i * 2, 0], [5, 30 - i * 3, 3], [0, 0, 0.5 + i * 0.25], i % 2 ? 0xfde047 : 0xff6a1a); // a burning crest
    const tail = group(head); // unused, keeps poseHero happy

    const arm = (side) => {
      const sh = group(torso, [0, 66, side * 50]);
      const ad = group(sh);
      part(ad, G.box, white, [0, 6, side * 6], [42, 26, 38]);
      part(ad, G.box, gold, [0, 20, side * 6], [44, 4, 40]);
      part(ad, G.cone, gold, [0, 28, side * 14], [5, 22, 5], [side * 0.3, 0, 0]);
      part(ad, G.box, black, [0, -20, 0], [24, 36, 24]);
      const el = group(ad, [0, -38, 0]);
      part(el, G.sphere, gold, [0, 0, 0], 11);
      part(el, G.box, white, [0, -19, 0], [28, 36, 28]);
      part(el, G.box, black, [10, -19, 0], [6, 30, 22]);
      const fist = part(el, G.box, glove, [0, -44, 0], [26, 22, 26]);
      return { sh, ad, el, fist };
    };
    const leg = (side) => {
      const hj = group(hip, [0, 0, side * 18]);
      part(hj, G.box, black, [0, -23, 0], [30, 44, 30]);
      part(hj, G.box, white, [12, -22, 0], [8, 34, 26]);
      const kn = group(hj, [0, -46, 0]);
      part(kn, G.box, gold, [12, 0, 0], [10, 14, 22]);
      part(kn, G.box, white, [2, -20, 0], [32, 42, 32]);
      part(kn, G.box, black, [8, -44, 0], [50, 14, 34]);
      part(kn, G.box, gold, [32, -44, 0], [6, 10, 28]);
      return { hj, kn };
    };
    const armF = arm(1), armB = arm(-1), legF = leg(1), legB = leg(-1);

    const sword = group(armF.el, [0, -44, 0]); sword.rotation.z = 0.55;
    const bladeGlow = glowMat(S.blade, 0.6);
    let tip;
    if (S.weapon === 'claws') { // three golden claws off each fist instead of a sword
      for (const z of [-11, 0, 11]) part(sword, G.cone, gold, [0, -60, z], [5, 110, 5], [Math.PI, 0, 0]);
      part(sword, G.box, bladeGlow, [0, -56, 0], [4, 90, 4], null, false);
      tip = group(sword, [0, -116, 0]);
      for (const z of [-11, 0, 11]) part(armB.el, G.cone, gold, [0, -90, z], [4, 70, 4], [Math.PI, 0, 0]);
    } else { // a giant sword; the phoenix's burns along its whole length
      const fire = S.weapon === 'firesword';
      part(sword, G.cyl, std(0x1a1a22, 0.6), [0, 4, 0], [5, 40, 5]);
      part(sword, G.sphere, gold, [0, 26, 0], 7);
      part(sword, G.box, gold, [0, -18, 0], [14, 10, 64]);
      for (const z of [-1, 1]) part(sword, G.cone, gold, [0, -12, z * 34], [6, 22, 6], [z * 1.1, 0, 0]);
      part(sword, G.box, fire ? std(0xf97316, 0.3, 0.6, { emissive: 0xff4500, emissiveIntensity: 0.8 }) : silver, [0, -122, 0], [5, 196, 22]);
      part(sword, G.box, bladeGlow, [0, -116, 0], [6, 168, 6], null, false);
      part(sword, G.cone, silver, [0, -232, 0], [2.6, 26, 11], [Math.PI, 0, 0]);
      tip = group(sword, [0, -244, 0]);
      if (fire) for (let i = 0; i < 6; i++) flame(sword, [0, -40 - i * 32, 0], [9, 46, 9], [Math.PI, 0, 0], i % 2 ? 0xfde047 : 0xff6a1a);
    }
    sword.userData.base = sword.scale.clone();

    const dummy = std(0xffffff); // poseHero recolors skin/pants; the zord has none
    const model = {
      root, yawG, poseG, rig, hip, torso, head, tail, armF, armB, legF, legB, yaw: -YAW_TURN,
      M: { skin: dummy, pants: dummy, glove },
      armor: { parts: [[sword], [], [], []], sword, tip, keySlot: group(sword), bladeGlow },
      flames, scale: S.scale || 1, fireBlade: S.weapon === 'firesword',
    };
    model.orb = part(scene, G.sphere, glowMat(0x7dd3fc, 0.9), null, 1, null, false); model.orb.visible = false;
    model.reviveKey = new THREE.Group(); scene.add(model.reviveKey);
    model.bladeColor = S.blade; model.trailColor = S.trail;
    root.visible = false;
    return model;
  }

  // ---------------------------------------------------------------- giant dragon
  // A serpent: the head flies a scripted path (dragonHead) and the body segments follow its trail.
  const DRAGON_SEGS = 30;
  function buildDragonModel(dark = false) {
    const black = std(0x15161b, 0.3, 0.7), white = std(dark ? 0x7f1d1d : 0xeef0f4, 0.35, 0.3), gold = std(dark ? 0x3f3f46 : 0xd4a017, 0.25, 0.9);
    const eye = new THREE.MeshBasicMaterial({ color: dark ? 0xff2020 : 0xfacc15, toneMapped: false });
    const root = new THREE.Group(); scene.add(root); root.visible = false;
    const head = group(root); // faces +z (Object3D.lookAt)
    part(head, G.box, black, [0, 0, 0], [80, 64, 96]);
    part(head, G.box, black, [0, -6, 80], [56, 36, 90]);
    part(head, G.box, white, [0, -24, 70], [50, 10, 84]);
    const jaw = group(head, [0, -30, 30]);
    part(jaw, G.box, black, [0, -6, 46], [50, 12, 86]);
    for (let i = 0; i < 5; i++) for (const x of [-20, 20]) part(jaw, G.cone, white, [x, 6, 20 + i * 15], [3, 12, 3]);
    for (const x of [-1, 1]) {
      part(head, G.box, eye, [x * 34, 16, 40], [6, 10, 24], null, false);
      part(head, G.cone, gold, [x * 28, 44, -34], [9, 80, 9], [-1.1, 0, x * -0.35]);
      part(head, G.cone, gold, [x * 30, -10, 118], [2, 120, 2], [1.2, 0, x * 0.9]); // whiskers
      for (let i = 0; i < 3; i++) part(head, G.cone, white, [x * 36, 20 - i * 18, -40], [6, 34, 6], [-1.4, 0, x * 0.6]);
    }
    const segs = [];
    for (let i = 0; i < DRAGON_SEGS; i++) {
      const r = 46 * (1 - i / DRAGON_SEGS * 0.8);
      const seg = group(root);
      part(seg, G.sphere, black, [0, 0, 0], [r, r, r * 1.35]);
      part(seg, G.sphere, white, [0, -r * 0.45, 0], [r * 0.8, r * 0.55, r * 1.2]);
      part(seg, G.cone, i % 2 ? gold : white, [0, r * 1.05, 0], [r * 0.22, r * 0.9, r * 0.22], [-0.5, 0, 0]);
      if (i === 5 || i === 16) for (const x of [-1, 1]) { // legs with claws
        part(seg, G.cyl, black, [x * r * 0.9, -r * 0.9, 0], [8, r * 1.4, 8], [0.4, 0, x * 0.5]);
        for (const dz of [-8, 0, 8]) part(seg, G.cone, gold, [x * r * 1.3, -r * 1.6, dz + 10], [3, 14, 3], [1.6, 0, 0]);
      }
      if (i === DRAGON_SEGS - 1) part(seg, G.cone, gold, [0, 0, -r * 2], [r * 0.9, r * 3, r * 0.4], [-Math.PI / 2, 0, 0]);
      segs.push(seg);
    }
    return { root, head, jaw, segs, trail: [] };
  }

  // the giant monster's one-shot beam (unit cylinder along +y, stretched between two points)
  function buildSagaBeam(outer = 0xa855f7, mid = 0xe9d5ff) {
    const g = new THREE.Group(); scene.add(g); g.visible = false;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
    g.userData.outer = part(g, geo, glowMat(outer, 0.45), null, null, null, false);
    g.userData.mid = part(g, geo, glowMat(mid, 0.8), null, null, null, false);
    g.userData.core = part(g, geo, glowMat(0xffffff, 1, false), null, null, null, false);
    g.userData.hit = part(g, G.sphere, glowMat(mid, 0.8), null, 1, null, false);
    return g;
  }
  // stretch a beam from one world point to another; w = width multiplier
  function aimBeam(beam, from, to, w) {
    const dir = tmpV3.copy(to).sub(from), len = dir.length();
    beam.visible = true; beam.position.copy(from);
    beam.quaternion.setFromUnitVectors(UP, dir.normalize());
    const { outer, mid, core, hit } = beam.userData;
    outer.scale.set(70 * w, len, 70 * w); mid.scale.set(40 * w, len, 40 * w); core.scale.set(16 * w, len, 16 * w);
    hit.position.set(0, len, 0); hit.scale.setScalar(110 * w);
  }

  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  function poseHero(model, h) {
    const p = h.pose;
    model.root.visible = true;
    model.root.position.set(X(h.x), Y(h.y), 0);
    model.root.scale.setScalar(h.renderScale || 1);
    const target = h.face > 0 ? -YAW_TURN : Math.PI + YAW_TURN;
    model.yaw += angDiff(target, model.yaw) * 0.25;
    let spin = h.spin || 0;
    if (h.state === 'attack' && h.move === 'spinkick') { const m = HERO_MOVES.spinkick; spin = clamp(h.t / (m.wind + m.active), 0, 1) * TAU; }
    model.yawG.rotation.y = model.yaw + spin;

    const { poseG, rig } = model;
    poseG.position.set(0, 0, 0); poseG.rotation.set(0, 0, 0); rig.position.set(0, 0, 0);
    if (h.state === 'dodge') { poseG.position.y = 60; rig.position.y = -60; poseG.rotation.z = -(h.t / 22) * TAU; }
    let fallen = 0;
    if (h.state === 'dead') fallen = Math.min(1, h.deathT / 24);
    if (h.state === 'summon') fallen = 1 - ease(clamp(h.t / 30, 0, 1));
    if (h.isShadow && h.fallen) fallen = h.fallen;
    if (fallen) { poseG.rotation.z = Math.PI / 2 * fallen; poseG.position.set(-10 * fallen, 24 * fallen, 0); }
    if (h.state === 'armorup' && h.t > 6 && h.t < 46) poseG.position.y += Math.sin((h.t - 6) / 40 * Math.PI) * 18; // lifted by the light
    rig.scale.setScalar(1 + 0.32 * h.hulk + 0.12 * h.rageK);
    // armor stages: sword, bodysuit recolor, plates flying in, helmet
    const A = model.armor, BA = model.beastArmor, beastPart = (name) => (i) => (BA && h.beastPart ? h.beastPart(i, name) : 0);
    let beastSuit = 0, suitColor = SUIT, helm = 0;
    if (BA) for (const name of BEAST_ORDER) {
      const p = beastPart(name);
      if (p(1) > beastSuit) { beastSuit = p(1); suitColor = BEAST_SUITS[name]; }
      helm = Math.max(helm, p(3));
    }
    const suit = Math.max(h.armorPart(1), beastSuit);
    model.M.skin.color.copy(SKIN).lerp(beastSuit > 0 ? suitColor : SUIT, suit).lerp(HULK_SKIN, h.hulk * (1 - suit));
    model.M.skin.emissive.setRGB(0, 0.12 * h.hulk * (1 - suit), 0);
    model.M.pants.color.copy(PANTS).lerp(SUIT_DARK, suit);
    const showParts = (sets, progress) => sets.forEach((meshes, i) => {
      const f = progress(i), e = ease(f), pop = f < 1 ? e * (1 + Math.sin(f * Math.PI) * 0.3) : 1;
      for (const m of meshes) {
        m.visible = f > 0;
        if (!m.visible) continue;
        m.scale.copy(m.userData.base).multiplyScalar(pop);
        if (m.userData.basePos) m.position.copy(m.userData.basePos).addScaledVector(m.userData.fly, 1 - e);
      }
    });
    showParts(A.parts, (i) => h.armorPart(i));
    if (BA) for (const name of BEAST_ORDER) {
      showParts(BA[name].parts, beastPart(name));
      BA[name].tailSegs.forEach((seg, i) => { seg.rotation.z = (i ? 0.16 : 0.6) + Math.sin(game.time * 0.12 - i * 0.6) * 0.1; seg.rotation.y = Math.sin(game.time * 0.07 - i * 0.5) * 0.18; });
    }
    model.tail.visible = Math.max(h.armorPart(3), helm) < 0.5;
    if (model.headBase) for (const m of model.headBase) m.visible = helm < 0.5;
    const el = h.element && ELEMENTS[h.element];
    A.bladeGlow.color.set(el ? el.hex : model.bladeColor);
    A.bladeGlow.opacity = 0.45 + 0.25 * Math.sin(game.time * 0.2);
    model.M.glove.emissive.set(el ? el.hex : 0x000000).multiplyScalar(el ? 0.6 + 0.3 * Math.sin(game.time * 0.3) : 0);
    rig.visible = !(h.inv > 0 && h.state === 'hurt' && (h.inv >> 2) % 2);

    model.hip.position.y = 96 - p.bob;
    model.torso.rotation.z = -p.lean;
    model.head.rotation.z = -p.head;
    model.tail.rotation.y = Math.sin(game.time * 0.25) * 0.35;
    model.tail.rotation.z = -0.3 + Math.sin(game.time * 0.18) * 0.15;
    const setArm = (a, u, f, sign) => { a.sh.rotation.z = u + p.lean; a.ad.rotation.x = sign * p.adduct; a.el.rotation.z = f - u; };
    setArm(model.armF, p.fu, p.ff, 1);
    setArm(model.armB, p.bu, p.bf, -1);
    model.legF.hj.rotation.z = p.ft; model.legF.kn.rotation.z = p.fs - p.ft;
    model.legB.hj.rotation.z = p.bt; model.legB.kn.rotation.z = p.bs - p.bt;
    const astride = h.state === 'ride' ? 0.6 : 0; // legs out around the lion's back
    model.legF.hj.rotation.x = -astride; model.legB.hj.rotation.x = astride;

    // kamehameha energy ball between the hands
    model.root.updateMatrixWorld(true);
    const orbOn = h.orb > 0.02 && h.state === 'special';
    model.orb.visible = orbOn;
    if (orbOn) {
      model.armF.fist.getWorldPosition(tmpV); model.armB.fist.getWorldPosition(tmpV2);
      tmpV.add(tmpV2).multiplyScalar(0.5);
      const firing = h.special === 'kame' && h.t >= KAME_CHARGE;
      if (firing) tmpV.x += h.face * 18;
      model.orb.position.copy(tmpV);
      model.orb.scale.setScalar((10 + 26 * h.orb) * (1 + Math.sin(game.time * 0.8) * 0.08) * (firing ? 1.5 : 1));
    }

    // glowing trail off the sword tip while a slash is live
    if (A.sword.visible && ((h.state === 'attack' && h.t > HERO_MOVES[h.move].wind - 2 && h.t <= HERO_MOVES[h.move].wind + HERO_MOVES[h.move].active + 2 && h === game.hero) || (h.isShadow && h.slashing))) {
      A.tip.getWorldPosition(tmpV);
      const col = el ? el.color : model.trailColor;
      for (let i = 0; i < 3; i++) particles.push({ x: tmpV.x + W / 2 + rand(-4, 4), y: GROUND - tmpV.y + rand(-4, 4), z: tmpV.z, vx: 0, vy: 0, vz: 0, life: 10, max: 10, color: i ? col : '#ffffff', size: 6, g: 0 });
    }

    // light streaking off the beast armor's claws / fists / talons while a swipe is live
    const worn = BA && h.beast && BA[h.beast];
    if (worn && h.state === 'attack' && h === game.hero) {
      const m = HERO_MOVES[h.move];
      if (h.t > m.wind - 2 && h.t <= m.wind + m.active + 2) for (const tip of worn.clawTips) {
        tip.getWorldPosition(tmpV);
        for (let i = 0; i < 2; i++) particles.push({ x: tmpV.x + W / 2 + rand(-6, 6), y: GROUND - tmpV.y + rand(-6, 6), z: tmpV.z, vx: 0, vy: 0, vz: 0, life: 10, max: 10, color: i ? worn.trail : '#ffffff', size: 6, g: 0 });
      }
    }
    // phoenix fire: flickering wing and crest flames, and a sword that sheds sparks
    if (model.flames) for (const f of model.flames) { f.scale.set(f.userData.base.x, f.userData.base.y * (0.75 + Math.random() * 0.5), f.userData.base.z); f.material.opacity = 0.45 + Math.random() * 0.4; }
    if (model.fireBlade && A.sword.visible && game.time % 2 === 0) { A.tip.getWorldPosition(tmpV); particles.push({ x: tmpV.x + W / 2, y: GROUND - tmpV.y, z: tmpV.z, vx: rand(-1, 1), vy: -rand(1, 3), vz: 0, life: 18, max: 18, color: Math.random() < 0.5 ? '#ff7a1a' : '#fde047', size: 9, g: 0 }); }

    // the dragon key: floats above him, then flies into the sword's hilt
    const kt = h.state === 'armorup' ? h.t : -1, key = model.reviveKey;
    key.visible = kt >= 32 && kt < 58;
    if (key.visible) {
      A.keySlot.getWorldPosition(tmpV2);
      tmpV.set(X(h.x) + h.face * 30, Y(h.y) + 270, 30);
      if (kt >= 48) tmpV.lerp(tmpV2, ease(clamp((kt - 48) / 8, 0, 1)));
      key.position.copy(tmpV);
      key.rotation.set(0, kt < 48 ? game.time * 0.15 : 0, kt >= 48 ? -Math.PI / 2 * h.face : 0);
      key.scale.setScalar(kt < 36 ? (kt - 32) / 4 : kt >= 52 ? 0.7 : 1);
    }
  }

  // a floating dragon key: ring bow with a glowing gem, shaft and teeth, wrapped in a glow
  function buildKeyMesh(color) {
    const g = new THREE.Group();
    const metal = std(0xffffff, 0.25, 0.85, { color, emissive: color, emissiveIntensity: 0.45 });
    part(g, new THREE.TorusGeometry(10, 3, 10, 24), metal, [0, 18, 0], null, null, false);
    part(g, G.sphere, glowMat(0xffffff, 1, false), [0, 18, 0], 5, null, false);
    part(g, G.box, metal, [0, -6, 0], [4.5, 34, 4.5], null, false);
    part(g, G.box, metal, [5, -18, 0], [8, 4, 4], null, false);
    part(g, G.box, metal, [4, -11, 0], [6, 4, 4], null, false);
    g.userData.glow = part(g, G.sphere, glowMat(color, 0.35), [0, 6, 0], 30, null, false);
    g.userData.metal = metal;
    return g;
  }

  // ---------------------------------------------------------------- boss model
  // Hulking monster builds: digitigrade-ish legs, long gorilla arms, hunched armoured torso, fanged head.
  // Built in "model units" (~186 tall, ground at 0, facing +x) and scaled by the boss's k.
  const limbGeos = {};
  const taperGeo = (r1, r2, len) => limbGeos[`${r1}/${r2}/${len}`] || (limbGeos[`${r1}/${r2}/${len}`] = new THREE.CylinderGeometry(r1, r2, len, 16));
  const THIGH = 36, SHIN = 34, FOOT_DROP = 7, HUNCH = 0.3;
  const legHeight = (t, k) => THIGH * Math.cos(t) + SHIN * Math.cos(t + k) + FOOT_DROP;
  const POINT_FWD = [0, 0, -Math.PI / 2], POINT_DOWN = [Math.PI, 0, 0];

  function buildBossModel(level) {
    const L = LEVELS[level], pal = L.palette, imp = level === WOLF; // the shade imps: a little abyss king in green
    const look = level === NOX_GIANT ? 4 : Math.min(level, 3); // the giant rounds reuse the abyss king's frame
    const shell = std(pal.shell[0], 0.38, 0.55, { envMapIntensity: 0.6 });
    const plate = std(pal.shell[1], 0.32, 0.7, { envMapIntensity: 0.7 });
    const dark = std(pal.shell[2], 0.5, 0.6);
    const accent = std(pal.accent, 0.4, 0.5);
    const bone = std(0xe8e2d0, 0.45, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: pal.eye, toneMapped: false });
    const vein = glowMat(imp ? pal.eye : look === 2 ? 0xff4a10 : look >= 3 ? 0xe879f9 : pal.eye, 0.95, false);
    const root = new THREE.Group(); scene.add(root);
    const yawG = group(root), tiltG = group(yawG, [0, 93, 0]), body = group(tiltG, [0, -93, 0]);

    // hips + legs
    const pelvis = group(body, [0, 69, 0]);
    part(pelvis, G.sphere, dark, [0, 0, 0], [24, 16, 32]);
    part(pelvis, G.box, plate, [14, -6, 0], [10, 22, 28], [0, 0, 0.2]);
    part(pelvis, new THREE.TorusGeometry(1, 0.08, 8, 32), accent, [0, 4, 0], [26, 33, 26], [Math.PI / 2, 0, 0]);
    const leg = (side) => {
      const hip = group(pelvis, [0, -2, side * 22]);
      part(hip, G.sphere, plate, [0, 0, 0], 14);
      part(hip, taperGeo(14, 10, THIGH), shell, [0, -THIGH / 2, 0]);
      part(hip, G.sphere, shell, [4, -14, 0], [14, 19, 14]);
      const knee = group(hip, [0, -THIGH, 0]);
      part(knee, G.sphere, plate, [3, 0, 0], 11);
      part(knee, G.cone, accent, [13, 2, 0], [5, 13, 5], POINT_FWD);
      part(knee, taperGeo(11, 8, SHIN), shell, [0, -SHIN / 2, 0]);
      part(knee, G.box, plate, [7, -15, 0], [6, 24, 14]);
      const ankle = group(knee, [0, -SHIN, 0]);
      part(ankle, G.box, dark, [9, -1, 0], [40, 12, 28]);
      part(ankle, G.box, dark, [-10, -1, 0], [12, 10, 18]);
      for (const tz of [-9, 0, 9]) part(ankle, G.cone, bone, [31, -3, tz], [4, 11, 4], POINT_FWD);
      return { hip, knee, ankle };
    };
    const legs = [leg(1), leg(-1)];

    // hunched torso
    const torso = group(pelvis, [0, 4, 0]);
    part(torso, G.sphere, shell, [4, 20, 0], [26, 24, 32]);
    part(torso, G.sphere, shell, [2, 52, 0], [32, 34, 46]);
    part(torso, G.sphere, plate, [16, 56, 0], [20, 26, 38]);
    part(torso, G.sphere, dark, [-14, 70, 0], [24, 20, 40]);
    for (const y of [12, 22, 32]) for (const z of [-8, 8]) part(torso, G.box, plate, [27 - y * 0.08, y, z], [5, 7, 12]);
    const spikes = [4, 5, 7, 8, 9][look], spikeSize = [8, 10, 14, 15, 17][look];
    for (let i = 0; i < spikes; i++) {
      const a = i / Math.max(1, spikes - 1);
      part(torso, G.cone, look === 2 ? dark : accent, [-30 + a * 6, 38 + a * 48, 0], [spikeSize * 0.45, spikeSize * (1.2 + Math.sin(a * Math.PI) * 0.6), spikeSize * 0.45], [0, 0, 1.1 - a * 0.6]);
    }
    const core = part(torso, G.sphere, eyeMat, [35, 50, 0], 7, null, false);
    const coreRing = part(torso, new THREE.TorusGeometry(12, 2, 8, 32), eyeMat, [35.5, 50, 0], null, [0, Math.PI / 2, 0], false);

    // head: low and forward, heavy brow, fanged jaw, horns
    const head = group(torso, [24, 78, 0]);
    part(head, G.sphere, shell, [4, 6, 0], [21, 17, 22]);
    part(head, G.box, plate, [13, 11, 0], [16, 8, 30], [0, 0, -0.15]);
    for (const z of [-1, 1]) part(head, G.box, eyeMat, [22.5, 6, z * 8], [3, 4, 9], [z * 0.4, 0, 0], false);
    const jaw = group(head, [6, -4, 0]);
    part(jaw, G.box, dark, [9, -4, 0], [24, 9, 26]);
    part(jaw, G.box, vein, [20, 0.5, 0], [2, 3, 18], null, false);
    for (const z of [-9, -3, 3, 9]) part(jaw, G.cone, bone, [19, 3, z], [2.2, 8, 2.2]);
    for (const z of [-7, 7]) part(head, G.cone, bone, [24, -1, z], [2, 7, 2], POINT_DOWN);
    const bigHorns = look >= 2;
    for (const z of [-1, 1]) {
      part(head, G.cone, bone, [-2, 20, z * 14], bigHorns ? [9, 50, 9] : look === 1 ? [6, 30, 6] : [5, 20, 5], [z * 0.55, 0, bigHorns ? 0.55 : 0.35]);
    }

    // long gorilla arms ending in spiked fists
    const arm = (side) => {
      const sh = group(torso, [0, 66, side * 50]);
      const ua = group(sh); ua.rotation.x = -side * 0.12;
      part(ua, G.sphere, plate, [0, 4, side * 3], [22, 20, 23]);
      if (look >= 1) for (const [dx, dz] of [[-6, 0], [6, 0], [0, side * 10]]) part(ua, G.cone, accent, [dx, 22, dz], [4, look >= 2 ? 16 : 12, 4], [side * 0.25, 0, 0]);
      part(ua, taperGeo(12, 10, 40), shell, [0, -20, 0]);
      part(ua, G.sphere, shell, [4, -16, 0], [13, 17, 13]);
      const el = group(ua, [0, -40, 0]);
      part(el, G.sphere, plate, [0, 0, 0], 11);
      part(el, taperGeo(12, 15, 38), shell, [0, -19, 0]);
      part(el, G.box, plate, [8, -20, 0], [8, 28, 20]);
      part(el, new THREE.TorusGeometry(15, 2.2, 8, 24), accent, [0, -38, 0], null, [Math.PI / 2, 0, 0]);
      const fist = group(el, [0, -46, 0]);
      part(fist, G.box, dark, [0, -2, 0], [27, 24, 27]);
      for (const fx of [-7, 7]) for (const fz of [-7, 7]) part(fist, G.cone, bone, [fx, -17, fz], [3, 10, 3], POINT_DOWN);
      return { sh, el };
    };
    const arms = [arm(1), arm(-1)];

    // per-look extras
    let tail = null;
    if (look === 0) { // junk brute: exhaust stacks and rust
      for (const z of [-12, 12]) {
        part(torso, G.cyl, dark, [-30, 82, z], [4, 30, 4], [0, 0, 0.5]);
        part(torso, G.cyl, accent, [-37, 95, z], [5, 3, 5], [0, 0, 0.5]);
      }
      for (const [x, y, z, r] of [[26, 40, -20, 5], [10, 70, 30, 6], [20, 22, 16, 4], [-6, 30, -28, 5]]) part(torso, G.sphere, accent, [x, y, z], r);
    }
    if (look === 1 || look === 2 || look === 4) { // shoulder cannon on the far shoulder
      part(torso, G.cyl, dark, [2, 86, -54], [8, 40, 8], [0, 0, Math.PI / 2]);
      part(torso, G.cyl, accent, [23, 86, -54], [8.5, 3, 8.5], [0, 0, Math.PI / 2]);
    }
    if (look >= 2) { // glowing veins + tail
      for (const [x, y, z, a] of [[30, 64, -14, 0.5], [30, 48, 18, -0.4], [28, 30, -10, 0.3], [-20, 58, 30, 0.2], [-20, 58, -30, -0.2]]) part(torso, G.box, vein, [x, y, z], [2, 16, 2.5], [a, 0, 0], false);
      for (const a of arms) part(a.el, G.box, vein, [12.5, -18, 0], [1.5, 24, 3], null, false);
      tail = [];
      let parent = group(pelvis, [-20, -4, 0]);
      for (let i = 0; i < 7; i++) {
        const seg = group(parent, i ? [-13, 0, 0] : [0, 0, 0]);
        const r = 10 - i * 1.2;
        part(seg, G.sphere, i % 2 ? dark : shell, [-7, 0, 0], [9, r, r]);
        part(seg, G.cone, dark, [-6, r, 0], [2.5, 7, 2.5], [0, 0, 0.6]);
        tail.push(seg); parent = seg;
      }
      part(parent, G.cone, accent, [-18, 0, 0], [5, 16, 5], [0, 0, Math.PI / 2]);
    }
    if (look === 4) for (let i = 0; i < 7; i++) part(head, G.cone, accent, [-2, 30, -18 + i * 6], [2.5, i === 3 ? 20 : 12, 2.5], [0, 0, 0.2]); // the titan's crown
    if (look >= 3) { // abyss king: bat wings, a second pair of horns, crown spikes
      const membrane = new THREE.MeshStandardMaterial({ color: imp ? 0x0f2418 : 0x2a0f45, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide, transparent: true, opacity: 0.92, emissive: imp ? 0x14532d : 0x3b0764, emissiveIntensity: 0.35 });
      const wings = [];
      for (const side of [-1, 1]) {
        const wing = group(torso, [-24, 74, side * 26]);
        wing.rotation.set(side * 0.5, 0, 0.5);
        for (let i = 0; i < 4; i++) {
          const a = -0.2 + i * 0.42, len = 90 - i * 12;
          part(wing, G.cyl, dark, [Math.sin(a) * len / 2 * -0.4, len / 2, side * Math.cos(a) * len * 0.45], [3, len, 3], [side * -(0.9 - i * 0.35), 0, 0]);
        }
        const mem = part(wing, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI), membrane, [-4, 40, side * 34], [4, 48, 46], [0, side > 0 ? 0 : Math.PI, 0], false);
        mem.castShadow = true;
        part(wing, G.cone, bone, [0, 92, side * 6], [4, 16, 4]);
        wings.push(wing);
      }
      body.userData.wings = wings;
      for (const z of [-1, 1]) part(head, G.cone, bone, [6, 16, z * 20], [4, 22, 4], [z * 1.0, 0, -0.2]);
      for (let i = 0; i < 5; i++) part(head, G.cone, accent, [-4 + i * 2.5, 24, -10 + i * 5], [2, 10, 2], [0, 0, 0.3]);
    }
    return { root, yawG, tiltG, body, pelvis, torso, head, jaw, legs, arms, tail, wings: body.userData.wings || null, mats: [shell, plate], vein, eyeMat, core, coreRing, pal, yaw: Math.PI + YAW_TURN };
  }

  const RED = new THREE.Color(0xff2020), WHITE = new THREE.Color(0xffffff);
  function poseBoss(model, b, heroModel) {
    const dead = b.state === 'dying' && b.deathT > 115;
    model.root.visible = !dead;
    if (dead) return;
    const lying = b.tilt > 0.01;
    model.root.position.set(X(b.x), Y(b.y) + (b.onGround && !lying ? b.bob * 0.25 : 0), 0);
    if (b.state === 'dying' || b.state === 'shocked') model.root.position.add(tmpV.set(rand(-3, 3), rand(-3, 3), rand(-3, 3)));
    model.root.scale.setScalar(b.k * (b.grow || 1));
    if (b.state === 'grabbed' && heroModel) model.yaw = heroModel.yawG.rotation.y + Math.PI / 2;
    else if (b.state === 'tornado') model.yaw += 0.35;
    else {
      const turn = lying ? 0 : YAW_TURN;
      const target = b.face > 0 ? -turn : Math.PI + turn;
      model.yaw += angDiff(target, model.yaw) * (lying ? 1 : 0.2);
    }
    model.yawG.rotation.y = model.yaw;
    let wob = 0;
    if (b.state === 'stagger') wob = Math.sin(b.t * 0.5) * 0.06;
    if (b.state === 'dying') wob = Math.sin(b.deathT * 0.9) * 0.06;
    model.tiltG.rotation.z = (b.tilt || 0) + wob;

    // torso hunch: rears up to roar, lunges low to dash
    const roaring = b.state === 'intro' && b.t > 20 && b.t < 60;
    let hunch = HUNCH, headBack = 0, jawOpen = 0.1 + Math.sin(game.time * 0.07) * 0.05;
    if (roaring || b.state === 'gloat') { hunch = -0.05; headBack = 0.45; jawOpen = 0.6; }
    else if (b.state === 'dash' && b.vx !== 0 && Math.abs(b.vx) > 3) { hunch = 0.6; jawOpen = 0.4; }
    else if (b.state === 'stagger' || b.state === 'down' || b.state === 'grabbed') { jawOpen = 0.5; headBack = 0.2; }
    else if (b.telegraph) jawOpen = 0.35;
    model.torso.rotation.z = -hunch;
    model.head.rotation.z = headBack - hunch * 0.6;
    model.jaw.rotation.z = -jawOpen;

    // arms swing from the shoulder; the elbow cocks on the wind-up and locks out on the punch
    const elbowFor = (r) => (r >= 0 ? 0.35 + r * 0.9 : Math.max(0.06, 0.35 + r * 0.25));
    const [fa, ba] = model.arms;
    fa.sh.rotation.z = -b.armRot + hunch + 0.12; fa.el.rotation.z = elbowFor(b.armRot);
    ba.sh.rotation.z = -b.backArmRot + hunch + 0.12; ba.el.rotation.z = elbowFor(b.backArmRot);

    // legs: fighting stance, walk cycle, crouch, jump tuck, flailing when helpless
    let tA = 0.55, kA = -0.75, tB = 0.05, kB = -0.5;
    const moving = Math.abs(b.vx) > 0.5 && b.onGround && !lying;
    if (lying || b.state === 'grabbed') {
      const f = game.time * 0.35;
      tA = 0.6 + Math.sin(f) * 0.5; kA = -0.9 + Math.cos(f) * 0.4; tB = 0.6 - Math.sin(f) * 0.5; kB = -0.9 - Math.cos(f) * 0.4;
    } else if (!b.onGround) { tA = tB = 1.0; kA = kB = -1.6; }
    else if (moving) {
      const ph = b.step * 3, amp = b.state === 'dash' ? 0.8 : 0.5;
      tA = 0.3 + Math.sin(ph) * amp; tB = 0.3 - Math.sin(ph) * amp;
      kA = -0.6 - Math.max(0, Math.cos(ph)) * 0.9; kB = -0.6 - Math.max(0, -Math.cos(ph)) * 0.9;
    }
    const crouch = (b.state === 'slam' && b.onGround) || b.state === 'stagger' || (b.state === 'shove' && b.t < 12) || (b.state === 'punch' && b.telegraph);
    if (crouch && !moving && !lying) { tA += 0.35; kA -= 0.7; tB += 0.35; kB -= 0.7; }
    const [la, lb] = model.legs;
    la.hip.rotation.z = tA; la.knee.rotation.z = kA; la.ankle.rotation.z = -(tA + kA);
    lb.hip.rotation.z = tB; lb.knee.rotation.z = kB; lb.ankle.rotation.z = -(tB + kB);
    model.pelvis.position.y = Math.max(legHeight(tA, kA), legHeight(tB, kB));
    if (model.wings) model.wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * (0.5 + Math.sin(game.time * 0.12) * 0.25); });
    if (model.tail) model.tail.forEach((seg, i) => { seg.rotation.z = (i ? 0.18 : 0.5) + Math.sin(game.time * 0.09 - i * 0.7) * 0.12; seg.rotation.y = Math.sin(game.time * 0.05 - i * 0.5) * 0.12; });

    for (const m of model.mats) {
      const em = m.emissive;
      if (b.flashT > 0) em.copy(WHITE).multiplyScalar(0.9 * b.flashT / 6);
      else if (b.telegraph && game.time % 10 < 5) em.copy(RED).multiplyScalar(0.45);
      else if (b.enraged) em.copy(RED).multiplyScalar(0.12 + 0.1 * Math.sin(game.time * 0.3));
      else em.setRGB(0, 0, 0);
    }
    const eyeGlow = b.telegraph || b.enraged || b.state === 'intro' || b.state === 'shocked';
    model.eyeMat.color.set(eyeGlow && game.time % 6 < 3 ? '#ffffff' : model.pal.eye);
    model.vein.opacity = 0.7 + 0.3 * Math.sin(game.time * 0.12);
    model.core.scale.setScalar(7 * (1 + Math.sin(game.time * 0.15) * 0.15));
    model.coreRing.rotation.x = game.time * 0.05;
  }

  // ---------------------------------------------------------------- the black lion
  // A lion spirit in the shape of a real big cat, ~100 units at the shoulder, facing +x: deep chest, tucked waist,
  // hocked back legs, a broad muzzle, a heavy layered mane, and a flickering spirit aura. Its pose (LION_KEYS)
  // comes from whoever owns it this frame: the ride, a cutscene, the summon, or the chapter 8 boss. Colors blend
  // to the corrupted lion (corrupt 0..1), and it can fade out (the spirit leaving or returning to Kane).
  function buildLionModel() {
    const mk = (a, b, rough, metal) => { const m = std(a, rough, metal, { transparent: true }); m.userData.a = new THREE.Color(a); m.userData.b = new THREE.Color(b); return m; };
    const fur = mk(0x2b2621, 0x140707, 0.85, 0.05), pale = mk(0x4a4038, 0x1f0a0a, 0.85, 0.05);
    const mane = mk(0x17120e, 0x2a0505, 0.95, 0.02), maneTip = mk(0x6b4a1f, 0x7f1d1d, 0.9, 0.05);
    const dark = mk(0x0b0908, 0x050202, 0.6, 0.1), claw = mk(0xe8e2d0, 0x1c1917, 0.4, 0.3);
    maneTip.userData.glow = 0.18; // the mane's bronze tips catch the light even in the dark
    const eye = new THREE.MeshBasicMaterial({ color: 0xfacc15, toneMapped: false, transparent: true });
    const root = new THREE.Group(); scene.add(root); root.visible = false;
    const yawG = group(root), fallG = group(yawG), pitchG = group(fallG, [-44, 62, 0]), body = group(pitchG, [44, -62, 0]);
    // torso: deep chest and shoulders, a long back, tucked belly, rounded haunch
    part(body, G.sphere, fur, [36, 74, 0], [40, 36, 30]);
    part(body, G.sphere, fur, [44, 90, 0], [22, 16, 22]); // shoulder blades
    part(body, G.sphere, fur, [0, 77, 0], [46, 25, 25]);
    part(body, G.sphere, fur, [-40, 74, 0], [34, 32, 27]);
    part(body, G.sphere, pale, [10, 58, 0], [42, 13, 19]);
    const saddle = group(body, [-4, 100, 0]);
    const paw = (parent, pos) => {
      part(parent, G.sphere, fur, pos, [13, 7, 11]);
      for (const cz of [-5, 0, 5]) {
        part(parent, G.sphere, fur, [pos[0] + 9, pos[1] - 1, cz], [5, 5, 4.5]);
        part(parent, G.cone, claw, [pos[0] + 14, pos[1] - 3, cz], [1.6, 6, 1.6], POINT_FWD);
      }
    };
    const frontLeg = (z) => {
      const up = group(body, [42, 70, z]);
      part(up, G.sphere, fur, [0, -4, 0], [17, 24, 13]);
      part(up, capsule(10, 24), fur, [0, -22, 0]);
      const lo = group(up, [0, -40, 0]);
      part(lo, capsule(8, 18), fur, [0, -10, 0]);
      paw(lo, [5, -24, 0]);
      return { up, lo };
    };
    const backLeg = (z) => { // a big thigh, then the backward hock a cat stands on
      const up = group(body, [-42, 72, z]);
      part(up, G.sphere, fur, [2, -8, 0], [22, 28, 15]);
      part(up, capsule(11, 20), fur, [4, -22, 0]);
      const lo = group(up, [6, -38, 0]);
      const shin = group(lo); shin.rotation.z = -0.5;
      part(shin, capsule(8, 12), fur, [0, -9, 0]);
      const hock = group(lo, [-8, -16, 0]);
      part(hock, capsule(6, 10), fur, [2, -8, 0], null, [0, 0, 0.2]);
      paw(hock, [5, -17, 0]);
      return { up, lo };
    };
    const legs = [frontLeg(14), frontLeg(-14), backLeg(13), backLeg(-13)]; // front near, front far, back near, back far
    part(body, G.sphere, fur, [58, 92, 0], [26, 26, 22]); // neck
    // the head: rounded skull, heavy brow, broad muzzle with whisker pads, a dark nose, small round ears
    const head = group(body, [80, 104, 0]);
    part(head, G.sphere, fur, [0, 2, 0], [21, 19, 19]);
    part(head, G.sphere, fur, [8, 10, 0], [14, 8, 18]);
    part(head, G.sphere, fur, [20, 2, 0], [13, 7, 9]); // bridge of the nose
    part(head, G.sphere, pale, [18, -6, 0], [16, 11, 14]);
    for (const z of [-1, 1]) {
      part(head, G.sphere, pale, [23, -8, z * 6], [9, 8, 7]);
      part(head, G.box, eye, [14, 5, z * 8.5], [3, 2.2, 5], [z * 0.25, 0, -0.2], false);
      part(head, G.sphere, fur, [-6, 18, z * 11], [5, 7, 4]);
      part(head, G.sphere, dark, [-4, 18, z * 11.5], [3, 5, 2]);
      part(head, G.cone, claw, [27, -13, z * 5], [1.8, 7, 1.8], POINT_DOWN); // fangs
    }
    part(head, G.sphere, dark, [31, -2, 0], [5, 4, 7]);
    const jaw = group(head, [10, -12, 0]);
    part(jaw, G.sphere, pale, [10, -2, 0], [14, 5, 10]);
    for (const z of [-1, 1]) part(jaw, G.cone, claw, [18, 2, z * 5], [1.6, 6, 1.6]);
    // the mane: a big rounded mass of overlapping fur clumps (fullest just behind the head, thinning down the
    // neck), some bronze-tipped, with a short shaggy fringe framing the face
    const maneG = group(head, [-4, -2, 0]), R = mulberry(41);
    part(maneG, G.sphere, mane, [-16, -2, 0], [32, 38, 40]);
    for (let i = 0; i < 54; i++) {
      const a = R() * TAU, x = -2 - R() * 36, r = 28 + 8 * Math.sin(-x / 38 * Math.PI) + R() * 4;
      part(maneG, G.sphere, R() < 0.25 ? maneTip : mane, [x, Math.sin(a) * r * 0.92, Math.cos(a) * r], [8 + R() * 5, 13 + R() * 7, 9], [Math.PI / 2 - a, 0, 0.5 + R() * 0.4]);
    }
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU;
      part(maneG, G.cone, i % 4 ? mane : maneTip, [0, Math.sin(a) * 30, Math.cos(a) * 32], [6, 15, 6], [Math.PI / 2 - a, 0, 0.6]);
    }
    for (let i = 0; i < 7; i++) { // shaggy chest mane hanging under the throat
      const z = (i - 3) * 6;
      part(body, G.cone, i % 3 ? mane : maneTip, [62 - Math.abs(z) * 0.3, 68, z], [8, 34, 8], [Math.PI + z * 0.02, 0, -0.35]);
    }
    for (let i = 0; i < 6; i++) part(body, G.cone, i % 2 ? mane : maneTip, [48 - i * 6, 100, (i % 3 - 1) * 10], [8, 28, 8], [0, 0, 1.1]); // swept over the shoulders
    const tail = [];
    let parent = group(body, [-72, 84, 0]);
    for (let i = 0; i < 7; i++) {
      const seg = group(parent, i ? [-12, 0, 0] : [0, 0, 0]);
      part(seg, G.sphere, fur, [-6, 0, 0], [8, 3.6 - i * 0.2, 3.6 - i * 0.2]);
      tail.push(seg); parent = seg;
    }
    part(parent, G.sphere, mane, [-14, 0, 0], [9, 6, 6]);
    part(parent, G.cone, maneTip, [-20, 0, 0], [4, 12, 4], [0, 0, Math.PI / 2]);
    // the spirit aura: soft additive shells around the body and mane, violet (crimson once corrupted)
    const aura = [];
    for (const [pos, s] of [[[6, 80, 0], [118, 62, 50]], [[72, 104, 0], [60, 58, 58]]]) {
      const m = glowMat(0x8b5cf6, 0.12); m.userData.a = new THREE.Color(0x8b5cf6); m.userData.b = new THREE.Color(0xdc2626);
      aura.push(part(body, G.sphere, m, pos, s, null, false));
    }
    return { root, yawG, fallG, pitchG, body, legs, head, jaw, tail, saddle, eye, aura, mats: [fur, pale, mane, maneTip, dark, claw], yaw: -YAW_TURN };
  }

  const GOLD_EYE = new THREE.Color(0xfacc15), RED_EYE = new THREE.Color(0xff2020), SPIRIT_GLOW = new THREE.Color(0xfde68a), tmpC = new THREE.Color();
  // e: anything with x, y, face, lp, and optionally corrupt, fade, tilt, flashT, telegraph
  function poseLion(model, e, scale) {
    const lp = e.lp, fade = e.fade ?? 1, corrupt = e.corrupt || 0;
    model.root.visible = fade > 0.01;
    if (!model.root.visible) return;
    model.root.position.set(X(e.x), Y(e.y), 0);
    model.root.scale.setScalar(scale);
    model.root.rotation.z = (e.tilt || 0) * -e.face;
    const target = e.face > 0 ? -YAW_TURN * 0.6 : Math.PI + YAW_TURN * 0.6;
    model.yaw += angDiff(target, model.yaw) * 0.2;
    model.yawG.rotation.y = model.yaw;
    model.fallG.rotation.x = -Math.PI / 2 * lp.fallen;
    model.fallG.position.set(0, 32 * lp.fallen, 62 * lp.fallen);
    const sp = Math.min(1.4, lp.speed), ph = lp.step;
    const pitch = lp.rear * 0.95 + lp.leap * 0.12;
    model.pitchG.rotation.z = pitch;
    model.pitchG.position.y = 62 - 22 * lp.crouch + Math.abs(Math.sin(ph)) * 6 * sp;
    const offs = [0, Math.PI, 0.7, 0.7 + Math.PI];
    model.legs.forEach((L, i) => {
      const front = i < 2, s = Math.sin(ph + offs[i]), c = Math.cos(ph + offs[i]);
      let up = s * 0.55 * sp, lo = (front ? 1 : -1) * Math.max(0, c) * 0.9 * sp;
      up += (front ? -0.5 : 0.6) * lp.crouch; lo += (front ? 1.0 : -1.1) * lp.crouch;
      up += (front ? 1.1 : -1.1) * lp.leap; lo += (front ? -0.3 : 0.4) * lp.leap;
      if (front) { up += lp.rear * (1.1 + (i === 0 ? Math.sin(game.time * 0.3) * 0.35 : 0)); lo += lp.rear * 0.9; } else up -= pitch;
      if (i === 0) { up += lp.swipe * 1.5; lo -= lp.swipe * 0.5; }
      up -= lp.fallen * 0.4;
      L.up.rotation.z = up; L.lo.rotation.z = lo;
    });
    model.head.rotation.z = -lp.pitch - pitch * 0.5;
    model.jaw.rotation.z = -lp.jaw * 0.7;
    model.tail.forEach((seg, i) => {
      seg.rotation.z = lerp((i ? 0.22 : 0.7) + Math.sin(game.time * 0.08 - i * 0.6) * 0.12, i ? -0.04 : 0.15, Math.max(lp.leap, sp * 0.6));
      seg.rotation.y = Math.sin(game.time * 0.05 - i * 0.5) * 0.15;
    });
    const glow = 1 - fade; // a spirit glows gold as it fades
    for (const m of model.mats) {
      m.color.copy(m.userData.a).lerp(m.userData.b, corrupt);
      m.opacity = fade; m.depthWrite = fade > 0.95;
      if (e.flashT > 0) m.emissive.copy(WHITE).multiplyScalar(0.9 * e.flashT / 6);
      else if (e.telegraph && game.time % 10 < 5) m.emissive.copy(RED).multiplyScalar(0.4);
      else m.emissive.copy(m.color).multiplyScalar(m.userData.glow || 0).add(tmpC.copy(SPIRIT_GLOW).multiplyScalar(0.5 * glow));
    }
    model.eye.color.copy(model.eyeBase || GOLD_EYE).lerp(RED_EYE, corrupt);
    if (e.telegraph && game.time % 6 < 3) model.eye.color.set(0xffffff);
    model.eye.opacity = fade;
    model.aura.forEach((a, i) => { // the spirit aura breathes and flickers
      a.material.color.copy(a.material.userData.a).lerp(a.material.userData.b, corrupt);
      a.material.opacity = (0.045 + 0.025 * Math.sin(game.time * 0.15 + i * 2) + 0.15 * glow) * fade;
      a.rotation.y = game.time * 0.02 * (i ? -1 : 1);
    });
  }

  // ---------------------------------------------------------------- the white wolf
  // A huge, heavily muscled white wolf on the lion's rig (same joints and LION_KEYS, posed by poseLion): a barrel
  // chest and bulging shoulders, thick forelegs, a shaggy neck ruff, a long muzzle, tall ears, a bushy tail, and
  // ice-blue eyes in a cold moonlight aura.
  function buildWolfModel() {
    const mk = (c, rough, metal) => { const m = std(c, rough, metal, { transparent: true }); m.userData.a = new THREE.Color(c); m.userData.b = new THREE.Color(c); return m; };
    const fur = mk(0xf1f5f9, 0.85, 0.02), muscle = mk(0xdbe3ee, 0.8, 0.02), pale = mk(0xffffff, 0.9, 0);
    const ruff = mk(0xe2e8f0, 0.95, 0), dark = mk(0x1e293b, 0.5, 0.1), claw = mk(0x94a3b8, 0.35, 0.4);
    ruff.userData.glow = 0.05; pale.userData.glow = 0.04; // the moonlight catches the fur
    const eye = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, toneMapped: false, transparent: true });
    const root = new THREE.Group(); scene.add(root); root.visible = false;
    const yawG = group(root), fallG = group(yawG), pitchG = group(fallG, [-44, 62, 0]), body = group(pitchG, [44, -62, 0]);
    // torso: a deep barrel chest, slabs of shoulder and back muscle, a tucked waist, powerful haunches
    part(body, G.sphere, fur, [36, 76, 0], [44, 40, 32]);
    for (const z of [-1, 1]) {
      part(body, G.sphere, muscle, [46, 88, z * 14], [24, 20, 14]); // shoulders
      part(body, G.sphere, muscle, [40, 64, z * 16], [20, 18, 10]); // chest
      part(body, G.sphere, muscle, [-4, 82, z * 13], [30, 12, 10]); // back
      part(body, G.sphere, muscle, [-44, 74, z * 15], [26, 24, 12]); // haunches
    }
    part(body, G.sphere, fur, [-2, 78, 0], [46, 24, 24]);
    part(body, G.sphere, fur, [-40, 76, 0], [34, 30, 26]);
    part(body, G.sphere, pale, [14, 58, 0], [40, 12, 18]);
    const saddle = group(body, [-4, 102, 0]);
    const paw = (parent, pos) => {
      part(parent, G.sphere, fur, pos, [14, 7, 12]);
      for (const cz of [-5, 0, 5]) {
        part(parent, G.sphere, fur, [pos[0] + 9, pos[1] - 1, cz], [5, 5, 4.5]);
        part(parent, G.cone, claw, [pos[0] + 15, pos[1] - 3, cz], [1.8, 8, 1.8], POINT_FWD);
      }
    };
    const frontLeg = (z) => { // thick, roped forelegs
      const up = group(body, [42, 72, z]);
      part(up, G.sphere, muscle, [2, -4, 0], [20, 27, 15]);
      part(up, capsule(12, 24), fur, [0, -22, 0]);
      part(up, G.sphere, muscle, [5, -20, 0], [10, 14, 10]);
      const lo = group(up, [0, -40, 0]);
      part(lo, capsule(9, 18), fur, [0, -10, 0]);
      paw(lo, [5, -24, 0]);
      return { up, lo };
    };
    const backLeg = (z) => {
      const up = group(body, [-42, 72, z]);
      part(up, G.sphere, muscle, [2, -8, 0], [24, 30, 16]);
      part(up, capsule(12, 20), fur, [4, -22, 0]);
      const lo = group(up, [6, -38, 0]);
      const shin = group(lo); shin.rotation.z = -0.5;
      part(shin, capsule(8, 12), fur, [0, -9, 0]);
      const hock = group(lo, [-8, -16, 0]);
      part(hock, capsule(6.5, 10), fur, [2, -8, 0], null, [0, 0, 0.2]);
      paw(hock, [5, -17, 0]);
      return { up, lo };
    };
    const legs = [frontLeg(15), frontLeg(-15), backLeg(14), backLeg(-14)];
    part(body, G.sphere, fur, [60, 96, 0], [26, 28, 22]); // neck
    // the head: a broad skull, a long tapering muzzle, a black nose, tall pointed ears, fangs
    const head = group(body, [82, 108, 0]);
    part(head, G.sphere, fur, [0, 4, 0], [19, 16, 17]);
    part(head, G.sphere, fur, [10, 10, 0], [12, 7, 15]); // brow
    part(head, G.sphere, pale, [24, -2, 0], [20, 8.5, 9.5]); // muzzle
    part(head, G.sphere, fur, [20, 4, 0], [14, 6, 8]); // bridge of the nose
    part(head, G.sphere, dark, [42, 0, 0], [4.5, 4, 5.5]);
    for (const z of [-1, 1]) {
      part(head, G.box, eye, [13, 8, z * 8], [3.5, 2.4, 5], [z * 0.3, 0, -0.25], false);
      part(head, G.cone, fur, [-4, 24, z * 9], [6, 18, 4], [z * 0.2, 0, 0.25]); // ears
      part(head, G.cone, dark, [-3, 22, z * 9.4], [3, 10, 2], [z * 0.2, 0, 0.25]);
      part(head, G.cone, pale, [36, -7, z * 4], [1.6, 7, 1.6], POINT_DOWN); // fangs
      for (let i = 0; i < 3; i++) part(head, G.cone, ruff, [-8, -6 - i * 5, z * (15 - i)], [5, 14, 5], [z * 1.2, 0, 0.9]); // cheek fur
    }
    const jaw = group(head, [12, -8, 0]);
    part(jaw, G.sphere, pale, [14, -2, 0], [18, 4, 8]);
    for (const z of [-1, 1]) part(jaw, G.cone, pale, [24, 2, z * 4], [1.4, 6, 1.4]);
    // the ruff: a thick shaggy collar of fur around the neck and down the chest
    const R = mulberry(23);
    for (let i = 0; i < 30; i++) {
      const a = R() * TAU, x = 52 + R() * 20, r = 22 + R() * 6;
      part(body, G.cone, R() < 0.3 ? pale : ruff, [x, 92 + Math.sin(a) * r * 0.8, Math.cos(a) * r], [7, 20 + R() * 10, 7], [Math.PI / 2 - a, 0, 0.9 + R() * 0.3]);
    }
    for (let i = 0; i < 7; i++) part(body, G.cone, ruff, [64 - Math.abs(i - 3) * 2, 64, (i - 3) * 6], [7, 26, 7], [Math.PI, 0, -0.4]);
    for (let i = 0; i < 6; i++) part(body, G.cone, ruff, [30 - i * 10, 100, 0], [6, 16, 8], [0, 0, 1.2]); // hackles down the spine
    // a big bushy tail
    const tail = [];
    let parent = group(body, [-74, 86, 0]);
    for (let i = 0; i < 7; i++) {
      const seg = group(parent, i ? [-12, 0, 0] : [0, 0, 0]);
      const r = 6 + Math.sin((i + 1) / 8 * Math.PI) * 7;
      part(seg, G.sphere, i % 2 ? ruff : fur, [-6, 0, 0], [10, r, r]);
      tail.push(seg); parent = seg;
    }
    part(parent, G.cone, pale, [-18, 0, 0], [7, 16, 7], [0, 0, Math.PI / 2]);
    // moonlight aura
    const aura = [];
    for (const [pos, s] of [[[6, 82, 0], [124, 66, 54]], [[76, 106, 0], [56, 52, 52]]]) {
      const m = glowMat(0xbfdbfe, 0.12); m.userData.a = new THREE.Color(0xbfdbfe); m.userData.b = new THREE.Color(0xbfdbfe);
      aura.push(part(body, G.sphere, m, pos, s, null, false));
    }
    return { root, yawG, fallG, pitchG, body, legs, head, jaw, tail, saddle, eye, aura, mats: [fur, muscle, pale, ruff, dark, claw], yaw: -YAW_TURN, eyeBase: new THREE.Color(0x7dd3fc) };
  }

  // ---------------------------------------------------------------- the phoenix
  // A great red fire eagle facing +x: a glowing body, hooked golden beak, a burning crest, broad wings of
  // flame-tipped feathers, a fan tail, and talons. Wings flap from e.flap; every flame flickers.
  function buildEagleModel() {
    const red = std(0xb91c1c, 0.45, 0.2, { emissive: 0xff3d00, emissiveIntensity: 0.45 });
    const orange = std(0xf97316, 0.45, 0.2, { emissive: 0xff7a1a, emissiveIntensity: 0.55 });
    const gold = std(0xfbbf24, 0.3, 0.7, { emissive: 0xf59e0b, emissiveIntensity: 0.4 });
    const eye = new THREE.MeshBasicMaterial({ color: 0xfff7c2, toneMapped: false });
    const flames = [];
    const flame = (parent, pos, scale, rot, color) => { const f = part(parent, G.cone, glowMat(color, 0.7), pos, scale, rot, false); f.userData.base = f.scale.clone(); flames.push(f); return f; };
    const root = new THREE.Group(); scene.add(root); root.visible = false;
    const yawG = group(root), bankG = group(yawG);
    part(bankG, G.sphere, red, [0, 0, 0], [56, 26, 26]);
    part(bankG, G.sphere, orange, [22, -6, 0], [30, 22, 22]);
    const head = group(bankG, [56, 14, 0]);
    part(head, G.sphere, red, [0, 0, 0], [17, 15, 14]);
    part(head, G.cone, gold, [18, -2, 0], [6, 20, 6], POINT_FWD);
    part(head, G.cone, gold, [25, -7, 0], [3, 8, 3], POINT_DOWN); // the hook of the beak
    for (const z of [-1, 1]) part(head, G.box, eye, [10, 4, z * 9], [5, 2.5, 2], null, false);
    for (let i = 0; i < 4; i++) flame(head, [-8 - i * 6, 10 + i * 2, 0], [5, 26 - i * 3, 4], [0, 0, 0.9 + i * 0.2], i % 2 ? 0xfde047 : 0xff6a1a);
    const wings = [];
    for (const side of [-1, 1]) {
      const w = group(bankG, [6, 10, side * 20]);
      part(w, G.box, red, [0, 0, side * 40], [56, 8, 80]);
      const outer = group(w, [0, 0, side * 80]);
      part(outer, G.box, orange, [-6, 0, side * 40], [44, 6, 80]);
      for (let i = 0; i < 7; i++) { // primaries swept back, each tipped in fire
        const z = side * (12 + i * 11), len = 50 + i * 7;
        part(outer, G.cone, i % 2 ? gold : orange, [-20 - len / 2, 0, z], [3, len, 8], [0, 0, Math.PI / 2]);
        flame(outer, [-20 - len, 0, z], [5, 34, 9], [0, 0, Math.PI / 2], i % 2 ? 0xfde047 : 0xff4500);
      }
      for (let i = 0; i < 4; i++) part(w, G.cone, gold, [-36, 0, side * (14 + i * 18)], [3, 40, 8], [0, 0, Math.PI / 2]); // secondaries
      wings.push({ w, outer, side });
    }
    for (let i = 0; i < 5; i++) { // the fan tail
      const yaw = (i - 2) * 0.28;
      part(bankG, G.cone, i % 2 ? gold : orange, [-60 - Math.cos(yaw) * 36, 0, Math.sin(yaw) * 36], [3, 76, 10], [0, yaw, Math.PI / 2]);
      flame(bankG, [-60 - Math.cos(yaw) * 84, 0, Math.sin(yaw) * 84], [6, 40, 10], [0, yaw, Math.PI / 2], i % 2 ? 0xfde047 : 0xff4500);
    }
    for (const z of [-1, 1]) { // talons
      part(bankG, capsule(5, 20), gold, [10, -26, z * 10]);
      for (const dx of [-6, 0, 6]) part(bankG, G.cone, gold, [14 + dx, -42, z * 10], [2.2, 9, 2.2], POINT_DOWN);
    }
    return { root, yawG, bankG, wings, flames };
  }
  function poseEagle(model, e) {
    model.root.visible = !!e;
    if (!e) return;
    model.root.position.set(X(e.x), Y(e.y), e.z || 0);
    model.root.scale.setScalar(e.scale);
    model.yawG.rotation.y = e.face > 0 ? -0.35 : Math.PI + 0.35;
    model.bankG.rotation.z = e.bank || 0;
    const f = Math.sin(e.flap);
    for (const { w, outer, side } of model.wings) { w.rotation.x = -side * f * 0.6; outer.rotation.x = -side * Math.max(0, f) * 0.4; }
    for (const fl of model.flames) { fl.scale.set(fl.userData.base.x, fl.userData.base.y * (0.7 + Math.random() * 0.6), fl.userData.base.z); fl.material.opacity = 0.45 + Math.random() * 0.45; }
  }

  // ---------------------------------------------------------------- the behemoth
  // An upright saurian ~186 units tall facing +x: column legs, a heavy tail on the ground behind it, small arms,
  // a low head on a thick neck, and rows of jagged dorsal plates that glow blue as the atomic breath charges.
  function buildKaijuModel() {
    const skin = std(0x2b3328, 0.85, 0.05), belly = std(0x4a4a3a, 0.9, 0.02), dark = std(0x141812, 0.9, 0.05);
    const plateMat = std(0x9ca3af, 0.5, 0.1, { emissive: 0x38bdf8, emissiveIntensity: 0 });
    const tooth = std(0xe8e2d0, 0.4, 0.1), eye = new THREE.MeshBasicMaterial({ color: 0xfde047, toneMapped: false });
    const root = new THREE.Group(); scene.add(root); root.visible = false;
    const yawG = group(root), body = group(yawG);
    const leg = (z) => {
      const hip = group(body, [-6, 72, z]);
      part(hip, G.sphere, skin, [0, -6, 0], [24, 30, 20]);
      part(hip, taperGeo(17, 14, 40), skin, [0, -28, 0]);
      const knee = group(hip, [0, -44, 0]);
      part(knee, taperGeo(13, 15, 26), skin, [2, -12, 0]);
      const foot = group(knee, [2, -26, 0]);
      part(foot, G.box, dark, [8, -2, 0], [40, 12, 30]);
      for (const tz of [-10, 0, 10]) part(foot, G.cone, tooth, [30, -3, tz], [4, 10, 4], POINT_FWD);
      return { hip, knee };
    };
    const legs = [leg(22), leg(-22)];
    const torso = group(body, [0, 72, 0]); torso.rotation.z = -0.25;
    part(torso, G.sphere, skin, [4, 34, 0], [36, 48, 36]);
    part(torso, G.sphere, skin, [12, 66, 0], [30, 34, 32]);
    part(torso, G.box, belly, [30, 32, 0], [8, 64, 28], [0, 0, 0.1]);
    for (let y = 10; y < 70; y += 12) part(torso, G.box, dark, [34.5, y, 0], [1, 2, 26], null, false); // belly ridges
    const arm = (side) => {
      const sh = group(torso, [24, 60, side * 26]);
      part(sh, capsule(7, 14), skin, [6, -8, 0], null, [0, 0, 0.8]);
      const el = group(sh, [12, -16, 0]);
      part(el, capsule(6, 12), skin, [6, -4, 0], null, [0, 0, 1.2]);
      for (const cz of [-4, 0, 4]) part(el, G.cone, tooth, [16, -6, cz], [2, 8, 2], POINT_DOWN);
      return sh;
    };
    const arms = [arm(1), arm(-1)];
    const head = group(torso, [26, 92, 0]);
    part(head, G.sphere, skin, [-8, -8, 0], [20, 22, 20]);
    part(head, G.box, skin, [8, 2, 0], [30, 20, 22]);
    part(head, G.box, skin, [26, -2, 0], [22, 14, 18]);
    part(head, G.box, dark, [14, 10, 0], [16, 5, 24]);
    for (const z of [-1, 1]) part(head, G.box, eye, [21, 6, z * 10], [5, 3, 3], [z * 0.3, 0, 0], false);
    for (let x = 18; x <= 34; x += 4) for (const z of [-7, 7]) part(head, G.cone, tooth, [x, -9, z], [1.6, 5, 1.6], POINT_DOWN);
    const jaw = group(head, [10, -8, 0]);
    part(jaw, G.box, dark, [14, -3, 0], [30, 7, 17]);
    for (let x = 10; x <= 26; x += 4) for (const z of [-6, 6]) part(jaw, G.cone, tooth, [x, 2, z], [1.4, 4, 1.4]);
    const mouth = group(head, [38, -6, 0]);
    // dorsal plates: three rows up the back, then down the tail
    const plates = [];
    const plate = (parent, pos, s, lean) => plates.push(part(parent, G.cone, plateMat, pos, [s * 0.5, s, s * 0.14], [0, 0, lean]));
    for (let i = 0; i < 7; i++) { // around the curve of the back, hips to shoulders, pointing outward
      const th = Math.PI * (1.1 - i * 0.083), x = 4 + 36 * Math.cos(th), y = 34 + 48 * Math.sin(th), s = 26 + Math.sin(i / 6 * Math.PI) * 18;
      plate(torso, [x, y, 0], s, th - Math.PI / 2);
      for (const z of [-9, 9]) plate(torso, [x + 2, y - 2, z], s * 0.7, th - Math.PI / 2);
    }
    const tail = [];
    let parent = group(body, [-24, 64, 0]);
    for (let i = 0; i < 10; i++) {
      const seg = group(parent, i ? [-19, 0, 0] : [0, 0, 0]), r = 20 - i * 1.5;
      part(seg, G.sphere, skin, [-10, 0, 0], [13, r, r]);
      plate(seg, [-10, r * 0.8, 0], Math.max(5, 16 - i * 1.2), 0.5);
      tail.push(seg); parent = seg;
    }
    return { root, yawG, body, torso, head, jaw, mouth, legs, arms, tail, plateMat, eye, mats: [skin, belly], yaw: Math.PI + YAW_TURN };
  }

  function poseKaiju(model, b) {
    const dead = b.state === 'dying' && b.deathT > 115;
    model.root.visible = !dead;
    if (dead) return;
    model.root.position.set(X(b.x), Y(b.y), 0);
    if (b.state === 'dying' || b.state === 'shocked') model.root.position.add(tmpV.set(rand(-3, 3), rand(-3, 3), rand(-3, 3)));
    model.root.scale.setScalar(b.k * (b.grow || 1));
    const target = b.face > 0 ? -YAW_TURN : Math.PI + YAW_TURN;
    model.yaw += angDiff(target, model.yaw) * 0.15;
    model.yawG.rotation.y = model.yaw + (b.spin || 0);
    const moving = Math.abs(b.vx) > 0.5 && b.onGround, ph = b.step * 3;
    model.legs.forEach((L, i) => {
      const s = (i ? -1 : 1) * Math.sin(ph);
      let hip = moving ? s * 0.4 : 0, knee = moving ? -Math.max(0, (i ? -1 : 1) * Math.cos(ph)) * 0.6 : 0;
      if (i === 0 && b.stompLeg) { hip += 0.8 * b.stompLeg; knee -= 1.1 * b.stompLeg; }
      L.hip.rotation.z = hip; L.knee.rotation.z = knee;
    });
    const roaring = (b.state === 'intro' && b.t > 20 && b.t < 60) || b.state === 'gloat';
    const lunge = b.lunge || 0, charge = b.charge || 0;
    model.torso.rotation.z = -0.25 - 0.4 * lunge + (roaring ? 0.25 : 0) + charge * 0.12 + (b.state === 'stagger' ? Math.sin(b.t * 0.5) * 0.08 : 0);
    model.head.rotation.z = -0.25 * lunge + (roaring ? 0.4 : 0) + (charge >= 1 ? -0.15 : 0);
    const jawOpen = roaring ? 0.8 : lunge > 0.5 ? 0.75 : charge >= 1 ? 0.9 : b.telegraph ? 0.35 : 0.08 + Math.sin(game.time * 0.06) * 0.05;
    model.jaw.rotation.z = -jawOpen;
    model.arms.forEach((a, i) => { a.rotation.z = -(i ? b.backArmRot : b.armRot) * 0.5 + Math.sin(game.time * 0.05 + i) * 0.08; });
    model.tail.forEach((seg, i) => {
      seg.rotation.z = (i ? -0.02 : 0.42) + Math.sin(game.time * 0.05 - i * 0.5) * 0.03;
      seg.rotation.y = Math.sin(game.time * 0.04 - i * 0.45) * 0.12 + (moving ? Math.sin(ph - i * 0.4) * 0.08 : 0);
    });
    for (const m of model.mats) {
      const em = m.emissive;
      if (b.flashT > 0) em.copy(WHITE).multiplyScalar(0.22 * b.flashT / 6);
      else if (b.telegraph && game.time % 10 < 5) em.copy(RED).multiplyScalar(0.3);
      else if (b.enraged) em.copy(RED).multiplyScalar(0.1 + 0.08 * Math.sin(game.time * 0.3));
      else em.setRGB(0, 0, 0);
    }
    model.plateMat.emissiveIntensity = charge * 2 + (b.enraged ? 0.25 : 0);
    model.eye.color.set(b.telegraph && game.time % 6 < 3 ? '#ffffff' : '#fde047');
  }

  // ---------------------------------------------------------------- effects (pooled meshes)
  const fxRoot = new THREE.Group(); scene.add(fxRoot);
  function pool(make) {
    const items = []; let used = 0;
    return {
      begin() { used = 0; },
      next() { if (used >= items.length) { const o = make(); items.push(o); fxRoot.add(o); } const o = items[used++]; o.visible = true; return o; },
      end() { for (let i = used; i < items.length; i++) items[i].visible = false; },
    };
  }
  const grenadePool = pool(() => {
    const g = new THREE.Group();
    g.userData.body = part(g, G.sphere, std(0x3f5a2a, 0.6, 0.3), null, [11, 13, 11]);
    part(g, G.cyl, std(0x555555, 0.4, 0.8), [0, 15, 0], [4, 5, 4]);
    g.userData.blink = part(g, G.lowSphere, glowMat(0xff3b1a, 1, false), [0, 20, 0], 4, null, false);
    g.userData.warn = part(g, G.ring, glowMat(0xff3c1e, 0.4, false), null, 105, null, false);
    return g;
  });
  const explosionPool = pool(() => {
    const g = new THREE.Group();
    g.userData.outer = part(g, G.sphere, glowMat(0xff8a1f, 1), null, 1, null, false);
    g.userData.inner = part(g, G.sphere, glowMat(0xffffdc, 1), null, 0.55, null, false);
    return g;
  });
  const ringPool = pool(() => part(new THREE.Group(), G.ring, glowMat(0xffffff, 1), null, 1, null, false));
  const wavePool = pool(() => part(new THREE.Group(), G.halfSphere, glowMat(0xff9a3c, 0.85), null, 1, null, false));
  const crackPool = pool(() => {
    const m = new THREE.Mesh(G.plane, new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    return m;
  });

  const keyPool = pool(() => {
    const g = buildKeyMesh(0xffffff);
    g.userData.beam = part(g, G.cyl, glowMat(0xffffff, 0.18), [0, 300, 0], [10, 600, 10], null, false);
    return g;
  });
  const slashPool = pool(() => {
    const g = new THREE.Group();
    g.userData.outer = part(g, new THREE.TorusGeometry(70, 9, 8, 32, Math.PI), glowMat(0x60a5fa, 0.7), null, null, null, false);
    g.userData.inner = part(g, new THREE.TorusGeometry(70, 3, 8, 32, Math.PI), glowMat(0xffffff, 1), null, null, null, false);
    return g;
  });
  const tornadoMesh = new THREE.Group(); fxRoot.add(tornadoMesh); tornadoMesh.visible = false;
  for (let i = 0; i < 9; i++) {
    const y = 20 + i * 50, r = 34 + i * 16;
    const ring = part(tornadoMesh, new THREE.TorusGeometry(r, 7 + i * 1.2, 8, 40), glowMat(i % 2 ? 0x38bdf8 : 0xbae6fd, 0.55), [0, y, 0], [1, 1, 1], [Math.PI / 2, 0, 0], false);
    ring.userData.i = i;
  }
  part(tornadoMesh, new THREE.CylinderGeometry(150, 30, 470, 24, 1, true), glowMat(0x0ea5e9, 0.18), [0, 245, 0], null, null, false);

  const darkTornadoMesh = tornadoMesh.clone(); fxRoot.add(darkTornadoMesh); darkTornadoMesh.visible = false;
  darkTornadoMesh.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.blending = THREE.NormalBlending; o.material.color.set(o.userData.i % 2 ? 0xb91c1c : 0x1f0a0a); o.material.opacity = 0.55; } });
  const orbPool = pool(() => { const g = new THREE.Group(); part(g, G.sphere, glowMat(0xa855f7, 0.6), null, 22, null, false); part(g, G.sphere, glowMat(0xffffff, 1), null, 9, null, false); return g; });
  const warnPool = pool(() => part(new THREE.Group(), G.ring, glowMat(0x93c5fd, 0.6, false), null, 1, null, false));

  const boltPool = pool(() => {
    const g = new THREE.Group();
    g.userData.segs = [];
    for (let i = 0; i < 9; i++) {
      const seg = new THREE.Group(); g.add(seg);
      part(seg, G.box, glowMat(0xfef9c3, 1, false), [0, 0.5, 0], [5, 1, 5], null, false);
      part(seg, G.box, glowMat(0xfacc15, 0.5), [0, 0.5, 0], [16, 1, 16], null, false);
      g.userData.segs.push(seg);
    }
    return g;
  });

  const laser = new THREE.Group(); fxRoot.add(laser);
  laser.userData.tele = part(laser, G.beam, glowMat(0xff2828, 0.7, false), null, 1, null, false);
  laser.userData.outer = part(laser, G.beam, glowMat(0xff1e1e, 0.45), null, 1, null, false);
  laser.userData.core = part(laser, G.beam, glowMat(0xfff0f0, 1, false), null, 1, null, false);
  laser.userData.muzzle = part(laser, G.sphere, glowMat(0xff4040, 0.8), null, 1, null, false);

  const kame = new THREE.Group(); fxRoot.add(kame);
  kame.userData.outer = part(kame, G.beam, glowMat(0x2563eb, 0.35), null, 1, null, false);
  kame.userData.mid = part(kame, G.beam, glowMat(0x38bdf8, 0.7), null, 1, null, false);
  kame.userData.core = part(kame, G.beam, glowMat(0xf0f9ff, 1, false), null, 1, null, false);
  kame.userData.head = part(kame, G.sphere, glowMat(0x7dd3fc, 0.85), null, 1, null, false);
  kame.userData.headCore = part(kame, G.sphere, glowMat(0xffffff, 1), null, 1, null, false);

  const MAX_PARTICLES = 2000;
  const sparks = new THREE.InstancedMesh(G.box, new THREE.MeshBasicMaterial({ toneMapped: false }), MAX_PARTICLES);
  sparks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
  sparks.frustumCulled = false;
  scene.add(sparks);
  const colorCache = {};
  const colorOf = (c) => colorCache[c] || (colorCache[c] = new THREE.Color(c));
  const dummy = new THREE.Object3D();

  const MAX_AMBIENT = 60;
  const ambientGeo = new THREE.BufferGeometry();
  ambientGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_AMBIENT * 3), 3));
  const ambientPts = new THREE.Points(ambientGeo, new THREE.PointsMaterial({ map: dotTex, size: 6, transparent: true, depthWrite: false, sizeAttenuation: true }));
  ambientPts.frustumCulled = false;
  scene.add(ambientPts);

  const podium = new THREE.Group(); scene.add(podium);
  part(podium, G.cyl, std(0xf5c542, 0.3, 0.8), [0, 26, 0], [110, 52, 110]);
  part(podium, G.cyl, std(0x8a5a00, 0.4, 0.7), [0, 2, 0], [125, 4, 125]);
  podium.visible = false;

  const heroModel = buildHeroModel();
  const zordModel = buildZordModel('dragon');
  const dragonModel = buildDragonModel();
  const shadowModel = buildHeroModel(SHADOW_THEME);
  const darkZordModel = buildZordModel('dark');
  const darkDragonModel = buildDragonModel(true);
  const ultimateZordModel = buildZordModel('ultimate');
  const lionZordModel = buildZordModel('lion');
  const dragonLionZordModel = buildZordModel('dragonlion'), phoenixZordModel = buildZordModel('phoenix');
  const legionModels = Object.fromEntries(['ravager', 'venom', 'frost', 'volt'].map((st) => [st, buildZordModel(st)]));
  const eagleModel = buildEagleModel();
  const lionModel = buildLionModel();
  const wolfModel = buildWolfModel();
  const lionGhostModel = buildLionModel(); // the lion armor's golden spirit (king of beasts), apart from the real lion
  const moonBeam = buildSagaBeam(0x93c5fd, 0xe0f2fe);
  // phantom fang's three shadow Kanes: the hero rig in see-through glowing blue, each fading on its own
  const ghostModels = [0, 1, 2].map(() => {
    const model = buildHeroModel(), mat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
    model.root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    model.root.visible = false;
    return { model, mat };
  });
  // the shade imps: a handful of models handed out as imps drop onto the roof (Imp.modelIdx)
  const impModels = [];
  const impModelFor = (i) => impModels[i] || (impModels[i] = buildBossModel(WOLF));
  const kaijuModel = buildKaijuModel();
  const sagaBeam = buildSagaBeam();
  const kaijuBeam = buildSagaBeam(0x0ea5e9, 0xbae6fd);
  // story holograms: Elder Shin (gold, bearded, with a staff) and Emperor Nox (hooded, purple eyes, crown)
  function buildHologram(kind) {
    const g = new THREE.Group(); scene.add(g); g.visible = false;
    const mats = [];
    const mat = (color, opacity, emissive, ei) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, transparent: true, opacity, emissive, emissiveIntensity: ei, depthWrite: false });
      m.userData.base = opacity; mats.push(m); return m;
    };
    const glow = (color, opacity) => { const m = glowMat(color, opacity); m.userData.base = opacity; mats.push(m); return m; };
    if (kind === 'elder') {
      const robe = mat(0xf5e6c8, 0.85, 0xfcd34d, 0.35), trim = mat(0xd4a017, 0.9, 0xd4a017, 0.5);
      const skin = mat(0xe8c39e, 0.9, 0xfcd34d, 0.2), white = mat(0xffffff, 0.9, 0xffffff, 0.4);
      part(g, G.cone, robe, [0, 85, 0], [62, 170, 52], null, false);
      part(g, G.cyl, trim, [0, 100, 0], [32, 8, 26], null, false);
      part(g, G.sphere, robe, [0, 160, 0], [38, 20, 30], null, false);
      for (const z of [-1, 1]) part(g, G.cone, robe, [14, 125, z * 36], [14, 60, 14], [0, 0, 0.6], false);
      part(g, G.sphere, skin, [0, 192, 0], [19, 22, 19], null, false);
      part(g, G.cone, white, [12, 158, 0], [13, 52, 12], [0, 0, Math.PI], false);
      part(g, G.sphere, white, [-4, 212, 0], [14, 9, 14], null, false);
      for (const z of [-1, 1]) part(g, G.box, glow(0xfcd34d, 1), [18.5, 196, z * 7], [1.5, 3, 5], null, false);
      part(g, G.cyl, trim, [44, 115, 22], [3, 240, 3], null, false);
      part(g, G.sphere, glow(0xfde68a, 1), [44, 240, 22], 9, null, false);
      g.userData.aura = part(g, G.sphere, glow(0xfcd34d, 0.12), [0, 120, 0], [90, 140, 90], null, false);
    } else if (kind === 'vorath') { // a tall wraith: ragged black-green robe, a horned skull, green fire for eyes
      const robe = mat(0x052e16, 0.9, 0x15803d, 0.5), bone = mat(0xd6d3d1, 0.92, 0x86efac, 0.3), dark = mat(0x020403, 0.95, 0x000000, 0);
      part(g, G.cone, robe, [0, 110, 0], [70, 220, 56], null, false);
      for (let i = 0; i < 7; i++) part(g, G.cone, robe, [Math.cos(i * 0.9) * 50, 12, Math.sin(i * 1.7) * 36], [12, 40, 12], [Math.PI, 0, 0], false); // ragged hem
      part(g, G.sphere, robe, [0, 196, 0], [50, 24, 40], null, false);
      for (const z of [-1, 1]) part(g, G.cone, dark, [0, 208, z * 46], [10, 50, 10], [z * 0.9, 0, 0], false);
      part(g, G.sphere, dark, [-4, 234, 0], [32, 36, 30], null, false); // hood
      part(g, G.sphere, bone, [10, 230, 0], [18, 21, 17], null, false); // skull
      part(g, G.box, dark, [25, 219, 0], [4, 5, 12], null, false);
      for (const z of [-1, 1]) {
        part(g, G.box, glow(0x4ade80, 1), [27.5, 234, z * 7], [1.5, 5, 6], null, false);
        part(g, G.cone, bone, [0, 264, z * 16], [5, 40, 5], [z * 0.5, 0, -0.4], false);
        part(g, G.cone, robe, [30, 120, z * 36], [6, 70, 6], [0, 0, -1.2], false);
      }
      g.userData.aura = part(g, G.sphere, glow(0x22c55e, 0.22), [0, 140, 0], [110, 170, 110], null, false);
    } else {
      const robe = mat(0x3b0764, 0.92, 0x7e22ce, 0.75), dark = mat(0x05010a, 0.95, 0x000000, 0), trim = mat(0xa855f7, 0.95, 0xc084fc, 0.9);
      part(g, G.cone, robe, [0, 100, 0], [74, 200, 60], null, false);
      part(g, G.sphere, robe, [0, 178, 0], [46, 24, 38], null, false);
      for (const z of [-1, 1]) part(g, G.cone, trim, [-4, 196, z * 40], [8, 34, 8], [z * 0.6, 0, 0], false);
      part(g, G.sphere, robe, [0, 220, 0], [28, 32, 28], null, false);
      part(g, G.sphere, dark, [12, 214, 0], [18, 22, 20], null, false);
      for (const z of [-1, 1]) part(g, G.box, glow(0xd946ef, 1), [29.5, 218, z * 7], [1.5, 3.5, 8], [z * 0.3, 0, 0], false);
      for (let i = 0; i < 5; i++) part(g, G.cone, trim, [-6, 252, -16 + i * 8], [3, i === 2 ? 22 : 14, 3], null, false);
      for (const z of [-1, 1]) part(g, G.cone, dark, [34, 120, z * 30], [5, 26, 5], [0, 0, -1.4], false);
      g.userData.aura = part(g, G.sphere, glow(0xa855f7, 0.24), [0, 130, 0], [100, 160, 100], null, false);
    }
    return { g, mats };
  }
  const holograms = { elder: buildHologram('elder'), nox: buildHologram('nox'), vorath: buildHologram('vorath') };
  // story holograms hover at the back of the arena, bigger in the giant rounds
  // emperor nox in the flesh: the hologram's robes made solid, floating, with a barrier dome when he guards
  const noxBody = buildHologram('nox');
  for (const m of noxBody.mats) { m.userData.base = Math.min(1, m.userData.base + 0.08); if (m.emissiveIntensity !== undefined) m.userData.ei = m.emissiveIntensity * 0.35; }
  const barrierMesh = part(scene, G.sphere, glowMat(0xa855f7, 0.25), null, 1, null, false);
  let noxYaw = Math.PI;
  function renderNox(b) {
    const g = noxBody.g, show = !!(b && b.isNox && !(b.state === 'dying' && b.deathT > 115));
    g.visible = show; barrierMesh.visible = show && b.state === 'barrier';
    if (!show) return;
    g.position.set(X(b.x), Y(b.y) + 30 + Math.sin(game.time * 0.06) * 10, 0);
    noxYaw += angDiff(b.face > 0 ? -0.45 : Math.PI + 0.45, noxYaw) * 0.2;
    g.rotation.set(0, noxYaw, b.tilt || 0); g.scale.setScalar(1.05);
    const glow = b.flashT > 0 ? 1.8 : b.telegraph && game.time % 10 < 5 ? 1.5 : 1;
    for (const m of noxBody.mats) { m.opacity = m.userData.base * (b.fade ?? 1); if (m.userData.ei !== undefined) m.emissiveIntensity = m.userData.ei * glow; }
    g.userData.aura.scale.set(100 * (b.telegraph ? 1.35 : 1), 160, 100);
    if (barrierMesh.visible) { barrierMesh.position.set(X(b.x), Y(b.y) + 140, 0); barrierMesh.scale.setScalar(150 + Math.sin(game.time * 0.4) * 6); }
  }
  const holoScale = () => (game.giant || game.sky ? 2.6 : 1);
  function renderHolograms() {
    const st = game.mode === 'story' ? game.story : null, hs = holoScale();
    for (const key of HOLO_CAST) {
      const { g, mats } = holograms[key], a = st ? st.holo[key] : key === 'vorath' && game.mode === 'saga' ? game.vorathA : 0;
      g.visible = a > 0.01;
      if (!g.visible) continue;
      g.position.set(0, (50 + Math.sin(game.time * 0.05) * 8) * hs, -140 * hs);
      g.scale.setScalar(hs * (0.7 + 0.3 * a));
      g.rotation.y = -Math.PI / 2 + Math.sin(game.time * 0.02) * 0.2;
      const flicker = game.time % 47 < 2 ? 0.45 : 1;
      for (const m of mats) m.opacity = m.userData.base * a * flicker;
    }
  }


  const bossModels = [];
  const bossModelFor = (lv) => bossModels[lv] || (bossModels[lv] = buildBossModel(lv));

  function renderEffects(h, b) {
    // grenades
    grenadePool.begin();
    for (const g of game.grenades) {
      const o = grenadePool.next();
      o.position.set(X(g.x), Y(g.y), 0); o.rotation.z = g.spin;
      o.userData.body.material.color.set(g.reflected ? 0x1e3a8a : 0x3f5a2a);
      o.userData.blink.visible = g.fuse > 0 && g.fuse % 8 < 4;
      const warn = o.userData.warn;
      warn.visible = g.landed && !g.reflected;
      if (warn.visible) { warn.rotation.z = -g.spin; warn.position.set(0, -Y(g.y) + 1, 0); warn.material.opacity = 0.25 + 0.3 * (g.fuse % 10 < 5); }
    }
    grenadePool.end();

    // explosions
    explosionPool.begin();
    let bigBoom = null;
    for (const e of game.explosions) {
      const o = explosionPool.next(), k = e.t / (e.dur || 28), r = e.r * (0.4 + k * 0.8);
      o.position.set(X(e.x), Math.max(r * 0.3, Y(e.y)), 0);
      o.userData.outer.scale.setScalar(r); o.userData.outer.material.opacity = 0.9 * (1 - k);
      o.userData.outer.material.color.set(e.color || 0xff8a1f); // fire, unless it says otherwise (moonlight blasts)
      o.userData.inner.material.opacity = 1 - k;
      if (!bigBoom || e.r > bigBoom.r) bigBoom = e;
    }
    explosionPool.end();

    ringPool.begin();
    for (const r of game.rings) {
      if (r.r <= 0) continue;
      const o = ringPool.next();
      o.position.set(X(r.x), Math.max(1, Y(r.y)), 0); o.scale.set(r.r, 1, r.r);
      const [cr, cg, cb] = r.color.split(',').map(Number);
      o.material.color.setRGB(cr / 255, cg / 255, cb / 255); o.material.opacity = r.life / 30;
    }
    ringPool.end();

    wavePool.begin();
    for (const w of game.waves) {
      const o = wavePool.next();
      o.position.set(X(w.x), 0, 0); o.scale.set(28, w.h * 1.7, 60);
      o.material.opacity = 0.6 + Math.sin(game.time * 0.8) * 0.2;
    }
    wavePool.end();

    keyPool.begin();
    const live = game.mode !== "title" && game.mode !== "complete";
    for (const k of live ? game.keys : []) {
      const o = keyPool.next(), E = ELEMENTS[k.el];
      o.visible = !(k.life < 120 && k.life % 10 < 5);
      o.position.set(X(k.x), Y(k.y) + Math.sin(k.t * 0.08) * 8, 40);
      o.rotation.set(0, k.t * 0.06, 0); o.scale.setScalar(1.3);
      o.userData.metal.color.set(E.hex); o.userData.metal.emissive.set(E.hex);
      o.userData.glow.material.color.set(E.hex); o.userData.glow.scale.setScalar(30 + Math.sin(k.t * 0.15) * 5);
      o.userData.beam.material.color.set(E.hex); o.userData.beam.visible = k.landed;
    }
    keyPool.end();

    slashPool.begin();
    for (const s of live ? game.slashes : []) {
      const o = slashPool.next(), f = s.life / 48;
      o.position.set(X(s.x), Y(s.y), 0);
      o.rotation.set(0, 0, s.rot !== undefined ? s.rot : -s.dir * Math.PI / 2);
      const sc = s.scale || 1;
      o.scale.set(sc, 1.25 * sc, sc);
      o.userData.outer.material.color.set(s.color); o.userData.outer.material.opacity = 0.75 * f;
      o.userData.inner.material.opacity = f;
    }
    slashPool.end();

    const tw = live && game.tornado;
    tornadoMesh.visible = !!tw;
    if (tw) {
      const grow = Math.min(1, tw.t / 14) * Math.min(1, tw.life / 24);
      tornadoMesh.position.set(X(tw.x), 0, 0);
      tornadoMesh.scale.set(grow, Math.min(1, tw.t / 10), grow);
      tornadoMesh.rotation.y = tw.t * 0.35;
      tornadoMesh.children.forEach((c, i) => { c.position.x = Math.sin(tw.t * 0.2 + i * 0.7) * (6 + i * 2); });
    }

    const dtw = live && game.darkTornado;
    darkTornadoMesh.visible = !!dtw;
    if (dtw) {
      const grow = Math.min(1, dtw.t / 14) * Math.min(1, dtw.life / 24);
      darkTornadoMesh.position.set(X(dtw.x), 0, 0); darkTornadoMesh.scale.set(grow * 0.8, Math.min(1, dtw.t / 10) * 0.85, grow * 0.8);
      darkTornadoMesh.rotation.y = -dtw.t * 0.35;
    }
    orbPool.begin();
    for (const o of live ? game.orbs || [] : []) { const m = orbPool.next(); m.position.set(X(o.x), Y(o.y), 0); m.scale.setScalar(1 + Math.sin(game.time * 0.5) * 0.15); }
    orbPool.end();
    warnPool.begin();
    for (const st of live ? game.strikes || [] : []) {
      if (st.t < 0) continue;
      const o = warnPool.next(), k = st.t / st.fuse;
      o.position.set(X(st.x), 1.5, 0); o.scale.set(60 * (1.6 - 0.6 * k), 1, 60 * (1.6 - 0.6 * k));
      o.material.color.set(st.color); o.material.opacity = st.t % 8 < 4 ? 0.9 : 0.4;
    }
    warnPool.end();

    boltPool.begin();
    for (const bolt of live ? game.bolts : []) {
      const o = boltPool.next(), segs = o.userData.segs, top = 1100, bottom = Y(bolt.y);
      let px = X(bolt.x) + rand(-60, 60), py = top;
      for (let i = 0; i < segs.length; i++) {
        const ny = top - (top - bottom) * (i + 1) / segs.length, nx = i === segs.length - 1 ? X(bolt.x) : X(bolt.x) + rand(-50, 50);
        const dx = nx - px, dy = ny - py, len = Math.hypot(dx, dy);
        segs[i].position.set(px, py, 0); segs[i].scale.set(1, len, 1);
        segs[i].rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
        px = nx; py = ny;
      }
      for (const seg of segs) seg.children[1].material.color.set(bolt.color || 0xfacc15);
      o.visible = bolt.life % 4 < 3;
    }
    boltPool.end();

    crackPool.begin();
    for (const c of game.cracks) {
      const o = crackPool.next();
      o.position.set(X(c.x), 0.8, 0); o.scale.set(420, 1, 300);
      o.material.color.set(c.color); o.material.opacity = Math.min(1, c.life / 60);
    }
    crackPool.end();

    // boss laser
    laser.visible = false;
    if (b && b.alive && b.state === 'laser') {
      const lz = b.L.laser, charge = Math.round(lz.charge / b.speedMul()), box = b.beamBox();
      const x0 = X(b.face > 0 ? box.x : box.x + box.w), x1 = X(b.face > 0 ? box.x + box.w : box.x), y = Y(box.y + box.h / 2);
      const len = Math.abs(x1 - x0), mid = (x0 + x1) / 2;
      laser.visible = true;
      const { tele, outer, core, muzzle } = laser.userData;
      tele.visible = b.t < charge; outer.visible = core.visible = !tele.visible;
      muzzle.position.set(x0, y, 0);
      if (tele.visible) {
        tele.position.set(mid, y, 0); tele.scale.set(len, 2, 2); tele.material.opacity = b.t % 8 < 4 ? 0.85 : 0.3;
        muzzle.scale.setScalar(8 + b.t * 0.4); muzzle.material.opacity = 0.6;
      } else {
        const jit = rand(-2, 2);
        core.position.set(mid, y + jit, 0); core.scale.set(len, 12, 12);
        outer.position.set(mid, y + jit, 0); outer.scale.set(len, 30 + Math.sin(game.time) * 4, 30);
        muzzle.scale.setScalar(40); muzzle.material.opacity = 0.9;
      }
    }

    // kamehameha
    const beam = game.beam;
    kame.visible = !!beam;
    if (beam) {
      let end = beam.x1;
      if (b && b.alive && b.hurtbox && (b.x - beam.x0) * beam.dir > 0 && Math.abs(b.hurtbox.y + b.hurtbox.h / 2 - beam.y) < b.hurtbox.h / 2 + 50) end = b.x - beam.dir * 30 * b.k;
      const full = Math.abs(end - beam.x0), len = Math.min(full, 40 + beam.t * 110);
      const x0 = X(beam.x0), x1 = x0 + beam.dir * len, mid = (x0 + x1) / 2, y = Y(beam.y);
      const pulse = 1 + Math.sin(game.time * 1.3) * 0.08, fade = beam.t > KAME_FIRE - 8 ? (KAME_FIRE - beam.t) / 8 : 1;
      const { outer, mid: m, core, head, headCore } = kame.userData;
      core.position.set(mid, y, 0); core.scale.set(len, 22 * fade, 22 * fade);
      m.position.set(mid, y, 0); m.scale.set(len, 40 * pulse * fade, 40 * pulse * fade);
      outer.position.set(mid, y, 0); outer.scale.set(len, 68 * pulse * fade, 68 * pulse * fade);
      head.position.set(x1, y, 0); head.scale.setScalar(80 * pulse * fade);
      headCore.position.set(x1, y, 0); headCore.scale.setScalar(46 * fade);
    }

    // particles
    const n = Math.min(particles.length, MAX_PARTICLES);
    for (let i = 0; i < n; i++) {
      const p = particles[i], f = clamp(p.life / p.max, 0, 1);
      dummy.position.set(X(p.x), Y(p.y), p.z);
      dummy.rotation.set(i * 0.7 + game.time * 0.1, i * 1.3, 0);
      dummy.scale.setScalar(p.size * 1.5 * (0.35 + 0.65 * f));
      dummy.updateMatrix();
      sparks.setMatrixAt(i, dummy.matrix);
      sparks.setColorAt(i, colorOf(p.color));
    }
    sparks.count = n;
    sparks.instanceMatrix.needsUpdate = true;
    sparks.instanceColor.needsUpdate = true;

    // ambient motes / smoke / embers
    const pos = ambientGeo.attributes.position, a = game.ambient, an = Math.min(a.length, MAX_AMBIENT);
    for (let i = 0; i < an; i++) pos.setXYZ(i, X(a[i].x), Y(a[i].y), a[i].z);
    pos.needsUpdate = true;
    ambientGeo.setDrawRange(0, an);

    // effect lights: [0] explosions / impacts, [1] hero energy, [2] boss glow
    const [l0, l1, l2] = fxLights;
    l0.intensity = 0;
    if (bigBoom) { const k = bigBoom.t / (bigBoom.dur || 28); l0.color.set(0xff8a2a); l0.position.set(X(bigBoom.x), Y(bigBoom.y) + 40, 120); l0.intensity = 3 * (1 - k); }
    l1.intensity = 0;
    if (beam) { l1.color.set(0x7dd3fc); l1.position.set(X(beam.x0) + beam.dir * 200, Y(beam.y), 150); l1.intensity = 3.5; l1.distance = 1400; }
    else if (h && h.orb > 0.02) { l1.color.set(0x7dd3fc); l1.position.copy(heroModel.orb.position).add(tmpV.set(0, 0, 60)); l1.intensity = 2.5 * h.orb; l1.distance = 700; }
    else if (h && h.state === 'special' && h.special === 'oneshot') { l1.color.set(0xfde047); l1.position.set(X(h.x), Y(h.y) + 160, 140); l1.intensity = 2 + Math.sin(game.time * 0.8); l1.distance = 800; }
    else if (h && h.hulk > 0.02) { l1.color.set(0x4ade80); l1.position.set(X(h.x), Y(h.y) + 140, 160); l1.intensity = 2 * h.hulk; l1.distance = 700; }
    else if (h && h.element) { l1.color.set(ELEMENTS[h.element].hex); l1.position.set(X(h.x), Y(h.y) + 150, 140); l1.intensity = 0.9 + Math.sin(game.time * 0.3) * 0.3; l1.distance = 600; }
    else if (h && (h.beast || h.state === 'wolfup')) {
      const surge = h.state === 'wolfup' || h.state === 'swap' ? 1.6 + Math.sin(game.time * 0.5) * 0.6 : h.state === 'special' ? 1.6 : 0.7;
      l1.color.set(h.B ? h.B.hex : 0x93c5fd); l1.position.set(X(h.x), Y(h.y) + 150, 140); l1.intensity = surge; l1.distance = 650;
    } else if (h && (h.rage || h.state === 'armorup')) {
      const surge = h.state === 'armorup' ? 1.4 + Math.sin(game.time * 0.6) * 0.6 : 0.6;
      l1.color.set(0x3b82f6); l1.position.set(X(h.x), Y(h.y) + 150, 140); l1.intensity = surge; l1.distance = 600;
    }
    if (game.bolts.length) { l0.color.set(0xfde68a); l0.position.set(X(game.bolts[0].x), 400, 150); l0.intensity = 4; }
    if (game.clash) { l0.color.set(0xfde68a); l0.position.set(X(game.clash.x), 170, 120); l0.intensity = 2.5 + Math.random() * 2; }
    l2.intensity = 0;
    if (b && b.alive) {
      const glow = b.state === 'laser' ? 2.5 : b.enraged ? 1.2 + Math.sin(game.time * 0.3) * 0.4 : b.telegraph ? 1.2 : 0;
      if (glow) { l2.color.set(0xff2a1a); l2.position.set(X(b.x) + b.face * 60 * b.k, 120 * b.k, 120); l2.intensity = glow; }
    }
  }

  // ---------------------------------------------------------------- camera
  const camPos = new THREE.Vector3(0, 320, 1300), camLook = new THREE.Vector3(0, 170, 0);
  const tp = new THREE.Vector3(), tl = new THREE.Vector3();
  function fightCam(h, b) {
    const hx = X(h.x), bx = X(b.x), mid = clamp((hx + bx) / 2, -280, 280), dist = Math.abs(hx - bx);
    const rk = h.rageK || 0; // pull back a little for the armored knight
    const z = clamp(560 + dist * 0.8, 820, 1300) + (b.k - 1.3) * 160 + rk * 60;
    tp.set(mid, 190 + z * 0.12, z); tl.set(mid, 150 + (b.k - 1.3) * 50 + rk * 15, 0);
  }
  function updateCamera() {
    let rate = 0.07;
    const h = game.hero, b = game.boss;
    if (game.mode === 'title') {
      const a = game.time * 0.004;
      tp.set(Math.sin(a) * 380, 300, 1250 + Math.cos(a * 0.7) * 80); tl.set(Math.sin(a) * 120, 190, 0);
    } else if (game.mode === 'complete') {
      const a = game.time * 0.006;
      tp.set(Math.sin(a) * 620, 240, Math.cos(a) * 620); tl.set(0, 170, 0); rate = 0.05;
    } else if (game.mode === 'saga' && game.saga.kind === 'nox') {
      const s = game.saga, kx = X(h.x), bx = X(b.x), g = b.grow || 1, ax = X(520);
      if (s.stage === 'rage' || s.stage === 'absorb') { tp.set(bx - 320, 170, 720); tl.set(bx, 200, 0); rate = 0.05; }
      else if (s.stage === 'grow') { tp.set(kx - 260, 50, 700); tl.set((kx + bx) / 2 + 80, 120 + 260 * g, 0); rate = 0.06; }
      else if (s.stage === 'ally') { tp.set((kx + ax) / 2, 70, 430); tl.set((kx + ax) / 2, 50, 0); rate = 0.06; }
      else if (s.stage === 'dragons') { tp.set((kx + bx) / 2, 520, 2000); tl.set((kx + bx) / 2, 380, 0); rate = 0.04; }
      else { tp.set(kx + 260, 300, 1350); tl.set(kx, 280, 0); rate = 0.05; }
    } else if (game.mode === 'saga' && ['legion', 'unite', 'phoenix', 'legiondown'].includes(game.saga.kind)) {
      const s = game.saga, k = s.kind, hx = X(h.x), bx = X(b.x), mid = (hx + bx) / 2;
      if (k === 'legion' && s.stage === 'call') { tp.set(hx + 170, 40, 360); tl.set(hx, 70, 0); rate = 0.06; }
      else if (k === 'legion' && s.stage === 'dragon') { tp.set(mid, 520, 2000); tl.set(mid, 380, 0); rate = 0.04; }
      else if (k === 'legion' || (k === 'unite' && s.stage === 'merge') || (k === 'phoenix' && s.stage === 'merge')) { tp.set(hx + 260, 300, 1400); tl.set(hx, 290, 0); rate = 0.05; }
      else if (k === 'unite' && s.stage === 'lion') { const lx = game.sagaLion ? X(game.sagaLion.x) : hx; tp.set((lx + hx) / 2, 260, 1400); tl.set((lx + hx) / 2, 220, 0); rate = 0.05; }
      else if (k === 'phoenix' && s.stage !== 'falter') { tp.set(mid, 580, 2700); tl.set(mid + 60, 580, 0); rate = 0.04; }
      else { tp.set(mid, 260, 1400); tl.set(mid, 220, 0); rate = 0.05; }
    } else if (game.mode === 'saga' && game.saga.kind === 'lion') {
      const s = game.saga, kx = X(h.x), bx = X(b.x), lx = game.sagaLion ? X(game.sagaLion.x) : kx;
      if (s.stage === 'breath') { tp.set((kx + bx) / 2 - 120, 280, 1650); tl.set((kx + bx) / 2, 280, 0); rate = 0.06; }
      else if (s.stage === 'down') { tp.set(kx + 140, 110, 360); tl.set(kx, 10, 0); rate = 0.05; }
      else if (s.stage === 'summon') { tp.set(kx + 170, 40, 360); tl.set(kx, 70, 0); rate = 0.06; }
      else if (s.stage === 'lion') { tp.set((lx + bx) / 2, 320, 1650); tl.set((lx + bx) / 2, 260, 0); rate = 0.05; }
      else { tp.set(lx + 320, 240, 900); tl.set(lx, 220, 0); rate = 0.06; }
    } else if (game.mode === 'saga' && game.saga.kind === 'lionzord') {
      if (game.saga.stage === 'rear') { const lx = X(game.sagaLion.x); tp.set(lx + 420, 200, 1050); tl.set(lx, 300, 0); rate = 0.05; }
      else { const zx = X(game.zordHero ? game.zordHero.x : 360); tp.set(zx + 260, 300, 1350); tl.set(zx, 280, 0); rate = 0.05; }
    } else if (game.mode === 'saga' && (game.saga.kind === 'steal' || game.saga.kind === 'spirit')) {
      const s = game.saga, kx = X(h.x), bx = X(b.x);
      if (s.kind === 'steal' && s.stage === 'strike') { tp.set(kx + 160, 260, 1150); tl.set(kx + 160, 230, -100); rate = 0.05; }
      else if (s.kind === 'steal' && s.stage === 'rise') { tp.set(kx + 200, 140, 520); tl.set(kx, 140, 0); rate = 0.06; }
      else if (s.kind === 'spirit' && s.stage === 'return') { tp.set(kx + 260, 180, 700); tl.set(kx, 150, 0); rate = 0.05; }
      else { tp.set((kx + bx) / 2, 230, 1000); tl.set((kx + bx) / 2, 140, 0); rate = 0.05; }
    } else if (game.mode === 'credits') {
      const a = game.time * 0.005;
      tp.set(Math.sin(a) * 760, 260, Math.cos(a) * 760); tl.set(0, 190, 0); rate = 0.05;
    } else if (game.mode === 'saga' && game.saga.kind === 'shadow') {
      const s = game.saga, kx = X(h.x), bx = X(b.x);
      if (s.stage === 'laugh' || s.stage === 'call') { tp.set(bx - b.face * 200, 120, 460); tl.set(bx, 140, 0); rate = 0.06; }
      else if (s.stage === 'darkdragon') { tp.set((kx + bx) / 2, 460, 1900); tl.set((kx + bx) / 2, 330, 0); rate = 0.04; }
      else if (s.stage === 'darkform') { tp.set(bx - 260, 240, 1250); tl.set(bx, 260, 0); rate = 0.05; }
      else { tp.set((kx + bx) / 2, 260, 1500); tl.set((kx + bx) / 2, 220, 0); rate = 0.05; }
    } else if (game.mode === 'saga') {
      const s = game.saga, kx = X(h.x), bx = X(b.x), g = b.grow || 1;
      if (s.stage === 'explode') { tp.set(bx - 300, 200, 900); tl.set(bx, 160, 0); }
      else if (s.stage === 'rise' || (s.stage === 'beam' && s.t < 40)) { tp.set(kx - 260, 50, 700); tl.set((kx + bx) / 2 + 80, 120 + 260 * g, 0); rate = 0.06; }
      else if (s.stage === 'beam') { tp.set((kx + bx) / 2, 330, 1500); tl.set((kx + bx) / 2, 200, 0); rate = 0.1; }
      else if (s.stage === 'down') { tp.set(kx + 140, 110, 360); tl.set(kx, 10, 0); rate = 0.05; }
      else if (s.stage === 'summon') { tp.set(kx + 170, 40, 360); tl.set(kx, 70, 0); rate = 0.06; }
      else if (s.stage === 'dragon') { tp.set((kx + bx) / 2, 520, 2000); tl.set((kx + bx) / 2, 380, 0); rate = 0.04; }
      else { tp.set(kx + 260, 260, 1250); tl.set(kx, 260, 0); rate = 0.05; }
    } else if (game.mode === 'story') {
      const who = game.story.lines[game.story.i][0], hx = X(h.x), bx = X(b.x), s = h.renderScale ? h.renderScale * 1.4 : h.zord || game.giant || game.sky ? 1.6 : 1, hs = holoScale();
      if (who === 'kane') { tp.set(hx + h.face * 230 * s, 190 * s, 430 * s); tl.set(hx, 165 * s, 0); }
      else if (who === 'boss' && b.alive) { const bk = b.k * (b.grow || 1); tp.set(bx + b.face * (170 + 110 * bk), 110 + 70 * bk, 380 + 200 * bk); tl.set(bx, 120 * bk + 20, 0); }
      else if (HOLO_CAST.includes(who)) { tp.set(60 * hs, 200 * hs, 420 * hs); tl.set(0, 190 * hs, -140 * hs); }
      else fightCam(h, b);
      rate = 0.06;
    } else if (game.mode === 'finish') {
      const fin = game.fin, hx = X(h.x), bx = X(fin.bx), s = h.zord ? 1.6 : 1;
      if (fin.t < 18) { tp.set((hx + bx) / 2, 180 * s, 760 * s); tl.set((hx + bx) / 2, 140 * s, 0); rate = 0.12; }
      else if (fin.t < 72 || !fin.blast) { tp.set(hx + fin.dir * 300 * s, 110 * s, 520 * s); tl.set(hx - fin.dir * 140 * s, 150 * s, 0); rate = 0.08; }
      else { tp.set(hx + fin.dir * 200 * s, 260 * s, 1300 * s); tl.set(bx, 200 * s, 0); rate = 0.05; }
    } else if (game.mode === 'intro' && game.modeT < 105) {
      const bx = X(b.x);
      tp.set(bx - 300, 110 + 70 * b.k, 480 + 170 * b.k); tl.set(bx, 120 * b.k, 0);
    } else if (game.clash) {
      const cx = X(game.clash.x);
      tp.set(cx, 190 + (h.zord ? 60 : 0), h.zord ? 820 : 600); tl.set(cx, 150 + (h.zord ? 50 : 0), 0); rate = 0.12;
    } else if (h.state === 'armorup') {
      const hx = X(h.x);
      if (h.t < 110) { tp.set(hx + h.face * 190, 150, 470); tl.set(hx, 160, 0); rate = 0.06; }
      else { fightCam(h, b); tp.z += 150; }
    } else if (h.state === 'wolfup') { // up at the moon, down the beam with the wolf, its howl, then the armor on Kane
      const hx = X(h.x), ws = game.wolfSpirit;
      if (h.t < 20) { tp.set(hx + h.face * 160, 60, 520); tl.set(hx * 0.5 + MOON[0] * 0.08, 420, -1200); rate = 0.05; }
      else if (ws && h.t < 90) { tp.set(hx + h.face * 140, 120, 900); tl.set(X(ws.x), Y(ws.y) * 0.8 + 100, ws.z * 0.8); rate = 0.07; }
      else if (ws && h.t < 156) { const wx = X(ws.x); tp.set(wx - ws.face * 300, 110, 640); tl.set(wx, 200, 0); rate = 0.06; }
      else if (h.t < 214) { tp.set(hx + h.face * 200, 150, 500); tl.set(hx, 160, 0); rate = 0.08; }
      else { fightCam(h, b); tp.z += 150; }
    } else if (h.state === 'special') {
      const hx = X(h.x);
      if (h.special === 'kame' && h.t < KAME_CHARGE) { tp.set(hx - h.face * 230, 170, 520); tl.set(hx + h.face * 120, 130, 0); rate = 0.08; }
      else if (h.special === 'kame') { const mid = clamp(hx + h.face * 300, -300, 300); tp.set(mid - h.face * 200, 260, 1150); tl.set(mid, 140, 0); rate = 0.06; }
      else if (h.special === 'hulk' && h.t < 26) { tp.set(hx + h.face * 160, 90, 560); tl.set(hx, 190, 0); rate = 0.1; }
      else if (h.special === 'hulk') { fightCam(h, b); tp.y = 120; tp.z += 120; tl.y += 60; }
      else if (h.special === 'splash' && h.phase !== 'dash') { const hx2 = X(h.x), wy = Y(h.y); tp.set(hx2 + 560, wy * 0.6 + 280, 1700); tl.set(hx2, wy * 0.6 + 170, 0); rate = 0.08; }
      else if (h.special === 'phantom' && game.phantom) { // wide for the shadows, close on Kane for "hunt's over"
        const t = game.phantom.t;
        if (t >= 106 && t < 140) { tp.set(hx + h.face * 260, 120, 560); tl.set(hx - h.face * 60, 160, 0); rate = 0.08; }
        else { fightCam(h, b); tp.z += 160; tp.y += 40; }
      }
      else if (h.special === 'oneshot') { const z = h.zord ? 1.6 : 1; tp.set(hx + h.face * 230 * z, 90 * z, 480 * z); tl.set(hx, 200 * z, 0); rate = 0.1; }
      else if (h.special === 'thunder' && h.phase === 'pose') { tp.set(hx + h.face * 330, 120, 560); tl.set(hx - h.face * 110, 170, 0); rate = 0.08; }
      else if (h.special === 'tornado' || (game.tornado && game.tornado.caught)) { fightCam(h, b); tp.y += 150; tp.z += 220; tl.y += 110; }
      else if (h.special === 'slam' && h.phase !== 'dash') {
        const a = game.time * 0.025;
        tp.set(hx + Math.sin(a) * 700, 300, Math.cos(a) * 300 + 650); tl.set(hx, 210, 0); rate = 0.05;
      } else fightCam(h, b);
    } else if (game.tornado && game.tornado.caught) { fightCam(h, b); tp.y += 150; tp.z += 220; tl.y += 110;
    } else if (game.mode === 'won' && game.modeT > 120) {
      const hx = X(h.x), a = Math.sin(game.modeT * 0.008) * 0.6;
      tp.set(hx + Math.sin(a) * 520, 210, Math.cos(a) * 520); tl.set(hx, 160, 0); rate = 0.04;
    } else fightCam(h, b);
    camPos.lerp(tp, rate); camLook.lerp(tl, rate);
    camera.position.copy(camPos);
    if (shake > 0) camera.position.add(tmpV.set(rand(-shake, shake), rand(-shake, shake), 0));
    camera.lookAt(camLook);
    camera.updateMatrixWorld();
  }
  const projV = new THREE.Vector3();
  function toScreen(x, y, z = 0) {
    projV.set(X(x), Y(y), z).project(camera);
    return [(projV.x + 1) / 2 * W, (1 - projV.y) / 2 * H];
  }

  // one giant dragon: head on its scripted path, body segments following the trail
  function drawDragon(d, D) {
    D.root.visible = true;
    if (d !== D.ref) { D.ref = d; D.trail.length = 0; }
    const p = dragonHead(d), headPos = new THREE.Vector3(p[0], p[1], p[2]);
    const prev = D.trail[0];
    D.trail.unshift(headPos);
    if (D.trail.length > 500) D.trail.length = 500;
    const shrink = d.phase === 'form' ? clamp(1 - (d.t - 34) / 26, 0, 1) : 1;
    D.head.position.copy(headPos);
    if (prev && prev.distanceToSquared(headPos) > 1) D.head.lookAt(tmpV.copy(headPos).multiplyScalar(2).sub(prev));
    D.head.scale.setScalar(shrink); D.head.visible = shrink > 0.01;
    D.jaw.rotation.x = d.phase === 'fly' && d.t >= 50 && d.t < 110 ? 0.55 : 0.12 + Math.sin(game.time * 0.2) * 0.05;
    // walk back along the trail placing a segment every ~52 units
    let ti = 0, acc = 0, last = headPos;
    for (let i = 0; i < D.segs.length; i++) {
      const want = (i + 1) * 52;
      while (ti < D.trail.length - 1 && acc < want) { acc += D.trail[ti].distanceTo(D.trail[ti + 1]); ti++; }
      const pos = D.trail[Math.min(ti, D.trail.length - 1)], seg = D.segs[i];
      seg.position.copy(pos);
      if (last.distanceToSquared(pos) > 1) seg.lookAt(last);
      seg.scale.setScalar(shrink); seg.visible = shrink > 0.01;
      last = pos;
    }
  }
  // the saga extras: up to two dragons, and the one-shot beam
  function renderSaga(b) {
    dragonModel.root.visible = false; darkDragonModel.root.visible = false;
    if (game.mode === 'saga') for (const d of [game.dragon, game.dragon2]) if (d && d.t >= 0) drawDragon(d, d.dark ? darkDragonModel : dragonModel);
    if (game.assist && game.assist.kind === 'dragon' && game.mode !== 'title') drawDragon(game.assist, dragonModel);
    const bt = game.mode === 'saga' ? game.sagaBeam : -1;
    // the behemoth's atomic breath: at Kane in the cutscene, raking the ground in a fight
    kaijuBeam.visible = false;
    if (b && b.isKaiju && kaijuModel.root.visible) {
      const firing = game.mode === 'fight' && b.alive && b.state === 'breath' && b.charge >= 1;
      if (bt >= 0 || firing) {
        kaijuModel.mouth.getWorldPosition(tmpV);
        if (bt >= 0) heroModel.torso.getWorldPosition(tmpV2); else tmpV2.set(X(b.beamX), 10, 0);
        aimBeam(kaijuBeam, tmpV, tmpV2, (bt >= 0 ? (bt < 24 ? 1 : (32 - bt) / 8) : 0.7) * (1 + Math.sin(game.time * 1.3) * 0.1) * b.k / 2.2);
      }
    }
    sagaBeam.visible = bt >= 0 && !!b && !b.isKaiju;
    if (sagaBeam.visible) {
      const bm = bossModelFor(b.level);
      bm.head.getWorldPosition(tmpV); tmpV.y += 10 * b.k;
      heroModel.torso.getWorldPosition(tmpV2);
      const dir = tmpV2.clone().sub(tmpV), len = dir.length();
      sagaBeam.position.copy(tmpV);
      sagaBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      const fade = bt < 24 ? 1 : (32 - bt) / 8, w = (1 + Math.sin(game.time * 1.3) * 0.1) * fade;
      const { outer, mid, core, hit } = sagaBeam.userData;
      outer.scale.set(70 * w, len, 70 * w); mid.scale.set(40 * w, len, 40 * w); core.scale.set(16 * w, len, 16 * w);
      hit.position.set(0, len, 0); hit.scale.setScalar(110 * w);
    }
  }

  function render3D() {
    const mode = game.mode;
    const lv = mode === 'title' ? levelArena(game.menuIdx) : mode === 'complete' ? 2 : mode === 'credits' ? 6 : arenaIndex();
    setArena(lv);
    const st = game.storm || 0, sc = SCENES[lv];
    hemi.intensity = sc.hemi[2] * (1 - 0.6 * st); keyLight.intensity = sc.key[1] * (1 - 0.65 * st); rimLight.intensity = sc.rim[1] * (1 - 0.5 * st);
    arenas[lv].sky.material.color.setScalar(1 - 0.75 * st);
    scene.fog.color.set(sc.fog[0]).multiplyScalar(1 - 0.7 * st);
    for (const f of animated) f(game.time);
    bossModels.forEach((m) => { if (m) m.root.visible = false; });
    podium.visible = false;
    let h = null, b = null;
    if (mode === 'title' && game.display) { h = game.display.hero; b = game.display.bosses[game.menuIdx]; }
    else if (mode === 'complete' || mode === 'credits') { h = game.champion; podium.visible = mode === 'complete'; }
    else if (game.hero) { h = game.hero; b = game.boss; }
    const zordUp = h && h.zord, saga = mode === 'saga' ? game.saga : null;
    const kaneGone = saga && (saga.stage === 'form' || saga.stage === 'ultimate') && saga.t >= 40; // beamed into the cockpit
    const asBird = h && h.cloak && h.special === 'flare'; // phoenix flare: Kane is the fire bird for a moment
    if (h && !zordUp && !kaneGone && !h.mount && !asBird) poseHero(heroModel, h); else { heroModel.root.visible = false; heroModel.orb.visible = false; }
    // the lion: whoever owns it this frame (a cutscene, the ride, the summon, or chapter 8's boss)
    lionModel.root.visible = false;
    const lion = mode === 'title' ? (b && b.isLion ? b : null)
      : game.sagaLion || (h && h.mount && !h.gone ? h : null) || (game.assist && game.assist.kind === 'lion' ? game.assist : null) || (b && b.isLion && !b.hidden && !(b.state === 'dying' && b.deathT > 115) ? b : null);
    if (lion) {
      poseLion(lionModel, lion, lion.mount ? 2 : lion.isLion ? lion.k : lion.scale);
      if (game.rider && mode !== 'title') { // Kane sits in the saddle, wherever the lion's back has gone
        lionModel.root.updateMatrixWorld(true);
        lionModel.saddle.getWorldPosition(tmpV);
        const r = game.rider; r.x = tmpV.x + W / 2; r.y = GROUND - (tmpV.y - 96);
        poseHero(heroModel, r);
      }
    }
    // a megazord mid-assembly pops in spinning (build 0..1)
    const assemble = (model, who, p) => {
      poseHero(model, who);
      model.rig.scale.multiplyScalar(Math.max(0.001, ease(p) * (1 + Math.sin(p * Math.PI) * 0.25)));
      model.yawG.rotation.y += (1 - ease(p)) * TAU * 2;
    };
    const zh = game.zordHero;
    const heroZords = [zordModel, ultimateZordModel, lionZordModel, dragonLionZordModel, phoenixZordModel];
    for (const m of heroZords) { m.root.visible = false; m.orb.visible = false; }
    const zm = (o) => (o.lion ? lionZordModel : o.ultimate ? ultimateZordModel : o.style === 'dragonlion' ? dragonLionZordModel : o.style === 'phoenix' ? phoenixZordModel : zordModel);
    if (zordUp) { if (h.build !== undefined) { if (h.build > 0) assemble(zm(h), h, h.build); } else poseHero(zm(h), h); } // chapter 9 merges assemble in place
    else if (saga && zh && zh.build !== undefined) { if (zh.build > 0) assemble(zm(zh), zh, zh.build); }
    else if (saga && zh && saga.t >= 50) assemble(zm(zh), zh, clamp((saga.t - 50) / 50, 0, 1));
    for (const m of heroZords) if (m.root.visible && m.scale !== 1) m.rig.scale.multiplyScalar(m.scale); // the bigger combinations
    shadowModel.root.visible = false; shadowModel.orb.visible = false; darkZordModel.root.visible = false; kaijuModel.root.visible = false;
    for (const m of Object.values(legionModels)) { m.root.visible = false; m.orb.visible = false; }
    if (game.legion && mode !== 'title') for (const e of game.legion) { // the rest of the legion, at the back of the city
      if (e === b || !e.alive) continue;
      const m = legionModels[e.style]; poseHero(m, e); m.root.position.z = -900;
    }
    if (b && b.isShadow) {
      const m = b.style ? legionModels[b.style] : b.zord ? darkZordModel : shadowModel;
      if (b.build !== undefined) { if (b.build > 0) assemble(m, b, b.build); }
      else if (!(b.state === 'dying' && b.deathT > 115)) poseHero(m, b);
    } else if (b && b.isKaiju) poseKaiju(kaijuModel, b);
    else if (b && b.isImp && game.horde && mode !== 'title') {} // the whole horde is drawn below
    else if (b && !b.isNox && !b.isLion) poseBoss(bossModelFor(b.level), b, zordUp ? zm(h) : heroModel);
    // chapter 10: the shade imps, the white wolf running down its moonbeam, and phantom fang's shadows
    for (const m of impModels) if (m) m.root.visible = false;
    if (game.horde && mode !== 'title') for (const m of game.horde) if (m.onField) poseBoss(impModelFor(m.modelIdx), m, heroModel);
    const ws = mode !== 'title' && game.wolfSpirit;
    wolfModel.root.visible = false;
    if (ws) { poseLion(wolfModel, ws, ws.scale); wolfModel.root.position.z = ws.z; }
    moonBeam.visible = false;
    if (ws && h && h.state === 'wolfup' && h.t >= 8 && h.t < 110) {
      const w = Math.min(1, (h.t - 8) / 12) * Math.min(1, (110 - h.t) / 20) * (1 + Math.sin(game.time * 0.9) * 0.06);
      tmpV.set(...MOON); tmpV2.set(X(ws.land), 0, 0);
      aimBeam(moonBeam, tmpV, tmpV2, 0.9 * w);
      moonBeam.userData.hit.scale.setScalar(40 * w); // just a soft pool of light where it touches the roof
    }
    for (const [i, g] of ghostModels.entries()) {
      const gh = mode !== 'title' && game.phantom && game.phantom.ghosts[i];
      g.model.root.visible = false;
      if (gh && gh.fade > 0.01) { poseHero(g.model, gh); g.mat.opacity = 0.42 * gh.fade * (0.85 + Math.random() * 0.15); }
    }
    renderNox(b);
    if (game.ally && saga && !(saga.stage === 'ultimate' && saga.t >= 40)) poseHero(shadowModel, game.ally);
    renderSaga(b);
    poseEagle(eagleModel, mode === 'saga' ? game.eagle : mode !== 'title' && h && h.special === 'flare' ? game.fireBird : null);
    const lg = mode !== 'title' && h && h.special === 'kingbeast' && game.lionGhost;
    lionGhostModel.root.visible = false;
    if (lg) poseLion(lionGhostModel, lg, lg.scale);
    const fires = arenas[5] && arenas[5].root.userData.fires;
    if (fires) fires.visible = (mode === 'title' ? game.menuIdx : game.level) === PHOENIX;
    renderHolograms();
    const fx = mode !== 'title';
    renderEffects(fx ? h : null, fx ? b : null);
    updateCamera();
    renderer.render(scene, camera);
  }

  // ================================================================ HUD (2D canvas on top)
  function text(str, x, y, size, color, align = 'center', stroke = '#000', weight = '900', font = 'Impact, "Arial Black", sans-serif') {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }

  function drawTexts() {
    for (const t of texts) {
      const [sx, sy] = toScreen(t.x, t.y);
      ctx.globalAlpha = clamp(t.life / 20, 0, 1);
      text(t.str, sx, sy, t.size, t.color);
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
    const special = h.ultimate || h.lion || ZORD_NAMES[h.style];
    text(h.ultimate ? 'ULTIMATE MEGAZORD' : h.lion ? 'LION MEGAZORD' : ZORD_NAMES[h.style] || (h.zord ? 'DRAGON MEGAZORD' : h.mount ? 'BLACK LION' : 'KANE'), 44, 26, 22, h.style === 'phoenix' ? '#fb923c' : special ? '#fde047' : '#fff', 'left');
    if (h.rage && !h.zord) text('DRAGON KNIGHT  ·  SWORD x1.5', 110, 26, 16, game.time % 40 < 20 ? '#ffffff' : '#9ca3af', 'left');
    if (h.B) text(`${h.B.name}  ·  ${h.B.tag}`, 110, 26, 16, game.time % 40 < 20 ? h.B.color : h.B.dim, 'left');
    if (h.B && !h.zord && !h.mount) { // the armor switcher: 1 wolf / 2 lion / 3 phoenix
      BEAST_ORDER.forEach((name, i) => {
        const B = BEASTS[name], x = W / 2 - 150 + i * 104, on = h.beast === name;
        ctx.fillStyle = on ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(x, H - 58, 96, 34, 8); ctx.fill();
        ctx.strokeStyle = on ? B.color : 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.stroke();
        text(`${i + 1}`, x + 16, H - 41, 18, on ? B.color : '#6b7280');
        text(name.toUpperCase(), x + 30, H - 41, 13, on ? '#ffffff' : '#9ca3af', 'left', '#000', '800', 'Arial, sans-serif');
      });
    }
    if (h.mount) text('KANE RIDING', 196, 26, 16, '#fde68a', 'left');
    bar(44, 44, 420, 22, h.hp / h.maxHp, h.trail / h.maxHp, h.hp / h.maxHp > 0.3 ? '#4ade80' : '#f87171', h.hp / h.maxHp > 0.3 ? '#15803d' : '#b91c1c');
    const ready = h.energy >= 100;
    if (b.isShadow && b.alive) { // his dark power: full means a dark special is coming
      bar(W - 344, 74, 300, 10, b.energy / 100, b.energy / 100, '#ef4444', '#7f1d1d', true);
      text('DARK POWER', W - 352, 80, 14, b.energy >= 85 && game.time % 20 < 10 ? '#fecaca' : '#f87171', 'right');
    }
    if (game.clash) { // the tug-of-war meter
      const c = game.clash, mx = W / 2 - 250;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.roundRect(mx - 4, 196, 508, 30, 8); ctx.fill();
      ctx.fillStyle = '#e5e7eb'; ctx.fillRect(mx, 200, 500 * clamp(c.meter, 0, 1), 22);
      ctx.fillStyle = '#b91c1c'; ctx.fillRect(mx + 500 * clamp(c.meter, 0, 1), 200, 500 * (1 - clamp(c.meter, 0, 1)), 22);
      ctx.fillStyle = '#fde047'; ctx.fillRect(mx + 248, 196, 4, 30);
      if (game.time % 16 < 10) text('MASH  J !', W / 2, 170, 40, '#fde047', 'center', '#000');
    }
    bar(44, 74, 300, 10, h.energy / 100, h.energy / 100, ready ? '#e0f2fe' : '#38bdf8', ready ? '#38bdf8' : '#0369a1');
    if (h.mount) { // riding: the lion's moves, and the transformation once the bar is full
      text('J  CLAW (J J J BITE)    K  POUNCE    JUMP + J  SKY MAUL    T  TRANSFORM (FULL ENERGY)', 44, H - 41, 15, '#fde68a', 'left', '#000', '800', 'Arial, sans-serif');
      if (ready) text('PRESS  T  —  LION MEGAZORD!', 356, 80, 18, game.time % 20 < 12 ? '#fde047' : '#ffffff', 'left');
    } else if (ready) {
      const c = game.time % 30 < 15 ? '#7dd3fc' : '#e0f2fe';
      text('SPECIAL READY', 356, 80, 15, c, 'left');
      const list = h.style === 'phoenix' ? 'U  FLAME SLASH    I  WATER TORNADO    O  THUNDER    F  MEGA PHOENIX SPLASH'
        : h.B ? h.B.list
        : h.rage ? 'U  FLAME SLASH    I  WATER TORNADO    O  THUNDER JUDGMENT' : 'U  BODY SLAM    I  KAMEHAMEHA    O  HULK SMASH';
      text(list, 44, 102, 14, '#e0f2fe', 'left', '#000', '800', 'Arial, sans-serif');
    }
    // summons: shown once unlocked, lit while still unused this fight
    if (!h.zord && !h.mount) {
      let sx = 44;
      for (const [kind, key, name, col] of [['dragon', 'R', 'DRAGON', '#facc15'], ['lion', 'T', 'LION', '#fde68a']]) {
        if (!game.summonUnlocked(kind)) continue;
        const live = !game.summonUsed[kind];
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(sx, H - 58, 168, 34, 8); ctx.fill();
        ctx.strokeStyle = live ? col : 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.stroke();
        text(key, sx + 18, H - 41, 20, live ? col : '#6b7280');
        text(name, sx + 36, H - 41, 15, live ? '#ffffff' : '#6b7280', 'left', '#000', '800', 'Arial, sans-serif');
        text(live ? 'READY' : 'USED', sx + 158, H - 41, 11, live ? col : '#6b7280', 'right', null, '800', 'Arial, sans-serif');
        sx += 178;
      }
    }
    if (game.level === KAIJU && game.round === 2 && b.floorHit) text('ITS HIDE IS TOO TOUGH — FILL ENERGY AND PRESS T!', W / 2, 120, 22, game.time % 30 < 18 ? '#fde68a' : '#ffffff');
    if (h.element) {
      const E = ELEMENTS[h.element], y = ready ? 128 : 104;
      text(`${E.name} KEY`, 44, y, 18, E.color, 'left');
      text(E.desc, 150, y, 13, '#e5e7eb', 'left', '#000', '700', 'Arial, sans-serif');
      bar(44, y + 14, 200, 6, h.elementT / ELEMENT_TIME, h.elementT / ELEMENT_TIME, E.color, E.color);
    }
    // boss (or, in chapter 10, how many imps are left, and a little health bar over each one on the roof)
    if (game.horde) {
      const left = HORDE_SIZE - game.hordeKills;
      text(`${L.boss}  ·  ${left} LEFT`, W - 44, 26, 22, '#86efac', 'right');
      bar(W - 464, 44, 420, 22, left / HORDE_SIZE, left / HORDE_SIZE, '#4ade80', '#166534', true);
      for (let i = 0; i < HORDE_SIZE; i++) { // one pip per imp
        ctx.fillStyle = i < game.hordeKills ? 'rgba(255,255,255,0.15)' : '#4ade80';
        ctx.beginPath(); ctx.arc(W - 52 - i * 22, 82, 7, 0, TAU); ctx.fill();
      }
      for (const f of game.foes()) {
        if (f.state === 'drop') continue;
        const [sx, sy] = toScreen(f.x, f.y - 190 * f.k);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - 26, sy - 4, 52, 8);
        ctx.fillStyle = f === b ? '#86efac' : '#22c55e'; ctx.fillRect(sx - 25, sy - 3, 50 * f.hp / f.maxHp, 6);
      }
    } else {
      text(L.boss, W - 44, 26, 22, '#ff6b6b', 'right');
      bar(W - 464, 44, 420, 22, b.hp / b.maxHp, b.trail / b.maxHp, b.enraged ? '#ff5252' : '#ef4444', '#7f1d1d', true);
      if (b.state === 'down' || b.state === 'floored') text('DOWN!  HIT IT LOW', W - 44, 86, 16, '#fde047', 'right');
    }
    // level
    text(`LEVEL ${game.level + 1}  ·  ${L.key}`, W / 2, 30, 20, '#fde68a');
    // combo
    if (h.combo >= 2) {
      const s = 1 + Math.min(0.5, h.combo * 0.03);
      text(`${h.combo} HITS`, 60, 160, 34 * s, '#fde047', 'left');
      if (h.combo >= 6) text('POWER x1.2', 62, 192, 16, '#fca5a5', 'left');
    }
  }

  function panel(x, y, w, h, alpha = 0.78) {
    ctx.fillStyle = `rgba(8,10,18,${alpha})`;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill(); ctx.stroke();
  }

  const CARD = { y: 290, w: 118, h: 210, gap: 6 };
  const cardX = (i) => W / 2 - (CARD.w * PLAYABLE + CARD.gap * (PLAYABLE - 1)) / 2 + i * (CARD.w + CARD.gap);
  function cardIndexAt(x, y) {
    for (let i = 0; i < PLAYABLE; i++) if (x >= cardX(i) && x <= cardX(i) + CARD.w && y >= CARD.y && y <= CARD.y + CARD.h) return i;
    return -1;
  }

  function drawTitle() {
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(5,5,12,0.55)'); v.addColorStop(0.4, 'rgba(5,5,12,0.15)'); v.addColorStop(1, 'rgba(5,5,12,0.6)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    const pulse = 1 + Math.sin(game.time * 0.05) * 0.02;
    ctx.save(); ctx.translate(W / 2, 110); ctx.scale(pulse, pulse);
    const tg = ctx.createLinearGradient(0, -50, 0, 50); tg.addColorStop(0, '#ffe08a'); tg.addColorStop(0.5, '#ff7a1a'); tg.addColorStop(1, '#c81e1e');
    ctx.shadowColor = '#ff3b1a'; ctx.shadowBlur = 30;
    text('STEEL BREAKER', 0, 0, 104, tg, 'center', '#1a0505');
    ctx.restore();
    text('3D', W / 2 + 330, 64, 34, '#7dd3fc', 'center', '#04263a');
    text('ONE MAN.  ONE DRAGON.  ONE LION.  ONE PHOENIX.  ONE WOLF.', W / 2, 190, 22, '#e5e7eb', 'center', '#000', '700', 'Arial, sans-serif');

    if (mouse) { const i = cardIndexAt(mouse.x, mouse.y); if (i !== -1) game.menuIdx = i; }
    for (let i = 0; i < PLAYABLE; i++) {
      const L = LEVELS[i], x = cardX(i), sel = i === game.menuIdx, locked = i >= game.unlocked;
      ctx.save();
      if (sel) { ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 28; }
      ctx.fillStyle = sel ? 'rgba(40,14,8,0.88)' : 'rgba(10,12,20,0.78)';
      ctx.strokeStyle = sel ? '#ff9d4a' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = sel ? 3 : 2;
      ctx.beginPath(); ctx.roundRect(x, CARD.y, CARD.w, CARD.h, 16); ctx.fill(); ctx.stroke();
      ctx.restore();
      text(`LEVEL ${i + 1}`, x + 14, CARD.y + 26, 15, '#9ca3af', 'left', null, '700', 'Arial, sans-serif');
      text(L.key, x + 12, CARD.y + 58, 26, ['#4ade80', '#fbbf24', '#ef4444', '#c084fc', '#f87171', '#e879f9', '#38bdf8', '#facc15', '#fb923c', '#bfdbfe'][i], 'left');
      if (!locked) text(L.boss, x + 12, CARD.y + 90, 10, '#fff', 'left', null, '800', 'Arial, sans-serif');
      // little boss silhouette, bigger per level
      ctx.save();
      ctx.globalAlpha = locked ? 0.25 : 0.9;
      ctx.translate(x + CARD.w / 2, CARD.y + 196);
      const k = 0.4 + Math.min(i, 2) * 0.05; ctx.scale(-k, k); ctx.translate(-80, -186);
      if (i === WOLF) { // a wolf howling at a full moon
        ctx.fillStyle = '#bfdbfe'; ctx.beginPath(); ctx.arc(40, 40, 34, 0, TAU); ctx.fill();
        ctx.fillStyle = '#20232b';
        ctx.beginPath(); ctx.moveTo(30, 200); ctx.lineTo(40, 130); ctx.lineTo(70, 96); ctx.lineTo(84, 60); ctx.lineTo(96, 30); ctx.lineTo(104, 50);
        ctx.lineTo(116, 40); ctx.lineTo(116, 70); ctx.lineTo(128, 84); ctx.lineTo(110, 96); ctx.lineTo(120, 150); ctx.lineTo(130, 200); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7dd3fc'; ctx.fillRect(100, 62, 6, 4);
      } else if (i === PHOENIX) { // a fire eagle, wings spread
        ctx.fillStyle = '#20232b';
        ctx.beginPath(); ctx.moveTo(80, 70); ctx.lineTo(-20, 20); ctx.lineTo(10, 90); ctx.lineTo(60, 110); ctx.lineTo(70, 186); ctx.lineTo(90, 186); ctx.lineTo(100, 110); ctx.lineTo(150, 90); ctx.lineTo(180, 20); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(80, 70, 18, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f97316'; for (const fx of [-10, 10, 40, 120, 150, 170]) { ctx.beginPath(); ctx.moveTo(fx, 40); ctx.lineTo(fx + 8, 10); ctx.lineTo(fx + 16, 44); ctx.fill(); }
        ctx.fillStyle = '#fde047'; ctx.fillRect(84, 64, 8, 4);
      } else if (i === KAIJU) { // a towering saurian, plates down its back
        ctx.fillStyle = '#20232b';
        ctx.beginPath(); ctx.moveTo(40, 186); ctx.lineTo(60, 90); ctx.lineTo(90, 40); ctx.lineTo(118, 30); ctx.lineTo(126, 50); ctx.lineTo(104, 60); ctx.lineTo(110, 120); ctx.lineTo(100, 186); ctx.lineTo(80, 186); ctx.lineTo(76, 140); ctx.lineTo(64, 186); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(62, 150); ctx.lineTo(-10, 186); ctx.lineTo(60, 176); ctx.fill();
        ctx.fillStyle = '#38bdf8'; for (let p = 0; p < 4; p++) { ctx.beginPath(); ctx.moveTo(58 + p * 8, 110 - p * 20); ctx.lineTo(48 + p * 8, 96 - p * 20); ctx.lineTo(66 + p * 8, 100 - p * 20); ctx.fill(); }
        ctx.fillStyle = '#fde047'; ctx.fillRect(110, 38, 6, 4);
      } else if (i === SPIRIT) { // a roaring lion's head in its mane
        ctx.fillStyle = '#20232b'; ctx.beginPath(); ctx.arc(80, 110, 70, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7f1d1d'; for (let p = 0; p < 10; p++) { const a = p / 10 * TAU; ctx.beginPath(); ctx.moveTo(80 + Math.cos(a) * 66, 110 + Math.sin(a) * 66); ctx.lineTo(80 + Math.cos(a + 0.2) * 92, 110 + Math.sin(a + 0.2) * 92); ctx.lineTo(80 + Math.cos(a + 0.4) * 66, 110 + Math.sin(a + 0.4) * 66); ctx.fill(); }
        ctx.fillStyle = '#0b0b0e'; ctx.beginPath(); ctx.arc(80, 116, 44, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff2020'; ctx.fillRect(58, 100, 14, 6); ctx.fillRect(88, 100, 14, 6);
      } else if (i === NOX) { // a hooded figure
        ctx.fillStyle = '#20232b'; ctx.beginPath(); ctx.moveTo(80, 40); ctx.lineTo(130, 200); ctx.lineTo(30, 200); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(80, 60, 26, 0, TAU); ctx.fill(); ctx.fillStyle = '#e879f9'; ctx.fillRect(68, 58, 8, 4); ctx.fillRect(86, 58, 8, 4);
      } else if (i === SHADOW) { // a sword instead of a monster
        ctx.fillStyle = '#20232b'; ctx.fillRect(74, 40, 12, 170); ctx.fillRect(50, 150, 60, 12); ctx.fillStyle = '#ef4444'; ctx.fillRect(77, 44, 6, 100);
      } else {
        ctx.fillStyle = '#20232b'; ctx.fill(P.body); ctx.fill(P.head); ctx.fill(i >= 2 ? P.bigHornL : P.hornL); ctx.fill(i >= 2 ? P.bigHornR : P.hornR);
        ctx.fillStyle = '#ff2b2b'; ctx.fill(P.eyeL); ctx.fill(P.eyeR);
      }
      ctx.restore();
      if (locked) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(x, CARD.y, CARD.w, CARD.h, 16); ctx.fill();
        const lx = x + CARD.w / 2, ly = CARD.y + 128;
        ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(lx, ly - 10, 12, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#9ca3af'; ctx.beginPath(); ctx.roundRect(lx - 18, ly - 10, 36, 28, 5); ctx.fill();
        text(`LOCKED · beat ${i} first`, lx, CARD.y + 178, 12, '#9ca3af', 'center', null, '700', 'Arial, sans-serif');
      }
    }
    const selL = LEVELS[game.menuIdx];
    if (game.menuIdx < game.unlocked) text(`${selL.boss}  —  ${selL.tagline}`, W / 2, 524, 16, '#cbd5e1', 'center', '#000', '700', 'Arial, sans-serif');
    const blink = game.time % 60 < 40;
    if (blink) text(game.menuIdx < game.unlocked ? 'PRESS ENTER OR CLICK TO FIGHT' : 'LEVEL LOCKED', W / 2, 560, 24, '#fde68a');

    panel(W / 2 - 540, 590, 1080, 100, 0.72);
    const rows = [
      ['MOVE', 'A / D  or  ← →'], ['JUMP', 'W / ↑ / SPACE'], ['PUNCH · KICK', 'J · K  (chain combos)'], ['BLOCK · DODGE · ONE-SHOT', 'S / ↓  ·  SHIFT  ·  L'],
      ['SPECIALS (full energy)', 'U slam · I kamehameha · O hulk'], ['SUMMONS (once per fight)', 'R dragon · T lion'], ['LION · PHOENIX · WOLF', 'T transform · F splash · O fang'], ['ARMOR · PAUSE · MUTE', '1 wolf 2 lion 3 phoenix · P · M'],
    ];
    rows.forEach(([k, val], i) => {
      const cx = W / 2 - 515 + (i % 4) * 265, cy = 618 + Math.floor(i / 4) * 42;
      text(k, cx, cy, 13, '#fbbf24', 'left', null, '800', 'Arial, sans-serif');
      text(val, cx, cy + 17, 15, '#e5e7eb', 'left', null, '600', 'Arial, sans-serif');
    });
    text('Combos: J J J · J J K · K K · K J J K · jump + J  —  punch or kick a grenade to bat it back!', W / 2, 250, 16, '#93c5fd', 'center', '#000', '700', 'Arial, sans-serif');
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

  // letterbox bars for the cutscene, and the call to get back up
  function drawSaga() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 64); ctx.fillRect(0, H - 64, W, 64);
    const s = game.saga;
    if (s.stage === 'down' && s.t > 30) {
      const a = Math.min(1, (s.t - 30) / 20), lion = s.kind === 'lion';
      ctx.globalAlpha = a;
      ctx.fillStyle = lion ? 'rgba(0,20,40,0.35)' : 'rgba(30,0,40,0.35)'; ctx.fillRect(0, 64, W, H - 128);
      text('KANE HAS FALLEN', W / 2, 250, 84, lion ? '#7dd3fc' : '#f0abfc', 'center', lion ? '#001a26' : '#1a0020');
      if (game.time % 60 < 42) text(lion ? 'PRESS  T  TO SUMMON THE BLACK LION' : 'PRESS  R  TO RISE AGAIN', W / 2, 340, 38, '#ffffff', 'center', '#000');
      ctx.globalAlpha = 1;
    }
    const tint = { [SHADOW]: '#f87171', [KAIJU]: '#7dd3fc', [SPIRIT]: '#86efac', [PHOENIX]: '#fb923c' }[game.level] || '#c084fc';
    text(`LEVEL ${game.level + 1}  ·  ${LEVELS[game.level].key}`, W / 2, 32, 18, tint);
  }

  // ---- story HUD: letterbox, dialogue box with a drawn portrait and typewriter text
  function letterbox() { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 64); ctx.fillRect(0, H - 64, W, 64); }

  function drawPortrait(who, x, y, s) {
    const c = (px, py) => [x + px * s, y + py * s]; // portrait-space (0..1) to screen
    const rect = (px, py, pw, ph, col) => { ctx.fillStyle = col; ctx.fillRect(x + px * s, y + py * s, pw * s, ph * s); };
    const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(...c(px, py)) : ctx.moveTo(...c(px, py)))); ctx.closePath(); ctx.fill(); };
    const circ = (px, py, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(...c(px, py), r * s, 0, TAU); ctx.fill(); };
    const b = game.boss, h = game.hero;
    if (who === 'boss' && b && b.isShadow) who = 'shadow';
    const bg = { kane: '#1e293b', elder: '#3b2a0a', nox: '#1e0b36', boss: '#1c0606', shadow: '#1c0606', vorath: '#052e16', lion: '#1c1608', wolf: '#0b1736' }[who];
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, s, s, 12); ctx.fillStyle = bg; ctx.fill(); ctx.clip();
    if (who === 'wolf') { // a white wolf's head, ears up, under the moon
      circ(0.82, 0.18, 0.14, '#e2e8f0');
      poly([[0.22, 0.42], [0.2, 0.06], [0.42, 0.3]], '#f1f5f9'); poly([[0.78, 0.42], [0.8, 0.06], [0.58, 0.3]], '#f1f5f9');
      poly([[0.26, 0.38], [0.25, 0.14], [0.38, 0.32]], '#93c5fd'); poly([[0.74, 0.38], [0.75, 0.14], [0.62, 0.32]], '#93c5fd');
      poly([[0.14, 0.5], [0.3, 0.3], [0.7, 0.3], [0.86, 0.5], [0.8, 0.86], [0.5, 1.02], [0.2, 0.86]], '#f8fafc');
      poly([[0.36, 0.56], [0.64, 0.56], [0.58, 0.9], [0.42, 0.9]], '#e2e8f0');
      circ(0.5, 0.86, 0.06, '#1e293b');
      poly([[0.27, 0.5], [0.42, 0.53], [0.29, 0.57]], '#38bdf8'); poly([[0.73, 0.5], [0.58, 0.53], [0.71, 0.57]], '#38bdf8');
    } else if (who === 'kane' && h && h.wolf) { // the wolf helm
      rect(0.2, 0.2, 0.6, 0.72, '#f8fafc'); rect(0.28, 0.48, 0.44, 0.16, '#0f172a'); rect(0.32, 0.53, 0.14, 0.05, '#7dd3fc'); rect(0.54, 0.53, 0.14, 0.05, '#7dd3fc');
      poly([[0.22, 0.24], [0.26, -0.04], [0.42, 0.2]], '#f8fafc'); poly([[0.78, 0.24], [0.74, -0.04], [0.58, 0.2]], '#f8fafc');
      rect(0.38, 0.3, 0.24, 0.14, '#e2e8f0'); rect(0.46, 0.4, 0.08, 0.05, '#0f172a');
    } else if (who === 'kane' && h && h.beast === 'phoenix') { // the phoenix helm: red, a gold beak, a crest of fire
      for (let i = 0; i < 5; i++) poly([[0.3 + i * 0.1, 0.24], [0.26 + i * 0.12, -0.04], [0.42 + i * 0.1, 0.22]], i % 2 ? '#fde047' : '#f97316');
      rect(0.2, 0.2, 0.6, 0.72, '#b91c1c'); rect(0.26, 0.44, 0.48, 0.16, '#1c0a0a');
      rect(0.31, 0.48, 0.14, 0.05, '#fde047'); rect(0.55, 0.48, 0.14, 0.05, '#fde047');
      poly([[0.42, 0.56], [0.58, 0.56], [0.5, 0.9]], '#f59e0b');
    } else if (who === 'lion' || (who === 'kane' && h && (h.lion || h.beast === 'lion'))) { // a lion's face in a spiked black-and-gold mane
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; poly([[0.5 + Math.cos(a) * 0.5, 0.52 + Math.sin(a) * 0.5], [0.5 + Math.cos(a + 0.3) * 0.3, 0.52 + Math.sin(a + 0.3) * 0.3], [0.5 + Math.cos(a - 0.3) * 0.3, 0.52 + Math.sin(a - 0.3) * 0.3]], i % 2 ? '#d4a017' : '#3a2a14'); }
      circ(0.5, 0.52, 0.3, '#1c1c22'); rect(0.38, 0.6, 0.24, 0.2, '#26262e'); rect(0.45, 0.6, 0.1, 0.06, '#0b0b0e');
      poly([[0.32, 0.44], [0.45, 0.48], [0.33, 0.5]], '#facc15'); poly([[0.68, 0.44], [0.55, 0.48], [0.67, 0.5]], '#facc15');
      poly([[0.5, 0.18], [0.46, 0.3], [0.54, 0.3]], '#d4a017');
    } else if (who === 'vorath') { // a horned skull in a black hood, green fire for eyes
      poly([[0.5, 0.04], [0.92, 0.5], [0.84, 1.02], [0.16, 1.02], [0.08, 0.5]], '#020403');
      poly([[0.3, 0.3], [0.16, 0.02], [0.36, 0.24]], '#d6d3d1'); poly([[0.7, 0.3], [0.84, 0.02], [0.64, 0.24]], '#d6d3d1');
      circ(0.5, 0.5, 0.22, '#d6d3d1'); rect(0.38, 0.68, 0.24, 0.12, '#d6d3d1');
      circ(0.41, 0.48, 0.065, '#020403'); circ(0.59, 0.48, 0.065, '#020403'); circ(0.41, 0.48, 0.03, '#4ade80'); circ(0.59, 0.48, 0.03, '#4ade80');
      for (let i = 0; i < 4; i++) rect(0.4 + i * 0.06, 0.72, 0.02, 0.06, '#020403');
    } else if (who === 'boss' && b && b.isKaiju) { // the behemoth's head in profile, plates behind
      for (let i = 0; i < 4; i++) poly([[0.1 + i * 0.1, 0.5], [0.04 + i * 0.1, 0.14 + i * 0.04], [0.2 + i * 0.1, 0.42]], '#9ca3af');
      poly([[0.12, 0.62], [0.38, 0.34], [0.86, 0.38], [0.96, 0.56], [0.86, 0.64], [0.4, 0.8]], '#2b3328');
      poly([[0.4, 0.66], [0.94, 0.62], [0.86, 0.78], [0.42, 0.86]], '#141812');
      for (let i = 0; i < 6; i++) poly([[0.46 + i * 0.075, 0.64], [0.49 + i * 0.075, 0.71], [0.52 + i * 0.075, 0.64]], '#e8e2d0');
      poly([[0.56, 0.44], [0.68, 0.46], [0.57, 0.5]], '#fde047');
    } else if (who === 'kane' && h && h.zord) { // the megazord's head
      rect(0.22, 0.2, 0.56, 0.7, '#15161b'); rect(0.34, 0.42, 0.32, 0.36, '#eef0f4'); rect(0.3, 0.46, 0.4, 0.07, '#4ade80');
      poly([[0.5, 0.02], [0.42, 0.24], [0.58, 0.24]], '#d4a017');
    } else if (who === 'kane' && h && h.rage) { // the dragon knight's helmet
      rect(0.2, 0.18, 0.6, 0.74, '#0d0e12'); rect(0.32, 0.4, 0.36, 0.42, '#f1f3f6'); rect(0.3, 0.46, 0.4, 0.07, '#e5e7eb');
      poly([[0.5, 0.0], [0.44, 0.2], [0.56, 0.2]], '#16181d'); poly([[0.2, 0.3], [0.04, 0.12], [0.24, 0.24]], '#16181d'); poly([[0.8, 0.3], [0.96, 0.12], [0.76, 0.24]], '#16181d');
    } else if (who === 'kane') {
      rect(0.24, 0.2, 0.52, 0.66, '#c98a52'); rect(0.22, 0.14, 0.56, 0.14, '#1b1210'); rect(0.22, 0.27, 0.56, 0.07, '#e53935');
      rect(0.33, 0.44, 0.1, 0.05, '#fff'); rect(0.57, 0.44, 0.1, 0.05, '#fff'); rect(0.37, 0.44, 0.05, 0.05, '#111'); rect(0.6, 0.44, 0.05, 0.05, '#111');
      rect(0.31, 0.39, 0.14, 0.03, '#111'); rect(0.55, 0.39, 0.14, 0.03, '#111'); rect(0.4, 0.7, 0.2, 0.03, '#7a4a22');
      rect(0.18, 0.86, 0.64, 0.2, '#c98a52');
    } else if (who === 'elder') {
      circ(0.5, 0.42, 0.22, '#e8c39e'); circ(0.5, 0.17, 0.09, '#f5f5f5');
      poly([[0.3, 0.5], [0.7, 0.5], [0.5, 1.02]], '#f5f5f5');
      rect(0.38, 0.38, 0.08, 0.04, '#fcd34d'); rect(0.54, 0.38, 0.08, 0.04, '#fcd34d'); rect(0.34, 0.33, 0.12, 0.03, '#f5f5f5'); rect(0.54, 0.33, 0.12, 0.03, '#f5f5f5');
    } else if (who === 'nox') {
      poly([[0.5, 0.06], [0.86, 0.44], [0.8, 1.02], [0.2, 1.02], [0.14, 0.44]], '#2e1065');
      circ(0.5, 0.5, 0.22, '#05010a');
      poly([[0.34, 0.46], [0.46, 0.5], [0.34, 0.52]], '#e879f9'); poly([[0.66, 0.46], [0.54, 0.5], [0.66, 0.52]], '#e879f9');
      for (let i = 0; i < 5; i++) poly([[0.3 + i * 0.1, 0.12], [0.35 + i * 0.1, i === 2 ? -0.04 : 0.02], [0.4 + i * 0.1, 0.12]], '#a855f7');
    } else if (who === 'shadow') {
      rect(0.2, 0.18, 0.6, 0.74, '#0b0b0d'); rect(0.32, 0.4, 0.36, 0.42, '#7f1d1d'); rect(0.28, 0.46, 0.44, 0.07, '#ff2020');
      poly([[0.5, 0.0], [0.44, 0.2], [0.56, 0.2]], '#7f1d1d');
    } else { // a monster: horned head, slanted eyes, teeth
      const pal = (b ? b.L : LEVELS[game.level]).palette;
      poly([[0.26, 0.3], [0.12, 0.0], [0.36, 0.24]], '#e8e2d0'); poly([[0.74, 0.3], [0.88, 0.0], [0.64, 0.24]], '#e8e2d0');
      circ(0.5, 0.52, 0.34, pal.shell[0]); rect(0.24, 0.42, 0.52, 0.14, '#050507');
      poly([[0.28, 0.43], [0.45, 0.5], [0.3, 0.53]], pal.eye); poly([[0.72, 0.43], [0.55, 0.5], [0.7, 0.53]], pal.eye);
      for (let i = 0; i < 5; i++) poly([[0.32 + i * 0.08, 0.68], [0.36 + i * 0.08, 0.78], [0.4 + i * 0.08, 0.68]], '#e8e2d0');
    }
    ctx.restore();
    ctx.strokeStyle = CAST[who] ? CAST[who].color : '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(x, y, s, s, 12); ctx.stroke();
  }

  function wrapLines(str, maxW, size) {
    ctx.font = `700 ${size}px Arial, sans-serif`;
    const out = []; let line = '';
    for (const w of str.split(' ')) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    }
    if (line) out.push(line);
    return out;
  }

  function drawStory() {
    letterbox();
    const st = game.story, line = st.lines[st.i], who = line[0], chapter = STORY[game.level];
    text(`CHAPTER ${game.level + 1}  ·  ${chapter.title}`, W / 2, 32, 20, '#fde68a');
    text('ENTER: next   ·   ESC: skip', W - 24, H - 32, 14, '#9ca3af', 'right', null, '700', 'Arial, sans-serif');
    panel(70, 470, 1140, 168, 0.9);
    drawPortrait(who, 90, 490, 128);
    const name = who === 'boss' ? LEVELS[game.boss.level].boss : CAST[who].name;
    text(name, 240, 500, 24, CAST[who].color, 'left');
    // wrap the whole line once so words don't jump as they type in
    const full = wrapLines(line[1], 930, 22);
    let left = Math.floor(st.chars);
    full.forEach((l, i) => {
      const shown = l.slice(0, Math.max(0, left)); left -= l.length + 1;
      if (shown) text(shown, 240, 540 + i * 30, 22, '#f3f4f6', 'left', null, '700', 'Arial, sans-serif');
    });
    if (st.chars >= line[1].length && game.time % 40 < 26) text('▶', 1186, 616, 22, CAST[who].color, 'center', null);
  }

  function drawMoveList(x, y) {
    panel(x, y, 560, 380, 0.85);
    text('COMBOS', x + 280, y + 30, 26, '#fbbf24');
    COMBO_LIST.forEach(([keysStr, desc], i) => {
      const yy = y + 66 + i * 26;
      text(keysStr, x + 30, yy, 17, '#7dd3fc', 'left', null, '800', 'Arial, sans-serif');
      text(desc, x + 180, yy, 16, '#e5e7eb', 'left', null, '600', 'Arial, sans-serif');
    });
    text('SPECIALS (full energy):  U body slam (get close)  ·  I kamehameha  ·  O hulk smash', x + 280, y + 300, 14, '#86efac', 'center', null, '700', 'Arial, sans-serif');
    text('ARMORED (5s in): finishers fire slashes  ·  U flame slash  ·  I water tornado  ·  O thunder', x + 280, y + 324, 14, '#93c5fd', 'center', null, '700', 'Arial, sans-serif');
    text('KEYS: walk over them  ·  FIRE burns  ·  WATER heals + slows  ·  THUNDER lightning', x + 280, y + 348, 14, '#fde68a', 'center', null, '700', 'Arial, sans-serif');
  }

  function drawOverlay() {
    const L = game.boss?.L;
    if (game.mode === 'intro') {
      const t = game.modeT;
      if (t < 120) {
        const a = Math.min(1, t / 15) * Math.min(1, (120 - t) / 15);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 470, W, 170);
        text(`LEVEL ${game.level + 1}  ·  ${L.key}`, W / 2, 515, 40, '#fde68a');
        text(L.boss, W / 2, 580, 72, '#ff4d4d', 'center', '#1a0000');
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
      text('PAUSED', W / 2, 150, 90, '#fff');
      text('P / ENTER to resume   ·   Q to quit to menu', W / 2, 220, 22, '#cbd5e1', 'center', null, '600', 'Arial, sans-serif');
      drawMoveList(W / 2 - 280, 250);
    }
    if (game.mode === 'won') { // the big WIN, then it slides up above the results
      const t = game.modeT, pop = Math.min(1, t / 12), big = t < 130;
      ctx.save();
      ctx.translate(W / 2, big ? 300 : 140); const sc = big ? 1 + (1 - pop) * 1.4 : 0.55; ctx.scale(sc, sc);
      ctx.globalAlpha = pop;
      const wg = ctx.createLinearGradient(0, -90, 0, 90); wg.addColorStop(0, '#fff7c2'); wg.addColorStop(0.5, '#fde047'); wg.addColorStop(1, '#f59e0b');
      ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 40;
      text('WIN!', 0, 0, 200, wg, 'center', '#3b1d00');
      ctx.restore();
      if (big && t > 20) text(`${L.boss} ${L.defeat || 'DESTROYED'}`, W / 2, 440, 36, '#ffffff', 'center', '#000');
    }
    if (game.mode === 'won' && game.modeT > 130) {
      const h = game.hero, a = Math.min(1, (game.modeT - 130) / 20);
      ctx.globalAlpha = a;
      panel(W / 2 - 330, 200, 660, 300);
      text(`${L.boss} ${L.defeat || 'DESTROYED'}`, W / 2, 255, 44, '#fde047');
      const secs = Math.round(game.fightT / 60);
      text(`Time ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}    ·    Best combo ${h.maxCombo}    ·    Damage taken ${h.damageTaken}`, W / 2, 320, 20, '#e5e7eb', 'center', null, '700', 'Arial, sans-serif');
      const rank = h.damageTaken < h.maxHp * 0.15 ? 'S' : h.damageTaken < h.maxHp * 0.4 ? 'A' : h.damageTaken < h.maxHp * 0.7 ? 'B' : 'C';
      text(`RANK ${rank}`, W / 2, 385, 54, { S: '#fde047', A: '#4ade80', B: '#7dd3fc', C: '#cbd5e1' }[rank]);
      text(game.level < PLAYABLE - 1 ? 'ENTER: next level   ·   ESC: menu' : 'ENTER: claim your title   ·   ESC: menu', W / 2, 455, 20, '#fbbf24', 'center', null, '700', 'Arial, sans-serif');
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

  const CREDITS = [
    ['STEEL BREAKER 3D', ''], ['', ''],
    ['KANE', 'the Dragon Knight'], ['ELDER SHIN', 'last guardian of the Dragon Order'], ['EMPEROR NOX', 'the emptiness between the stars'], ['THE SHADOW KNIGHT', 'who found the light'],
    ['THE BLACK LION', 'who came home'], ['THE PHOENIX', 'third guardian of the Order'], ['THE WHITE WOLF', 'who runs down the moonlight'], ['VORATH', 'the Soul Reaver, still watching'], ['', ''],
    ['THE MONSTERS', ''], ['SCRAP SENTINEL', ''], ['IRON WARLORD', ''], ['OMEGA TITAN', ''], ['ABYSS KING', ''], ['NOX TITAN', ''], ['BEHEMOTH', 'King of Monsters'], ['', ''],
    ["VORATH'S LEGION", ''], ['RAVAGER', ''], ['VENOMAX', ''], ['FROSTFANG', ''], ['VOLTRIX', ''], ['THE SHADE IMPS', 'all ten of them'], ['', ''],
    ['THE ARMORS', ''], ['DRAGON KNIGHT', ''], ['WHITE WOLF ARMOR', ''], ['', ''],
    ['THE GUARDIANS', ''], ['DRAGON MEGAZORD', ''], ['DARK MEGAZORD', ''], ['ULTIMATE MEGAZORD', ''], ['LION MEGAZORD', ''], ['DRAGON LION MEGAZORD', ''], ['PHOENIX MEGAZORD', ''], ['', ''],
    ['THANK YOU FOR PLAYING', ''], ['TO BE CONTINUED...', ''],
  ];
  function drawCredits() {
    letterbox();
    const v = ctx.createLinearGradient(0, 0, W * 0.6, 0); v.addColorStop(0, 'rgba(0,0,0,0.65)'); v.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = v; ctx.fillRect(0, 64, W, H - 128);
    const y0 = H + 40 - game.modeT * 1.1;
    CREDITS.forEach(([title, sub], i) => {
      const y = Math.max(y0 + i * 70, i === CREDITS.length - 1 ? H / 2 : -999);
      if (y < 40 || y > H + 40) return;
      const big = i === 0 || i === CREDITS.length - 1;
      text(title, 320, y, big ? 52 : 30, big ? '#fde047' : '#ffffff', 'center', '#000');
      if (sub) text(sub, 320, y + 28, 16, '#cbd5e1', 'center', null, '700', 'Arial, sans-serif');
    });
    text('ENTER: skip', W - 24, H - 32, 14, '#9ca3af', 'right', null, '700', 'Arial, sans-serif');
  }

  function drawComplete() {
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(0,0,0,0.55)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    const tg = ctx.createLinearGradient(0, 70, 0, 170); tg.addColorStop(0, '#fff7c2'); tg.addColorStop(1, '#f59e0b');
    ctx.save(); ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 40;
    text('CHAMPION OF STEEL', W / 2, 110, 92, tg, 'center', '#3b1d00');
    ctx.restore();
    text('The legion is slag, the Phoenix has risen, and Vorath is on the run. The city is safe.', W / 2, 190, 26, '#fde68a', 'center', null, '700', 'Arial, sans-serif');
    if (game.modeT > 120 && game.time % 60 < 40) text('PRESS ENTER', W / 2, 660, 26, '#fff');
  }

  function render() {
    render3D();
    ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (game.mode === 'complete') drawComplete();
    else if (game.mode === 'credits') drawCredits();
    else {
      if (game.storm > 0) { ctx.fillStyle = `rgba(4,6,18,${0.35 * game.storm})`; ctx.fillRect(0, 0, W, H); } // thunderstorm gloom
      drawTexts();
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash / 20})`; ctx.fillRect(0, 0, W, H); }
      if (game.mode === 'title') drawTitle();
      else if (game.mode === 'saga') drawSaga();
      else if (game.mode === 'story') drawStory();
      else if (game.mode === 'finish') letterbox();
      else { drawHud(); drawOverlay(); }
    }
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

  if (params.has('level')) game.start(clamp(parseInt(params.get('level'), 10) || 0, 0, PLAYABLE - 1));
  if (params.has('saga')) { game.start(ABYSS); game.mode = 'fight'; game.boss.hp = 0; game.boss.die(); }
  if (params.has('finish')) { game.mode = 'fight'; game.hero.beast = 'wolf'; game.hero.revived = true; game.boss.hp = 0; game.boss.die(); } // debug: the finishing blow
  if (params.has('noxsaga')) { game.start(NOX); game.mode = 'fight'; game.hero.beast = 'wolf'; game.hero.revived = true; game.boss.hp = 0; game.boss.die(); }
  if (params.has('titan')) { game.start(NOX); game.giant = true; game.retry(); }
  if (params.has('credits')) { game.start(NOX); game.startCredits(); }
  if (params.has('shadowsaga')) { game.start(SHADOW); game.mode = 'fight'; game.boss.hp = 0; game.boss.die(); }
  if (params.has('darkzord')) { game.start(SHADOW); game.sky = true; game.retry(); }
  if (params.has('zord')) { game.start(ABYSS); game.giant = true; game.retry(); }
  if (params.has('complete')) { game.level = PLAYABLE - 1; game.advance(); game.modeT = 200; } // debug: ending screen
  if (params.has('lionsaga')) { game.start(KAIJU, true); game.mode = 'fight'; game.hero.beast = 'wolf'; game.hero.revived = true; game.startLionSaga(); }
  if (params.has('ride')) { game.start(KAIJU, true); game.hero.beast = 'wolf'; game.hero.revived = true; game.beginRide(); }
  if (params.has('lionzord')) { game.start(KAIJU, true); game.beginLionZordRound(); }
  if (params.has('steal')) { game.start(SPIRIT, true); game.startStealSaga(); }
  if (params.has('legion')) game.start(PHOENIX, true); // starts with kane calling the dragon
  if (params.has('unite')) { game.start(PHOENIX, true); game.zordHero = makeZordHero(300); game.beginZordFight(); game.round = 1; game.hero.hp = 100; game.startUniteSaga(); }
  if (params.has('phoenix')) { game.start(PHOENIX, true); game.zordHero = makeZordHero(300, 'dragonlion'); game.beginZordFight(); game.round = 2; game.hero.hp = 100; game.startPhoenixSaga(); }
  if (params.has('phoenixzord')) { game.start(PHOENIX, true); game.beginPhoenixRound(1); }
  if (params.has('wolfup')) { game.start(WOLF, true); game.mode = 'fight'; game.hero.startWolfUp(); }
  if (params.has('spirit')) { game.start(SPIRIT, true); game.mode = 'fight'; game.hero.beast = 'wolf'; game.hero.revived = true; game.boss.hp = 0; game.boss.die(); }
  // debug: fast-forward N frames of simulation (for screenshots / balance testing)
  if (params.has('ff')) { const n = parseInt(params.get('ff'), 10) || 0; for (let i = 0; i < n; i++) { game.tick(); pressed.clear(); } }
  window.__game = game; // handy for debugging in the console
  canvas.focus();
  requestAnimationFrame(frame);
})();
