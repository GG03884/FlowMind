import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  setDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDoc
} from "firebase/firestore";
import { auth, googleProvider, db } from "../lib/firebase";
import { Task, Habit, AgentLog, UserProfile, UserPreferences } from "../types";

// Seed data definitions to ensure backward compatibility and fresh user bootstrapping
const DEFAULT_TASKS: Omit<Task, "id" | "userId">[] = [
  {
    title: "CS 320: Term Web Project",
    description: "Design and implement responsive client-side UI with full persistence.",
    deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    estimatedMinutes: 120,
    priority: "high",
    status: "pending",
    cognitiveLoad: "high",
    escalationLevel: 1,
    originType: "manual",
    subtasks: [
      { title: "Define schema & types", completed: true },
      { title: "Build responsive widgets", completed: false }
    ],
    mitigationDraft: { subject: "", body: "", recipient: "", status: "none" },
    agentPlan: ["Automatically aligned with morning Lark high energy peak"]
  },
  {
    title: "Complete MATH 240: Linear Homework",
    description: "Eigenvalues and matrix vector projections problem set.",
    deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    estimatedMinutes: 90,
    priority: "medium",
    status: "pending",
    cognitiveLoad: "medium",
    escalationLevel: 1,
    originType: "syllabus_pdf",
    subtasks: [],
    mitigationDraft: { subject: "", body: "", recipient: "", status: "none" },
    agentPlan: ["Rescheduled non-essential tasks to prioritize linear prep block"]
  }
];

