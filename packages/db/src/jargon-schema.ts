import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jargon = sqliteTable("jargon", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jargon: text("jargon").notNull().unique(),
  shortDefinition: text("short_definition").notNull(),
  definition: text("definition").notNull(),
  easyUnderstanding: text("easy_understanding").notNull(),
  useExample: text("use_example").notNull(),
  badExample: text("bad_example").notNull(),
});
