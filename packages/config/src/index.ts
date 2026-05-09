export const defaultPasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialCharacter: true,
  passwordHistoryCount: 5,
  lockoutAttempts: 5,
  lockoutMinutes: 15,
  forcePeriodicExpiry: false,
} as const;

