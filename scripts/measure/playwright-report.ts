// Reads a timed value out of Playwright's JSON report (`--reporter=json`): the onboarding test records its time from
// the sign-up page to the first answer as the annotation `onboarding-ms` (e2e/onboarding.spec.ts). Only a passed test
// counts: a failed run has no time to report.
import { z } from "zod";

const annotationSchema = z.object({ type: z.string(), description: z.string().optional() });
const resultSchema = z.object({ status: z.string(), annotations: z.array(annotationSchema).optional() });
const testSchema = z.object({ annotations: z.array(annotationSchema).optional(), results: z.array(resultSchema) });
const specSchema = z.object({ title: z.string(), tests: z.array(testSchema) });

interface Suite {
  readonly specs?: readonly z.infer<typeof specSchema>[];
  readonly suites?: readonly Suite[];
}

const suiteSchema: z.ZodType<Suite> = z.lazy(() => z.object({ specs: z.array(specSchema).optional(), suites: z.array(suiteSchema).optional() }));
const reportSchema = z.object({ suites: z.array(suiteSchema) });

export type AnnotationResult = { readonly ok: true; readonly values: readonly number[] } | { readonly ok: false; readonly error: string };

/** Every numeric value of the annotation `type` on a passed test of the report. */
export function readAnnotationValues(report: unknown, type: string): AnnotationResult {
  const parsed = reportSchema.safeParse(report);
  if (!parsed.success) return { ok: false, error: `not a Playwright JSON report: ${parsed.error.message}` };
  const values: number[] = [];
  const visit = (suite: Suite): void => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        for (const result of test.results) {
          if (result.status !== "passed") continue;
          const annotations = [...(test.annotations ?? []), ...(result.annotations ?? [])];
          const found = annotations.find((annotation) => annotation.type === type);
          const value = Number(found?.description);
          if (found !== undefined && Number.isFinite(value)) values.push(value);
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  parsed.data.suites.forEach(visit);
  return values.length === 0 ? { ok: false, error: `no passed test carries the annotation ${type}` } : { ok: true, values };
}
