import React, { useState, useEffect } from "react";
import { testFirestoreConnection } from "./lib/firebase";
import { Task, CalendarEvent } from "./types";
import {
  useAuth,
  useUserProfile,
  useTasks,
  useHabits,
  useAgentLogs
} from "./context/AuthContext";
import UrgencyConstellation from "./components/UrgencyConstellation";
import Dashboard from "./components/Dashboard";
import MultimodalIngestion from "./components/MultimodalIngestion";
import ShadowSchedulerView from "./components/ShadowSchedulerView";
import MitigationTimeline from "./components/MitigationTimeline";
import HabitsAnalytics from "./components/HabitsAnalytics";
import Analytics from "./components/Analytics";
import AgentChat from "./components/AgentChat";
import { Cpu, Shield, ShieldCheck } from "lucide-react";

export default function App() {
  const { user, loading: authLoading, activeUserId, signInWithGoogle, logout } = useAuth();
  const { profile, loading: profileLoading, updatePreferences } = useUserProfile();
  const { tasks, loading: tasksLoading, addTask, updateTask, deleteTask } = useTasks();
  const { habits, loading: habitsLoading, addHabit, completeHabit } = useHabits();
  const { logs, loading: logsLoading, addLog } = useAgentLogs();

  // Calendar events are kept as local component state as they are ephemeral and computed dynamically
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isMitigating, setIsMitigating] = useState(false);

  // Trigger initial connection validation
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Compute aggregated preferences or fallback to default
  const preferences = profile?.preferences || {
    chronotype: "morning_lark" as const,
    work_hours: { start: "09:00", end: "17:00" },
    high_energy_windows: ["09:00-11:00", "14:00-15:30"]
  };

  // Google Sign-In helper
  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Sign-in failed, continuing in Guest Sandbox Mode:", err);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      setEvents([]);
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  // Ingestion Action callback
  const handleImportedTasks = async (parsedTasks: Omit<Task, "id" | "userId">[]) => {
    try {
      for (const t of parsedTasks) {
        await addTask({
          ...t,
          status: "pending",
          escalationLevel: 1,
          mitigationDraft: { subject: "", body: "", recipient: "", status: "none" },
          agentPlan: ["Autonomous scheduler block creation queued"]
        });
      }

      await addLog(
        "syllabus_parsed",
        `Imported ${parsedTasks.length} structured task(s) from document scan. Chronological timeline updated.`
      );
    } catch (err) {
      console.error("Failed to write imported tasks:", err);
    }
  };

  // Add Task manually
  const handleAddTask = async (task: Omit<Task, "id" | "userId">) => {
    try {
      await addTask(task);
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  // Update Task Status
  const handleUpdateTaskStatus = async (taskId: string, status: Task["status"]) => {
    try {
      await updateTask(taskId, { status });

      const targetTask = tasks.find((t) => t.id === taskId);
      await addLog(
        "conflict_resolved",
        `Marked task "${targetTask?.title || "Unknown Task"}" as ${status}.`
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId);
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  // Log generation helper
  const handleAddLog = async (actionType: any, description: string) => {
    try {
      await addLog(actionType, description);
    } catch (err) {
      console.error("Failed to add log:", err);
    }
  };

  // Shadow Scheduler integration
  const handleTriggerSchedule = async () => {
    setIsScheduling(true);
    try {
      const response = await fetch("/api/agent/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks,
          habits,
          preferences,
          currentEvents: events
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      if (data.events) {
        setEvents(data.events);
      }

      if (data.logs && Array.isArray(data.logs)) {
        for (const log of data.logs) {
          await addLog(log.actionType, log.description);
        }
      }
    } catch (err) {
      console.error("Shadow scheduler run failed:", err);
    } finally {
      setIsScheduling(false);
    }
  };

  // Mitigation scan execution
  const handleRunMitigationScan = async () => {
    setIsMitigating(true);
    try {
      const response = await fetch("/api/agent/mitigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks,
          userEmail: user?.email || "gayatri03884@gmail.com"
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // Batch update the escalation level and mitigation drafts on client
      if (data.tasks && Array.isArray(data.tasks)) {
        for (const updatedTask of data.tasks) {
          const original = tasks.find((t) => t.id === updatedTask.id);
          if (
            original &&
            (original.escalationLevel !== updatedTask.escalationLevel ||
              original.mitigationDraft?.status !== updatedTask.mitigationDraft?.status)
          ) {
            await updateTask(updatedTask.id, {
              escalationLevel: updatedTask.escalationLevel,
              mitigationDraft: updatedTask.mitigationDraft
            });
          }
        }
      }

      // Add audit logs returned
      if (data.logs && Array.isArray(data.logs)) {
        for (const log of data.logs) {
          await addLog(log.actionType, log.description);
        }
      }
    } catch (err) {
      console.error("Mitigation core run failed:", err);
    } finally {
      setIsMitigating(false);
    }
  };

  // Simulate sending draft email
  const handleSendEmailDraft = async (taskId: string) => {
    try {
      const task = tasks.find((t) => t.id === taskId);
      if (!task || !task.mitigationDraft) return;

      await updateTask(taskId, {
        mitigationDraft: {
          ...task.mitigationDraft,
          status: "sent"
        }
      });

      await addLog(
        "email_drafted",
        `🛡️ Level 3 Mitigation Completed: Successfully processed and pushed mitigation email for "${task.title}" to ${task.mitigationDraft.recipient}.`
      );
    } catch (err) {
      console.error("Failed to mark draft as sent:", err);
    }
  };

  // Complete habit
  const handleCompleteHabit = async (habitId: string) => {
    try {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;

      await completeHabit(habitId);

      await addLog(
        "habit_auto_scheduled",
        `Completed daily habit "${habit.title}". Current streak increased to ${habit.streakCount + 1} days!`
      );
    } catch (err) {
      console.error("Failed to complete habit:", err);
    }
  };

  // Add custom habit
  const handleAddHabit = async (title: string, frequency: "daily" | "weekly", preferredScheduleSlot: any) => {
    try {
      await addHabit({
        title,
        frequency,
        streakCount: 0,
        lastCompleted: null,
        preferredScheduleSlot
      });

      await addLog(
        "habit_auto_scheduled",
        `Registered new recurring habit: "${title}" (${preferredScheduleSlot}). Auto-scheduler ready to map blocks.`
      );
    } catch (err) {
      console.error("Failed to register habit:", err);
    }
  };

  // Add focus block locally to calendar
  const handleAddFocusBlock = (title: string, start: string, end: string) => {
    const newBlock: CalendarEvent = {
      id: `focus-${Date.now()}`,
      title,
      start,
      end,
      type: "focus_block",
      color: "#8b5cf6"
    };
    setEvents(prev => [...prev, newBlock]);
  };

  const isAppLoading = authLoading || profileLoading || tasksLoading || habitsLoading || logsLoading;

  if (isAppLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 font-mono">
        <Cpu className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-xs">Connecting FlowMind Core with Cloud Firestore...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070913] text-slate-100 flex flex-col relative overflow-x-hidden font-sans select-none pb-12">
      {/* Background Urgency Constellation particle engine */}
      <UrgencyConstellation tasks={tasks} />

      {/* Primary Container */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 relative z-10 flex-1 flex flex-col pt-6 space-y-6">
        {/* Elegant display navbar header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner">
              <Cpu className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-white font-extrabold tracking-tight text-lg">FlowMind</h1>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded-full border border-indigo-500/20 font-bold font-mono tracking-wide uppercase">
                  v1.2 Agentic
                </span>
              </div>
              <p className="text-xs text-slate-400">Proactive Productivity Companion & Chronological Shield</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800/80 px-3 py-1.5 rounded-xl text-xs">
              {user ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-300 font-medium truncate max-w-[120px]">
                    {user.displayName || user.email}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="text-slate-500 hover:text-red-400 font-semibold pl-2 border-l border-slate-800 transition cursor-pointer"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-slate-300 font-medium">Guest Sandbox</span>
                  <button
                    onClick={handleGoogleSignIn}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold pl-2 border-l border-slate-800 transition cursor-pointer"
                  >
                    Connect Auth
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Modular Grid Layout */}
        <main className="grid grid-cols-1 gap-6">
          {/* Row 1: Unified dashboard, Task Queues & Syllabus uploader */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Dashboard
                tasks={tasks}
                events={events}
                onAddTask={handleAddTask}
                onUpdateTaskStatus={handleUpdateTaskStatus}
                onDeleteTask={handleDeleteTask}
                onRunMitigationScan={handleRunMitigationScan}
              />
            </div>
            <div>
              <MultimodalIngestion onTasksImported={handleImportedTasks} userId={activeUserId} />
            </div>
          </section>

          {/* Row 2: Shadow Scheduler View & Habits Tracker */}
          <section className="grid grid-cols-1 gap-6">
            <ShadowSchedulerView
              preferences={preferences}
              onUpdatePreferences={updatePreferences}
              events={events}
              onTriggerSchedule={handleTriggerSchedule}
              isScheduling={isScheduling}
            />
          </section>

          {/* Row 3: Interactive Agent Chat, Analytics panel, and Mitigation email drafts timeline */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-6">
              <HabitsAnalytics
                tasks={tasks}
                habits={habits}
                onCompleteHabit={handleCompleteHabit}
                onAddHabit={handleAddHabit}
              />
              <Analytics
                tasks={tasks}
                momentumHistory={profile?.momentumHistory || []}
                activeUserId={activeUserId}
              />
              <MitigationTimeline
                tasks={tasks}
                logs={logs}
                onRunMitigationScan={handleRunMitigationScan}
                isScanning={isMitigating}
                onSendEmailDraft={handleSendEmailDraft}
              />
            </div>
            <div>
              <AgentChat
                tasks={tasks}
                habits={habits}
                activeUserId={activeUserId}
                onTriggerSchedule={handleTriggerSchedule}
                onAddTask={handleAddTask}
                onAddLog={handleAddLog}
                onAddFocusBlock={handleAddFocusBlock}
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
