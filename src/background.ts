// Chrome extension background service worker managing the Pomodoro timer state.

interface Settings {
  pomoTime: number; // in minutes
  shortBreakTime: number; // in minutes
  longBreakTime: number; // in minutes
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  autoPlay: boolean;
  backgroundMusic: string;
  backgroundMusicVolume?: number;
}

interface TimerState {
  isRunning: boolean;
  timeLeft: number; // in seconds
  duration: number; // in seconds
  sessionType: 'pomo' | 'short_break' | 'long_break';
  endTime: number; // timestamp MS
  settings: Settings;
  completedTodayCount: number;
}

const DEFAULT_SETTINGS: Settings = {
  pomoTime: 25,
  shortBreakTime: 5,
  longBreakTime: 15,
  soundEnabled: true,
  notificationsEnabled: true,
  autoPlay: true,
  backgroundMusic: 'none',
  backgroundMusicVolume: 0.4,
};

const DEFAULT_STATE: TimerState = {
  isRunning: false,
  timeLeft: 25 * 60,
  duration: 25 * 60,
  sessionType: 'pomo',
  endTime: 0,
  settings: DEFAULT_SETTINGS,
  completedTodayCount: 0,
};

// On install, setup initial state
chrome.runtime.onInstalled.addListener(async () => {
  const data = (await chrome.storage.local.get('timerState')) as { timerState?: TimerState };
  if (!data.timerState) {
    await chrome.storage.local.set({ timerState: DEFAULT_STATE });
  }
  updateBadge(DEFAULT_STATE);
});

// Update Badge Text based on timer state
function updateBadge(state: TimerState) {
  if (!state.isRunning) {
    chrome.action.setBadgeText({ text: 'PAUS' });
    chrome.action.setBadgeBackgroundColor({ color: '#7c7f93' }); // Catppuccin Overlay2 color
    return;
  }

  const remainingSeconds = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
  const minutes = Math.ceil(remainingSeconds / 60);

  chrome.action.setBadgeText({ text: `${minutes}m` });

  let badgeColor = '#40a02b'; // Green (pomo)
  if (state.sessionType === 'short_break') {
    badgeColor = '#04a5e5'; // Sky (short break)
  } else if (state.sessionType === 'long_break') {
    badgeColor = '#1e66f5'; // Blue (long break)
  }

  chrome.action.setBadgeBackgroundColor({ color: badgeColor });
}

// Play sound using Offscreen Document (MV3 standard)
async function playAlarmChime() {
  try {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Play Pomodoro alarm chimes',
    });
  } catch (err) {
    // Ignore error if document already exists
  }

  // Send message to the offscreen page
  chrome.runtime.sendMessage({ target: 'offscreen', action: 'PLAY_CHIME' }).catch(() => {});
}

async function updateBackgroundMusic(state: TimerState) {
  if (state.isRunning && state.settings.backgroundMusic && state.settings.backgroundMusic !== 'none') {
    try {
      await chrome.offscreen.createDocument({
        url: 'src/offscreen/offscreen.html',
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: 'Play Pomodoro background music',
      });
    } catch (err) {
      // ignore error if document already exists
    }
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'PLAY_MUSIC',
      track: state.settings.backgroundMusic,
      volume: state.settings.backgroundMusicVolume ?? 0.4
    }).catch(() => {});
  } else {
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'PAUSE_MUSIC'
    }).catch(() => {});
  }
}

// Show local notification
function showNotification(title: string, message: string) {
  chrome.notifications.create('pomo-notification', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    priority: 2,
    requireInteraction: true
  });
}

// Alarm Handler (timer completed)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'pomodoro-alarm') return;

  const data = (await chrome.storage.local.get('timerState')) as { timerState?: TimerState };
  if (!data.timerState) return;

  const state: TimerState = data.timerState;

  state.isRunning = false;
  state.timeLeft = 0;
  state.endTime = 0;

  // Handle session completions and cycles
  let notifyTitle = '';
  let notifyMessage = '';

  if (state.sessionType === 'pomo') {
    state.completedTodayCount += 1;
    notifyTitle = 'Focus Session Complete!';
    notifyMessage = 'Great job! Time for a short break.';

    // Switch to short break by default
    state.sessionType = 'short_break';
    state.duration = state.settings.shortBreakTime * 60;
    state.timeLeft = state.duration;
  } else {
    // Break finished, switch to focus
    notifyTitle = 'Break Completed!';
    notifyMessage = 'Ready to focus? Let\'s start a new session.';
    state.sessionType = 'pomo';
    state.duration = state.settings.pomoTime * 60;
    state.timeLeft = state.duration;
  }

  // Auto-start next session if autoplay is enabled
  if (state.settings.autoPlay) {
    state.isRunning = true;
    state.endTime = Date.now() + state.timeLeft * 1000;

    await chrome.alarms.create('pomodoro-alarm', { when: state.endTime });
    await chrome.alarms.create('pomo-badge-tick', { periodInMinutes: 1 })
  }

  await chrome.storage.local.set({ timerState: state });
  updateBadge(state);
  await updateBackgroundMusic(state);

  // Trigger sound/notification based on settings
  if (state.settings.notificationsEnabled) {
    showNotification(notifyTitle, notifyMessage);
  }

  if (state.settings.soundEnabled) {
    await playAlarmChime();
  }
});

