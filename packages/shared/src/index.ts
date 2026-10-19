import { z } from 'zod';
export const CandidateInput = z.object({ name:z.string().min(2), phone:z.string().optional(), language:z.string().default('English'), yearsExperience:z.number().min(0).max(70), tasks:z.array(z.string()).default([]), consent:z.boolean() });
export type CandidateInput = z.infer<typeof CandidateInput>;
