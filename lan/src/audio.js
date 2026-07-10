// Synthesised sound effects via the Web Audio API — no external files, works
// offline. A gunshot is a fast-decaying filtered noise "crack" plus a low
// "thump"; melee is a swish; kill is a short stinger.

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
function noise(c, dur) {
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i += 1) d[i] = Math.random() * 2 - 1;
  return b;
}

// --- ambient bed (wind + birds in the field, low hum in the base) ----------
let ambient = null; // { nodes: [], timer }
function stopAmbient() {
  if (!ambient) return;
  for (const n of ambient.nodes) { try { n.stop ? n.stop() : n.disconnect(); } catch (_) {} }
  if (ambient.timer) clearTimeout(ambient.timer);
  ambient = null;
}

export const audio = {
  resume() { ac(); }, // call from a user gesture to unlock audio

  // Switch the looping ambience: "forest" | "base" | null (off).
  setAmbient(kind) {
    const c = ac(); if (!c) return;
    stopAmbient();
    if (!kind) return;
    ambient = { nodes: [], timer: null };
    if (kind === "forest") {
      // wind: looping noise through a slowly-wobbling lowpass
      const src = c.createBufferSource(); src.buffer = noise(c, 2.5); src.loop = true;
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 420; f.Q.value = 0.4;
      const g = c.createGain(); g.gain.value = 0.045;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
      const lfoG = c.createGain(); lfoG.gain.value = 160;
      lfo.connect(lfoG).connect(f.frequency);
      src.connect(f).connect(g).connect(c.destination);
      src.start(); lfo.start();
      ambient.nodes.push(src, lfo, g);
      // occasional bird chirps
      const chirp = () => {
        if (!ambient) return;
        const t = c.currentTime + 0.02;
        const o = c.createOscillator(); o.type = "sine";
        const base = 2400 + Math.random() * 1600;
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * (1.1 + Math.random() * 0.4), t + 0.07);
        o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.16);
        const og = c.createGain(); og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(og).connect(c.destination); o.start(t); o.stop(t + 0.22);
        ambient.timer = setTimeout(chirp, 1800 + Math.random() * 5200);
      };
      ambient.timer = setTimeout(chirp, 1200);
    } else if (kind === "base") {
      // facility hum: low sine + faint filtered noise
      const o = c.createOscillator(); o.type = "sine"; o.frequency.value = 58;
      const og = c.createGain(); og.gain.value = 0.022;
      o.connect(og).connect(c.destination); o.start();
      const src = c.createBufferSource(); src.buffer = noise(c, 2.0); src.loop = true;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 0.6;
      const g = c.createGain(); g.gain.value = 0.012;
      src.connect(f).connect(g).connect(c.destination); src.start();
      ambient.nodes.push(o, src, og, g);
    }
  },

  // Footstep: soft filtered thud; crouch = quieter, sprint = harder.
  footstep(mode = "walk") {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const vol = mode === "crouch" ? 0.05 : mode === "sprint" ? 0.16 : 0.1;
    const src = c.createBufferSource(); src.buffer = noise(c, 0.07);
    const f = c.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(700 + Math.random() * 300, t);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + 0.08);
  },

  // Headshot: sharp metallic ding layered over the hit.
  headshot() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(2600, t);
    o.frequency.exponentialRampToValueAtTime(1900, t + 0.09);
    const g = c.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.15);
  },

  // Slide: a short gravelly whoosh (filtered noise sweeping down).
  slide() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noise(c, 0.5);
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.9;
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(320, t + 0.42);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + 0.5);
  },

  // UI: short soft click for menu buttons.
  click() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(1150, t);
    const g = c.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.06);
  },

  shot(kind) {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    if (kind === "knife") {
      const src = c.createBufferSource(); src.buffer = noise(c, 0.2);
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + 0.21);
      return;
    }
    const pistol = kind === "pistol";
    const smg = kind === "smg";
    const dur = pistol ? 0.12 : smg ? 0.09 : 0.17;
    const src = c.createBufferSource(); src.buffer = noise(c, dur);
    const f = c.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(pistol ? 5200 : smg ? 6200 : 3600, t); f.frequency.exponentialRampToValueAtTime(smg ? 600 : 380, t + dur);
    const g = c.createGain(); const peak = pistol ? 0.32 : smg ? 0.26 : 0.42;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + dur);
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    const og = c.createGain(); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(og).connect(c.destination); o.start(t); o.stop(t + 0.13);
  },

  reload() {
    const c = ac(); if (!c) return;
    for (const off of [0, 0.18, 0.34]) {
      const t = c.currentTime + off;
      const src = c.createBufferSource(); src.buffer = noise(c, 0.05);
      const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1500;
      const g = c.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + 0.06);
    }
  },

  kill() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = "square";
    o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.18);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.23);
    const o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.setValueAtTime(1400, t + 0.05);
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.15, t + 0.05); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o2.connect(g2).connect(c.destination); o2.start(t + 0.05); o2.stop(t + 0.21);
  },

  // Distant, muffled crack for enemy fire — clearly quieter than the player's gun.
  enemyShot() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noise(c, 0.12);
    const f = c.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(220, t + 0.12);
    const g = c.createGain(); g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + 0.13);
  },

  hurt() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
    const g = c.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.19);
    const src = c.createBufferSource(); src.buffer = noise(c, 0.08);
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.2, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(f).connect(g2).connect(c.destination); src.start(t); src.stop(t + 0.09);
  },

  // Loot pickup: short bright two-note blip.
  pickup() {
    const c = ac(); if (!c) return;
    [880, 1320].forEach((freq, i) => {
      const t = c.currentTime + i * 0.06;
      const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(freq, t);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.12);
    });
  },

  heal() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(950, t + 0.22);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.27);
  },

  levelup() {
    const c = ac(); if (!c) return;
    [660, 880, 1320].forEach((freq, i) => {
      const t = c.currentTime + i * 0.09;
      const o = c.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(freq, t);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.23);
    });
  },
};
