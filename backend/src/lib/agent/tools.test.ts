import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProjectWorkspaceTool, normalizeProjectName, julesSessionTool, listJulesSourcesTool, listJulesSessionsTool } from './tools.js';
import { promises as fs } from 'fs';
import path from 'path';

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        promises: {
            ...actual.promises,
            mkdir: vi.fn().mockResolvedValue(undefined),
            writeFile: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn().mockResolvedValue(''),
            readdir: vi.fn().mockResolvedValue([]),
            unlink: vi.fn().mockResolvedValue(undefined),
        },
    };
});

describe('Agent Tools', () => {
    describe('normalizeProjectName', () => {
        it('should normalize names correctly', () => {
            expect(normalizeProjectName('My Project! @2024')).toBe('my-project-2024');
            expect(normalizeProjectName('  ')).toBe('general');
        });
    });

    describe('create_project_workspace', () => {
        it('should create a directory for the project', async () => {
            const result = await createProjectWorkspaceTool.execute!({ projectName: 'Test-Proj' } as any);
            expect(result).toContain('Project workspace ready');
            expect(fs.mkdir).toHaveBeenCalledWith(
                expect.stringContaining(path.join('projects', 'test-proj')),
                { recursive: true }
            );
        });
    });

    describe('run_jules_session', () => {
        it('should validate schema with missing optional fields', () => {
            const parsed = julesSessionTool.inputSchema.safeParse({
                prompt: 'Hello world',
                autoPr: false
            });
            expect(parsed.success).toBe(true);
            if (parsed.success) {
                expect(parsed.data.prompt).toBe('Hello world');
                expect(parsed.data.githubRepository).toBeUndefined();
            }
        });
    });

    describe('list_jules_sources', () => {
        it('should require JULES_API_KEY when missing', async () => {
            const original = process.env.JULES_API_KEY;
            delete process.env.JULES_API_KEY;
            await expect(listJulesSourcesTool.execute!({} as any)).rejects.toThrow('JULES_API_KEY is missing');
            if (original) process.env.JULES_API_KEY = original;
        });
    });

    describe('list_jules_sessions', () => {
        it('should validate schema with optional pagination fields', () => {
            const parsed = listJulesSessionsTool.inputSchema.safeParse({
                pageSize: 5,
                pageToken: 'abc123'
            });

            expect(parsed.success).toBe(true);
            if (parsed.success) {
                expect(parsed.data.pageSize).toBe(5);
                expect(parsed.data.pageToken).toBe('abc123');
            }
        });
    });
});
