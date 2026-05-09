import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

import type { PasswordPolicy } from "../domain/password-policy.js";

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  validateAgainstPolicy(password: string, policy: PasswordPolicy): string[] {
    const errors: string[] = [];

    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters.`);
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push("Password must contain an uppercase letter.");
    }
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push("Password must contain a lowercase letter.");
    }
    if (policy.requireNumber && !/[0-9]/.test(password)) {
      errors.push("Password must contain a number.");
    }
    if (policy.requireSpecialCharacter && !/[^A-Za-z0-9]/.test(password)) {
      errors.push("Password must contain a special character.");
    }

    return errors;
  }
}

