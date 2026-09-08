import * as Schema from "@effect/schema/Schema";

export const Report = Schema.Struct({
  reportId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  title: Schema.NonEmptyString,
  status: Schema.Enums({
    DRAFT: "DRAFT",
    OUTLINED: "OUTLINED",
    DRAFTED: "DRAFTED",
    REVIEWED: "REVIEWED",
  }),
  sectionIds: Schema.Array(Schema.UUID),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
  content: Schema.String,
});

export type Report = Schema.Schema.Type<typeof Report>;

export const createReport = (override: Partial<Report> = {}): Report => ({
  reportId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  branchId: crypto.randomUUID(),
  title: "Report Title",
  status: "DRAFT",
  sectionIds: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  content: "",
  ...override,
});
