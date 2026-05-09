export type PasswordPolicy = {
  tenantId: string;
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialCharacter: boolean;
  passwordHistoryCount: number;
  lockoutAttempts: number;
  lockoutMinutes: number;
  forcePeriodicExpiry: boolean;
  expiryDays: number | null;
};

