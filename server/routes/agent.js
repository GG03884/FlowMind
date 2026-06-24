import express from "express";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { saveGmailDraft } from "../services/workspaceService.js";

const router = express.Router();

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
function getRetryDelayMs(error) {
  try {
    const errMsg = error.message || String(error);
    let errObj = null;
    if (errMsg.startsWith('{') || errMsg.includes('{"error":')) {
      const jsonStart = errMsg.indexOf('{');
      errObj = JSON.parse(errMsg.substring(jsonStart));
    } else if (error.error && typeof error.error === 'object') {
      errObj = error;
    }

    if (errObj && errObj.error && errObj.error.details) {
      const retryInfo = errObj.error.details.find(
        (d) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
      );
      if (retryInfo && retryInfo.retryDelay) {
        const match = retryInfo.retryDelay.match(/^(\d+(\.\d+)?)s$/);
        if (match) {
          return parseFloat(match[1]) * 1000 + 1000; // Add 1s safety buffer
        }
      }
    }
  } catch (e) {
    console.log("[Gemini API] Retry delay metadata parsing was skipped:", e.message || e);
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
async function generateContentWithRetry(aiClient, params, maxRetries = 3) {
  let lastError = null;
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
      } catch (error) {
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

// Configure Firestore on the server-side
const firebaseConfig = {
  apiKey: "AIzaSyChW2VvB7g2MZQU5hwo3i1LHuvl5B8weyw",
  authDomain: "carbide-affinity-lgbcx.firebaseapp.com",
  projectId: "carbide-affinity-lgbcx",
  storageBucket: "carbide-affinity-lgbcx.firebasestorage.app",
  messagingSenderId: "128474779549",
  appId: "1:128474779549:web:fe320b6ce939bb23f8e974"
};

const firebaseApp = getApps().find(app => app.name === "server-agent") || initializeApp(firebaseConfig, "server-agent");
const db = getFirestore(firebaseApp, "ai-studio-9ac65dd4-0cdb-4902-b111-d92523e8508f");

// Define Tool/Function Declarations for Gemini
const createFocusBlockDeclaration = {
  name: "createFocusBlock",
  description: "Creates a designated focus block on the calendar for a specific title, start time, and end time.",
  parameters: {
    type: "OBJECT",
    properties: {
      title: {
        type: "STRING",
        description: "Concise title describing the focus block activity (e.g. 'Focus: Math Homework')."
      },
      start: {
        type: "STRING",
        description: "ISO-8601 formatted date-time string representing the start of the focus block."
      },
      end: {
        type: "STRING",
        description: "ISO-8601 formatted date-time string representing the end of the focus block."
      }
    },
    required: ["title", "start", "end"]
  }
};

const createTaskFromIngestedDocDeclaration = {
  name: "createTaskFromIngestedDoc",
  description: "Creates a new structured task derived from an ingested document, syllabus, or task description.",
  parameters: {
    type: "OBJECT",
    properties: {
      title: {
        type: "STRING",
        description: "The concise, specific title of the task."
      },
      description: {
        type: "STRING",
        description: "Elaborated details, instructions, reading chapters, or grading weights."
      },
      deadline: {
        type: "STRING",
        description: "ISO-8601 formatted date-time string representing the task deadline."
      },
      loadRating: {
        type: "STRING",
        description: "The cognitive load rating of the task. Allowed values: 'low', 'medium', 'high'."
      }
    },
    required: ["title", "description", "deadline", "loadRating"]
  }
};

const generateMitigationDraftDeclaration = {
  name: "generateMitigationDraft",
  description: "Generates a mitigation email draft to address upcoming task delays or extensions.",
  parameters: {
    type: "OBJECT",
    properties: {
      recipient: {
        type: "STRING",
        description: "The recipient email address or name (e.g. 'Professor Smith')."
      },
      subject: {
        type: "STRING",
        description: "The professional subject line of the mitigation email draft."
      },
      body: {
        type: "STRING",
        description: "The detailed HTML or plain-text body content of the email requesting an extension or mitigation."
      }
    },
    required: ["recipient", "subject", "body"]
  }
};

// Route: Agent Chat Endpoint with Function Calling (Gemini 1.5 Pro equivalents)
router.post("/chat", async (req, res) => {
  try {
    const { messages, tasks, habits, preferences, activeUserId } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing or invalid messages history" });
    }

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key is not configured. Please add it to your secrets." });
    }

    const userId = activeUserId || "guest_user";
    console.log(`[Agent Router] Processing agent chat loop for user: ${userId}`);

    // Construct the System Instruction explaining the executive assistant role
    const systemInstruction = `
      You are FlowMind, a highly advanced agentic productivity and active executive-function assistant.
      Your role is to guide the user, manage their tasks, proactively schedule focus blocks, and help them mitigate deadline conflicts.

      To assist the user, you have access to three specific tools/functions:
      1. createFocusBlock(title, start, end): Use this when the user asks to schedule a focus block, study slot, or calendar event.
      2. createTaskFromIngestedDoc(title, description, deadline, loadRating): Use this when the user wants to add a new task, assignment, project, or parse an item.
      3. generateMitigationDraft(recipient, subject, body): Use this when the user needs to write a delay update, status check, or extension request email to a supervisor or teacher.

      Use these tools proactively and intelligently when matching the user's intent. Do not ask for confirmation before using them if the user's request explicitly states or strongly implies that action is needed.

      Current User Preferences:
      Chronotype: ${preferences?.chronotype || "morning_lark"}
      Work Hours: ${preferences?.work_hours?.start || "09:00"} to ${preferences?.work_hours?.end || "17:00"}
      High Energy Windows: ${JSON.stringify(preferences?.high_energy_windows || ["09:00-11:00"])}

      Current User's Tasks:
      ${JSON.stringify(tasks || [])}

      Current User's Habits:
      ${JSON.stringify(habits || [])}
    `;

    // Package message history into Gemini SDK format
    const contents = messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    // Trigger Gemini Model with tool definitions
    // Note: 'gemini-3.5-flash' is utilized as the highly-optimized and supported equivalent.
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        tools: [{
          functionDeclarations: [
            createFocusBlockDeclaration,
            createTaskFromIngestedDocDeclaration,
            generateMitigationDraftDeclaration
          ]
        }]
      }
    });

    const textResponse = response.text || "";
    const functionCalls = response.functionCalls || [];
    const clientActions = [];

    console.log(`[Agent Router] Gemini response text: "${textResponse}". Found function calls: ${functionCalls.length}`);

    // Switch logic to handle model execution requests (Function Calling)
    for (const call of functionCalls) {
      const { name, args } = call;
      console.log(`[Agent Router] Executing tool: ${name} with arguments:`, args);

      switch (name) {
        case "createFocusBlock": {
          const { title, start, end } = args;

          // Write an audit log document to Firestore
          await addDoc(collection(db, "agent_logs"), {
            userId: userId,
            actionType: "calendar_block_created",
            description: `🎯 FlowMind Function Call: Automatically scheduled a Focus Block "${title}" from ${new Date(start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} to ${new Date(end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`,
            timestamp: new Date().toISOString()
          });

          // Return action to update local calendar state on client
          clientActions.push({
            type: "create_focus_block",
            data: { title, start, end }
          });
          break;
        }

        case "createTaskFromIngestedDoc": {
          const { title, description, deadline, loadRating } = args;

          // Generate a clean Task object structure and write directly to Firestore
          const newTask = {
            userId: userId,
            title: title || "New Task",
            description: description || "",
            deadline: deadline || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            estimatedMinutes: 60,
            priority: "medium",
            status: "pending",
            cognitiveLoad: loadRating || "medium",
            escalationLevel: 1,
            originType: "manual",
            subtasks: [],
            mitigationDraft: { subject: "", body: "", recipient: "", status: "none" },
            agentPlan: ["Autonomous task creation via FlowMind Gemini Function Call"]
          };

          // Save the task to Firebase Firestore (this instantly triggers the client snapshot listener)
          await addDoc(collection(db, "tasks"), newTask);

          // Write an audit log document to Firestore
          await addDoc(collection(db, "agent_logs"), {
            userId: userId,
            actionType: "syllabus_parsed",
            description: `📝 FlowMind Function Call: Automatically created task "${title}" with deadline: ${new Date(deadline).toLocaleDateString()}.`,
            timestamp: new Date().toISOString()
          });

          clientActions.push({
            type: "create_task",
            data: newTask
          });
          break;
        }

        case "generateMitigationDraft": {
          const { recipient, subject, body } = args;

          // If Gmail Auth token is available in authorization headers, save draft directly
          const authHeader = req.headers.authorization;
          let draftSaved = false;
          if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
              const token = authHeader.substring(7);
              await saveGmailDraft(token, { to: recipient, subject, body });
              draftSaved = true;
            } catch (err) {
              console.error("[Agent Router] Failed to save actual Gmail draft:", err);
            }
          }

          // Write an audit log document to Firestore
          await addDoc(collection(db, "agent_logs"), {
            userId: userId,
            actionType: "email_drafted",
            description: `🛡️ FlowMind Function Call: Generated pre-emptive mitigation draft to "${recipient}" with subject "${subject}" (${draftSaved ? "saved in Gmail Drafts" : "saved to system"}).`,
            timestamp: new Date().toISOString()
          });

          clientActions.push({
            type: "draft_email",
            data: { recipient, subject, body }
          });
          break;
        }

        default:
          console.warn(`[Agent Router] Unrecognized tool execution request: ${name}`);
      }
    }

    // Return friendly model response, function calls, and corresponding database/client actions
    return res.json({
      response: textResponse || "I've handled that scheduling instruction using FlowMind function modules.",
      actions: clientActions
    });

  } catch (error) {
    console.error("[Agent Router] Critical Chat Error:", error);
    return res.status(500).json({ error: error.message || "Agent router loop failed." });
  }
});

export default router;
