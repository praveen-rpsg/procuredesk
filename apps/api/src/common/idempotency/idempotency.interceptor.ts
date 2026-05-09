import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, from, switchMap, tap } from "rxjs";

import { DatabaseService } from "../../database/database.service.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";

const TTL_HOURS = 24;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly db: DatabaseService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<{ status: (code: number) => unknown; statusCode: number }>();
    const key = request.headers["idempotency-key"];

    if (!key || typeof key !== "string" || !request.user?.tenantId) {
      return next.handle();
    }

    const tenantId = request.user.tenantId;

    return from(this.findCached(tenantId, key)).pipe(
      switchMap((cached) => {
        if (cached) {
          throw new HttpException(JSON.parse(cached.response_body), cached.status_code);
        }

        return next.handle().pipe(
          tap((body) => {
            const statusCode = (response as { statusCode: number }).statusCode ?? 200;
            void this.storeCached(tenantId, key, statusCode, body).catch(() => undefined);
          }),
        );
      }),
    );
  }

  private async findCached(
    tenantId: string,
    key: string,
  ): Promise<{ response_body: string; status_code: number } | null> {
    const result = await this.db.query<{ response_body: string; status_code: number }>(
      `
        select status_code, response_body
        from ops.idempotent_requests
        where tenant_id = $1
          and idempotency_key = $2
          and created_at >= now() - interval '${TTL_HOURS} hours'
        limit 1
      `,
      [tenantId, key],
    );
    return result.rows[0] ?? null;
  }

  private async storeCached(
    tenantId: string,
    key: string,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    await this.db.query(
      `
        insert into ops.idempotent_requests (tenant_id, idempotency_key, status_code, response_body)
        values ($1, $2, $3, $4)
        on conflict (tenant_id, idempotency_key) do nothing
      `,
      [tenantId, key, statusCode, JSON.stringify(body)],
    );
  }
}
