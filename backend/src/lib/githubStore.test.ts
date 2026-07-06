import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStore, resetStoreForTesting } from './githubStore.js';
import { resetManagerForTesting } from './githubContextManager.js';

// Setup pg mock globally for testing Postgres codepaths
const mockQuery = vi.fn();
const mockPoolInstance = {
  query: mockQuery,
  end: vi.fn(),
};

// Use function constructor so it works with 'new'
function MockPool() {
  return mockPoolInstance;
}

vi.mock('pg', () => {
  return {
    Pool: MockPool,
    default: {
      Pool: MockPool,
    },
  };
});

describe('GitHubStore - GitHub Fallback Mode', () => {
  beforeEach(() => {
    resetStoreForTesting();
    resetManagerForTesting();
    vi.stubGlobal('process', {
      ...process,
      env: {
        ...process.env,
        DATABASE_URL: '',
        GITHUB_TOKEN: '', // Disable GitHub for basic tests
      },
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should initialize with admin user if no Postgres or GitHub is configured', async () => {
    const store = await getStore();
    const admin = await store.getUserByEmail('admin');
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

    const retrieved = await store.getSettings(1);
    expect(retrieved).toEqual(settings);
  });

  it('should not store LLM API keys in settings records', async () => {
    const store = await getStore();
    const settings = await store.upsertSettings(1, {
      llm_provider: 'openai',
      llm_model: 'gpt-4',
      llm_api_key: 'sk-sensitive',
    });

    expect(settings.llm_api_key).toBeNull();
    expect((await store.getSettings(1))?.llm_api_key).toBeNull();
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
    const all = await store.getNotificationsByUser(1);
    expect(all[0]).toEqual(notification);
  });
});

describe('GitHubStore - Neon Postgres Mode', () => {
  beforeEach(() => {
    resetStoreForTesting();
    mockQuery.mockReset();
    vi.stubGlobal('process', {
      ...process,
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://test-user:test-pass@ep-test.neon.tech/neondb',
      },
    });
  });

  it('should initialize tables and default admin user in Postgres', async () => {
    // Setup mock query to return that admin user doesn't exist
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // CREATE TABLE queries
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // check admin user query
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // insert admin user query

    const store = await getStore();
    expect(mockQuery).toHaveBeenCalled();
  });

  it('should query user by email in Postgres', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // init queries
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1, email: 'admin' }] }); // check admin user
    
    const store = await getStore();

    // Query mock
    const mockAdminRecord = {
      id: 1,
      email: 'admin',
      password_hash: 'hashed',
      created_at: new Date().toISOString()
    };
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [mockAdminRecord] });

    const admin = await store.getUserByEmail('admin');
    expect(admin).toBeDefined();
    expect(admin?.email).toBe('admin');
  });

  it('should upsert settings in Postgres', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // init
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1, email: 'admin' }] }); // check admin
    const store = await getStore();

    // Mock getSettings to return undefined (no settings exist yet)
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    // Mock INSERT query
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    // Mock subsequent getSettings query to return created settings
    const mockSettings = {
      id: 5,
      user_id: 1,
      llm_provider: 'deepseek',
      llm_model: 'deepseek-chat',
      llm_api_key: null,
      enabled_integrations: '[]',
      created_at: new Date().toISOString()
    };
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [mockSettings] });

    const settings = await store.upsertSettings(1, {
      llm_provider: 'deepseek',
      llm_model: 'deepseek-chat'
    });

    expect(settings.user_id).toBe(1);
    expect(settings.llm_provider).toBe('deepseek');
  });

  it('should prune old notifications if Postgres size exceeds the limit', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // init
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1, email: 'admin' }] }); // check admin
    const store = await getStore();

    // Mock pg_database_size query to return 460MB (exceeding 450MB limit)
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ size_bytes: 460 * 1024 * 1024 }] });
    // Mock DELETE query return
    mockQuery.mockResolvedValueOnce({ rowCount: 15, rows: [] });

    await store.checkAndPruneDatabase();

    // Check that we issued the DELETE query
    expect(mockQuery).toHaveBeenLastCalledWith(
      "DELETE FROM notifications WHERE sent_at IS NOT NULL OR status IN ('sent', 'failed', 'cancelled')"
    );
  });
});
