import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import {
  getUpcomingCalendarEvents,
  createCalendarEvent,
  getUnreadDeadlines,
  saveGmailDraft
} from "./server/services/workspaceService";
import {
  calculateAndRecordUserMomentum
} from "./server/services/momentumService";
import agentRouter from "./server/routes/agent.js";

dotenv.config();

const app = express();
const PORT = 3000;

// Set high body limit for base64 file uploads (whiteboard photos, PDFs)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize the Gemini AI SDK
const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

// Helper function to extract retry delay from error metadata or default backoff
function getRetryDelayMs(error: any): number {
  try {
    const errMsg = error.message || String(error);
    let errObj: any = null;
    if (errMsg.startsWith('{') || errMsg.includes('{"error":')) {
      const jsonStart = errMsg.indexOf('{');
      errObj = JSON.parse(errMsg.substring(jsonStart));
    } else if (error.error && typeof error.error === 'object') {
      errObj = error;
    }

    if (errObj && errObj.error && errObj.error.details) {
      const retryInfo = errObj.error.details.find(
        (d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
      );
      if (retryInfo && retryInfo.retryDelay) {
        const match = retryInfo.retryDelay.match(/^(\d+(\.\d+)?)s$/);
        if (match) {
          return parseFloat(match[1]) * 1000 + 1000; // Add 1s safety buffer
        }
      }
    }
  } catch (e) {
    console.log("[Gemini API] Retry delay metadata parsing was skipped:", e instanceof Error ? e.message : String(e));
  }

  const isExhausted = error.status === "RESOURCE_EXHAUSTED" || 
                      error.code === 429 || 
                      String(error).includes("exhausted") || 
                      String(error).includes("429") ||
                      String(error).includes("quota");
  if (isExhausted) {
    return 16000; // 16 seconds default fallback for free-tier rate limits
  }

  return 1500; // Default for other transient errors like 503
}

// Helper function to call generateContent with retry and fallback
async function generateContentWithRetry(aiClient: any, params: any, maxRetries = 3): Promise<any> {
  let lastError: any = null;
  const modelsToTry = [params.model, "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash"];
  
  for (const currentModel of modelsToTry) {
    if (!currentModel) continue;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        console.log(`[Gemini API] Attempting call with model: ${currentModel} (attempt ${attempt + 1}/${maxRetries})`);
        const response = await aiClient.models.generateContent({
          ...params,
          model: currentModel
        });
        return response;
      } catch (error: any) {
        lastError = error;
        attempt++;
        const errMsg = error.message || String(error);
        console.log(`[Gemini API] Temporary query issue with ${currentModel}, attempt ${attempt}/${maxRetries}. Details:`, errMsg);
        
        const isQuotaExceeded = error.status === "RESOURCE_EXHAUSTED" || 
                                error.code === 429 || 
                                errMsg.includes("429") || 
                                errMsg.includes("exhausted") || 
                                errMsg.includes("quota");
        
        if (isQuotaExceeded) {
          console.log(`[Gemini API] Quota/Rate limit exceeded for ${currentModel}. Switching to next fallback model immediately...`);
          break; // Break the while loop to try the next model
        }

        const isTransient = error.status === "UNAVAILABLE" || 
                            error.code === 503 || 
                            errMsg.includes("503") ||
                            errMsg.includes("high demand");
        
        if (isTransient && attempt < maxRetries) {
          const delay = getRetryDelayMs(error);
          console.log(`[Gemini API] Transient busy state detected. Retrying ${currentModel} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        break; // Non-transient error or max retries reached: switch models
      }
    }
  }
  
  if (lastError) {
    throw lastError;
  }
  throw new Error("All Gemini models exhausted and no response received.");
}

// Helper: safe date helper to add hours
const addHours = (date: Date, hours: number) => {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
};

// API Endpoint 1: Multimodal Ingestion (Parse Syllabus PDFs, Task screenshots, Whiteboard images)
app.post("/api/ingest", async (req, res) => {
  try {
    const { base64Data, mimeType, fileName } = req.body;

    if (!base64Data || !mimeType) {
      return res.status(400).json({ error: "Missing base64Data or mimeType" });
    }

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key is not configured. Please add it to your secrets." });
    }

    console.log(`[Ingest] Processing file: ${fileName || "unnamed"} (${mimeType})`);

    // Clean base64 string
    const cleanedBase64 = base64Data.replace(/^data:.*?;base64,/, "");

    const prompt = `
      You are an expert academic and productivity assistant.
      Parse the attached file (which might be a syllabus PDF, an image of a handwritten task list, a whiteboard photo of project milestones, or a screenshot of an email thread).
      Identify all actionable tasks, milestones, or homework assignments with their associated deadlines and details.

      For each identified item, construct a structured task. Format your output strictly as a JSON array of objects conforming to this schema:
      [
        {
          "title": "A concise, specific task title",
          "description": "Elaborated details, instructions, reading chapters, or grading weights identified in the document",
          "deadline": "ISO-8601 date-time string. If no year/date is explicit, estimate a logical future date based on today's date: ${new Date().toISOString()}",
          "estimatedMinutes": 60, // integer representing the estimated completion effort (default to 60, 90, 120 or 180 depending on complexity)
          "priority": "high", // low, medium, or high
          "cognitiveLoad": "high", // low, medium, or high based on expected mental effort (e.g., coding/writing is high, administrative tasks are low)
          "status": "pending",
          "originType": "syllabus_pdf", // choose one of: 'syllabus_pdf', 'gmail_scan', 'whiteboard_photo'
          "subtasks": [
            { "title": "Specific action item/step 1", "completed": false },
            { "title": "Specific action item/step 2", "completed": false }
          ]
        }
      ]

      Ensure your response is valid JSON and contains absolutely no markdown formatting other than raw JSON content.
    `;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: [
        {
          inlineData: {
            data: cleanedBase64,
            mimeType: mimeType
          }
        },
        prompt
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const responseText = response.text || "[]";
    let tasks = [];
    try {
      tasks = JSON.parse(responseText.trim());
    } catch (parseError) {
      console.error("[Ingest] JSON parsing failed, attempting cleanup:", responseText);
      // Fallback clean regex
      const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        tasks = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse Gemini output as JSON array.");
      }
    }

    return res.json({ success: true, tasks });
  } catch (error: any) {
    console.error("[Ingest] Error:", error);
    return res.status(500).json({ error: error.message || "Ingestion parsing failed." });
  }
});

// API Endpoint 2: Agentic Chat (Workspace Companion Chatbot with Proactive Intent Detection with Gemini Function Calling)
app.use("/api/agent", agentRouter);

// API Endpoint 3: Shadow Scheduler (Chronotype Energy Window Mapping and Autonomous Shifting)
app.post("/api/agent/schedule", async (req, res) => {
  try {
    const { tasks, habits, preferences, currentEvents } = req.body;

    const chronotype = preferences?.chronotype || "morning_lark";
    const workHours = preferences?.work_hours || { start: "09:00", end: "17:00" };
    const highEnergyWindows = preferences?.high_energy_windows || ["09:00-11:00", "14:00-16:00"];

    console.log(`[Scheduler] Generating plan for chronotype ${chronotype}.`);

    // Define peak slots on upcoming 7 days
    const upcomingEvents: any[] = [];
    const agentLogs: any[] = [];
    const today = new Date();

    // Map chronotype peaks
    const getPeakTimesForDay = (day: Date) => {
      // Return peak start/end dates based on chronotype
      const peakRanges = [];
      if (chronotype === "morning_lark") {
        peakRanges.push({ startHour: 9, startMin: 0, endHour: 11, endMin: 0 });
        peakRanges.push({ startHour: 14, startMin: 0, endHour: 15, endMin: 30 });
      } else if (chronotype === "night_owl") {
        peakRanges.push({ startHour: 15, startMin: 0, endHour: 17, endMin: 0 });
        peakRanges.push({ startHour: 19, startMin: 30, endHour: 22, endMin: 0 });
      } else {
        // productive afternoon
        peakRanges.push({ startHour: 13, startMin: 0, endHour: 15, endMin: 0 });
        peakRanges.push({ startHour: 16, startMin: 0, endHour: 18, endMin: 0 });
      }

      return peakRanges.map(range => {
        const start = new Date(day);
        start.setHours(range.startHour, range.startMin, 0, 0);
        const end = new Date(day);
        end.setHours(range.endHour, range.endMin, 0, 0);
        return { start, end };
      });
    };

    // Filter pending/in_progress tasks
    const activeTasks = (tasks || [])
      .filter((t: any) => t.status === "pending" || t.status === "in_progress")
      .sort((a: any, b: any) => {
        // High priority first, then closer deadlines
        if (a.priority === "high" && b.priority !== "high") return -1;
        if (a.priority !== "high" && b.priority === "high") return 1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });

    const activeHabits = habits || [];

    // Tracks booked time slots to resolve conflicts and overlap shifts
    const bookedSlots: { start: number; end: number; label: string }[] = [];

    // Register existing non-focus-block events if provided
    if (currentEvents && Array.isArray(currentEvents)) {
      currentEvents.forEach((ev: any) => {
        if (ev.type !== "focus_block") {
          bookedSlots.push({
            start: new Date(ev.start).getTime(),
            end: new Date(ev.end).getTime(),
            label: ev.title
          });
        }
      });
    }

    const isOverlap = (start: number, end: number) => {
      return bookedSlots.some(slot => {
        return (start < slot.end && end > slot.start);
      });
    };

    // Helper to find a free focus slot on peak energy windows
    const findFreePeakSlot = (minutesNeeded: number, deadlineDate: Date): { start: Date; end: Date; description: string } | null => {
      // Loop over next 5 days
      for (let i = 1; i <= 5; i++) {
        const testDay = new Date(today);
        testDay.setDate(today.getDate() + i);

        // If after deadline, skip
        if (testDay.getTime() > deadlineDate.getTime()) continue;

        const peaks = getPeakTimesForDay(testDay);
        for (const peak of peaks) {
          const slotStart = peak.start.getTime();
          const slotEnd = slotStart + minutesNeeded * 60 * 1000;

          if (slotEnd <= peak.end.getTime() && !isOverlap(slotStart, slotEnd)) {
            return {
              start: new Date(slotStart),
              end: new Date(slotEnd),
              description: `high energy peak (${chronotype.replace("_", " ")})`
            };
          }
        }
      }

      // Fallback: search any non-peak work hours or evening slot
      for (let i = 1; i <= 5; i++) {
        const testDay = new Date(today);
        testDay.setDate(today.getDate() + i);
        if (testDay.getTime() > deadlineDate.getTime()) continue;

        // Try standard morning slot (10:00 - 11:30) or afternoon (15:00 - 16:30)
        const alternateSlots = [
          { sh: 10, sm: 0 },
          { sh: 15, sm: 0 },
          { sh: 18, sm: 0 }
        ];

        for (const alt of alternateSlots) {
          const start = new Date(testDay);
          start.setHours(alt.sh, alt.sm, 0, 0);
          const slotStart = start.getTime();
          const slotEnd = slotStart + minutesNeeded * 60 * 1000;

          if (!isOverlap(slotStart, slotEnd)) {
            return {
              start: new Date(slotStart),
              end: new Date(slotEnd),
              description: "autonomous backup slot"
            };
          }
        }
      }

      return null;
    };

    // 1. Schedule focus blocks for tasks based on priority & cognitive load
    for (const task of activeTasks) {
      const minutesNeeded = Math.min(task.estimatedMinutes || 60, 120); // cap blocks at 2 hours
      const deadlineDate = new Date(task.deadline);

      const slot = findFreePeakSlot(minutesNeeded, deadlineDate);
      if (slot) {
        upcomingEvents.push({
          id: `focus-${task.id}`,
          title: `🎯 Focus: ${task.title}`,
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          type: "focus_block",
          associatedId: task.id,
          color: task.priority === "high" ? "#ef4444" : task.priority === "medium" ? "#f59e0b" : "#3b82f6"
        });

        bookedSlots.push({
          start: slot.start.getTime(),
          end: slot.end.getTime(),
          label: `🎯 Focus: ${task.title}`
        });

        agentLogs.push({
          id: `log-sched-${task.id}-${Date.now()}`,
          actionType: "calendar_block_created",
          description: `Auto-scheduled ${minutesNeeded}-min Focus block for "${task.title}" in your ${slot.description} on ${slot.start.toLocaleDateString('en-US', { weekday: 'long' })} at ${slot.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
          timestamp: new Date().toISOString()
        });
      } else {
        // Overlap shift situation
        agentLogs.push({
          id: `log-shift-${task.id}-${Date.now()}`,
          actionType: "conflict_resolved",
          description: `⚠️ Alert: Could not find conflict-free peak energy slot for "${task.title}" before its deadline. Suggested custom manual allocation.`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // 2. Schedule habits
    for (const habit of activeHabits) {
      const testDay = new Date(today);
      testDay.setDate(today.getDate() + 1); // schedule habit starting tomorrow

      let targetHour = 8;
      if (habit.preferredScheduleSlot === "early_morning") targetHour = 7;
      else if (habit.preferredScheduleSlot === "mid_afternoon") targetHour = 15;
      else if (habit.preferredScheduleSlot === "evening") targetHour = 19;

      const habitStart = new Date(testDay);
      habitStart.setHours(targetHour, 0, 0, 0);
      const habitEnd = new Date(habitStart);
      habitEnd.setMinutes(habitEnd.getMinutes() + 30); // habits default to 30 mins

      if (!isOverlap(habitStart.getTime(), habitEnd.getTime())) {
        upcomingEvents.push({
          id: `habit-${habit.id}`,
          title: `🌱 Habit: ${habit.title}`,
          start: habitStart.toISOString(),
          end: habitEnd.toISOString(),
          type: "habit",
          associatedId: habit.id,
          color: "#10b981"
        });

        bookedSlots.push({
          start: habitStart.getTime(),
          end: habitEnd.getTime(),
          label: `🌱 Habit: ${habit.title}`
        });

        agentLogs.push({
          id: `log-habit-${habit.id}-${Date.now()}`,
          actionType: "habit_auto_scheduled",
          description: `Scheduled habit "${habit.title}" for ${habit.preferredScheduleSlot} (${habitStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) starting tomorrow.`,
          timestamp: new Date().toISOString()
        });
      }
    }

    return res.json({
      success: true,
      events: upcomingEvents,
      logs: agentLogs
    });
  } catch (error: any) {
    console.error("[Scheduler] Error:", error);
    return res.status(500).json({ error: error.message || "Scheduling mapping failed." });
  }
});

// API Endpoint 4: Proactive Mitigation & Escalation Core
app.post("/api/agent/mitigate", async (req, res) => {
  try {
    const { tasks, currentEvents, userEmail } = req.body;

    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ error: "Missing tasks array" });
    }

    console.log(`[Mitigate] Analyzing delay potentials for ${tasks.length} tasks.`);
    const updatedTasks: any[] = [];
    const agentLogs: any[] = [];
    const now = new Date();

    for (const task of tasks) {
      if (task.status === "completed") {
        updatedTasks.push(task);
        continue;
      }

      const deadline = new Date(task.deadline);
      const diffMs = deadline.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      const updatedTask = { ...task };

      // Case A: Level 1 - Approaching Deadline Warning (within 24 hours)
      if (diffHours > 0 && diffHours <= 24 && task.escalationLevel < 1) {
        updatedTask.escalationLevel = 1;
        
        agentLogs.push({
          id: `log-mitigate-l1-${task.id}-${Date.now()}`,
          actionType: "escalation_warning",
          description: `🛡️ Level 1 Mitigation: High urgency for "${task.title}". Deadline is in ${Math.round(diffHours)} hours. Urgency dashboard visual speed metrics increased.`,
          timestamp: new Date().toISOString()
        });
        
        updatedTasks.push(updatedTask);
      }
      // Case B: Level 2 - Resource De-confliction & Extra Prep blocks (within 12 hours)
      else if (diffHours > 0 && diffHours <= 12 && task.escalationLevel < 2) {
        updatedTask.escalationLevel = 2;

        agentLogs.push({
          id: `log-mitigate-l2-${task.id}-${Date.now()}`,
          actionType: "conflict_resolved",
          description: `🛡️ Level 2 Mitigation: Auto-rescheduled low-priority habits and unblocked calendar preparation times to free up focus blocks for impending task "${task.title}".`,
          timestamp: new Date().toISOString()
        });

        updatedTasks.push(updatedTask);
      }
      // Case C: Level 3 - Write Mitigation Email (overdue or less than 3 hours remaining)
      else if ((diffHours <= 3) && task.status !== "completed" && (!task.mitigationDraft || task.mitigationDraft.status === "none")) {
        updatedTask.escalationLevel = 3;

        console.log(`[Mitigate] Task "${task.title}" requires Level 3 mitigation draft.`);

        // Ask Gemini to write an outstanding, professional, polite email
        const emailPrompt = `
          You are FlowMind AI, a proactive productivity assistant.
          The user has an impending or overdue deadline that they will likely delay or miss.
          Task Title: "${task.title}"
          Task Description: "${task.description || "No description provided"}"
          Deadline: ${task.deadline}
          Current Time: ${now.toISOString()}
          User Email: ${userEmail || "gayatri03884@gmail.com"}

          Draft a polite, highly professional mitigation email to send to the project supervisor, supervisor, teacher, or colleague (use a logical placeholder recipient if not obvious).
          The email should apologize for the delay, explain that they are polishing the final aspects, and propose a sensible 24 to 48-hour extension. Keep the tone humble, sincere, and action-oriented.

          Respond strictly in this JSON format:
          {
            "recipient": "recipient@example.com",
            "subject": "Extension Request / Status Update: [Task Title]",
            "body": "The complete email body text here."
          }
        `;

        try {
          const emailResponse = await generateContentWithRetry(ai, {
            model: 'gemini-3.5-flash',
            contents: [emailPrompt],
            config: { responseMimeType: "application/json" }
          });

          const resText = emailResponse.text || "{}";
          let draft = { recipient: "supervisor@example.com", subject: "Status Update: " + task.title, body: "" };
          try {
            draft = JSON.parse(resText.trim());
          } catch (pe) {
            const match = resText.match(/\{[\s\S]*?\}/);
            if (match) draft = JSON.parse(match[0]);
          }

          updatedTask.mitigationDraft = {
            recipient: draft.recipient,
            subject: draft.subject,
            body: draft.body,
            status: "drafted"
          };

          agentLogs.push({
            id: `log-mitigate-l3-${task.id}-${Date.now()}`,
            actionType: "email_drafted",
            description: `🛡️ Level 3 Mitigation: Automatically generated pre-emptive email draft to "${draft.recipient}" for task "${task.title}" requesting a buffer extension.`,
            timestamp: new Date().toISOString()
          });
        } catch (err) {
          console.error("Failed to generate Gemini email:", err);
        }

        updatedTasks.push(updatedTask);
      } else {
        updatedTasks.push(task);
      }
    }

    return res.json({
      success: true,
      tasks: updatedTasks,
      logs: agentLogs
    });
  } catch (error: any) {
    console.error("[Mitigate] Error:", error);
    return res.status(500).json({ error: error.message || "Mitigation analysis failed." });
  }
});

