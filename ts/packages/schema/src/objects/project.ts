import * as Schema from "@effect/schema/Schema";

export const Project = Schema.Struct({
  projectId: Schema.UUID,
  name: Schema.NonEmptyString,
  description: Schema.String,
  status: Schema.Enums({
    ACTIVE: "ACTIVE",
    ARCHIVED: "ARCHIVED",
  } as const),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type Project = Schema.Schema.Type<typeof Project>;
