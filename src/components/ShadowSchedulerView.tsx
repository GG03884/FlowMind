import React, { useState } from "react";
import { Calendar, Settings, Compass, Sparkles, RefreshCw, Zap, Check } from "lucide-react";
import { Task, Habit, UserPreferences, CalendarEvent } from "../types";

interface ShadowSchedulerViewProps {
  preferences: UserPreferences;
  onUpdatePreferences: (prefs: UserPreferences) => void;
  events: CalendarEvent[];
  onTriggerSchedule: () => void;
  isScheduling: boolean;
}

export default function ShadowSchedulerView({
  preferences,
  onUpdatePreferences,
  events,
  onTriggerSchedule,
  isScheduling
}: ShadowSchedulerViewProps) {
  const [chronotype, setChronotype] = useState<UserPreferences["chronotype"]>(preferences.chronotype);
  const [workStart, setWorkStart] = useState(preferences.work_hours.start);
  const [workEnd, setWorkEnd] = useState(preferences.work_hours.end);

  const handleSavePreferences = () => {
    let energyWindows: string[] = [];
    if (chronotype === "morning_lark") {
      energyWindows = ["09:00-11:00", "14:00-15:30"];
    } else if (chronotype === "night_owl") {
      energyWindows = ["15:00-17:00", "19:30-22:00"];
    } else {
      energyWindows = ["13:00-15:00", "16:00-18:00"];
    }

    onUpdatePreferences({
      chronotype,
      work_hours: { start: workStart, end: workEnd },
      high_energy_windows: energyWindows
    });
  };

  // Days list for visual rendering
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Helper: group events by day of week based on current date
  const getEventsForDayIndex = (dayIndex: number) => {
    // Basic day indexing from tomorrow for demo
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + dayIndex + 1);
    const dateStr = testDate.toDateString();

    return events.filter(ev => {
      const evDate = new Date(ev.start).toDateString();
      return evDate === dateStr;
    });
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl h-full flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <Compass className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-white font-medium">Shadow Scheduler</h3>
              <p className="text-xs text-slate-400 font-medium">Cognitive load-to-chronotype mapping</p>
            </div>
          </div>
          <button
            onClick={onTriggerSchedule}
            disabled={isScheduling}
            className="flex items-center gap-1.5 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-xs font-semibold rounded-lg transition cursor-pointer shadow-md"
          >
            {isScheduling ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Align Shadow blocks
          </button>
        </div>

        {/* Configuration settings panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
              Chronotype Profile
            </label>
            <select
              value={chronotype}
              onChange={(e) => {
                setChronotype(e.target.value as any);
              }}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="morning_lark">🌅 Morning Lark</option>
              <option value="night_owl">🦉 Night Owl</option>
              <option value="productive_afternoon">⚡ Afternoon Catalyst</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
              Sleep / Work bounds
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                placeholder="Start"
                className="w-1/2 bg-slate-900 border border-slate-800 rounded-lg p-2 text-center text-xs text-white focus:outline-none"
              />
              <span className="text-slate-500 text-xs">-</span>
              <input
                type="text"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                placeholder="End"
                className="w-1/2 bg-slate-900 border border-slate-800 rounded-lg p-2 text-center text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleSavePreferences}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-750 border border-slate-700/60 rounded-lg text-xs font-medium text-slate-200 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              Save Core Bounds
            </button>
          </div>
        </div>

        {/* Energy Windows info */}
        <div className="mb-6 flex items-center gap-2.5 bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3 text-xs text-indigo-300">
          <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>
            Current peaks scheduled at:{" "}
            <strong className="text-white">
              {preferences.high_energy_windows.join(" & ")}
            </strong>{" "}
            daily. High cognitive-load items will lock here autonomously.
          </span>
        </div>

        {/* Scheduled Timeline Grid */}
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 font-mono">
          Weekly Shadow Timeline (Tomorrow onwards)
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5">
          {days.map((dayName, idx) => {
            const dayEvents = getEventsForDayIndex(idx);
            const targetDay = new Date();
            targetDay.setDate(targetDay.getDate() + idx + 1);

            return (
              <div
                key={dayName}
                className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/40 min-h-[140px] flex flex-col"
              >
                <div className="flex justify-between items-center mb-2 border-b border-slate-800/40 pb-1.5">
                  <span className="text-xs font-bold text-slate-200">{dayName}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {targetDay.getDate()}/{targetDay.getMonth() + 1}
                  </span>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar max-h-[140px]">
                  {dayEvents.length === 0 ? (
                    <span className="text-[10px] text-slate-600 block text-center py-4 italic">
                      No blocks
                    </span>
                  ) : (
                    dayEvents.map(ev => (
                      <div
                        key={ev.id}
                        className="p-2 rounded-lg border text-[10px] leading-tight flex flex-col justify-between"
                        style={{
                          backgroundColor: `${ev.color || "#4f46e5"}20`,
                          borderColor: ev.color || "#4f46e5"
                        }}
                      >
                        <span className="font-semibold text-slate-200 truncate block">
                          {ev.title}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono mt-1">
                          {new Date(ev.start).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
