import dotenv from 'dotenv';
dotenv.config();
import { jobs } from './lib/scheduler';

async function test() {
  console.log("Starting scheduler...");
  jobs.start();

  console.log("Scheduling task in 2 seconds...");
  const taskId = jobs.schedule(
    async () => {
      console.log("TASK RUNNING SUCCESSFULLY! Hello from scheduled task!");
    },
    {
      runAt: new Date(Date.now() + 2000),
    }
  );

  console.log("Scheduled task ID:", taskId);

  console.log("Waiting 5 seconds for execution...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  const tasks = (jobs as any).db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  console.log("Task after run:", tasks);

  jobs.stop();
}

test().catch(console.error);
