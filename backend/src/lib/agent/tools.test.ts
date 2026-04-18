import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProjectWorkspaceTool, normalizeProjectName, julesSessionTool, listJulesSessionsTool } from './tools.js';
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
            const result = await createProjectWorkspaceTool.invoke({ projectName: 'Test-Proj' });
            expect(result).toContain('Project workspace ready');
            expect(fs.mkdir).toHaveBeenCalledWith(
                expect.stringContaining(path.join('projects', 'test-proj')),
                { recursive: true }
            );
        });
    });

    describe('julesSessionTool', () => {
        it('should validate schema with missing optional fields', async () => {
            // We just test the schema validation here to ensure we don't throw ZodError
            // We can't fully mock @google/jules-sdk easily for vitest in the same file
            // without affecting other tests if any, but we can check if schema accepts it
            const parsed = julesSessionTool.schema.safeParse({
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

    describe('listJulesSessionsTool', () => {
        it('should validate schema with default page size', async () => {
            const parsed = listJulesSessionsTool.schema.safeParse({});
            expect(parsed.success).toBe(true);
            if (parsed.success) {
                expect(parsed.data.pageSize).toBe(5);
                expect(parsed.data.pageToken).toBeUndefined();
            }
        });
    });
});
