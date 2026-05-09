import { Injectable } from "@nestjs/common";

import { RedisCacheService } from "../../../common/cache/redis-cache.service.js";

@Injectable()
export class CatalogCacheService {
  private readonly ttlSeconds = 300;

  constructor(private readonly cache: RedisCacheService) {}

  get<T>(tenantId: string): Promise<T | null> {
    return this.cache.getJson<T>(this.snapshotKey(tenantId));
  }

  set<T>(tenantId: string, value: T): Promise<T> {
    return this.cache.setJson(this.snapshotKey(tenantId), value, this.ttlSeconds);
  }

  invalidateTenant(tenantId: string): Promise<void> {
    return this.cache.deleteKey(this.snapshotKey(tenantId));
  }

  private snapshotKey(tenantId: string): string {
    return `catalog:${tenantId}:snapshot`;
  }
}
