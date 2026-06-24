import React, { useState } from "react";
import { Shield, Mail, Check, AlertTriangle, FileText, ChevronRight, Play, Copy, RefreshCw } from "lucide-react";
import { Task, AgentLog } from "../types";

interface MitigationTimelineProps {
  tasks: Task[];
  logs: AgentLog[];
  onRunMitigationScan: () => void;
  isScanning: boolean;
  onSendEmailDraft: (taskId: string) => void;
}

export default function MitigationTimeline({
  tasks,
  logs,
  onRunMitigationScan,
  isScanning,
  onSendEmailDraft
}: MitigationTimelineProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter tasks that have mitigation drafts
  const tasksWithDrafts = tasks.filter(t => t.mitigationDraft && t.mitigationDraft.status !== "none");

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl h-full flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center border border-red-500/30">
              <Shield className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h3 className="text-white font-medium">Mitigation & Escalation Core</h3>
              <p className="text-xs text-slate-400 font-medium">Proactive timeline & autonomous alerts</p>
            </div>
          </div>
          <button
            onClick={onRunMitigationScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 py-1.5 px-3 bg-red-650 hover:bg-red-600 disabled:bg-red-650/50 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            {isScanning ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Run Escalation Scan
          </button>
        </div>

        {/* Level Legend */}
        <div className="grid grid-cols-3 gap-2 mb-6 text-center">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg py-2">
            <span className="block text-[10px] font-bold text-amber-400 font-mono">LEVEL 1</span>
            <span className="text-[9px] text-slate-400">Urgency Alerts</span>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg py-2">
            <span className="block text-[10px] font-bold text-orange-400 font-mono">LEVEL 2</span>
            <span className="text-[9px] text-slate-400">Calendar Shifts</span>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg py-2">
            <span className="block text-[10px] font-bold text-red-400 font-mono">LEVEL 3</span>
            <span className="text-[9px] text-slate-400">Gmail Mitigation</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Mitigation Timeline Logs */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 font-mono">
              Agent Mitigation Logs
            </h4>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
              {logs.length === 0 ? (
                <div className="text-center py-8 bg-slate-950/25 rounded-xl border border-slate-800/40 border-dashed">
                  <p className="text-xs text-slate-500 italic">No autonomous mitigations triggered yet.</p>
                </div>
              ) : (
                logs
                  .slice()
                  .reverse()
                  .map((log, idx) => {
                    const isL1 = log.actionType === "escalation_warning";
                    const isL2 = log.actionType === "conflict_resolved";
                    const isL3 = log.actionType === "email_drafted";

                    let borderClass = "border-indigo-500/20 bg-indigo-500/5";
                    let badgeColor = "bg-indigo-500/10 text-indigo-400";
                    let levelLabel = "LOG";

                    if (isL1) {
                      borderClass = "border-amber-500/25 bg-amber-500/5";
                      badgeColor = "bg-amber-500/10 text-amber-400";
                      levelLabel = "LEVEL 1";
                    } else if (isL2) {
                      borderClass = "border-orange-500/25 bg-orange-500/5";
                      badgeColor = "bg-orange-500/10 text-orange-400";
                      levelLabel = "LEVEL 2";
                    } else if (isL3) {
                      borderClass = "border-red-500/25 bg-red-500/5";
                      badgeColor = "bg-red-500/10 text-red-400";
                      levelLabel = "LEVEL 3";
                    }

                    return (
                      <div
                        key={log.id}
                        className={`flex gap-3 p-3 rounded-xl border ${borderClass} relative`}
                      >
                        <div className="flex flex-col items-center">
                          <div className={`w-2 h-2 rounded-full ${isL3 ? "bg-red-400" : isL2 ? "bg-orange-400" : isL1 ? "bg-amber-400" : "bg-indigo-400"}`} />
                          <div className="w-[1px] bg-slate-800 flex-1 my-1" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono ${badgeColor}`}>
                              {levelLabel}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed font-medium">
                            {log.description}
                          </p>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Gmail Drafts Drawer */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 font-mono flex items-center justify-between">
              <span>Gmail Mitigation Drafts</span>
              <span className="text-[10px] text-slate-500">{tasksWithDrafts.length} pending draft(s)</span>
            </h4>

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
              {tasksWithDrafts.length === 0 ? (
                <div className="text-center py-8 bg-slate-950/25 rounded-xl border border-slate-800/40 border-dashed">
                  <Mail className="w-5 h-5 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 italic">No Level 3 Gmail mitigation drafts generated.</p>
                </div>
              ) : (
                tasksWithDrafts.map(task => (
                  <div
                    key={task.id}
                    className="bg-slate-950/50 rounded-xl border border-slate-800 p-4 space-y-3"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] text-slate-500 block font-mono">FOR TASK:</span>
                        <h5 className="text-xs font-bold text-slate-200">{task.title}</h5>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                        task.mitigationDraft.status === "sent"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {task.mitigationDraft.status === "sent" ? "SENT" : "DRAFT"}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-500">To: </span>
                        <span className="text-indigo-300 font-mono font-medium">{task.mitigationDraft.recipient}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Subject: </span>
                        <span className="text-slate-200 font-medium">{task.mitigationDraft.subject}</span>
                      </div>
                      <div className="bg-slate-950/80 rounded-lg p-2.5 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed max-h-[100px] overflow-y-auto font-mono">
                        {task.mitigationDraft.body}
                      </div>
                    </div>

                    {task.mitigationDraft.status !== "sent" && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleCopy(task.mitigationDraft.body, task.id)}
                          className="flex-1 py-1.5 px-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-300 text-xs font-medium transition flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedId === task.id ? "Copied" : "Copy body"}
                        </button>
                        <button
                          onClick={() => onSendEmailDraft(task.id)}
                          className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Mail className="w-3 h-3" />
                          Simulate Send
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
