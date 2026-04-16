/**
 * Database abstraction — delegates to GitHubStore.
 * This file exists for backward compatibility; prefer importing from githubStore directly.
 */

export { getStore, getStore as getDb } from "./githubStore.js";
