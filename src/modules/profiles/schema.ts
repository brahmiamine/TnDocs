import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

export const profileDataSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  arabicName: optionalText(160),
  latinName: optionalText(160),
  dateOfBirth: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }),
    z.literal(""),
  ]).optional().default(""),
  nationality: optionalText(80),
  email: z.union([z.string().trim().email().max(320), z.literal("")]).optional().default(""),
  phone: optionalText(40),
  addressTunisia: optionalText(500),
  addressAbroad: optionalText(500),
  profession: optionalText(120),
  maritalStatus: z.enum(["", "single", "married", "divorced", "widowed"]).optional().default(""),
  cin: optionalText(40),
  passportNumber: optionalText(40),
});

export const profileInputSchema = z.object({
  relationship: z.enum(["self", "spouse", "child", "parent", "relative"]),
  authorizationBasis: z.enum(["self", "consent", "legal_authority"]).optional(),
  authorizationConfirmed: z.boolean().optional(),
  data: profileDataSchema,
}).superRefine((value, context) => {
  if (value.relationship === "self" && value.authorizationBasis && value.authorizationBasis !== "self") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["authorizationBasis"], message: "The primary profile must use the self basis." });
  }
  if (value.relationship !== "self" && (value.authorizationBasis === "self" || !value.authorizationBasis || !value.authorizationConfirmed)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["authorizationConfirmed"], message: "Confirm consent or another legal authority before adding another person." });
  }
});

export type ProfileData = z.infer<typeof profileDataSchema>;
