import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStore, resetStoreForTesting } from './githubStore.js';
import { resetManagerForTesting } from './githubContextManager.js';

describe('GitHubStore', () => {
    beforeEach(() => {
        resetStoreForTesting();
        resetManagerForTesting();
        vi.stubGlobal('process', {
            ...process,
            env: {
                ...process.env,
                GITHUB_TOKEN: '', // Disable GitHub for basic tests
            },
        });
        vi.stubGlobal('fetch', vi.fn());
    });

    it('should initialize with admin user if no GitHub is configured', async () => {
        const store = await getStore();
        const admin = store.getUserByEmail('admin');
        expect(admin).toBeDefined();
        expect(admin?.id).toBe(1);
    });

    it('should upsert settings correctly', async () => {
        const store = await getStore();
        const settings = await store.upsertSettings(1, {
            llm_provider: 'openai',
            llm_model: 'gpt-4',
        });

        expect(settings.user_id).toBe(1);
        expect(settings.llm_provider).toBe('openai');

        const retrieved = store.getSettings(1);
        expect(retrieved).toEqual(settings);
    });

    it('should create and retrieve notifications', async () => {
        const store = await getStore();
        const notification = await store.createNotification(1, {
            recipient_email: 'test@example.com',
            subject: 'Test',
            body: 'Hello',
            send_at: new Date().toISOString(),
        });

        expect(notification.id).toBeDefined();
        const all = store.getNotificationsByUser(1);
        expect(all[0]).toEqual(notification);
    });
});
