export type AuthenticatedUser = {
  id: string;
  tenantId: string | null;
  email: string;
  username: string;
  fullName: string;
  isPlatformSuperAdmin: boolean;
  permissions: string[];
  entityIds: string[];
};

