// All sound is synthesised with WebAudio — no audio files, no network.
// Engine hum follows speed, a two-tone siren follows the nearest police
// car, gunshots are noise bursts, and a looping synthwave pattern
// (bass, pad, arpeggio) plays as SOLMAR FM. Everything is guarded so a
// browser without audio (or before the first user gesture) just stays
// silent instead of throwing.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      // Synthwave loop: 8-step bass + arpeggio, scheduled ahead.
      const bassNotes = [55, 55, 65.41, 49, 55, 55, 73.42, 82.41];
      const arpNotes = [220, 261.63, 329.63, 440, 329.63, 261.63, 196, 164.81];
      musicTimer = window.setInterval(() => {
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        const i = step % 8;
        blip(bassNotes[i], t, 0.22, 'triangle', 0.5, musicGain);
        blip(arpNotes[(step * 3) % 8], t + 0.11, 0.12, 'square', 0.12, musicGain);
        if (step % 8 === 0) blip(110, t, 0.5, 'sine', 0.25, musicGain);
        step += 1;
      }, 240);
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function blip(freq, when, dur, type, vol, dest) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(dest || master);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function noise(when, dur, vol, lowpass) {
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(when);
  }

  return {
    // Call from any user gesture (button click, key press) so the context may start.
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master && ctx) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    setEngine(speed01, on) {
      if (!ctx) return;
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = on ? 0.05 + speed01 * 0.05 : 0;
    },
    setSiren(on, distance) {
      if (!ctx) return;
      sirenGain.gain.value = on ? Math.max(0, 0.05 - distance * 0.0006) : 0;
      sirenOsc.frequency.value = 700 + 180 * Math.sin(performance.now() / 450);
    },
    gunshot() { if (ensure()) noise(ctx.currentTime, 0.14, 0.5, 2400); },
    punch() { if (ensure()) blip(90, ctx.currentTime, 0.12, 'sine', 0.5); },
    pickup() {
      if (!ensure()) return;
      blip(880, ctx.currentTime, 0.1, 'sine', 0.3);
      blip(1318, ctx.currentTime + 0.08, 0.14, 'sine', 0.3);
    },
    crash() { if (ensure()) noise(ctx.currentTime, 0.25, 0.4, 900); },
    horn() { if (ensure()) blip(370, ctx.currentTime, 0.35, 'square', 0.18); },
    missionComplete() {
      if (!ensure()) return;
      [523, 659, 784, 1046].forEach((f, i) => blip(f, ctx.currentTime + i * 0.09, 0.22, 'triangle', 0.3));
    },
    missionFail() {
      if (!ensure()) return;
      [330, 262, 196].forEach((f, i) => blip(f, ctx.currentTime + i * 0.12, 0.25, 'sawtooth', 0.2));
    },
  };
}
