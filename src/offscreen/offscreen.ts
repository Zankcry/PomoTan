// Offscreen DOM helper to play sound in Manifest V3

chrome.runtime.onMessage.addListener((message) => {
  if (message.target === 'offscreen' && message.action === 'PLAY_CHIME') {
    playChime();
  }
});

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
