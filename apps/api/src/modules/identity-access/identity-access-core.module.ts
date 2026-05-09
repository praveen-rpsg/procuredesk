import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module.js";
import { AuthGuard } from "./application/auth.guard.js";
import { AuthService } from "./application/auth.service.js";
import { EntityScopeGuard } from "./application/entity-scope.guard.js";
import { PasswordService } from "./application/password.service.js";
import { PermissionGuard } from "./application/permission.guard.js";
import { LoginRateLimitRepository } from "./infrastructure/login-rate-limit.repository.js";
import { PasswordPolicyRepository } from "./infrastructure/password-policy.repository.js";
import { PermissionRepository } from "./infrastructure/permission.repository.js";
import { RoleRepository } from "./infrastructure/role.repository.js";
import { SessionRepository } from "./infrastructure/session.repository.js";
import { UserRepository } from "./infrastructure/user.repository.js";

const identityCoreProviders = [
  AuthService,
  PasswordService,
  AuthGuard,
  PermissionGuard,
  EntityScopeGuard,
  UserRepository,
  LoginRateLimitRepository,
  RoleRepository,
  PermissionRepository,
  SessionRepository,
  PasswordPolicyRepository,
];

@Module({
  imports: [DatabaseModule],
  providers: identityCoreProviders,
  exports: identityCoreProviders,
})
export class IdentityAccessCoreModule {}
