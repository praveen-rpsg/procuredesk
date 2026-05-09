import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

import { DATABASE_POOL } from "./database.tokens.js";

type Queryable = Pool | PoolClient;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly transactionContext = new AsyncLocalStorage<PoolClient>();

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
    client?: Queryable,
  ): Promise<QueryResult<T>> {
    return (client ?? this.transactionContext.getStore() ?? this.pool).query<T>(text, [...values]);
  }

  async one<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
    client: Queryable = this.pool,
  ): Promise<T | null> {
    const result = await this.query<T>(text, values, client);
    return result.rows[0] ?? null;
  }

  async transaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const activeClient = this.transactionContext.getStore();
    if (activeClient) {
      return handler(activeClient);
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await this.transactionContext.run(client, () => handler(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Runs a handler inside a transaction with the PostgreSQL RLS tenant context set.
   * All queries within the handler are scoped to tenantId via the
   * `app.current_tenant_id` session-local variable enforced by RLS policies.
   * Use this for every authenticated, tenant-scoped database operation.
   */
  async withTenantContext<T>(tenantId: string, handler: () => Promise<T>): Promise<T> {
    return this.transaction(async (client) => {
      // set_config with true = session-local (reset after transaction)
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      return handler();
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
