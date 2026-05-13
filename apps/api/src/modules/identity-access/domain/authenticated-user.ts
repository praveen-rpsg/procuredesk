export type AuthenticatedUser = {
  id: string;
  tenantId: string | null;
  email: string;
  username: string;
  fullName: string;
  accessLevel: "ENTITY" | "GROUP" | "USER";
  isPlatformSuperAdmin: boolean;
  permissions: string[];
  entityIds: string[];
};
