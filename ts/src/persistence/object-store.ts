import * as Effect from "effect/Effect";

export type ResearchObject = { [key: string]: unknown };

export interface ObjectStore {
  get<T extends ResearchObject>(id: string, type: string): Effect.Effect<Option<T>, Error>;
  list<T extends ResearchObject>(type: string, filter?: (obj: T) => boolean): Effect.Effect<ReadonlyArray<T>, Error>;
  save<T extends ResearchObject>(obj: T): Effect.Effect<T, Error>;
  delete(id: string, type: string): Effect.Effect<boolean, Error>;
}

export class Option<T> {
  constructor(readonly value: T | null) {}
  static some<T>(value: T): Option<T> {
    return new Option(value);
  }
  static none<T>(): Option<T> {
    return new Option(null as unknown as T);
  }
  isSome(): boolean {
    return this.value !== null;
  }
  isNone(): boolean {
    return this.value === null;
  }
  map<U>(fn: (value: T) => U): Option<U> {
    return this.value !== null ? Option.some(fn(this.value)) : Option.none();
  }
  getOrThrow(message?: string): T {
    if (this.value === null) {
      throw new Error(message ?? "Value not present");
    }
    return this.value;
  }
}

export class InMemoryObjectStore implements ObjectStore {
  constructor(readonly store = new Map<string, ResearchObject>()) {}

  private key(id: string, type: string): string {
    return `${type}:${id}`;
  }

  get<T extends ResearchObject>(id: string, type: string): Effect.Effect<Option<T>, Error> {
    return Effect.succeed(
      this.store.has(this.key(id, type))
        ? Option.some(this.store.get(this.key(id, type)) as T)
        : Option.none<T>()
    );
  }

  list<T extends ResearchObject>(
    type: string,
    filter?: (obj: T) => boolean
  ): Effect.Effect<ReadonlyArray<T>, Error> {
    return Effect.succeed(
      Array.from(this.store.entries())
        .filter(([key]) => key.startsWith(`${type}:`))
        .map(([, value]) => value as T)
        .filter((obj) => !filter || filter(obj))
    );
  }

  save<T extends ResearchObject>(obj: T): Effect.Effect<T, Error> {
    const idKey = this.getIdKey(obj);
    return Effect.sync(() => {
      const key = this.key(idKey, this.getType(obj));
      this.store.set(key, obj);
      return obj;
    });
  }

  delete(id: string, type: string): Effect.Effect<boolean, Error> {
    return Effect.sync(() => this.store.delete(this.key(id, type)));
  }

  private getIdKey(obj: ResearchObject): string {
    for (const key of Object.keys(obj)) {
      if (key.endsWith("Id") && typeof obj[key] === "string") {
        return obj[key] as string;
      }
    }
    return "";
  }

  private getType(obj: ResearchObject): string {
    if ("submissionId" in obj) return "Submission";
    if ("reportId" in obj && "sectionIds" in obj) return "Report";
    if ("failureId" in obj) return "ResearchFailure";
    if ("claimId" in obj) return "Claim";
    if ("evidenceId" in obj) return "Evidence";
    if ("experimentId" in obj && "resultIds" in obj) return "Experiment";
    if ("protocolId" in obj) return "Protocol";
    if ("hypothesisId" in obj) return "Hypothesis";
    if ("gapId" in obj) return "ResearchGap";
    if ("knowledgeId" in obj) return "KnowledgeItem";
    if ("questionId" in obj) return "ResearchQuestion";
    if ("resultId" in obj) return "Result";
    if ("approvalId" in obj) return "ApprovalRequest";
    if ("taskId" in obj) return "Task";
    if ("branchId" in obj && !("hypothesisId" in obj) && !("questionId" in obj) && !("gapId" in obj)) return "Branch";
    if ("projectId" in obj && !("branchId" in obj)) return "Project";
    return "Unknown";
  }
}
