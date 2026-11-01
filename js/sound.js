// Soft, calming interface sounds made on the fly with the Web Audio API.
// No audio files, nothing downloaded. Quiet by design; can be turned off in Preferences.
let ctx = null, master = null, enabled = true, last = 0;

export function setSoundEnabled(on) { enabled = !!on; }

function ensure() {
  if (!enabled) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) { try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// one soft sine "bell" note with a gentle attack and long, smooth fade
function note(freq, at, dur, vol) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  o2.type = 'sine'; o2.frequency.value = freq * 2; // faint octave for warmth
  const g2 = ctx.createGain(); g2.gain.value = 0.18;
  const t = ctx.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(master);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}

const SOUNDS = {
  tap:     () => note(523.25, 0, 0.16, 0.05),                                   // C5, barely there
  tab:     () => note(659.25, 0, 0.2, 0.06),                                    // E5
  open:    () => { note(440, 0, 0.3, 0.05); note(659.25, 0.06, 0.3, 0.04); },  // rising
  close:   () => { note(659.25, 0, 0.25, 0.04); note(440, 0.06, 0.28, 0.04); },// falling
  success: () => { note(523.25, 0, 0.7, 0.07); note(659.25, 0.11, 0.7, 0.06); note(783.99, 0.22, 1.0, 0.06); }, // C-E-G chime
  soft:    () => note(392, 0, 0.35, 0.05),
};

export function play(name) {
  const now = performance.now();
  if (now - last < 45) return; // never machine-gun
  const fn = SOUNDS[name];
  if (!fn || !ensure()) return;
  last = now;
  try { fn(); } catch { /* sound is optional */ }
}
