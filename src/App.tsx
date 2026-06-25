import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  X,
  Check,
  Square,
  CheckSquare,
  Music,
  ChevronDown,
  Volume2,
  VolumeX
} from 'lucide-react';

import './App.css';

interface Settings {
  pomoTime: number;
  shortBreakTime: number;
  longBreakTime: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  autoPlay: boolean;
  backgroundMusic: string;
  backgroundMusicVolume?: number;
}

interface TimerState {
  isRunning: boolean;
  timeLeft: number;
  duration: number;
  sessionType: 'pomo' | 'short_break' | 'long_break';
  endTime: number;
  settings: Settings;
  completedTodayCount: number;
}

interface Task {
  id: string;
  text: string;
  completed: boolean;
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

const FLAVORS = [
  { id: 'theme-latte', name: 'Latte', desc: 'Light Cream' },
  { id: 'theme-frappe', name: 'Frappé', desc: 'Muted Dark' },
  { id: 'theme-macchiato', name: 'Macchiato', desc: 'Warm Dark' },
  { id: 'theme-mocha', name: 'Mocha', desc: 'Deep Dark' },
];

const ACCENTS = [
  { id: 'green', name: 'Sage Green', color: '#40a02b' },
  { id: 'teal', name: 'Teal', color: '#179299' },
  { id: 'blue', name: 'Blue', color: '#1e66f5' },
  { id: 'mauve', name: 'Mauve', color: '#8839ef' },
  { id: 'peach', name: 'Peach', color: '#fe640b' },
  { id: 'pink', name: 'Pink', color: '#ea76cb' },
  { id: 'red', name: 'Red', color: '#d20f39' },
];

const MUSIC_TRACKS = [
  { id: 'none', name: 'None (Silence)' },
  { id: 'rose water', name: 'Rose Water' },
  { id: 'peach prosecco', name: 'Peach Prosecco' },
  { id: 'lavender', name: 'Lavender' },
  { id: 'honey jam', name: 'Honey Jam' },
  { id: 'gift', name: 'Gift' },
  { id: 'floral', name: 'Floral' },
];

// Safe storage wrapper for development in normal browser tabs
const storage = {
  get: (keys: string[], callback: (result: any) => void) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, callback);
    } else {
      const res: any = {};
      keys.forEach(key => {
        const val = localStorage.getItem(key);
        if (val) {
          try {
            res[key] = JSON.parse(val);
          } catch (e) {
            res[key] = val;
          }
        }
      });
      callback(res);
    }
  },
  set: (data: any, callback?: () => void) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(data, callback || (() => { }));
    } else {
      Object.keys(data).forEach(key => {
        localStorage.setItem(key, JSON.stringify(data[key]));
      });
      // Fire mock storage event to trigger listener in same window
      window.dispatchEvent(new Event('storage_mock'));
      if (callback) callback();
    }
  },
  addListener: (callback: (changes: any) => void) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(callback);
    } else {
      const handleStorageMock = () => {
        const res: any = {};
        const timerStateStr = localStorage.getItem('timerState');
        const tasksStr = localStorage.getItem('tasks');
        const themeFlavorStr = localStorage.getItem('themeFlavor');
        const themeAccentStr = localStorage.getItem('themeAccent');

        res.timerState = { newValue: timerStateStr ? JSON.parse(timerStateStr) : null };
        res.tasks = { newValue: tasksStr ? JSON.parse(tasksStr) : null };
        res.themeFlavor = { newValue: themeFlavorStr ? JSON.parse(themeFlavorStr) : null };
        res.themeAccent = { newValue: themeAccentStr ? JSON.parse(themeAccentStr) : null };

        callback(res);
      };
      window.addEventListener('storage_mock', handleStorageMock);
      (callback as any)._storageMock = handleStorageMock;
    }
  },
  removeListener: (callback: any) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.removeListener(callback);
    } else if (callback._storageMock) {
      window.removeEventListener('storage_mock', callback._storageMock);
    }
  }
};

