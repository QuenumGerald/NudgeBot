import dotenv from 'dotenv';
dotenv.config();
import { jobs } from './lib/scheduler';

async function test() {
  const now = new Date().toISOString();
  console.log("Current time (ISO):", now);
  const tasks = (jobs as any).db.prepare("SELECT * FROM tasks").all();
  console.log("All tasks in DB:");
  console.log(tasks);

  const due = (jobs as any).db.prepare(`
    SELECT * FROM tasks
    WHERE runAt <= ? AND status = 'pending'
  `).all(now);
  console.log("Due tasks count:", due.length);
  console.log("Due tasks:", due);
}

test().catch(console.error);