// Helper to extract access token from authorization header
function getBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

// API Endpoint: Fetch Google Calendar events for the upcoming week
app.get("/api/workspace/calendar", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing or invalid authorization token." });
    }
    const events = await getUpcomingCalendarEvents(token);
    return res.json({ success: true, events });
  } catch (error: any) {
    console.error("[Workspace API] Calendar fetch failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch calendar events." });
  }
});

// API Endpoint: Create calendar events/blocks for user focus sessions and habits
app.post("/api/workspace/calendar/event", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing or invalid authorization token." });
    }
    const { title, description, startTime, endTime, colorId } = req.body;
    if (!title || !startTime || !endTime) {
      return res.status(400).json({ error: "Missing required fields: title, startTime, and endTime are required." });
    }
    const createdEvent = await createCalendarEvent(token, {
      title,
      description,
      startTime,
      endTime,
      colorId,
    });
    return res.json({ success: true, event: createdEvent });
  } catch (error: any) {
    console.error("[Workspace API] Calendar event creation failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create calendar event." });
  }
});

// API Endpoint: Read unread Gmail headers containing potential deadlines
app.get("/api/workspace/gmail/unread", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing or invalid authorization token." });
    }
    const emails = await getUnreadDeadlines(token);
    return res.json({ success: true, emails });
  } catch (error: any) {
    console.error("[Workspace API] Gmail fetch failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch unread emails." });
  }
});

// API Endpoint: Generate and save draft emails into the user's Gmail Drafts folder
app.post("/api/workspace/gmail/draft", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing or invalid authorization token." });
    }
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: "Missing required fields: to, subject, and body are required." });
    }
    const draft = await saveGmailDraft(token, { to, subject, body });
    return res.json({ success: true, draft });
  } catch (error: any) {
    console.error("[Workspace API] Gmail draft creation failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create Gmail draft." });
  }
});

// API Endpoint: Calculate and record Weekly Productivity Momentum Score on demand
app.post("/api/momentum/calculate", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "Missing required field: userId." });
    }
    const result = await calculateAndRecordUserMomentum(userId);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Momentum API] Calculation failed:", error);
    return res.status(500).json({ error: error.message || "Failed to calculate momentum score." });
  }
});

// Serve frontend assets
if (process.env.NODE_ENV !== "production") {
  const startVite = async () => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Express] Dev server running in full-stack mode on http://0.0.0.0:${PORT}`);
    });
  };
  startVite();
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Express] Production server running on port ${PORT}`);
  });
}
