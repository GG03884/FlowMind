import React, { useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { Task } from "../types";

interface MultimodalIngestionProps {
  onTasksImported: (tasks: Omit<Task, "id" | "userId">[]) => void;
  userId: string;
}

const SAMPLE_SYLLABUS = `
  CS 320: Advanced Web Architectures Syllabus
  Midterm Project: Interactive Full-Stack Application
  Due: June 28, 2026 at 11:59 PM.
  Estimated Effort: 120 minutes. Priority: HIGH. Cognitive load: HIGH.
  Milestone Requirements:
  - Configure robust database collections (30%)
  - Implement full responsive dashboard UI (40%)
  - Integrate server-side predictive model APIs (30%)
`;

export default function MultimodalIngestion({ onTasksImported, userId }: MultimodalIngestionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setSuccessCount(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const response = await fetch("/api/ingest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            base64Data,
            mimeType: file.type || "application/octet-stream",
            fileName: file.name
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to parse document");
        }

        if (data.tasks && data.tasks.length > 0) {
          onTasksImported(data.tasks);
          setSuccessCount(data.tasks.length);
        } else {
          setError("No actionable tasks identified in this file. Please make sure the dates and titles are clearly visible.");
        }
      };
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while uploading.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Mock scan email threads
  const triggerEmailScan = async () => {
    setIsProcessing(true);
    setError(null);
    setSuccessCount(null);

    try {
      // Simulate reading emails through AI
      const simulatedBase64 = btoa(SAMPLE_SYLLABUS);
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          base64Data: simulatedBase64,
          mimeType: "text/plain",
          fileName: "academic_email_threads.txt"
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      if (data.tasks && data.tasks.length > 0) {
        onTasksImported(data.tasks);
        setSuccessCount(data.tasks.length);
      }
    } catch (err: any) {
      setError(err.message || "Email scan failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl relative overflow-hidden h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <Upload className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-white font-medium">Multimodal Ingestion</h3>
              <p className="text-xs text-slate-400">Add materials to generate structured timelines</p>
            </div>
          </div>
          <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full px-2 py-0.5 uppercase tracking-wider font-semibold font-mono">
            Gemini Flash
          </span>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? "border-indigo-400 bg-indigo-500/10 scale-[0.99]"
              : "border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60"
          }`}
          onClick={() => document.getElementById("file-ingest")?.click()}
        >
          <input
            id="file-ingest"
            type="file"
            className="hidden"
            accept=".pdf,image/*,text/*"
            onChange={handleFileChange}
            disabled={isProcessing}
          />
          
          <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 mb-3 shadow-inner">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-300 font-medium">
            Drag & drop files here, or <span className="text-indigo-400 underline">browse</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Supports Course Syllabi PDFs, whiteboard list photos, or screenshot images
          </p>
        </div>

        {isProcessing && (
          <div className="flex items-center gap-3 mt-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 animate-pulse">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
            <p className="text-xs text-indigo-200">FlowMind parsing syllabus & building chronological tasks...</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-200 leading-normal">{error}</p>
          </div>
        )}

        {successCount !== null && (
          <div className="flex items-center gap-2.5 mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-200">
              Successfully identified and imported <strong className="text-white">{successCount}</strong> structured tasks!
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800/60 flex flex-col sm:flex-row gap-2">
        <button
          onClick={triggerEmailScan}
          disabled={isProcessing}
          className="flex-1 text-center py-2 px-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700/60 transition font-medium cursor-pointer disabled:opacity-50"
        >
          📧 Trigger Inbox Scan
        </button>
        <button
          onClick={async () => {
            setIsProcessing(true);
            setError(null);
            setSuccessCount(null);
            try {
              const simulatedBase64 = btoa(SAMPLE_SYLLABUS);
              const response = await fetch("/api/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  base64Data: simulatedBase64,
                  mimeType: "text/plain",
                  fileName: "advanced_web_architectures.pdf"
                })
              });
              const data = await response.json();
              if (data.tasks) {
                onTasksImported(data.tasks);
                setSuccessCount(data.tasks.length);
              }
            } catch (err: any) {
              setError(err.message || "Sample parse failed");
            } finally {
              setIsProcessing(false);
            }
          }}
          disabled={isProcessing}
          className="flex-1 text-center py-2 px-3 text-xs bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition font-medium cursor-pointer shadow-md disabled:opacity-50"
        >
          ⚡ Load Sample Syllabus
        </button>
      </div>
    </div>
  );
}
