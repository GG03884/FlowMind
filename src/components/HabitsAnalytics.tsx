import React, { useState } from "react";
import { Award, CheckCircle, Flame, Calendar, Sparkles, TrendingUp, Compass, Plus } from "lucide-react";
import { Habit, Task } from "../types";

interface HabitsAnalyticsProps {
  tasks: Task[];
  habits: Habit[];
  onCompleteHabit: (habitId: string) => void;
  onAddHabit: (title: string, frequency: 'daily' | 'weekly', slot: 'early_morning' | 'mid_afternoon' | 'evening') => void;
}

export default function HabitsAnalytics({
  tasks,
  habits,
  onCompleteHabit,
  onAddHabit
}: HabitsAnalyticsProps) {
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>("daily");
  const [slot, setSlot] = useState<'early_morning' | 'mid_afternoon' | 'evening'>("early_morning");

  // Calculate Productivity Momentum Score: (completed tasks / total tasks) * 100
  // Plus minor modifiers for streaks
  const calculateMomentumScore = () => {
    const total = tasks.length;
    if (total === 0) return 75; // baseline

    const completed = tasks.filter(t => t.status === "completed").length;
    const baseScore = Math.round((completed / total) * 100);

    // Minor streak bonus (up to 15 bonus points)
    const habitStreakBonus = habits.reduce((acc, h) => acc + h.streakCount, 0);
    const totalBonus = Math.min(habitStreakBonus * 2, 15);

    return Math.min(baseScore + totalBonus, 100);
  };

  const score = calculateMomentumScore();

  // Get status text for momentum
  const getMomentumStatus = (val: number) => {
    if (val >= 90) return { label: "Cognitive Zenith", color: "text-emerald-400" };
    if (val >= 70) return { label: "High Resonance", color: "text-indigo-400" };
    if (val >= 50) return { label: "Steady Inertia", color: "text-amber-400" };
    return { label: "Delay Friction Detected", color: "text-red-400" };
  };

  const status = getMomentumStatus(score);

  const handleSubmitHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitTitle.trim()) return;
    onAddHabit(newHabitTitle, frequency, slot);
    setNewHabitTitle("");
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Productivity Momentum Score Panel */}
      <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-white font-medium">Behavioral Insights</h3>
              <p className="text-xs text-slate-400">Weekly productivity performance metrics</p>
            </div>
          </div>

          <div className="flex items-center gap-6 py-4">
            {/* Circular Gauge */}
            <div className="relative w-28 h-28 flex items-center justify-center">
              {/* Circular track */}
              <svg className="absolute w-full h-full transform -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  className="stroke-slate-800 fill-none"
                  strokeWidth="8"
                />
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  className="stroke-indigo-500 fill-none transition-all duration-1000"
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 48}`}
                  strokeDashoffset={`${2 * Math.PI * 48 * (1 - score / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="text-center">
                <span className="text-3xl font-extrabold text-white tracking-tight">{score}</span>
                <span className="block text-[9px] text-slate-500 uppercase tracking-wider font-mono">Score</span>
              </div>
            </div>

            <div className="space-y-2 flex-1">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-mono">Current Resonance State</span>
                <h4 className={`text-lg font-bold ${status.color}`}>{status.label}</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your score is generated dynamically based on active vs. completed deadlines, combined with recurring habit adherence streaks.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800/60 pt-4 mt-4 grid grid-cols-2 gap-4">
          <div className="bg-slate-950/40 border border-slate-800/40 p-3 rounded-xl">
            <span className="text-[10px] text-slate-500 font-mono block">COMPLETION RATE</span>
            <span className="text-lg font-bold text-slate-200">
              {tasks.length > 0 ? Math.round((tasks.filter(t => t.status === "completed").length / tasks.length) * 100) : 0}%
            </span>
          </div>
          <div className="bg-slate-950/40 border border-slate-800/40 p-3 rounded-xl">
            <span className="text-[10px] text-slate-500 font-mono block">RECURRING HABITS</span>
            <span className="text-lg font-bold text-slate-200">
              {habits.length} active
            </span>
          </div>
        </div>
      </div>

      {/* Habit Tracker Panel */}
      <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                <Flame className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Habit Alignment</h3>
                <p className="text-xs text-slate-400">Recurring habits scheduled dynamically</p>
              </div>
            </div>
          </div>

          {/* Create new habit */}
          <form onSubmit={handleSubmitHabit} className="flex gap-2 mb-4 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
            <input
              type="text"
              placeholder="e.g. Deep Work block, Meditation, Review email..."
              value={newHabitTitle}
              onChange={(e) => setNewHabitTitle(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-850 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
            />
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value as any)}
              className="bg-slate-900 border border-slate-850 rounded-lg px-1 py-1.5 text-[11px] text-slate-300 focus:outline-none"
            >
              <option value="early_morning">🌅 Early Morning</option>
              <option value="mid_afternoon">☀️ Afternoon</option>
              <option value="evening">🌌 Evening</option>
            </select>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg p-1.5 transition flex items-center justify-center cursor-pointer shadow"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Habits list */}
          <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 no-scrollbar">
            {habits.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-6">No habits registered. Create one above!</p>
            ) : (
              habits.map(habit => (
                <div
                  key={habit.id}
                  className="bg-slate-950/30 border border-slate-850 rounded-xl p-2.5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => onCompleteHabit(habit.id)}
                      className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition flex items-center justify-center text-emerald-400 shrink-0 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{habit.title}</h4>
                      <p className="text-[10px] text-slate-500 font-mono capitalize">
                        {habit.frequency} • {habit.preferredScheduleSlot.replace("_", " ")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full font-semibold text-[10px] font-mono">
                    <Flame className="w-3 h-3 text-orange-500 animate-pulse" />
                    <span>{habit.streakCount}d streak</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