const messaging = {
  sendMessage: (message: any, callback?: (response: any) => void) => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(message, callback);
    } else {
      console.log('Mock sendMessage:', message);
      // Simulate messaging locally for normal browser page testing
      const savedState = localStorage.getItem('timerState');
      const state = savedState ? JSON.parse(savedState) : {
        isRunning: false,
        timeLeft: 25 * 60,
        duration: 25 * 60,
        sessionType: 'pomo',
        endTime: 0,
        settings: DEFAULT_SETTINGS,
        completedTodayCount: 0,
      } as TimerState;

      if (message.type === 'START') {
        state.isRunning = true;
        state.endTime = Date.now() + state.timeLeft * 1000;
      } else if (message.type === 'PAUSE') {
        state.isRunning = false;
        state.timeLeft = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
        state.endTime = 0;
      } else if (message.type === 'SKIP') {
        state.isRunning = false;
        state.endTime = 0;
        state.sessionType = state.sessionType === 'pomo' ? 'short_break' : 'pomo';
        state.timeLeft = state.sessionType === 'pomo' ? state.settings.pomoTime * 60 : state.settings.shortBreakTime * 60;
        state.duration = state.timeLeft;
      } else if (message.type === 'SWITCH_SESSION') {
        state.isRunning = false;
        state.endTime = 0;
        state.sessionType = message.sessionType;
        if (state.sessionType === 'pomo') state.timeLeft = state.settings.pomoTime * 60;
        else if (state.sessionType === 'short_break') state.timeLeft = state.settings.shortBreakTime * 60;
        else state.timeLeft = state.settings.longBreakTime * 60;
        state.duration = state.timeLeft;
      } else if (message.type === 'UPDATE_SETTINGS') {
        state.settings = { ...state.settings, ...message.settings };
        if (!state.isRunning) {
          if (state.sessionType === 'pomo') state.timeLeft = state.settings.pomoTime * 60;
          else if (state.sessionType === 'short_break') state.timeLeft = state.settings.shortBreakTime * 60;
          else state.timeLeft = state.settings.longBreakTime * 60;
          state.duration = state.timeLeft;
        }
      }

      localStorage.setItem('timerState', JSON.stringify(state));
      // Dispatch storage change to update local listeners
      window.dispatchEvent(new Event('storage_mock'));

      if (callback) callback(state);
    }
  }
};

