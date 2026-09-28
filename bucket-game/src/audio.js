import { rand } from "./utils.js";

const MUTED_KEY = "well-well-well:muted";

// All sounds are synthesized, so the game ships without audio files.
export function createAudio() {
  let context = null;
  let master = null;
  let echo = null;
  let noiseBuffer = null;
  let muted = readMuted();

  function unlock() {
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(context.destination);
      noiseBuffer = createNoiseBuffer();
      echo = createEcho();
    }
    if (context.state === "suspended") context.resume();
  }

  function createNoiseBuffer() {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // The inside of a well sounds like a well.
  function createEcho() {
    const input = context.createGain();
    const delay = context.createDelay(1);
    const feedback = context.createGain();
    const filter = context.createBiquadFilter();
    delay.delayTime.value = 0.21;
    feedback.gain.value = 0.48;
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    input.connect(delay).connect(filter).connect(feedback).connect(delay);
    filter.connect(master);
    return input;
  }

  function envelope(start, attack, duration, peak) {
    const amp = context.createGain();
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    return amp;
  }

  function noise({ duration, type = "lowpass", from, to = from, q = 1, gain = 0.3, attack = 0.005, delay = 0, destinations = [master] }) {
    if (!context) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    const amp = envelope(start, attack, duration, gain);
    source.connect(filter).connect(amp);
    destinations.forEach((destination) => amp.connect(destination));
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.05);
  }

  function tone({ type = "sine", from, to = from, duration, gain = 0.2, attack = 0.005, delay = 0, lowpass = 0, destinations = [master] }) {
    if (!context) return null;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    const amp = envelope(start, attack, duration, gain);
    let output = oscillator;
    if (lowpass) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpass;
      output = oscillator.connect(filter);
    }
    output.connect(amp);
    destinations.forEach((destination) => amp.connect(destination));
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
    return { oscillator, start };
  }

  return {
    unlock,
    isMuted: () => muted,
    toggleMuted() {
      muted = !muted;
      writeMuted(muted);
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, context.currentTime, 0.05);
      return muted;
    },
    whoosh(power) {
      noise({ duration: 0.45, type: "bandpass", from: 300, to: 1400 + power * 1800, q: 0.9, gain: 0.2 + power * 0.25, attack: 0.12 });
    },
    clunk(strength) {
      tone({ type: "triangle", from: 190, to: 110, duration: 0.2, gain: 0.12 + strength * 0.3 });
      tone({ type: "sine", from: 760, to: 700, duration: 0.3, gain: 0.05 + strength * 0.1 });
      tone({ type: "sine", from: 1140, duration: 0.22, gain: 0.03 + strength * 0.06 });
      noise({ duration: 0.07, type: "highpass", from: 1800, gain: 0.06 + strength * 0.25 });
    },
    knock(strength) {
      tone({ type: "triangle", from: 440, to: 300, duration: 0.14, gain: 0.1 + strength * 0.3 });
      noise({ duration: 0.05, type: "bandpass", from: 900, q: 2, gain: 0.08 + strength * 0.2 });
    },
    thud(strength) {
      tone({ type: "sine", from: 120, to: 45, duration: 0.25, gain: 0.1 + strength * 0.35 });
      noise({ duration: 0.18, type: "lowpass", from: 420, to: 150, gain: 0.05 + strength * 0.2 });
    },
    drop() {
      tone({ type: "sine", from: 1100, to: 260, duration: 0.6, gain: 0.06, attack: 0.05 });
    },
    splash() {
      const wet = [master, echo];
      noise({ duration: 0.7, type: "lowpass", from: 2600, to: 280, gain: 0.45, destinations: wet });
      for (let i = 0; i < 7; i += 1) {
        const from = rand(350, 850);
        tone({ from, to: from * 1.8, duration: 0.08, gain: 0.07, delay: 0.05 + i * rand(0.04, 0.09), destinations: wet });
      }
    },
    chime(streak) {
      const base = 523.25 * 2 ** (((Math.min(streak, 5) - 1) * 2) / 12);
      [0, 4, 7, 12].forEach((semitones, i) => {
        const frequency = base * 2 ** (semitones / 12);
        tone({ type: "triangle", from: frequency, duration: 0.4, gain: 0.1, delay: 0.3 + i * 0.075 });
        tone({ from: frequency * 2, duration: 0.3, gain: 0.03, delay: 0.3 + i * 0.075 });
      });
    },
    womp() {
      tone({ type: "sawtooth", from: 220, to: 170, duration: 0.25, gain: 0.08, lowpass: 900 });
      tone({ type: "sawtooth", from: 165, to: 110, duration: 0.5, gain: 0.08, delay: 0.22, lowpass: 700 });
    },
    sadTrombone() {
      [392, 370, 349].forEach((frequency, i) => {
        tone({ type: "sawtooth", from: frequency, to: frequency * 0.98, duration: 0.34, gain: 0.09, delay: i * 0.36, attack: 0.03, lowpass: 1200 });
      });
      const last = tone({ type: "sawtooth", from: 330, to: 300, duration: 1.1, gain: 0.09, delay: 1.08, attack: 0.03, lowpass: 1200 });
      if (!last) return;
      const vibrato = context.createOscillator();
      const depth = context.createGain();
      vibrato.frequency.value = 6;
      depth.gain.value = 9;
      vibrato.connect(depth).connect(last.oscillator.frequency);
      vibrato.start(last.start);
      vibrato.stop(last.start + 1.15);
    },
    step() {
      noise({ duration: 0.09, type: "lowpass", from: rand(500, 700), to: 200, gain: 0.06 });
    },
    rumble() {
      noise({ duration: 1.1, type: "lowpass", from: 200, to: 80, gain: 0.35, attack: 0.1 });
    },
    pop() {
      tone({ from: 160, to: 440, duration: 0.14, gain: 0.18 });
      noise({ duration: 0.1, type: "bandpass", from: 1400, q: 1.5, gain: 0.12 });
    },
  };
}

function readMuted() {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted) {
  try {
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // Storage can be unavailable (private mode); sound state just won't persist.
  }
}
