export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface UserRecord {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface UserSettingsRecord {
  id: number;
  user_id: number;
  llm_provider: string;
  llm_model: string;
  llm_api_key: string;
  created_at: string;
}

export interface SessionData {
  userId: number;
  email: string;
}

export type StreamEventType =
  | "thinking"
  | "delta"
  | "tool_start"
  | "tool_result"
  | "error"
  | "done";

export interface StreamEvent {
  type: StreamEventType;
  payload: Record<string, unknown>;
}
