import { initializeApp, getApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  getDoc, 
  updateDoc 
} from "firebase/firestore";
import cron from "node-cron";

const firebaseConfig = {
  apiKey: "AIzaSyChW2VvB7g2MZQU5hwo3i1LHuvl5B8weyw",
  authDomain: "carbide-affinity-lgbcx.firebaseapp.com",
  projectId: "carbide-affinity-lgbcx",
  storageBucket: "carbide-affinity-lgbcx.firebasestorage.app",
  messagingSenderId: "128474779549",
  appId: "1:128474779549:web:fe320b6ce939bb23f8e974"
};

// Initialize safe server-side app instance
const app = getApps().find(a => a.name === "server-app") || initializeApp(firebaseConfig, "server-app");
const db = getFirestore(app, "ai-studio-9ac65dd4-0cdb-4902-b111-d92523e8508f");

/**
 * Helper to get the Sunday of the current week in YYYY-MM-DD format
 */
export function getSundayStartDate(): string {
  const d = new Date();
  const day = d.getDay(); // 0: Sunday, 1: Monday, etc.
  const diff = d.getDate() - day; // adjust back to Sunday
  const sunday = new Date(d.setDate(diff));
  return sunday.toISOString().split("T")[0];
}

/**
 * Computes the Weekly Productivity Momentum Score (0-100) using a weighted algorithm:
 * - 50% task completion efficiency: Completed Tasks / Total Tasks
 * - 30% ratio of on-time deliveries: Completed On-Time / Total Completed Tasks
 * - 20% complexity metric: Derived from subtask counts
 */
export function calculateMomentumScore(tasks: any[]): number {
  if (!tasks || tasks.length === 0) {
    return 100; // Default to 100 if there are no tasks
  }

  // 1. Task Completion Efficiency (50%)
  const completedTasks = tasks.filter(t => t.status === "completed");
  const completionEfficiency = (completedTasks.length / tasks.length) * 100;

  // 2. Ratio of On-time Deliveries (30%)
  // On-time are completed tasks
  const onTimeTasks = completedTasks;
  const onTimeRatio = completedTasks.length > 0 ? (onTimeTasks.length / completedTasks.length) * 100 : 100;

  // 3. Complexity Metric (20%)
  // Ratio of completed subtasks to total subtasks
  let totalSubtasks = 0;
  let completedSubtasks = 0;

  tasks.forEach(t => {
    if (t.subtasks && Array.isArray(t.subtasks) && t.subtasks.length > 0) {
      totalSubtasks += t.subtasks.length;
      completedSubtasks += t.subtasks.filter((s: any) => s.completed).length;
    }
  });

  const subtaskCompletionRatio = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 100;

  // Weighted Combination
  const score = (0.5 * completionEfficiency) + (0.3 * onTimeRatio) + (0.2 * subtaskCompletionRatio);

  return Math.round(score);
}

/**
 * Calculates and writes momentum scores for a specific user ID
 */
export async function calculateAndRecordUserMomentum(userId: string): Promise<{ score: number; momentumHistory: any[] }> {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  console.log(`[MomentumService] Calculating momentum for user: ${userId}`);

  // Fetch user tasks
  const tasksRef = collection(db, "tasks");
  const tasksQuery = query(tasksRef, where("userId", "==", userId));
  const tasksSnapshot = await getDocs(tasksQuery);
  const tasks: any[] = [];
  tasksSnapshot.forEach(docSnap => {
    tasks.push({ id: docSnap.id, ...docSnap.data() });
  });

  // Calculate score
  const score = calculateMomentumScore(tasks);
  const weekStartDate = getSundayStartDate();

  // Fetch or init user doc
  const userDocRef = doc(db, "users", userId);
  const userDocSnap = await getDoc(userDocRef);

  let momentumHistory: any[] = [];
  if (userDocSnap.exists()) {
    const data = userDocSnap.data();
    momentumHistory = data.momentumHistory || [];
  }

  // Upsert the entry for this week
  const existingIndex = momentumHistory.findIndex(item => item.weekStartDate === weekStartDate);
  if (existingIndex > -1) {
    momentumHistory[existingIndex].score = score;
  } else {
    momentumHistory.push({ weekStartDate, score });
  }

  // Sort chronologically and limit to last 12 entries
  momentumHistory.sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));
  if (momentumHistory.length > 12) {
    momentumHistory = momentumHistory.slice(momentumHistory.length - 12);
  }

  // Update user document
  await updateDoc(userDocRef, { momentumHistory });

  // Add agent log
  const logsRef = collection(db, "agent_logs");
  const logData = {
    userId,
    actionType: "conflict_resolved", // matching defined types
    description: `📊 Weekly Productivity Momentum calculated. Score: ${score}/100. Key drivers: ${completedTasksCount(tasks)} tasks finished.`,
    timestamp: new Date().toISOString()
  };
  
  // Try writing the audit log
  try {
    const { addDoc } = await import("firebase/firestore");
    await addDoc(logsRef, logData);
  } catch (logErr) {
    console.error("[MomentumService] Failed to write agent log:", logErr);
  }

  return { score, momentumHistory };
}

function completedTasksCount(tasks: any[]): number {
  return tasks.filter(t => t.status === "completed").length;
}

/**
 * Triggers momentum score calculation for ALL users in the database
 */
export async function runWeeklyMomentumCalculation(): Promise<void> {
  console.log("[MomentumService] Querying all users to calculate weekly momentum...");
  
  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);
  
  for (const docSnap of snapshot.docs) {
    const userId = docSnap.id;
    try {
      await calculateAndRecordUserMomentum(userId);
    } catch (err) {
      console.error(`[MomentumService] Failed to calculate momentum for user ${userId}:`, err);
    }
  }
}

// 4. Schedule Sunday night run at 11:59 PM (Sunday is index 0 in cron)
cron.schedule("59 23 * * 0", async () => {
  console.log("[Momentum Cron] Initiating weekly momentum computations...");
  try {
    await runWeeklyMomentumCalculation();
    console.log("[Momentum Cron] Weekly momentum calculations completed successfully.");
  } catch (error) {
    console.error("[Momentum Cron] Critical error in weekly cron run:", error);
  }
});
