export class SoundManager {
  constructor(settings = {}) {
    this.settings = settings;
    this.masterVolume = settings.volume ?? 0.6;
    this.muted = false;
    this.listener = { x: 0, y: 0 };
    this.context = null;
  }

  ensureContext() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.context = new AudioContext();
      }
    }
    if (this.context?.state === "suspended") {
      this.context.resume().catch(() => {});
    }
  }

  setVolume(volume) {
    this.masterVolume = volume;
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  setListener(x, y) {
    this.listener = { x, y };
  }

  makeGain(position) {
    const gain = this.context.createGain();
    let volume = this.muted ? 0 : this.masterVolume;
    if (position) {
      const dx = position.x - this.listener.x;
      const dy = position.y - this.listener.y;
      const dist = Math.min(1800, Math.hypot(dx, dy));
      volume *= Math.max(0.15, 1 - dist / 1800);
      if (this.context.createStereoPanner) {
        const panner = this.context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, dx / 700));
        panner.connect(gain);
        gain.connect(this.context.destination);
        return { gain, input: panner, volume };
      }
    }
    gain.connect(this.context.destination);
    return { gain, input: gain, volume };
  }

  play(name, position = null) {
    this.ensureContext();
    if (!this.context) return;

    const now = this.context.currentTime;
    const { gain, input, volume } = this.makeGain(position);
    gain.gain.setValueAtTime(volume, now);

    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";

    const palette = {
      pistol_fire: [260, 0.07, "square"],
      ar_fire: [180, 0.04, "sawtooth"],
      shotgun_fire: [110, 0.12, "triangle"],
      sniper_fire: [420, 0.18, "sawtooth"],
      smg_fire: [220, 0.03, "square"],
      lmg_fire: [150, 0.06, "sawtooth"],
      rocket_fire: [90, 0.15, "sine"],
      explosion: [55, 0.35, "triangle"],
      hit_flesh: [300, 0.05, "triangle"],
      hit_wall: [750, 0.03, "square"],
      reload: [520, 0.08, "square"],
      reload_done: [680, 0.05, "triangle"],
      pickup: [900, 0.06, "triangle"],
      death: [95, 0.22, "sawtooth"],
      kill_confirm: [1200, 0.08, "triangle"],
      low_health: [60, 0.18, "sine"]
    };

    const [freq, duration, wave] = palette[name] || [220, 0.05, "sine"];
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(freq, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), now + duration);
    filter.frequency.setValueAtTime(name === "explosion" ? 600 : 2400, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * 0.45), now + duration);

    oscillator.connect(filter);
    filter.connect(input);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
