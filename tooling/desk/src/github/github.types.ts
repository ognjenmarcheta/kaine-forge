import { z } from "zod";

/**
 * Shapes of the `gh` JSON that the desk reads. Every response is parsed with
 * one of these at the boundary. Unknown fields are dropped, not rejected, so a
 * new `gh` version that adds fields keeps working.
 */

const loginSchema = z.object({ login: z.string().min(1) });

/** `author_association` values that make a comment author trusted for prompts. */
export const TRUSTED_ASSOCIATIONS = ["OWNER", "MEMBER", "COLLABORATOR"] as const;

export const issueViewSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z
    .string()
    .nullable()
    .transform((body) => body ?? ""),
  url: z.string().min(1),
  state: z.string(),
  author: loginSchema.nullable(),
  labels: z.array(z.object({ name: z.string() })),
  comments: z.array(
    z.object({
      url: z.string(),
      body: z.string(),
      createdAt: z.string(),
      author: loginSchema.nullable(),
      authorAssociation: z.string()
    })
  )
});

export const issueEventSchema = z.object({
  id: z.number(),
  event: z.string(),
  created_at: z.string(),
  actor: loginSchema.nullable(),
  label: z.object({ name: z.string() }).optional()
});
export type IssueEvent = z.infer<typeof issueEventSchema>;

export const restCommentSchema = z.object({
  id: z.number().int().positive(),
  body: z
    .string()
    .nullable()
    .transform((body) => body ?? ""),
  user: loginSchema.nullable()
});
export type RestComment = z.infer<typeof restCommentSchema>;

export const userSchema = loginSchema;

export const repositorySchema = z.object({
  full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  owner: z.object({ login: z.string().min(1), type: z.string() })
});

export interface RepositoryInfo {
  readonly fullName: string;
  readonly ownerLogin: string;
  readonly ownerType: "User" | "Organization" | "Other";
}

export interface IssueComment {
  readonly url: string;
  readonly body: string;
  readonly createdAt: string;
  readonly author: string | null;
  readonly authorAssociation: string;
}

export interface IssueLabelEvent {
  readonly id: number;
  readonly action: "labeled" | "unlabeled";
  readonly label: string;
  readonly actor: string | null;
  readonly createdAt: string;
}

/** One read of an issue: its content plus the label events that authorize it. */
export interface IssueSnapshot {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly open: boolean;
  readonly author: string | null;
  readonly labels: readonly string[];
  readonly comments: readonly IssueComment[];
  readonly labelEvents: readonly IssueLabelEvent[];
}

export interface StatusCommentResult {
  readonly action: "created" | "updated" | "unchanged";
  readonly commentId: number;
}
