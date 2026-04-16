import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProjectWorkspaceTool, normalizeProjectName } from './tools.js';
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
});
