let audio: AudioContext | null = null;

function ctx() {
  if (typeof window === "undefined") return null;
  if (!audio) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    audio = new AC();
  }
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

export function unlockAudio() {
  ctx();
}

export function playTone(kind: "move" | "capture" | "check" | "end") {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const freq = kind === "capture" ? 196 : kind === "check" ? 660 : kind === "end" ? 140 : 523;
  osc.type = kind === "end" ? "sine" : "triangle";
  osc.frequency.value = freq;
  const now = ac.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "end" ? 0.28 : 0.11));
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}
