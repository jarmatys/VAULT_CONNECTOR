// The guided setup of a new account (VC-12, FR-5, G-2): five steps from what the account has done so far. A pure
// function of the facts the panel reads (load-onboarding.ts), so every state is tested without a page. The steps run
// in order, except that Claude can be added while the index is still being built: both open once a folder is shared.

export const ONBOARDING_STEP_IDS = ["source", "folders", "index", "assistant", "question"] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

/** The theme's `Steps` states: done, the one to do now, failed, or later. */
export type OnboardingStepState = "done" | "current" | "todo" | "failed";

/** The latest sync run as the overview needs it: none yet, running, or how it ended. */
export type OnboardingSyncState = "none" | "running" | "succeeded" | "failed";

export interface OnboardingFacts {
  readonly hasSource: boolean;
  readonly sharedFolders: number;
  readonly sync: OnboardingSyncState;
  /** Notes in the synced copy and how many of them are searchable against this instance's model. */
  readonly notes: number;
  readonly indexed: number;
  /** The index's last step failed (it retries by itself). */
  readonly hasIndexFailure: boolean;
  /** A connected app or a token of the account has reached the server at least once. */
  readonly isAssistantConnected: boolean;
}

export interface OnboardingStep {
  readonly id: OnboardingStepId;
  readonly state: OnboardingStepState;
  /** Whether the step's card and action are shown: its prerequisites are done. */
  readonly isOpen: boolean;
}

export interface Onboarding {
  readonly steps: readonly OnboardingStep[];
  /** The step to do now: the first not done; the question once everything else is. */
  readonly current: OnboardingStepId;
  /** Source, folders, index and assistant are done: only the question is left, which the panel cannot see. */
  readonly isComplete: boolean;
  /** The index is being built: the overview refreshes itself until it is done. */
  readonly isWaiting: boolean;
}

/** Whether every copied note is searchable, or the first copy finished with no note at all. */
export function isIndexReady(facts: OnboardingFacts): boolean {
  if (facts.hasIndexFailure) return false;
  if (facts.notes === 0) return facts.sync === "succeeded";
  return facts.indexed >= facts.notes;
}

export function getOnboarding(facts: OnboardingFacts): Onboarding {
  const isShared = facts.hasSource && facts.sharedFolders > 0;
  const isIndexDone = isShared && isIndexReady(facts);
  const isIndexFailed = isShared && !isIndexDone && (facts.hasIndexFailure || (facts.sync === "failed" && facts.notes === 0));
  const isAssistantDone = isShared && facts.isAssistantConnected;

  const progress: readonly { readonly id: OnboardingStepId; readonly isDone: boolean; readonly isOpen: boolean; readonly isFailed: boolean }[] = [
    { id: "source", isDone: facts.hasSource, isOpen: true, isFailed: false },
    { id: "folders", isDone: isShared, isOpen: facts.hasSource, isFailed: false },
    { id: "index", isDone: isIndexDone, isOpen: isShared, isFailed: isIndexFailed },
    { id: "assistant", isDone: isAssistantDone, isOpen: isShared, isFailed: false },
    // The question is never seen by the panel, so it is never done: it is the step to do once everything else is.
    { id: "question", isDone: false, isOpen: isShared, isFailed: false },
  ];
  const current = progress.find((step) => !step.isDone)?.id ?? "question";
  const steps = progress.map(({ id, isDone, isOpen, isFailed }): OnboardingStep => ({
    id,
    isOpen,
    state: isDone ? "done" : isFailed ? "failed" : id === current ? "current" : "todo",
  }));
  return {
    steps,
    current,
    isComplete: isIndexDone && isAssistantDone,
    isWaiting: isShared && !isIndexDone && !isIndexFailed,
  };
}
