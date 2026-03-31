import { query } from "./db";

export interface Memory {
  id: number;
  content: string;
  category: string;
  importance: number;
  created_at: string;
}

export interface ConvMessage {
  id: number;
  session_id: string;
  role: string;
  content: string;
  model?: string;
  created_at: string;
}

export interface Session {
  session_id: string;
  last_message: string;
  message_count: number;
  last_active: string;
}

export async function saveMemory(content: string, category: string = "general", importance: number = 3): Promise<void> {
  await query("INSERT INTO memories (content, category, importance) VALUES ($1, $2, $3)", [content, category, importance]);
}

export async function getMemories(limit: number = 15): Promise<Memory[]> {
  const result = await query("SELECT * FROM memories ORDER BY importance DESC, created_at DESC LIMIT $1", [limit]);
  return result.rows;
}

export async function searchMemories(searchQuery: string): Promise<Memory[]> {
  const result = await query("SELECT * FROM memories WHERE content ILIKE $1 ORDER BY importance DESC, created_at DESC", [`%${searchQuery}%`]);
  return result.rows;
}

export async function deleteMemory(id: number): Promise<void> {
  await query("DELETE FROM memories WHERE id = $1", [id]);
}

export async function saveMessage(sessionId: string, role: string, content: string, model?: string): Promise<void> {
  await query("INSERT INTO conversations (session_id, role, content, model) VALUES ($1, $2, $3, $4)", [sessionId, role, content, model || null]);
}

export async function getHistory(sessionId: string, limit: number = 30): Promise<ConvMessage[]> {
  const result = await query(`
    SELECT * FROM (
      SELECT * FROM conversations WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2
    ) sub
    ORDER BY created_at ASC
  `, [sessionId, limit]);
  return result.rows;
}

export async function getSessions(): Promise<Session[]> {
  const result = await query(`
    SELECT
      session_id,
      MAX(created_at) as last_active,
      COUNT(*) as message_count,
      (SELECT content FROM conversations c2 WHERE c2.session_id = c1.session_id ORDER BY created_at ASC LIMIT 1) as last_message
    FROM conversations c1
    GROUP BY session_id
    ORDER BY last_active DESC
  `);
  return result.rows;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await query("DELETE FROM conversations WHERE session_id = $1", [sessionId]);
}

export async function getStats(): Promise<{ totalMessages: number, totalMemories: number, todayMessages: number }> {
  const resultMessages = await query("SELECT COUNT(*) FROM conversations");
  const resultMemories = await query("SELECT COUNT(*) FROM memories");
  const resultToday = await query("SELECT COUNT(*) FROM conversations WHERE created_at >= NOW() - INTERVAL '24 HOURS'");

  return {
    totalMessages: parseInt(resultMessages.rows[0].count, 10),
    totalMemories: parseInt(resultMemories.rows[0].count, 10),
    todayMessages: parseInt(resultToday.rows[0].count, 10),
  };
}
