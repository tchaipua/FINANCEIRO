"use client";

import { useEffect } from "react";

type GuardedPerformance = {
  __msinforMeasureGuard?: boolean;
  measure: (...args: unknown[]) => unknown;
};

export default function PerformanceMeasureGuard() {
  useEffect(() => {
    const performance = window.performance as unknown as GuardedPerformance;
    if (!performance?.measure || performance.__msinforMeasureGuard) return;

    const originalMeasure = performance.measure.bind(window.performance);
    performance.measure = (...args: unknown[]) => {
      try {
        return originalMeasure(...args);
      } catch (error) {
        const message = String(error instanceof Error ? error.message : "");
        const measureName = String(args[0] || "");
        if (message.includes("negative time stamp") && measureName.includes("Page")) return undefined;
        throw error;
      }
    };
    performance.__msinforMeasureGuard = true;
  }, []);

  return null;
}
