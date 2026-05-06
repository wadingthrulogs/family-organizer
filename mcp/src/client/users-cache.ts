import type { OrganizerApiClient } from './api.js';
import type { UserListItem } from './types.js';

const TTL_MS = 60_000;

export class UsersCache {
  private cached: { fetchedAt: number; users: UserListItem[] } | null = null;

  constructor(private readonly api: OrganizerApiClient) {}

  invalidate(): void {
    this.cached = null;
  }

  async list(): Promise<UserListItem[]> {
    if (this.cached && Date.now() - this.cached.fetchedAt < TTL_MS) {
      return this.cached.users;
    }
    const users = await this.api.get<UserListItem[]>('/auth/users');
    this.cached = { fetchedAt: Date.now(), users };
    return users;
  }

  /**
   * Resolve a list of usernames to their numeric ids. Throws if any username
   * is missing so the caller can surface a clear tool error.
   */
  async resolveUsernames(usernames: string[]): Promise<number[]> {
    if (usernames.length === 0) return [];
    const users = await this.list();
    const byName = new Map(users.map((u) => [u.username.toLowerCase(), u.id] as const));
    const ids: number[] = [];
    const missing: string[] = [];
    for (const name of usernames) {
      const id = byName.get(name.toLowerCase());
      if (id === undefined) missing.push(name);
      else ids.push(id);
    }
    if (missing.length > 0) {
      throw new Error(
        `Unknown username(s): ${missing.join(', ')}. Known: ${users.map((u) => u.username).join(', ')}`,
      );
    }
    return ids;
  }

  /** Map userId → username, used for output projections. */
  async usernameMap(): Promise<Map<number, string>> {
    const users = await this.list();
    return new Map(users.map((u) => [u.id, u.username] as const));
  }
}