// Periodic alarm to keep service worker alive and update badge
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'pomo-badge-tick') return;

  const data = (await chrome.storage.local.get('timerState')) as { timerState?: TimerState };
  if (!data.timerState || !data.timerState.isRunning) return;

  updateBadge(data.timerState);
});

// Listen for messages from the Popup React UI
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // If targeted at offscreen document, ignore here
  if (message.target === 'offscreen') return;

  handleAction(message).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleAction(message: any): Promise<any> {
  const data = (await chrome.storage.local.get('timerState')) as { timerState?: TimerState };
  const state: TimerState = data.timerState || DEFAULT_STATE;

  switch (message.type) {
    case 'START':
      if (!state.isRunning) {
        state.isRunning = true;
        state.endTime = Date.now() + state.timeLeft * 1000;

        // Setup timer alarm
        await chrome.alarms.create('pomodoro-alarm', { when: state.endTime });

        // Setup badge ticking alarm (every 1 minute)
        await chrome.alarms.create('pomo-badge-tick', { periodInMinutes: 1 });

        await chrome.storage.local.set({ timerState: state });
        updateBadge(state);
        await updateBackgroundMusic(state);
      }
      break;

    case 'PAUSE':
      if (state.isRunning) {
        await chrome.alarms.clear('pomodoro-alarm');
        await chrome.alarms.clear('pomo-badge-tick');

        state.isRunning = false;
        state.timeLeft = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
        state.endTime = 0;

        await chrome.storage.local.set({ timerState: state });
        updateBadge(state);
        await updateBackgroundMusic(state);
      }
      break;

    case 'SKIP':
      await chrome.alarms.clear('pomodoro-alarm');
      await chrome.alarms.clear('pomo-badge-tick');

      state.isRunning = false;
      state.endTime = 0;

      // Determine next session
      if (state.sessionType === 'pomo') {
        state.sessionType = 'short_break';
        state.duration = state.settings.shortBreakTime * 60;
      } else {
        state.sessionType = 'pomo';
        state.duration = state.settings.pomoTime * 60;
      }
      state.timeLeft = state.duration;

      await chrome.storage.local.set({ timerState: state });
      updateBadge(state);
      await updateBackgroundMusic(state);
      break;

    case 'RESET':
      await chrome.alarms.clear('pomodoro-alarm');
      await chrome.alarms.clear('pomo-badge-tick');

      state.isRunning = false;
      state.endTime = 0;

      if (state.sessionType === 'pomo') {
        state.duration = state.settings.pomoTime * 60;
      } else if (state.sessionType === 'short_break') {
        state.duration = state.settings.shortBreakTime * 60;
      } else {
        state.duration = state.settings.longBreakTime * 60;
      }
      state.timeLeft = state.duration;

      await chrome.storage.local.set({ timerState: state });
      updateBadge(state);
      await updateBackgroundMusic(state);
      break;

    case 'UPDATE_SETTINGS':
      const prevSettings = state.settings;
      state.settings = { ...state.settings, ...message.settings };

      // If duration changed and timer is paused, adjust time left
      if (!state.isRunning) {
        if (state.sessionType === 'pomo' && prevSettings.pomoTime !== state.settings.pomoTime) {
          state.duration = state.settings.pomoTime * 60;
          state.timeLeft = state.duration;
        } else if (state.sessionType === 'short_break' && prevSettings.shortBreakTime !== state.settings.shortBreakTime) {
          state.duration = state.settings.shortBreakTime * 60;
          state.timeLeft = state.duration;
        } else if (state.sessionType === 'long_break' && prevSettings.longBreakTime !== state.settings.longBreakTime) {
          state.duration = state.settings.longBreakTime * 60;
          state.timeLeft = state.duration;
        }
      }

      await chrome.storage.local.set({ timerState: state });
      updateBadge(state);
      await updateBackgroundMusic(state);
      break;

    case 'SWITCH_SESSION':
      await chrome.alarms.clear('pomodoro-alarm');
      await chrome.alarms.clear('pomo-badge-tick');

      state.isRunning = false;
      state.endTime = 0;
      state.sessionType = message.sessionType;

      if (state.sessionType === 'pomo') {
        state.duration = state.settings.pomoTime * 60;
      } else if (state.sessionType === 'short_break') {
        state.duration = state.settings.shortBreakTime * 60;
      } else {
        state.duration = state.settings.longBreakTime * 60;
      }
      state.timeLeft = state.duration;

      await chrome.storage.local.set({ timerState: state });
      updateBadge(state);
      await updateBackgroundMusic(state);
      break;

    case 'GET_STATE':
      // Return fresh state
      break;
  }

  return state;
}
