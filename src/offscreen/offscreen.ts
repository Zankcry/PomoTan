// Offscreen DOM helper to play sound in Manifest V3

let bgMusic: HTMLAudioElement | null = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.target === 'offscreen') {
    if (message.action === 'PLAY_CHIME') {
      playChime();
    } else if (message.action === 'PLAY_MUSIC') {
      playMusic(message.track, message.volume);
    } else if (message.action === 'PAUSE_MUSIC') {
      pauseMusic();
    } else if (message.action === 'SET_VOLUME') {
      setVolume(message.volume);
    }
  }
});

function playMusic(track: string, volume?: number) {
  try {
    const audioUrl = chrome.runtime.getURL(`music/${encodeURIComponent(track)}.mp3`);
    const targetVolume = typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : 0.4;
    
    if (!bgMusic) {
      bgMusic = new Audio(audioUrl);
      bgMusic.loop = true;
      bgMusic.volume = targetVolume;
    } else {
      bgMusic.volume = targetVolume;
      if (bgMusic.src !== audioUrl) {
        bgMusic.pause();
        bgMusic.src = audioUrl;
      }
    }
    
    bgMusic.play().catch(err => {
      console.error('Error playing background music:', err);
    });
  } catch (err) {
    console.error('Failed to setup background music:', err);
  }
}

function pauseMusic() {
  if (bgMusic) {
    bgMusic.pause();
  }
}

function setVolume(volume: number) {
  if (bgMusic && typeof volume === 'number') {
    bgMusic.volume = Math.max(0, Math.min(1, volume));
  }
}

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();
    
    // Elegant arpeggio chime: C6, E6, G6, C7
    const frequencies = [1046.50, 1318.51, 1567.98, 2093.00];
    const noteDuration = 0.15; // duration of note triggers
    const noteSpacing = 0.08;  // stagger start of notes for arpeggio effect
    
    const startTime = audioCtx.currentTime;

    frequencies.forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      // Warm sine wave sound
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime + index * noteSpacing);
      
      const noteStart = startTime + index * noteSpacing;
      gainNode.gain.setValueAtTime(0, noteStart);
      
      // Envelope: 20ms attack, smooth exponential decay
      gainNode.gain.linearRampToValueAtTime(0.2, noteStart + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration + 0.8);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start(noteStart);
      osc.stop(noteStart + noteDuration + 0.9);
    });
  } catch (err) {
    console.error('Failed to play custom Web Audio chime:', err);
  }
}
