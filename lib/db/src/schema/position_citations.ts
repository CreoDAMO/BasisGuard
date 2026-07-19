import { pgTable, uuid, primaryKey } from "drizzle-orm/pg-core";
import { positionRecordsTable } from "./position_records";
import { authorityCitationsTable } from "./authority_citations";

export const positionCitationsTable = pgTable(
  "position_citations",
  {
    positionId: uuid("position_id")
      .notNull()
      .references(() => positionRecordsTable.id, { onDelete: "cascade" }),
    citationId: uuid("citation_id")
      .notNull()
      .references(() => authorityCitationsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.positionId, t.citationId] })]
);

export type PositionCitation = typeof positionCitationsTable.$inferSelect;
