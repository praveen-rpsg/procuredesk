import type { FastifyRequest } from "fastify";

import type { AuthenticatedUser } from "../../modules/identity-access/domain/authenticated-user.js";

export type AuthenticatedRequest = FastifyRequest & {
  cookies?: Record<string, string | undefined>;
  user?: AuthenticatedUser;
  sessionTokenHash?: string;
};
