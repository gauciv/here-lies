import type { Store } from './engine';

/** In-memory Store used by tests and the local preview. */
export class MemoryStore implements Store {
  private kv = new Map<string, string>();
  private h = new Map<string, Map<string, string>>();
  private z = new Map<string, Map<string, number>>();

  private hash(key: string): Map<string, string> {
    let m = this.h.get(key);
    if (!m) { m = new Map(); this.h.set(key, m); }
    return m;
  }

  private zset(key: string): Map<string, number> {
    let m = this.z.get(key);
    if (!m) { m = new Map(); this.z.set(key, m); }
    return m;
  }

  async get(key: string) { return this.kv.get(key); }
  async set(key: string, value: string) { this.kv.set(key, value); }
  async incrBy(key: string, n: number) {
    const v = Number(this.kv.get(key) ?? 0) + n;
    this.kv.set(key, String(v));
    return v;
  }
  async hGet(key: string, field: string) { return this.h.get(key)?.get(field); }
  async hGetAll(key: string) { return Object.fromEntries(this.h.get(key) ?? []); }
  async hSet(key: string, values: Record<string, string>) {
    const m = this.hash(key);
    for (const [f, v] of Object.entries(values)) m.set(f, v);
  }
  async hSetNX(key: string, field: string, value: string) {
    const m = this.hash(key);
    if (m.has(field)) return false;
    m.set(field, value);
    return true;
  }
  async hIncrBy(key: string, field: string, n: number) {
    const m = this.hash(key);
    const v = Number(m.get(field) ?? 0) + n;
    m.set(field, String(v));
    return v;
  }
  async zAdd(key: string, member: string, score: number) { this.zset(key).set(member, score); }
  async zIncrBy(key: string, member: string, n: number) {
    const m = this.zset(key);
    const v = (m.get(member) ?? 0) + n;
    m.set(member, v);
    return v;
  }
  async zTop(key: string, count: number) {
    return [...(this.z.get(key) ?? [])].sort((a, b) => b[1] - a[1]).slice(0, count).map(([k]) => k);
  }
  async zCard(key: string) { return this.z.get(key)?.size ?? 0; }
}
