/** Two-note ascending chime (D5 -> A5) via Web Audio. */

let audioCtx: AudioContext | null = null;

export function playPing() {
  audioCtx ??= new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  const t = audioCtx.currentTime;
  for (const [freq, offset] of [[587, 0], [880, 0.08]] as const) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.15);
    osc.start(t + offset);
    osc.stop(t + offset + 0.15);
  }
}
