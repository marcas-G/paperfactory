export interface Metrics {
  counter: MetricCounter;
  histogram: MetricHistogram;
  gauge: MetricGauge;
  getMetrics(): ReadonlyArray<MetricRecord>;
}

export interface MetricRecord {
  name: string;
  labels: Record<string, string>;
  value: number;
  timestamp: number;
}

export interface MetricCounter {
  inc(name: string, value?: number, labels?: Record<string, string>): void;
}

export interface MetricHistogram {
  observe(name: string, value: number, labels?: Record<string, string>): void;
}

export interface MetricGauge {
  set(name: string, value: number, labels?: Record<string, string>): void;
  inc(name: string, value?: number, labels?: Record<string, string>): void;
  dec(name: string, value?: number, labels?: Record<string, string>): void;
}

export class InMemoryMetrics implements Metrics {
  private records: MetricRecord[] = [];

  counter: MetricCounter = {
    inc: (name: string, value = 1, labels?: Record<string, string>) => {
      const existing = this.records.find(
        (r) => r.name === name && JSON.stringify(r.labels) === JSON.stringify(labels ?? {})
      );
      if (existing) {
        existing.value += value;
      } else {
        this.records.push({
          name,
          labels: labels ?? {},
          value,
          timestamp: Date.now(),
        });
      }
    },
  };

  histogram: MetricHistogram = {
    observe: (name: string, value: number, labels?: Record<string, string>) => {
      this.records.push({
        name,
        labels: labels ?? {},
        value,
        timestamp: Date.now(),
      });
    },
  };

  gauge: MetricGauge = {
    set: (name: string, value: number, labels?: Record<string, string>) => {
      const idx = this.records.findIndex(
        (r) => r.name === name && JSON.stringify(r.labels) === JSON.stringify(labels ?? {})
      );
      if (idx >= 0) {
        this.records[idx].value = value;
      } else {
        this.records.push({
          name,
          labels: labels ?? {},
          value,
          timestamp: Date.now(),
        });
      }
    },
    inc: (name: string, value = 1, labels?: Record<string, string>) => {
      const idx = this.records.findIndex(
        (r) => r.name === name && JSON.stringify(r.labels) === JSON.stringify(labels ?? {})
      );
      if (idx >= 0) {
        this.records[idx].value += value;
      } else {
        this.records.push({
          name,
          labels: labels ?? {},
          value,
          timestamp: Date.now(),
        });
      }
    },
    dec: (name: string, value = 1, labels?: Record<string, string>) => {
      const idx = this.records.findIndex(
        (r) => r.name === name && JSON.stringify(r.labels) === JSON.stringify(labels ?? {})
      );
      if (idx >= 0) {
        this.records[idx].value -= value;
      } else {
        this.records.push({
          name,
          labels: labels ?? {},
          value: -value,
          timestamp: Date.now(),
        });
      }
    },
  };

  getMetrics(): ReadonlyArray<MetricRecord> {
    return [...this.records];
  }
}
