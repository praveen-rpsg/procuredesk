import { SetMetadata } from "@nestjs/common";

export const REQUIRED_ENTITY_PARAM_KEY = "required_entity_param";

export const RequireEntityScopeParam = (paramName: string) =>
  SetMetadata(REQUIRED_ENTITY_PARAM_KEY, paramName);

