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

export const audio = {
  resume() { ac(); }, // call from a user gesture to unlock audio

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
    const dur = pistol ? 0.12 : 0.17;
    const src = c.createBufferSource(); src.buffer = noise(c, dur);
    const f = c.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(pistol ? 5200 : 3600, t); f.frequency.exponentialRampToValueAtTime(380, t + dur);
    const g = c.createGain(); const peak = pistol ? 0.32 : 0.42;
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
