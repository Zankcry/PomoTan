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
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = state.duration > 0 ? (state.duration - timeLeft) / state.duration : 0;
  const strokeDashoffset = circumference - progressRatio * circumference;

  // Active Accent styling variables injected into style
  const themeAccentStyle = {
    '--ctp-accent': `var(--ctp-${themeAccent})`,
  } as React.CSSProperties;

  return (
    <div
      className={`w-full h-full ${themeFlavor} bg-base text-text flex flex-col p-5 select-none relative transition-colors duration-300`}
      style={themeAccentStyle}
    >
      {/* Header */}
      <header className="flex justify-between items-center mb-3">
        <div>
          <h1 className="font-medium text-sm tracking-wide text-text/90">PomoFocus</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Custom BGM Selector */}
          <div className="relative">
            <button
              onClick={() => setIsMusicDropdownOpen(!isMusicDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-mantle/50 border border-surface0/30 hover:bg-mantle/80 text-subtext1 hover:text-text font-medium text-[10px] transition-all duration-200 cursor-pointer active:scale-95"
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
              <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-mantle border border-surface0/50 shadow-2xl p-2.5 z-50 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                <div className="text-[9px] uppercase tracking-wider text-subtext2 font-bold px-1.5">
                  Focus BGM
                </div>

                {/* Track list */}
                <div className="flex flex-col gap-0.5 max-h-[140px] overflow-y-auto pr-0.5">
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
                        className={`flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-left text-[10px] font-medium transition-all duration-150 cursor-pointer ${isActive
                          ? 'bg-accent/10 text-accent'
                          : 'hover:bg-surface0/40 text-subtext1 hover:text-text'
                          }`}
                      >
                        <span className="truncate">{track.name}</span>
                        {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>

                <div className="h-[1px] bg-surface0/50 my-0.5" />

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
                      className="text-subtext1 hover:text-text transition-colors duration-150"
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

                <div className="h-[1px] bg-surface0/50 my-0.5" />

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
            className="p-1.5 rounded-full hover:bg-surface0/50 text-subtext1 hover:text-text transition-colors duration-200"
          >
            <SettingsIcon className="w-[16px] h-[16px]" />
          </button>
        </div>
      </header>

      {/* Dynamic Duration Customization (In One Line, Input Only) */}
      <div className="bg-mantle/40 rounded-xl px-4 py-2 mb-3 border border-surface0/30 flex gap-6 text-xs font-medium text-subtext1 items-center justify-center">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-subtext2">Focus</span>
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
              className="w-7 bg-transparent border-b border-transparent focus:border-accent text-center text-accent font-medium text-xs focus:outline-none transition-all p-0"
              style={{ MozAppearance: 'textfield' }}
            />
            <span className="text-[10px] text-subtext2 ml-0.5">m</span>
          </div>
        </div>

        <div className="w-[1px] bg-surface1/40 self-stretch"></div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-subtext2">Break</span>
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
              className="w-7 bg-transparent border-b border-transparent focus:border-accent text-center text-accent font-medium text-xs focus:outline-none transition-all p-0"
              style={{ MozAppearance: 'textfield' }}
            />
            <span className="text-[10px] text-subtext2 ml-0.5">m</span>
          </div>
        </div>
      </div>

      {/* Main Timer Display */}
      <div className="flex flex-col items-center justify-center mb-3 grow">
        <div className="relative w-48 h-48 flex items-center justify-center">
          {/* Circular Progress SVG */}
          <svg className="w-full h-full transform -rotate-90">
            {/* Background Circle */}
            <circle
              cx="96"
              cy="96"
              r={radius}
              className="stroke-surface0/60"
              strokeWidth="2.5"
              fill="transparent"
            />
            {/* Foreground Ring */}
            <circle
              cx="96"
              cy="96"
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
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-[34px] font-light tracking-tight text-text/95 tabular-nums leading-none">
              {formatTime(timeLeft)}
            </span>
            <span className="text-[9px] font-medium tracking-[0.2em] text-subtext1 uppercase mt-2">
              {state.sessionType === 'pomo' ? 'Focusing' : 'Break Time'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 mt-4 w-full px-6">
          <button
            onClick={toggleTimer}
            className="flex-1 py-2 rounded-xl bg-accent/10 hover:bg-accent/15 text-accent font-medium text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all duration-200"
          >
            {state.isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                Start
              </>
            )}
          </button>

          <button
            onClick={skipTimer}
            className="px-5 py-2 rounded-xl hover:bg-surface0/30 text-subtext1 hover:text-text font-medium text-xs active:scale-[0.98] transition-all duration-200"
          >
            Skip
          </button>
        </div>
      </div>

      {/* Tasks List */}
      <div className="bg-mantle/30 rounded-2xl p-4 flex flex-col border border-surface0/30 h-[190px] shrink-0 overflow-hidden">
        <div className="flex justify-between items-center mb-3 pb-1.5 border-b border-surface1/20">
          <h2 className="font-medium text-xs text-subtext0">Today's Tasks</h2>

          {!isAddingTask && (
            <button
              onClick={() => setIsAddingTask(true)}
              className="flex items-center gap-0.5 text-[10px] font-medium text-accent hover:opacity-80 transition-all duration-200"
            >
              <Plus className="w-3.5 h-3.5" />
              Add task
            </button>
          )}
        </div>

        {/* Task Form inline */}
        {isAddingTask && (
          <form onSubmit={handleAddTask} className="flex gap-2 mb-2 items-center animate-in fade-in slide-in-from-top-1 duration-200">
            <input
              type="text"
              placeholder="What are you working on?"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              className="flex-grow text-xs px-2.5 py-1.5 rounded-lg bg-base/50 text-text placeholder-subtext2 border border-surface1/20 focus:outline-none focus:border-accent"
              autoFocus
            />
            <div className="flex gap-1">
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsAddingTask(false)}
                className="p-1.5 rounded-lg bg-surface1/20 text-subtext1 hover:bg-surface2/20"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* Tasks List container */}
        <div className={`overflow-y-auto grow text-xs space-y-1.5 pr-0.5 ${tasks.length === 0 ? 'flex flex-col justify-center items-center' : ''}`}>
          {tasks.length === 0 ? (
            <div className="text-center text-subtext2 italic text-[11px]">
              No tasks added yet. Let's add one!
            </div>
          ) : (
            tasks.map((task, index) => (
              <div
                key={task.id}
                className="group flex items-center justify-between p-2 rounded-xl bg-surface0/20 border border-transparent hover:border-surface1/25 hover:bg-surface0/35 transition-all duration-200"
              >
                <div
                  onClick={() => toggleTask(task.id)}
                  className="flex items-center gap-2.5 cursor-pointer flex-grow min-w-0"
                >
                  <span className="text-subtext2 font-medium">{index + 1}.</span>
                  <button className="text-accent flex-shrink-0 transition-transform duration-200 hover:scale-105">
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
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-red hover:bg-red/10 hover:text-red transition-all duration-200 flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Completed footer */}
        {tasks.length > 0 && (
          <div className="text-center text-[9px] font-medium text-subtext2 mt-2 pt-2 border-t border-surface1/10">
            Today: {tasks.filter(t => t.completed).length} of {tasks.length} Completed
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="absolute inset-0 bg-crust/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-mantle border border-surface1/20 rounded-2xl w-full max-h-[90%] overflow-y-auto flex flex-col p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">

            {/* Modal Header */}
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-surface1/20">
              <h3 className="font-medium text-sm text-text flex items-center gap-2">
                <SettingsIcon className="w-3.5 h-3.5 text-accent" />
                Configuration
              </h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-md text-subtext1 hover:bg-surface0/50 hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 text-xs">


              {/* Theme Settings (Catppuccin Flavor) */}
              <div>
                <h4 className="font-medium text-subtext0 mb-2">Theme Flavor</h4>
                <div className="grid grid-cols-2 gap-2">
                  {FLAVORS.map(flavor => (
                    <button
                      key={flavor.id}
                      type="button"
                      onClick={() => setThemeFlavor(flavor.id)}
                      className={`py-1.5 px-2.5 rounded-lg border text-left flex flex-col justify-center transition-all ${themeFlavor === flavor.id ? 'border-accent bg-base/50' : 'border-surface1/10 hover:bg-surface0/30'}`}
                    >
                      <span className="font-medium text-[11px]">{flavor.name}</span>
                      <span className="text-[9px] text-subtext2">{flavor.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Color picker */}
              <div>
                <h4 className="font-medium text-subtext0 mb-1.5">Accent Color</h4>
                <div className="flex gap-2 flex-wrap">
                  {ACCENTS.map(acc => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setThemeAccent(acc.id)}
                      title={acc.name}
                      style={{ backgroundColor: acc.color }}
                      className={`w-5.5 h-5.5 rounded-full relative transition-all duration-200 hover:scale-110 shadow-sm border border-black/5 flex items-center justify-center`}
                    >
                      {themeAccent === acc.id && (
                        <Check className="w-3 h-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] font-bold stroke-[3]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound and Notification Toggles */}
              <div className="space-y-2.5 pt-2 border-t border-surface1/20">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-medium text-text">Alarm Sound (Synth)</span>
                  <input
                    type="checkbox"
                    checked={formSound}
                    onChange={(e) => setFormSound(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-accent focus:ring-accent border-surface2/40 bg-base"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-medium text-text">Desktop Notifications</span>
                  <input
                    type="checkbox"
                    checked={formNotify}
                    onChange={(e) => setFormNotify(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-accent focus:ring-accent border-surface2/40 bg-base"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-medium text-text">Auto-start Next Session</span>
                  <input
                    type="checkbox"
                    checked={formAutoPlay}
                    onChange={(e) => setFormAutoPlay(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-accent focus:ring-accent border-surface2/40 bg-base"
                  />
                </label>
              </div>





            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 mt-5">
              <button
                onClick={saveSettings}
                className="flex-1 py-2 rounded-xl bg-accent text-white font-medium shadow-sm active:scale-[0.98] transition-all hover:opacity-90"
              >
                Save Changes
              </button>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 rounded-xl bg-surface0/50 hover:bg-surface1/50 text-text font-medium active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
