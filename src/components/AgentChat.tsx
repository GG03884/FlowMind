import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Sparkles, Plus, Calendar, AlertCircle, RefreshCw } from "lucide-react";
import { ChatMessage, Task, Habit } from "../types";

interface AgentChatProps {
  tasks: Task[];
  habits: Habit[];
  activeUserId: string;
  onTriggerSchedule: () => void;
  onAddTask: (task: Omit<Task, "id" | "userId">) => void;
  onAddLog: (actionType: string, description: string) => void;
  onAddFocusBlock: (title: string, start: string, end: string) => void;
}

export default function AgentChat({
  tasks,
  habits,
  activeUserId,
  onTriggerSchedule,
  onAddTask,
  onAddLog,
  onAddFocusBlock
}: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "agent",
      text: "Hello! I am FlowMind, your proactive productivity companion. I've audited your tasks and habits. How can I assist you with scheduling focus blocks, mitigating deadline overlaps, or preparing notifications today?",
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          tasks,
          habits,
          activeUserId
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chat failed");

      const agentMsg: ChatMessage = {
        id: `agent-${Date.now()}`,
        sender: "agent",
        text: data.response || "I have processed your request.",
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, agentMsg]);

      // Handle any proactive database/calendar actions returned by the backend agent
      if (data.actions && Array.isArray(data.actions)) {
        data.actions.forEach((action: any) => {
          if (action.type === "create_focus_block" && action.data) {
            onAddFocusBlock(action.data.title, action.data.start, action.data.end);
            onAddLog("calendar_block_created", `Focus Block "${action.data.title}" added to calendar.`);
          } else if (action.type === "create_task" && action.data) {
            // Task is already created directly on the backend Firestore! No client write needed to avoid duplication.
            onAddLog("syllabus_parsed", `Created task "${action.data.title}" via FlowMind.`);
          } else if (action.type === "draft_email" && action.data) {
            onAddLog("email_drafted", `🛡️ Generated email draft to "${action.data.recipient}" with subject "${action.data.subject}".`);
          } else if (action.type === "suggest_schedule") {
            onTriggerSchedule();
          }
        });
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: "agent",
          text: `⚠️ Error interacting with FlowMind core: ${err.message || "Failed to communicate."}`,
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSend(input);
    }
  };

  const quickPrompts = [
    { text: "Schedule all my pending tasks", label: "📅 Plan Calendar" },
    { text: "Proactively check for deadline mitigations", label: "🛡️ Run Mitigations" },
    { text: "Add research paper due tomorrow 4pm", label: "➕ Quick Task" }
  ];

  return (
    <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 flex flex-col h-[500px] shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <MessageSquare className="w-4 h-4 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-white font-medium text-sm">FlowMind Assistant</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <p className="text-[10px] text-slate-400">Autonomous Core Online</p>
            </div>
          </div>
        </div>
        <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700/60 rounded-lg px-2 py-0.5 font-mono">
          Model: 3.5-Flash
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-slate-950/20">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col max-w-[85%] ${
              msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
            }`}
          >
            <div
              className={`p-3.5 rounded-2xl text-sm leading-relaxed ${
                msg.sender === "user"
                  ? "bg-indigo-600 text-white rounded-tr-none shadow-indigo-900/10"
                  : "bg-slate-800/80 text-slate-100 border border-slate-700/40 rounded-tl-none"
              }`}
            >
              {msg.text}
            </div>
            <span className="text-[9px] text-slate-500 mt-1 px-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-2 mr-auto bg-slate-800/40 border border-slate-800/60 p-3 rounded-2xl rounded-tl-none max-w-[80%]">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
            <span className="text-xs text-slate-400">FlowMind is planning scheduler actions...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick suggestions */}
      <div className="px-4 py-2 bg-slate-950/30 border-t border-slate-800/40 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
        {quickPrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(p.text)}
            className="shrink-0 text-[11px] bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 border border-slate-700/40 rounded-lg px-2.5 py-1 transition cursor-pointer"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Ask FlowMind to plan, rescheduling, or draft delay emails..."
          className="flex-1 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-indigo-500/80 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition shadow-inner"
        />
        <button
          onClick={() => handleSend(input)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl p-2.5 transition flex items-center justify-center shrink-0 cursor-pointer shadow-md"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
