

export interface Span {
  name: string;
  traceId: string;
  spanId: string;
  parentId?: string;
  attributes: Record<string, unknown>;
  startTime: number;
  endTime?: number;
  status: "OK" | "ERROR";
  events: ReadonlyArray<SpanEvent>;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface Tracer {
  startSpan(name: string, options?: TraceOptions): Span;
  endSpan(span: Span, status?: "OK" | "ERROR"): Span;
  createChildSpan(span: Span, name: string): Span;
  getSpans(): ReadonlyArray<Span>;
}

export interface TraceOptions {
  attributes?: Record<string, unknown>;
}

let counter = 0;
const makeId = () => `span-${++counter}`;
const makeTraceId = () => `trace-${++counter}`;

export class NoOpTracer implements Tracer {
  private spans: Span[] = [];
  private currentTraceId: string = makeTraceId();

  startSpan(name: string, options?: TraceOptions): Span {
    const span: Span = {
      name,
      traceId: this.currentTraceId,
      spanId: makeId(),
      attributes: options?.attributes ?? {},
      startTime: Date.now(),
      status: "OK",
      events: [],
    };
    this.spans.push(span);
    return span;
  }

  endSpan(span: Span, status: "OK" | "ERROR" = "OK"): Span {
    const updated = { ...span, endTime: Date.now(), status };
    const idx = this.spans.indexOf(span);
    if (idx >= 0) {
      this.spans[idx] = updated;
    }
    return updated;
  }

  createChildSpan(parent: Span, name: string): Span {
    const span: Span = {
      name,
      traceId: parent.traceId,
      spanId: makeId(),
      parentId: parent.spanId,
      attributes: {},
      startTime: Date.now(),
      status: "OK",
      events: [],
    };
    this.spans.push(span);
    return span;
  }

  getSpans(): ReadonlyArray<Span> {
    return [...this.spans];
  }
}