const DEFAULT_HABITS: Omit<Habit, "id" | "userId">[] = [
  {
    title: "Mindfulness Meditation",
    frequency: "daily",
    streakCount: 4,
    lastCompleted: new Date().toISOString(),
    preferredScheduleSlot: "early_morning"
  },
  {
    title: "Deep Work Sprint",
    frequency: "daily",
    streakCount: 2,
    lastCompleted: null,
    preferredScheduleSlot: "mid_afternoon"
  }
];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  guestId: string | null;
  activeUserId: string;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setGuestId(null);
      } else {
        // Fallback to client-side guest sandbox
        let storedGuestId = localStorage.getItem("aegis_guest_id");
        if (!storedGuestId) {
          storedGuestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          localStorage.setItem("aegis_guest_id", storedGuestId);
        }
        setGuestId(storedGuestId);
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("[AuthContext] Google Sign-In failed:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("[AuthContext] Sign-out failed:", error);
      throw error;
    }
  };

  const activeUserId = user?.uid || guestId || "";

  return (
    <AuthContext.Provider value={{ user, loading, guestId, activeUserId, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// 1. Hook for User Profiles & Preferences
export const useUserProfile = () => {
  const { activeUserId, user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeUserId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const userDocRef = doc(db, "users", activeUserId);

    const unsubscribe = onSnapshot(userDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
        setLoading(false);
      } else {
        // Lazily initialize user profile document if it doesn't exist
        const defaultProfile: UserProfile = {
          uid: activeUserId,
          email: user?.email || "guest@example.com",
          displayName: user?.displayName || "Guest Sandbox",
          preferences: {
            chronotype: "morning_lark",
            work_hours: { start: "09:00", end: "17:00" },
            high_energy_windows: ["09:00-11:00", "14:00-15:30"]
          },
          momentumHistory: []
        };

        try {
          await setDoc(userDocRef, defaultProfile);
          setProfile(defaultProfile);
        } catch (error) {
          console.error("[useUserProfile] Failed to initialize user profile document:", error);
        } finally {
          setLoading(false);
        }
      }
    }, (error) => {
      console.error("[useUserProfile] Error listening to user profile:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeUserId, user]);

  const updatePreferences = async (preferences: UserPreferences) => {
    if (!activeUserId) return;
    try {
      const userDocRef = doc(db, "users", activeUserId);
      await updateDoc(userDocRef, { preferences });
    } catch (error) {
      console.error("[useUserProfile] Failed to update preferences:", error);
      throw error;
    }
  };

  const updateProfile = async (profileData: Partial<UserProfile>) => {
    if (!activeUserId) return;
    try {
      const userDocRef = doc(db, "users", activeUserId);
      await updateDoc(userDocRef, profileData);
    } catch (error) {
      console.error("[useUserProfile] Failed to update profile data:", error);
      throw error;
    }
  };

  return { profile, loading, updatePreferences, updateProfile };
};

// 2. Hook for Tasks
export const useTasks = () => {
  const { activeUserId } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeUserId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const tasksQuery = query(collection(db, "tasks"), where("userId", "==", activeUserId));

    const unsubscribe = onSnapshot(tasksQuery, async (snapshot) => {
      const taskList: Task[] = [];
      snapshot.forEach((docSnap) => {
        taskList.push({ id: docSnap.id, ...docSnap.data() } as Task);
      });

      // Auto-seed if the list is empty on load
      if (taskList.length === 0) {
        console.log("[useTasks] Seeding initial tasks collection for user:", activeUserId);
        try {
          for (const t of DEFAULT_TASKS) {
            await addDoc(collection(db, "tasks"), { ...t, userId: activeUserId });
          }
        } catch (error) {
          console.error("[useTasks] Failed to auto-seed initial tasks:", error);
        }
      } else {
        setTasks(taskList);
        setLoading(false);
      }
    }, (error) => {
      console.error("[useTasks] Error listening to tasks:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeUserId]);

  const addTask = async (task: Omit<Task, "id" | "userId">) => {
    if (!activeUserId) throw new Error("No active authenticated user ID");
    try {
      const docRef = await addDoc(collection(db, "tasks"), {
        ...task,
        userId: activeUserId
      });
      return docRef.id;
    } catch (error) {
      console.error("[useTasks] Failed to add task:", error);
      throw error;
    }
  };

  const updateTask = async (taskId: string, taskUpdates: Partial<Task>) => {
    try {
      const taskRef = doc(db, "tasks", taskId);
      await updateDoc(taskRef, taskUpdates);
    } catch (error) {
      console.error("[useTasks] Failed to update task:", error);
      throw error;
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const taskRef = doc(db, "tasks", taskId);
      await deleteDoc(taskRef);
    } catch (error) {
      console.error("[useTasks] Failed to delete task:", error);
      throw error;
    }
  };

  return { tasks, loading, addTask, updateTask, deleteTask };
};

// 3. Hook for Habits
export const useHabits = () => {
  const { activeUserId } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeUserId) {
      setHabits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const habitsQuery = query(collection(db, "habits"), where("userId", "==", activeUserId));

    const unsubscribe = onSnapshot(habitsQuery, async (snapshot) => {
      const habitList: Habit[] = [];
      snapshot.forEach((docSnap) => {
        habitList.push({ id: docSnap.id, ...docSnap.data() } as Habit);
      });

      // Auto-seed default habits if the list is empty on load
      if (habitList.length === 0) {
        console.log("[useHabits] Seeding initial habits collection for user:", activeUserId);
        try {
          for (const h of DEFAULT_HABITS) {
            await addDoc(collection(db, "habits"), { ...h, userId: activeUserId });
          }
        } catch (error) {
          console.error("[useHabits] Failed to auto-seed initial habits:", error);
        }
      } else {
        setHabits(habitList);
        setLoading(false);
      }
    }, (error) => {
      console.error("[useHabits] Error listening to habits:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeUserId]);

  const addHabit = async (habit: Omit<Habit, "id" | "userId">) => {
    if (!activeUserId) throw new Error("No active authenticated user ID");
    try {
      const docRef = await addDoc(collection(db, "habits"), {
        ...habit,
        userId: activeUserId
      });
      return docRef.id;
    } catch (error) {
      console.error("[useHabits] Failed to add habit:", error);
      throw error;
    }
  };

  const updateHabit = async (habitId: string, habitUpdates: Partial<Habit>) => {
    try {
      const habitRef = doc(db, "habits", habitId);
      await updateDoc(habitRef, habitUpdates);
    } catch (error) {
      console.error("[useHabits] Failed to update habit:", error);
      throw error;
    }
  };

  const deleteHabit = async (habitId: string) => {
    try {
      const habitRef = doc(db, "habits", habitId);
      await deleteDoc(habitRef);
    } catch (error) {
      console.error("[useHabits] Failed to delete habit:", error);
      throw error;
    }
  };

  const completeHabit = async (habitId: string) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;
    try {
      await updateHabit(habitId, {
        streakCount: habit.streakCount + 1,
        lastCompleted: new Date().toISOString()
      });
    } catch (error) {
      console.error("[useHabits] Failed to complete habit:", error);
      throw error;
    }
  };

  return { habits, loading, addHabit, updateHabit, deleteHabit, completeHabit };
};

// 4. Hook for Agent Logs
export const useAgentLogs = () => {
  const { activeUserId } = useAuth();
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeUserId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const logsQuery = query(collection(db, "agent_logs"), where("userId", "==", activeUserId));

    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const logList: AgentLog[] = [];
      snapshot.forEach((docSnap) => {
        logList.push({ id: docSnap.id, ...docSnap.data() } as AgentLog);
      });
      setLogs(logList);
      setLoading(false);
    }, (error) => {
      console.error("[useAgentLogs] Error listening to agent logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeUserId]);

  const addLog = async (actionType: AgentLog["actionType"], description: string) => {
    if (!activeUserId) throw new Error("No active authenticated user ID");
    try {
      const docRef = await addDoc(collection(db, "agent_logs"), {
        userId: activeUserId,
        actionType,
        description,
        timestamp: new Date().toISOString()
      });
      return docRef.id;
    } catch (error) {
      console.error("[useAgentLogs] Failed to add agent log:", error);
      throw error;
    }
  };

  return { logs, loading, addLog };
};
