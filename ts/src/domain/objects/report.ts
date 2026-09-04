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
});

export type Report = Schema.Schema.Type<typeof Report>;

export const createReport = (override: Partial<Report> = {}): Report => ({
  reportId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  title: "Report Title",
  status: "DRAFT",
  sectionIds: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});
