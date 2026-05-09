import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

import type { EnvConfig } from "../../config/env.schema.js";

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = new Redis(this.config.getOrThrow("REDIS_URL"), {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.client.on("error", () => {
      // Cache failures must not break request handling; PostgreSQL remains authoritative.
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      await this.connectIfNeeded();
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<T> {
    try {
      await this.connectIfNeeded();
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Ignore cache write failures; callers already have the value from the database.
    }
    return value;
  }

  async deleteKey(key: string): Promise<void> {
    try {
      await this.connectIfNeeded();
      await this.client.del(key);
    } catch {
      // Ignore cache invalidation failures; short TTLs cap stale metadata exposure.
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }

  private async connectIfNeeded(): Promise<void> {
    if (this.client.status === "ready" || this.client.status === "connecting") return;
    await this.client.connect();
  }
}
