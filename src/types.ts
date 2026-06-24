export interface UserPreferences {
  chronotype: 'morning_lark' | 'night_owl' | 'productive_afternoon';
  work_hours: {
    start: string; // e.g. "09:00"
    end: string;   // e.g. "17:00"
  };
  high_energy_windows: string[]; // e.g. ["09:00-11:00", "19:00-21:00"]
}

export interface MomentumHistory {
  weekStartDate: string; // "YYYY-MM-DD"
  score: number; // 0-100
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  preferences: UserPreferences;
  momentumHistory: MomentumHistory[];
}

export interface SubTask {
  title: string;
  completed: boolean;
}

export interface MitigationDraft {
  subject: string;
  body: string;
  recipient: string;
  status: 'none' | 'drafted' | 'sent';
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  deadline: string; // ISO String
  estimatedMinutes: number;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  cognitiveLoad: 'low' | 'medium' | 'high';
  escalationLevel: 1 | 2 | 3;
  originType: 'manual' | 'syllabus_pdf' | 'gmail_scan' | 'whiteboard_photo';
  subtasks: SubTask[];
  mitigationDraft: MitigationDraft;
  agentPlan: string[]; // autonomous decisions
}

export interface Habit {
  id: string;
  userId: string;
  title: string;
  frequency: 'daily' | 'weekly';
  streakCount: number;
  lastCompleted: string | null; // ISO String or null
  preferredScheduleSlot: 'early_morning' | 'mid_afternoon' | 'evening';
}

export interface AgentLog {
  id: string;
  userId: string;
  actionType: 'calendar_block_created' | 'conflict_resolved' | 'email_drafted' | 'habit_auto_scheduled' | 'escalation_warning' | 'syllabus_parsed';
  description: string;
  timestamp: string; // ISO String
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO String
  end: string; // ISO String
  type: 'focus_block' | 'deadline' | 'habit' | 'other';
  associatedId?: string; // task ID or habit ID
  color?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
}
