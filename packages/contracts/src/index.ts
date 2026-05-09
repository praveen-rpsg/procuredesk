import { z } from "zod";

export const HealthResponseSchema = z.object({
  service: z.string(),
  status: z.enum(["ok", "ready"]),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

