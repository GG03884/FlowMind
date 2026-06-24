import React, { useState } from "react";
import { CheckSquare, Calendar, ShieldAlert, Clock, AlertCircle, Trash2, Plus, Sparkles, Filter, Check } from "lucide-react";
import { Task, CalendarEvent, UserPreferences } from "../types";

interface DashboardProps {
  tasks: Task[];
  events: CalendarEvent[];
  onAddTask: (task: Omit<Task, "id" | "userId">) => void;
  onUpdateTaskStatus: (taskId: string, status: Task["status"]) => void;
  onDeleteTask: (taskId: string) => void;
  onRunMitigationScan: () => void;
}

export default function Dashboard({
  tasks,
  events,
  onAddTask,
  onUpdateTaskStatus,
  onDeleteTask,
  onRunMitigationScan
}: DashboardProps) {
  const [filter, setFilter] = useState<"all" | "high" | "pending" | "completed">("all");
  
  // New task form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [cognitiveLoad, setCognitiveLoad] = useState<"low" | "medium" | "high">("medium");

  const activeTasks = tasks.filter(t => t.status !== "completed");
  const overdueTasks = tasks.filter(t => {
    return t.status !== "completed" && new Date(t.deadline).getTime() < Date.now();
  });

  const filteredTasks = tasks.filter(t => {
    if (filter === "high") return t.priority === "high" && t.status !== "completed";
    if (filter === "pending") return t.status !== "completed";
    if (filter === "completed") return t.status === "completed";
    return true;
  });

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !deadline) return;

    onAddTask({
      title,
      description,
      deadline: new Date(deadline).toISOString(),
      estimatedMinutes,
      priority,
      status: "pending",
      cognitiveLoad,
      escalationLevel: 1,
      originType: "manual",
      subtasks: [],
      mitigationDraft: { subject: "", body: "", recipient: "", status: "none" },
      agentPlan: ["Autonomous scheduler assignment planned"]
    });

    // Reset fields
    setTitle("");
    setDescription("");
    setDeadline("");
    setEstimatedMinutes(60);
    setPriority("medium");
    setCognitiveLoad("medium");
  };

  // Format local current clock time
  const [currentTime, setCurrentTime] = useState(new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Task Queue & List (Left 2 cols) */}
      <div className="xl:col-span-2 space-y-6">
        {/* Real-time Urgency Alert banner if overdue */}
        {overdueTasks.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-red-950/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center border border-red-500/30 shrink-0">
                <ShieldAlert className="w-5 h-5 text-red-400 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-red-300">Impending Overdue Risk</h4>
                <p className="text-xs text-slate-300">
                  {overdueTasks.length} task(s) are currently past their deadline. The companion is prepared to draft extension mitigations.
                </p>
              </div>
            </div>
            <button
              onClick={onRunMitigationScan}
              className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg py-1.5 px-3 hover:bg-red-500/20 transition cursor-pointer"
            >
              🛡️ Mitigate Now
            </button>
          </div>
        )}

        {/* Task List Controls */}
        <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">Task Queues</h3>
              <p className="text-xs text-slate-400 font-medium">Manage and check priorities</p>
            </div>

            {/* Filter buttons */}
            <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/80 text-xs font-mono">
              {(["all", "pending", "high", "completed"] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer capitalize ${
                    filter === type
                      ? "bg-indigo-600 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Tasks loop */}
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 no-scrollbar">
            {filteredTasks.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-12">No tasks matching the selected filter.</p>
            ) : (
              filteredTasks.map(task => {
                const isOverdue = new Date(task.deadline).getTime() < Date.now() && task.status !== "completed";
                const isHigh = task.priority === "high";

                return (
                  <div
                    key={task.id}
                    className="bg-slate-950/45 hover:bg-slate-950/70 border border-slate-850 rounded-xl p-4 flex items-center justify-between gap-4 transition"
                  >
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <button
                        onClick={() => onUpdateTaskStatus(task.id, task.status === "completed" ? "pending" : "completed")}
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition cursor-pointer ${
                          task.status === "completed"
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "border-slate-700 hover:border-slate-500"
                        }`}
                      >
                        {task.status === "completed" && <Check className="w-3.5 h-3.5" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className={`text-sm font-bold truncate text-slate-100 ${task.status === "completed" ? "line-through text-slate-500" : ""}`}>
                            {task.title}
                          </h4>

                          {/* Priority badge */}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold capitalize ${
                            isHigh ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-slate-800 text-slate-400"
                          }`}>
                            {task.priority}
                          </span>

                          {/* Overdue/Urgent notification */}
                          {isOverdue && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold animate-pulse">
                              OVERDUE
                            </span>
                          )}

                          {/* Cognitive Load */}
                          <span className="text-[9px] bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded font-mono">
                            🧠 {task.cognitiveLoad} load
                          </span>
                        </div>

                        {task.description && (
                          <p className="text-xs text-slate-400 truncate mb-1.5">{task.description}</p>
                        )}

                        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                          <span>⏱️ {task.estimatedMinutes} mins</span>
                          <span>•</span>
                          <span>📅 Due: {new Date(task.deadline).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onDeleteTask(task.id)}
                      className="text-slate-600 hover:text-red-400 transition p-1 rounded-lg hover:bg-slate-900 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Side Forms & Live Clock (Right 1 col) */}
      <div className="space-y-6">
        {/* Live Clock Card */}
        <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">System Clock</h4>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-white font-mono tracking-tight">
                {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="text-xs font-semibold text-indigo-400 font-mono uppercase">
                {currentTime.toLocaleTimeString([], { hour12: false }).endsWith("PM") ? "PM" : "AM"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <Clock className="w-10 h-10 text-indigo-500/20 shrink-0" />
        </div>

        {/* Task Creator Form */}
        <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <Plus className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-white font-medium">Create Task</h3>
              <p className="text-xs text-slate-400">Add an item to timeline manually</p>
            </div>
          </div>

          <form onSubmit={handleCreateTask} className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 font-mono">Task Title</label>
              <input
                type="text"
                required
                placeholder="e.g. History essay, CS lab"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 font-mono">Details</label>
              <textarea
                placeholder="Add notes, weights, or resources..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 font-mono">Deadline</label>
                <input
                  type="datetime-local"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-[10px] text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 font-mono">Effort (Min)</label>
                <input
                  type="number"
                  required
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-indigo-500 text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 font-mono">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white focus:outline-none"
                >
                  <option value="low">🟢 Low</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="high">🔴 High</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 font-mono">Cognitive Load</label>
                <select
                  value={cognitiveLoad}
                  onChange={(e) => setCognitiveLoad(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white focus:outline-none"
                >
                  <option value="low">🧠 Low Load</option>
                  <option value="medium">🧠 Mid Load</option>
                  <option value="high">🧠 High Load</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-md flex items-center justify-center gap-1.5"
            >
              Add Task to Queue
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
