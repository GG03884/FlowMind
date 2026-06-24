import React, { useState } from "react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from "recharts";
import { 
  TrendingUp, 
  Activity, 
  CheckCircle, 
  Clock, 
  Layers, 
  RefreshCw, 
  AlertCircle,
  TrendingDown,
  Percent
} from "lucide-react";
import { Task, MomentumHistory } from "../types";

interface AnalyticsProps {
  tasks: Task[];
  momentumHistory: MomentumHistory[];
  activeUserId: string;
}

export default function Analytics({
  tasks,
  momentumHistory = [],
  activeUserId
}: AnalyticsProps) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Calculate active metrics for the current instant view
  const completedTasks = tasks.filter(t => t.status === "completed");
  const completionEfficiency = tasks.length > 0 
    ? Math.round((completedTasks.length / tasks.length) * 100) 
    : 100;

  const onTimeTasks = completedTasks;
  const onTimeRatio = completedTasks.length > 0 
    ? Math.round((onTimeTasks.length / completedTasks.length) * 100) 
    : 100;

  let totalSubtasks = 0;
  let completedSubtasks = 0;
  tasks.forEach(t => {
    if (t.subtasks && Array.isArray(t.subtasks)) {
      totalSubtasks += t.subtasks.length;
      completedSubtasks += t.subtasks.filter(s => s.completed).length;
    }
  });
  const subtaskRatio = totalSubtasks > 0 
    ? Math.round((completedSubtasks / totalSubtasks) * 100) 
    : 100;

  // Weighted algorithm (identical to server-side core)
  const currentInstantScore = Math.round(
    (0.5 * completionEfficiency) + (0.3 * onTimeRatio) + (0.2 * subtaskRatio)
  );

  // Trigger server-side momentum score update and database write
  const handleRecalculateMomentum = async () => {
    if (!activeUserId) return;
    setIsCalculating(true);
    setError(null);
    try {
      const response = await fetch("/api/momentum/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: activeUserId })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to compute score.");
      console.log("[Analytics] Momentum recalculated successfully:", data);
    } catch (err: any) {
      console.error("[Analytics] Calculation error:", err);
      setError(err.message || "Failed to trigger server calculation.");
    } finally {
      setIsCalculating(false);
    }
  };

  // Format history for recharts rendering
  const chartData = momentumHistory.map((item) => {
    const dateObj = new Date(item.weekStartDate + "T12:00:00");
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return {
      week: formattedDate,
      score: item.score,
      rawDate: item.weekStartDate
    };
  });

  // Get momentum score category & visual styling
  const getScoreProfile = (score: number) => {
    if (score >= 85) {
      return {
        label: "Zenith Velocity",
        description: "Optimal performance. Mind, habits, and tasks are in perfect alignment.",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
        text: "text-emerald-400"
      };
    } else if (score >= 65) {
      return {
        label: "Resonance Flow",
        description: "Strong momentum. You are maintaining a highly productive cadence.",
        bg: "bg-indigo-500/10",
        border: "border-indigo-500/20",
        text: "text-indigo-400"
      };
    } else if (score >= 45) {
      return {
        label: "Steady Inertia",
        description: "Moderate stability. Focus is solid, but some deliveries are slipping.",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        text: "text-amber-400"
      };
    } else {
      return {
        label: "Friction Detected",
        description: "Delay bottlenecks and pending loops are putting momentum at risk.",
        bg: "bg-rose-500/10",
        border: "border-rose-500/20",
        text: "text-rose-400"
      };
    }
  };

  const profile = getScoreProfile(momentumHistory.length > 0 ? momentumHistory[momentumHistory.length - 1].score : currentInstantScore);

  return (
    <div id="analytics-panel" className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20 shadow-inner">
            <Activity className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-white font-extrabold tracking-tight text-lg">Weekly Productivity Momentum</h2>
            <p className="text-xs text-slate-400">Algorithmic velocity scoring of completed work and structural delivery pacing</p>
          </div>
        </div>

        <button
          onClick={handleRecalculateMomentum}
          disabled={isCalculating || !activeUserId}
          className="flex items-center gap-2 bg-indigo-600/90 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition duration-200 cursor-pointer shadow-lg shadow-indigo-500/10 border border-indigo-500/30 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isCalculating ? "animate-spin" : ""}`} />
          {isCalculating ? "Computing..." : "Update Weekly Score"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2.5 rounded-xl text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid of Current Weighted Drivers & Main gauge */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Real-time score gauge */}
        <div className="md:col-span-1 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between items-center text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Active Score</span>
          <div className="relative my-4 w-28 h-28 flex items-center justify-center">
            <svg className="absolute w-full h-full transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r="46"
                className="stroke-slate-800 fill-none"
                strokeWidth="7"
              />
              <circle
                cx="56"
                cy="56"
                r="46"
                className="stroke-violet-500 fill-none transition-all duration-1000"
                strokeWidth="7"
                strokeDasharray={`${2 * Math.PI * 46}`}
                strokeDashoffset={`${2 * Math.PI * 46 * (1 - currentInstantScore / 100)}`}
                strokeLinecap="round"
              />
            </svg>
            <div>
              <span className="text-4xl font-black text-white tracking-tighter">{currentInstantScore}</span>
              <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider">PTS</span>
            </div>
          </div>
          <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${profile.bg} ${profile.text} border ${profile.border}`}>
            {profile.label}
          </div>
        </div>

        {/* Driver 1: Completion Efficiency */}
        <div className="bg-slate-950/20 border border-slate-800/40 rounded-xl p-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Completion Efficiency</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{completionEfficiency}</span>
              <span className="text-xs text-slate-500 font-bold">%</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Weight: <b className="text-slate-300">50%</b> of overall momentum</p>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${completionEfficiency}%` }} />
          </div>
        </div>

        {/* Driver 2: On-time Delivery Ratio */}
        <div className="bg-slate-950/20 border border-slate-800/40 rounded-xl p-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">On-Time Delivery</span>
            <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/25">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{onTimeRatio}</span>
              <span className="text-xs text-slate-500 font-bold">%</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Weight: <b className="text-slate-300">30%</b> of overall momentum</p>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div className="bg-sky-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${onTimeRatio}%` }} />
          </div>
        </div>

        {/* Driver 3: Complexity Metric */}
        <div className="bg-slate-950/20 border border-slate-800/40 rounded-xl p-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Complexity Ratio</span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{subtaskRatio}</span>
              <span className="text-xs text-slate-500 font-bold">%</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Weight: <b className="text-slate-300">20%</b> (Subtask completion rate)</p>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${subtaskRatio}%` }} />
          </div>
        </div>
      </div>

      {/* Main Historical Trend Chart Area */}
      <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-violet-400 animate-pulse" />
            Momentum Trend History
          </h3>
          <span className="text-[10px] text-slate-500 font-mono font-bold">
            {chartData.length} records active
          </span>
        </div>

        {chartData.length === 0 ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-lg">
            <TrendingDown className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No Historical Records Saved Yet</p>
            <p className="text-[10px] text-slate-500 mt-1 max-w-sm">
              Press "Update Weekly Score" to compute and write this week's momentum score directly into your Firestore history.
            </p>
          </div>
        ) : (
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="week" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  domain={[0, 100]} 
                  tickLine={false} 
                  axisLine={false} 
                  ticks={[0, 25, 50, 75, 100]}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg shadow-xl text-left">
                          <p className="text-[10px] text-slate-500 font-mono font-bold">{data.rawDate}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 rounded-full bg-violet-500" />
                            <span className="text-xs font-black text-white">Momentum: {data.score}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#scoreColor)"
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Algorithmic info footer */}
      <div className="bg-slate-950/20 border border-slate-800/40 p-4 rounded-xl text-[11px] text-slate-400 space-y-1">
        <p className="font-semibold text-slate-300">How is this calculated?</p>
        <p>
          FlowMind's weighted scoring assesses your behavior over all logged actions:
        </p>
        <ul className="list-disc pl-4 space-y-1 text-slate-500">
          <li><b className="text-slate-400">Task Completion Efficiency (50%):</b> The raw ratio of tasks marked as completed.</li>
          <li><b className="text-slate-400">On-Time Deliveries (30%):</b> Completed tasks that were finalized without triggering an overdue warning.</li>
          <li><b className="text-slate-400">Complexity Multiplier (20%):</b> Measures execution of complex initiatives based on individual subtask completion tracking.</li>
        </ul>
      </div>
    </div>
  );
}
