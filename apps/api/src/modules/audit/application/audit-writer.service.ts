import { Injectable } from "@nestjs/common";

import { getRequestContext } from "../../../common/request/request-context.js";
import { DatabaseService } from "../../../database/database.service.js";

type AuditWriteInput = {
  action: string;
  actorUserId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  summary: string;
  targetId?: string | null;
  targetType: string;
  tenantId?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuditWriterService {
  constructor(private readonly db: DatabaseService) {}

  async write(input: AuditWriteInput): Promise<void> {
    const auditMetadata = buildAuditMetadata(input);
    await this.db.query(
      `
        insert into ops.audit_events (
          tenant_id, actor_user_id, action, target_type, target_id,
          summary, details, ip_address, user_agent
        )
        values ($1, $2, $3, $4, nullif($5, '')::uuid, $6, $7, nullif($8, '')::inet, $9)
      `,
      [
        input.tenantId ?? null,
        input.actorUserId ?? null,
        input.action,
        input.targetType,
        input.targetId ?? "",
        input.summary,
        JSON.stringify(auditMetadata.details),
        auditMetadata.ipAddress,
        auditMetadata.userAgent,
      ],
    );
  }
}

function buildAuditMetadata(input: AuditWriteInput): {
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string | null;
} {
  const requestContext = getRequestContext();
  const details = { ...(input.details ?? {}) };
  if (requestContext?.requestId) {
    details.requestId = requestContext.requestId;
  }

  return {
    details,
    ipAddress: input.ipAddress ?? requestContext?.ipAddress ?? "",
    userAgent: input.userAgent ?? requestContext?.userAgent ?? null,
  };
}
