import { z } from "zod";

export const poeticNameSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);

export const uuidSchema = z.string().uuid();