export default function App() {
  // Timer State
  const [state, setState] = useState<TimerState>(DEFAULT_STATE);
  const [timeLeft, setTimeLeft] = useState<number>(DEFAULT_STATE.timeLeft);

  // Tasks State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');

  // UI Customization State (Stored separately or in settings)
  const [themeFlavor, setThemeFlavor] = useState<string>('theme-latte');
  const [themeAccent, setThemeAccent] = useState<string>('green');

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMusicDropdownOpen, setIsMusicDropdownOpen] = useState(false);

  // Settings Form State
  const [formSound, setFormSound] = useState(true);
  const [formNotify, setFormNotify] = useState(true);
  const [formAutoPlay, setFormAutoPlay] = useState(true);

  // Sync with Chrome Extension Storage and DOM class application
  useEffect(() => {
    // Apply initial theme flavor class to document.body
    document.body.classList.add(themeFlavor);
    return () => {
      document.body.classList.remove(themeFlavor);
    };
  }, [themeFlavor]);

  useEffect(() => {
    // 1. Initial Load
    storage.get(['timerState', 'tasks', 'themeFlavor', 'themeAccent'], (res) => {
      const result = res as {
        timerState?: TimerState;
        tasks?: Task[];
        themeFlavor?: string;
        themeAccent?: string;
      };
      if (result.timerState) {
        setState(result.timerState);
        setTimeLeft(result.timerState.timeLeft);

        // Sync settings form
        const s = result.timerState.settings;
        setFormSound(s.soundEnabled);
        setFormNotify(s.notificationsEnabled);
        setFormAutoPlay(s.autoPlay ?? true);
      }
      if (result.tasks) {
        setTasks(result.tasks);
      }
      if (result.themeFlavor) {
        setThemeFlavor(result.themeFlavor);
      }
      if (result.themeAccent) {
        setThemeAccent(result.themeAccent);
      }
    });

    // 2. Storage Changed Listener
    const handleStorageChange = (changes: any) => {
      if (changes.timerState) {
        const newState = changes.timerState.newValue as TimerState;
        if (newState) {
          setState(newState);
          if (!newState.isRunning) {
            setTimeLeft(newState.timeLeft);
          }
        }
      }
      if (changes.tasks) {
        setTasks((changes.tasks.newValue as Task[]) || []);
      }
      if (changes.themeFlavor) {
        setThemeFlavor(changes.themeFlavor.newValue as string);
      }
      if (changes.themeAccent) {
        setThemeAccent(changes.themeAccent.newValue as string);
      }
    };

    storage.addListener(handleStorageChange);
    return () => storage.removeListener(handleStorageChange);
  }, []);

  // Timer Tick (Local precision synchronization)
  useEffect(() => {
    if (!state.isRunning || !state.endTime) return;

    const tick = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.round((state.endTime - now) / 1000));
      setTimeLeft(diff);

      if (diff === 0) {
        // Stop checking, service worker will trigger completion updates
        setState(prev => ({ ...prev, isRunning: false, timeLeft: 0 }));
      }
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [state.isRunning, state.endTime]);

  // Handle Play/Pause
  const toggleTimer = () => {
    const type = state.isRunning ? 'PAUSE' : 'START';
    messaging.sendMessage({ type });
  };

  // Handle Skip
  const skipTimer = () => {
    messaging.sendMessage({ type: 'SKIP' });
  };

  // Handle Duration Customization
  const handleDurationChange = (key: 'pomoTime' | 'shortBreakTime', value: number) => {
    const updatedSettings: Settings = {
      ...state.settings,
      [key]: value
    };

    messaging.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: updatedSettings
    });
  };

  // Handle Task Addition
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;

    const newTasks = [
      ...tasks,
      { id: crypto.randomUUID(), text: newTaskText.trim(), completed: false }
    ];
    setTasks(newTasks);
    storage.set({ tasks: newTasks });
    setNewTaskText('');
    setIsAddingTask(false);
  };

  // Handle Task Toggle
  const toggleTask = (id: string) => {
    const newTasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    setTasks(newTasks);
    storage.set({ tasks: newTasks });
  };

  // Handle Task Deletion
  const deleteTask = (id: string) => {
    const newTasks = tasks.filter(t => t.id !== id);
    setTasks(newTasks);
    storage.set({ tasks: newTasks });
  };

  // Format time (MM:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Save Settings
  const saveSettings = () => {
    const updatedSettings: Settings = {
      pomoTime: state.settings.pomoTime,
      shortBreakTime: state.settings.shortBreakTime,
      longBreakTime: state.settings.longBreakTime,
      soundEnabled: formSound,
      notificationsEnabled: formNotify,
      autoPlay: formAutoPlay,
      backgroundMusic: state.settings.backgroundMusic,
      backgroundMusicVolume: state.settings.backgroundMusicVolume,
    };

    // Update Theme and Accent locally and in storage
    storage.set({
      themeFlavor,
      themeAccent
    });

    // Send update command to background script
    messaging.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: updatedSettings
    });

    setIsSettingsOpen(false);
  };

  // Open settings & load state
  const openSettings = () => {
    setFormSound(state.settings.soundEnabled);
    setFormNotify(state.settings.notificationsEnabled);
    setFormAutoPlay(state.settings.autoPlay ?? true);
    setIsSettingsOpen(true);
  };

  // Circle Math for Timer Ring
  const radius = 80; // Adjusted for smaller frame size (176px container)
  const circumference = 2 * Math.PI * radius;
  const progressRatio = state.duration > 0 ? (state.duration - timeLeft) / state.duration : 0;
  const strokeDashoffset = circumference - progressRatio * circumference;

  // Active Accent styling variables injected into style
  const themeAccentStyle = {
    '--ctp-accent': `var(--ctp-${themeAccent})`,
  } as React.CSSProperties;
  return (
    <div
      className={`w-full h-full ${themeFlavor} bg-base text-text flex flex-col p-2 select-none relative transition-colors duration-300 overflow-hidden`}
      style={themeAccentStyle}
    >
      {/* Background Grid Pattern */}
      <div className="bg-grid-overlay" />

      {/* Floating Background Particles */}
      <div className="particle-layer">
        <span className="particle" style={{ left: '8%', width: '5px', height: '5px', animationDelay: '0s', animationDuration: '6.5s' }} />
        <span className="particle" style={{ left: '28%', width: '7px', height: '7px', animationDelay: '1.2s', animationDuration: '5.8s' }} />
        <span className="particle" style={{ left: '52%', width: '4px', height: '4px', animationDelay: '2.8s', animationDuration: '7.2s' }} />
        <span className="particle" style={{ left: '74%', width: '8px', height: '8px', animationDelay: '0.6s', animationDuration: '5.0s' }} />
        <span className="particle" style={{ left: '88%', width: '6px', height: '6px', animationDelay: '1.8s', animationDuration: '6.8s' }} />
      </div>

      {/* Main Double Border Container Frame */}
      <div className="anime-theme-frame flex flex-col p-3.5 relative z-10 overflow-hidden">
        {/* Corner Anchors */}
        <div className="corner-cross corner-top-left" />
        <div className="corner-cross corner-top-right" />
        <div className="corner-cross corner-bottom-left" />
        <div className="corner-cross corner-bottom-right" />

        {/* Header */}
        <header className="flex justify-between items-center mb-2.5 relative z-20">
          <div>
            <h1 className="font-semibold text-xs tracking-widest text-accent uppercase flex">
              {'POMOTAN'.split('').map((c, i) => (
                <span
                  key={`${c}-${i}`}
                  className="char-slide-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {c}
                </span>
              ))}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Custom BGM Selector */}
            <div className="relative">
              <button
                onClick={() => setIsMusicDropdownOpen(!isMusicDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-mantle/70 border border-surface0/50 hover:bg-mantle hover:border-accent/40 text-subtext1 hover:text-text font-medium text-[10px] transition-all duration-200 cursor-pointer active:scale-95 btn-squash"
              >
                {state.isRunning && state.settings.backgroundMusic && state.settings.backgroundMusic !== 'none' ? (
                  <div className="eq-container">
                    <span className="eq-bar animate-eq-1" />
                    <span className="eq-bar animate-eq-2" />
                    <span className="eq-bar animate-eq-3" />
                  </div>
                ) : (
                  <Music className="w-3 h-3 text-accent" />
                )}
                <span className="truncate max-w-[80px]">
                  {MUSIC_TRACKS.find(t => t.id === state.settings.backgroundMusic)?.name || 'Off'}
                </span>
                <ChevronDown className={`w-3 h-3 text-subtext2 transition-transform duration-200 ${isMusicDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Click outside backdrop */}
              {isMusicDropdownOpen && (
                <div
                  className="fixed inset-0 z-40 bg-transparent cursor-default"
                  onClick={() => setIsMusicDropdownOpen(false)}
                />
              )}

              {/* Custom Dropdown Menu */}
              {isMusicDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-mantle border border-surface0/60 shadow-2xl p-2.5 z-50 flex flex-col gap-2.5 animate-spring-in origin-top-right">
                  <div className="text-[9px] uppercase tracking-wider text-accent font-bold px-1.5 flex items-center">
                    <span className="list-decoration-dots">
                      <span className="list-dot" />
                      <span className="list-dot" style={{ animationDelay: '100ms' }} />
                    </span>
                    Focus BGM
                  </div>

                  {/* Track list */}
                  <div className="flex flex-col gap-1 max-h-[135px] overflow-y-auto overflow-x-hidden pr-1.5">
                    {MUSIC_TRACKS.map(track => {
                      const isActive = (state.settings.backgroundMusic || 'none') === track.id;
                      return (
                        <button
                          key={track.id}
                          onClick={() => {
                            messaging.sendMessage({
                              type: 'UPDATE_SETTINGS',
                              settings: { ...state.settings, backgroundMusic: track.id }
                            });
                          }}
                          className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left text-[10px] font-medium btn-fluid-hover cursor-pointer ${isActive
                            ? 'bg-accent/15 text-accent border border-accent/25'
                            : 'hover:bg-accent/10 hover:text-accent hover:pl-3.5 text-subtext1'
                            }`}
                        >
                          <span className="truncate">{track.name}</span>
                          {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="dashed-divider my-0" />

                  {/* Volume slider */}
                  <div className="flex flex-col gap-1.5 px-1.5 pb-0.5">
                    <div className="flex items-center justify-between text-[8px] uppercase tracking-wider text-subtext2 font-bold">
                      <span>Volume</span>
                      <span className="tabular-nums font-mono text-[9px] text-subtext1">
                        {Math.round((state.settings.backgroundMusicVolume ?? 0.4) * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          const currentVol = state.settings.backgroundMusicVolume ?? 0.4;
                          const newVol = currentVol > 0 ? 0 : 0.4;
                          messaging.sendMessage({
                            type: 'UPDATE_SETTINGS',
                            settings: { ...state.settings, backgroundMusicVolume: newVol }
                          });
                        }}
                        className="text-subtext1 hover:text-text transition-colors duration-150 btn-squash"
                      >
                        {(state.settings.backgroundMusicVolume ?? 0.4) === 0 ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-accent" />
                        )}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round((state.settings.backgroundMusicVolume ?? 0.4) * 100)}
                        onChange={(e) => {
                          const vol = parseFloat(e.target.value) / 100;
                          messaging.sendMessage({
                            type: 'UPDATE_SETTINGS',
                            settings: { ...state.settings, backgroundMusicVolume: vol }
                          });
                        }}
                        className="w-full h-1 bg-surface0 rounded-lg appearance-none cursor-pointer accent-accent focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="dashed-divider my-0" />

                  <div className="text-center pb-0.5">
                    <a
                      href="https://www.youtube.com/@massobeats"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[8px] text-subtext2 hover:text-accent transition-colors duration-150 underline cursor-pointer"
                    >
                      Music by massobeats
                    </a>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={openSettings}
              className="p-1.5 rounded-full hover:bg-surface0/60 text-subtext1 hover:text-text transition-all duration-200 btn-squash"
            >
              <SettingsIcon className="w-[15px] h-[15px]" />
            </button>
          </div>
        </header>

        {/* Dynamic Duration Customization */}
        <div className="bg-mantle/40 rounded-xl px-4 py-1.5 mb-2.5 border border-surface0/50 flex gap-6 text-xs font-medium text-subtext1 items-center justify-center">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-text font-bold">Focus</span>
            <div className="flex items-center">
              <input
                type="number"
                min="1"
                max="999"
                value={state.settings.pomoTime === 0 ? '' : state.settings.pomoTime}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.length > 3) return;
                  handleDurationChange('pomoTime', val === '' ? 0 : parseInt(val) || 0);
                }}
                onBlur={() => {
                  if (state.settings.pomoTime < 1) {
                    handleDurationChange('pomoTime', 1);
                  }
                }}
                className="w-7 bg-transparent border-b border-transparent focus:border-accent text-center text-accent font-bold text-xs focus:outline-none transition-all p-0"
                style={{ MozAppearance: 'textfield' }}
              />
              <span className="text-[9px] text-subtext2 ml-0.5">m</span>
            </div>
          </div>

          <div className="w-[1px] bg-surface1/30 self-stretch"></div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-text font-bold">Break</span>
            <div className="flex items-center">
              <input
                type="number"
                min="1"
                max="999"
                value={state.settings.shortBreakTime === 0 ? '' : state.settings.shortBreakTime}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.length > 3) return;
                  handleDurationChange('shortBreakTime', val === '' ? 0 : parseInt(val) || 0);
                }}
                onBlur={() => {
                  if (state.settings.shortBreakTime < 1) {
                    handleDurationChange('shortBreakTime', 1);
                  }
                }}
                className="w-7 bg-transparent border-b border-transparent focus:border-accent text-center text-accent font-bold text-xs focus:outline-none transition-all p-0"
                style={{ MozAppearance: 'textfield' }}
              />
              <span className="text-[9px] text-subtext2 ml-0.5">m</span>
            </div>
          </div>
        </div>

        {/* Main Timer Display */}
        <div className="flex flex-col items-center justify-center mb-2.5 grow">
          <div className={`relative w-44 h-44 flex items-center justify-center ${state.isRunning ? 'animate-breathe animate-rock' : ''}`}>
            {/* Circular Progress SVG */}
            <svg className="w-full h-full transform -rotate-90">
              {/* Background Circle */}
              <circle
                cx="88"
                cy="88"
                r={radius}
                className="stroke-surface0/60"
                strokeWidth="2.5"
                fill="transparent"
              />
              {/* Foreground Ring */}
              <circle
                cx="88"
                cy="88"
                r={radius}
                className="stroke-accent transition-all duration-300 ease-out"
                strokeWidth="3.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* Large Time Text */}
            <div className="absolute flex flex-col items-center justify-center select-none">
              <span className="text-[32px] font-extralight tracking-tighter text-text tabular-nums leading-none">
                {formatTime(timeLeft)}
              </span>
              <span className="text-[8px] font-bold tracking-[0.25em] text-accent uppercase mt-2">
                {state.sessionType === 'pomo' ? 'FOCUSING' : 'BREAK TIME'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 mt-4 w-full px-4">
            <button
              onClick={toggleTimer}
              className="flex-1 py-1.5 btn-bouncy-primary text-xs flex items-center justify-center gap-1.5 active:scale-[0.97]"
            >
              {state.isRunning ? (
                <>
                  <Pause className="w-3 h-3 fill-current" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  Start
                </>
              )}
            </button>

            <button
              onClick={skipTimer}
              className="px-4 py-1.5 btn-bouncy-secondary text-xs flex items-center justify-center gap-1 active:scale-[0.97]"
            >
              Skip
            </button>
          </div>
        </div>

        {/* Tasks List */}
        <div className="bg-mantle/40 rounded-xl p-3 flex flex-col border border-surface0/50 h-[175px] shrink-0 overflow-hidden">
          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-surface1/20">
            <h2 className="font-semibold text-[10px] text-subtext0 tracking-wider uppercase flex items-center">
              <span className="list-decoration-dots">
                <span className="list-dot" />
                <span className="list-dot" style={{ animationDelay: '100ms' }} />
              </span>
              Today's Tasks
            </h2>

            {!isAddingTask && (
              <button
                onClick={() => setIsAddingTask(true)}
                className="flex items-center gap-0.5 text-[9px] font-bold text-accent hover:opacity-80 transition-all duration-200 btn-squash"
              >
                <Plus className="w-3 h-3" />
                Add task
              </button>
            )}
          </div>

          {/* Task Form inline */}
          {isAddingTask && (
            <form onSubmit={handleAddTask} className="flex gap-2 mb-2 items-center animate-spring-in">
              <input
                type="text"
                placeholder="What are you working on?"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                className="grow text-[11px] px-2 py-1 rounded-lg bg-base text-text placeholder-subtext2 border border-surface1/30 focus:outline-none focus:border-accent"
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  type="submit"
                  className="p-1 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 btn-squash"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingTask(false)}
                  className="p-1 rounded-lg bg-surface1/20 text-subtext1 hover:bg-surface2/20 btn-squash"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </form>
          )}

          {/* Tasks List container */}
          <div className={`overflow-y-auto overflow-x-hidden grow text-[11px] space-y-1.5 pr-0.5 ${tasks.length === 0 ? 'flex flex-col justify-center items-center' : ''}`}>
            {tasks.length === 0 ? (
              <div className="text-center text-subtext2 italic text-[10px] py-4">
                No tasks added yet. Let's add one!
              </div>
            ) : (
              tasks.map((task, index) => {
                const tiltAngle = index % 2 === 0 ? -0.8 : 0.8;
                const tiltHover = index % 2 === 0 ? 0.6 : -0.6;
                return (
                  <div
                    key={task.id}
                    style={{ '--card-tilt': `${tiltAngle}deg`, '--tilt-hover': `${tiltHover}deg` } as React.CSSProperties}
                    className="group task-item-container polaroid-card animate-spring-in"
                  >
                    <div
                      onClick={() => toggleTask(task.id)}
                      className="flex items-center gap-2 cursor-pointer grow min-w-0"
                    >
                      <span className="text-subtext2 font-bold">{index + 1}.</span>
                      <button className="text-accent shrink-0 transition-transform duration-200 hover:scale-110">
                        {task.completed ? (
                          <CheckSquare className="w-3.5 h-3.5 fill-accent/10" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className={`truncate ${task.completed ? 'line-through text-subtext2 font-light' : 'text-text font-medium'}`}>
                        {task.text}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-red hover:bg-red/10 hover:text-red transition-all duration-200 flex-shrink-0 btn-squash"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Completed footer */}
          {tasks.length > 0 && (
            <div className="text-center text-[9px] font-bold text-subtext2 mt-1.5 pt-1.5 border-t border-surface1/10 tracking-wide uppercase">
              Today: {tasks.filter(t => t.completed).length} of {tasks.length} Completed
            </div>
          )}
        </div>

        {/* Settings Modal */}
        {isSettingsOpen && (
          <div className="absolute inset-0 bg-crust/50 backdrop-blur-[3px] z-50 flex items-center justify-center p-4 curtain-reveal-overlay">
            <div className="bg-mantle border border-surface1/30 rounded-2xl w-full max-h-[90%] overflow-y-auto flex flex-col p-4 shadow-2xl origin-center animate-spring-in">

              {/* Modal Header */}
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-surface1/20">
                <h3 className="font-semibold text-xs tracking-wider text-text flex items-center gap-1.5 uppercase">
                  <SettingsIcon className="w-3.5 h-3.5 text-accent hover:rotate-90 transition-transform duration-300" />
                  Configuration
                </h3>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1 rounded-md text-subtext1 hover:bg-surface0/60 hover:text-text btn-squash"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="space-y-4 text-[11px]">

                {/* Theme Settings (Catppuccin Flavor) */}
                <div>
                  <h4 className="font-bold text-[10px] text-accent uppercase tracking-wider mb-2">Theme Flavor</h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FLAVORS.map(flavor => (
                      <button
                        key={flavor.id}
                        type="button"
                        onClick={() => setThemeFlavor(flavor.id)}
                        className={`py-1 px-2 rounded-lg border text-left flex flex-col justify-center transition-all btn-squash ${themeFlavor === flavor.id ? 'border-accent bg-base/60' : 'border-surface1/10 hover:bg-surface0/40'}`}
                      >
                        <span className="font-bold text-[10px]">{flavor.name}</span>
                        <span className="text-[8px] text-subtext2">{flavor.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent Color picker */}
                <div>
                  <h4 className="font-bold text-[10px] text-accent uppercase tracking-wider mb-1.5">Accent Color</h4>
                  <div className="flex gap-2 flex-wrap">
                    {ACCENTS.map(acc => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setThemeAccent(acc.id)}
                        title={acc.name}
                        style={{ backgroundColor: acc.color }}
                        className={`w-5 h-5 rounded-full relative transition-all duration-200 hover:scale-110 shadow-sm border border-black/5 flex items-center justify-center`}
                      >
                        {themeAccent === acc.id && (
                          <Check className="w-3 h-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] font-bold stroke-[3]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sound and Notification Toggles */}
                <div className="space-y-2 pt-2 border-t border-surface1/20">
                  <label className="flex items-center justify-between cursor-pointer btn-squash py-0.5">
                    <span className="font-medium text-text">Alarm Sound (Synth)</span>
                    <input
                      type="checkbox"
                      checked={formSound}
                      onChange={(e) => setFormSound(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-accent focus:ring-accent border-surface2/40 bg-base cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer btn-squash py-0.5">
                    <span className="font-medium text-text">Desktop Notifications</span>
                    <input
                      type="checkbox"
                      checked={formNotify}
                      onChange={(e) => setFormNotify(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-accent focus:ring-accent border-surface2/40 bg-base cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer btn-squash py-0.5">
                    <span className="font-medium text-text">Auto-start Next Session</span>
                    <input
                      type="checkbox"
                      checked={formAutoPlay}
                      onChange={(e) => setFormAutoPlay(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-accent focus:ring-accent border-surface2/40 bg-base cursor-pointer"
                    />
                  </label>
                </div>

              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={saveSettings}
                  className="flex-1 py-1.5 btn-bouncy-primary text-xs"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-1.5 btn-bouncy-secondary text-xs"
                >
                  Cancel
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
