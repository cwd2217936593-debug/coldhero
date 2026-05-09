import { z } from "zod";

const questionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("text"),
    title: z.string().min(1).max(500),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("single"),
    title: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(30),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal("multiple"),
    title: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(30),
  }),
]);

export const createSurveySchema = z.object({
  title: z.string().min(2).max(255),
  description: z.string().max(4000).nullable().optional(),
  questions: z.array(questionSchema).min(1).max(50),
  status: z.enum(["draft", "published", "closed"]).optional().default("draft"),
});

export const updateSurveySchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().max(4000).nullable().optional(),
  questions: z.array(questionSchema).min(1).max(50).optional(),
  status: z.enum(["draft", "published", "closed"]).optional(),
});

export const submitAnswersSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

export const listResponsesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
