import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ZodValidationPipe } from "./zod-validation.pipe.js";

const schema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
});

describe("ZodValidationPipe", () => {
  it("passes through valid data unchanged", () => {
    const pipe = new ZodValidationPipe(schema);
    const result = pipe.transform({ name: "Alice", age: 30 });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("throws BadRequestException on invalid input", () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ name: "", age: -1 })).toThrow(BadRequestException);
  });

  it("throws BadRequestException with issues array", () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ name: "", age: "not-a-number" });
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response.message).toBe("Validation failed");
      expect(Array.isArray(response.issues)).toBe(true);
    }
  });

  it("throws BadRequestException when required field is missing", () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });

  it("strips extra fields via strict schema", () => {
    const strictSchema = schema.strict();
    const pipe = new ZodValidationPipe(strictSchema);
    expect(() => pipe.transform({ name: "Bob", age: 25, extra: "field" })).toThrow(BadRequestException);
  });
});
