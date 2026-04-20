/**
 * Shared BlazeJob singleton with SQLite persistence.
 * Every module that needs to schedule or query tasks imports from here.
 */
import { BlazeJob } from 'blazerjob';
import path from 'path';

const dbPath = (process.env.BLAZERJOB_DB_PATH || path.join(process.cwd(), 'blazerjob.db')).trim();

const jobs = new BlazeJob({
  storage: 'sqlite',
  dbPath,
  concurrency: 16,
});

export { jobs };
