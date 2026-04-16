import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initGitHubContextManager, getGitHubContextManager, resetManagerForTesting } from './githubContextManager.js';

describe('GitHubContextManager', () => {
    beforeEach(() => {
        resetManagerForTesting();
        vi.stubGlobal('process', {
            ...process,
            env: {
                ...process.env,
                GITHUB_TOKEN: 'test-token',
                GITHUB_REPO: 'test-owner/test-repo',
            },
        });
        vi.stubGlobal('fetch', vi.fn());
    });

    it('should initialize with GITHUB_TOKEN', async () => {
        const mockFetch = vi.mocked(fetch);

        // Mock user resolve
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ login: 'test-owner' }),
        } as any);

        // Mock repo check
        mockFetch.mockResolvedValueOnce({
            ok: true,
        } as any);

        const manager = await initGitHubContextManager();
        expect(manager).toBeDefined();
        expect(getGitHubContextManager()).toBe(manager);
    });

    it('should fall back to other tokens if GITHUB_TOKEN is missing', async () => {
        vi.stubGlobal('process', {
            ...process,
            env: {
                ...process.env,
                GITHUB_TOKEN: '',
                GITHUB_CONTEXT_TOKEN: 'fallback-token',
            },
        });

        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ login: 'owner' }),
        } as any);

        const manager = await initGitHubContextManager();
        expect(manager).toBeDefined();
    });

    it('should return null if no token is found', async () => {
        vi.stubGlobal('process', {
            ...process,
            env: {
                ...process.env,
                GITHUB_TOKEN: '',
                GITHUB_CONTEXT_TOKEN: '',
                GITHUB_PERSONAL_ACCESS_TOKEN: '',
            },
        });

        const manager = await initGitHubContextManager();
        expect(manager).toBeNull();
    });
});
