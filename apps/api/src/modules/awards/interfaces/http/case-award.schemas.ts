import { z } from "zod";

import { MoneyPolicy } from "../../domain/money.js";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const moneyPolicy = new MoneyPolicy();
const moneyAmount = z
  .union([z.number(), z.string().trim()])
  .nullable()
  .optional()
  .transform((value, context) => {
    const normalized = moneyPolicy.normalizeNullable(value);
    if (normalized === null && value !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Money amount must be a non-negative value with up to two decimals.",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const CreateAwardRequestSchema = z.object({
  notes: z.string().trim().max(5000).nullable().optional(),
  poAwardDate: dateString,
  poNumber: z.string().trim().max(200).nullable().optional(),
  poValue: moneyAmount,
  poValidityDate: dateString,
  vendorCode: z.string().trim().max(100).nullable().optional(),
  vendorName: z.string().trim().min(1).max(500),
});

export const UpdateAwardRequestSchema = CreateAwardRequestSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one award field is required.",
);

export type CreateAwardRequest = z.infer<typeof CreateAwardRequestSchema>;
export type UpdateAwardRequest = z.infer<typeof UpdateAwardRequestSchema>;
