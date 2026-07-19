import { pgTable, text, uuid, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Submission status: pending | approved | rejected
export const chainSubmissionsTable = pgTable("chain_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  submittedBy: text("submitted_by").notNull(), // CPA name / identifier
  submitterCredential: text("submitter_credential").notNull(), // license number
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isL2: boolean("is_l2").notNull().default(false),
  parentChainSlug: text("parent_chain_slug"),
  rpcUrl: text("rpc_url"),
  explorerUrl: text("explorer_url"),
  nativeToken: text("native_token"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const protocolSubmissionsTable = pgTable("protocol_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  submittedBy: text("submitted_by").notNull(),
  submitterCredential: text("submitter_credential").notNull(),
  chainSlug: text("chain_slug").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  contractAddresses: jsonb("contract_addresses").default({}),
  adapterVersion: text("adapter_version"),
  documentationUrl: text("documentation_url"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChainSubmissionSchema = createInsertSchema(chainSubmissionsTable).omit({ id: true, createdAt: true, status: true, reviewedBy: true, reviewedAt: true, rejectionReason: true });
export const insertProtocolSubmissionSchema = createInsertSchema(protocolSubmissionsTable).omit({ id: true, createdAt: true, status: true, reviewedBy: true, reviewedAt: true, rejectionReason: true });

export type InsertChainSubmission = z.infer<typeof insertChainSubmissionSchema>;
export type ChainSubmission = typeof chainSubmissionsTable.$inferSelect;
export type InsertProtocolSubmission = z.infer<typeof insertProtocolSubmissionSchema>;
export type ProtocolSubmission = typeof protocolSubmissionsTable.$inferSelect;
