import { describe, expect, it } from "vitest";
import { getOnboarding, isIndexReady, type OnboardingFacts, type OnboardingStepState } from "./onboarding-steps.ts";

const NEW_ACCOUNT: OnboardingFacts = {
  hasSource: false,
  sharedFolders: 0,
  sync: "none",
  notes: 0,
  indexed: 0,
  hasIndexFailure: false,
  isAssistantConnected: false,
};

function statesOf(facts: OnboardingFacts): Record<string, OnboardingStepState> {
  return Object.fromEntries(getOnboarding(facts).steps.map((step) => [step.id, step.state]));
}

function openStepsOf(facts: OnboardingFacts): string[] {
  return getOnboarding(facts)
    .steps.filter((step) => step.isOpen)
    .map((step) => step.id);
}

describe("getOnboarding", () => {
  it("shows a new account only the first step, as the one to do", () => {
    const onboarding = getOnboarding(NEW_ACCOUNT);

    expect(onboarding.current).toBe("source");
    expect(statesOf(NEW_ACCOUNT)).toEqual({ source: "current", folders: "todo", index: "todo", assistant: "todo", question: "todo" });
    expect(openStepsOf(NEW_ACCOUNT)).toEqual(["source"]);
    expect([onboarding.isComplete, onboarding.isWaiting]).toEqual([false, false]);
  });

  it("asks for the folders once a source is connected", () => {
    const facts = { ...NEW_ACCOUNT, hasSource: true };

    expect(getOnboarding(facts).current).toBe("folders");
    expect(statesOf(facts)).toEqual({ source: "done", folders: "current", index: "todo", assistant: "todo", question: "todo" });
    expect(openStepsOf(facts)).toEqual(["source", "folders"]);
  });

  it("opens the index, Claude and the question together once a folder is shared, and waits for the copy", () => {
    const facts: OnboardingFacts = { ...NEW_ACCOUNT, hasSource: true, sharedFolders: 2, sync: "running" };
    const onboarding = getOnboarding(facts);

    expect(onboarding.current).toBe("index");
    expect(statesOf(facts)).toEqual({ source: "done", folders: "done", index: "current", assistant: "todo", question: "todo" });
    expect(openStepsOf(facts)).toEqual(["source", "folders", "index", "assistant", "question"]);
    expect(onboarding.isWaiting).toBe(true);
  });

  it("keeps waiting while part of the copied notes is searchable", () => {
    const facts: OnboardingFacts = { ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "succeeded", notes: 6, indexed: 5 };

    expect(statesOf(facts).index).toBe("current");
    expect(getOnboarding(facts).isWaiting).toBe(true);
  });

  it("moves on to Claude when every copied note is searchable", () => {
    const facts: OnboardingFacts = { ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "succeeded", notes: 6, indexed: 6 };
    const onboarding = getOnboarding(facts);

    expect(onboarding.current).toBe("assistant");
    expect(statesOf(facts)).toEqual({ source: "done", folders: "done", index: "done", assistant: "current", question: "todo" });
    expect(onboarding.isWaiting).toBe(false);
  });

  it("counts Claude as added while the index is still being built", () => {
    const facts: OnboardingFacts = { ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "running", notes: 6, indexed: 2, isAssistantConnected: true };

    expect(statesOf(facts)).toEqual({ source: "done", folders: "done", index: "current", assistant: "done", question: "todo" });
    expect(getOnboarding(facts).isComplete).toBe(false);
  });

  it("is complete with the index ready and Claude connected, leaving the first question as the step to do", () => {
    const facts: OnboardingFacts = { ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "succeeded", notes: 6, indexed: 6, isAssistantConnected: true };
    const onboarding = getOnboarding(facts);

    expect(onboarding.current).toBe("question");
    expect(statesOf(facts)).toEqual({ source: "done", folders: "done", index: "done", assistant: "done", question: "current" });
    expect([onboarding.isComplete, onboarding.isWaiting]).toEqual([true, false]);
  });

  it("marks the index failed when the first copy failed, and stops waiting", () => {
    const facts: OnboardingFacts = { ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "failed" };
    const onboarding = getOnboarding(facts);

    expect(statesOf(facts).index).toBe("failed");
    expect(onboarding.current).toBe("index");
    expect(onboarding.isWaiting).toBe(false);
  });

  it("marks the index failed when its last step failed, even with notes left from an earlier copy", () => {
    const facts: OnboardingFacts = { ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "succeeded", notes: 6, indexed: 6, hasIndexFailure: true };

    expect(statesOf(facts).index).toBe("failed");
  });

  it("keeps the index done when a later copy failed after every note was indexed", () => {
    const facts: OnboardingFacts = { ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "failed", notes: 6, indexed: 6 };

    expect(statesOf(facts).index).toBe("done");
  });

  it("ignores a connected assistant and a leftover copy before any folder is shared", () => {
    const facts: OnboardingFacts = { ...NEW_ACCOUNT, hasSource: true, sync: "succeeded", notes: 3, indexed: 3, isAssistantConnected: true };

    expect(statesOf(facts)).toEqual({ source: "done", folders: "current", index: "todo", assistant: "todo", question: "todo" });
  });
});

describe("isIndexReady", () => {
  it("is ready for a shared folder with no note once the first copy succeeded, not before", () => {
    expect(isIndexReady({ ...NEW_ACCOUNT, sync: "succeeded" })).toBe(true);
    expect(isIndexReady({ ...NEW_ACCOUNT, sync: "running" })).toBe(false);
    expect(isIndexReady({ ...NEW_ACCOUNT, sync: "none" })).toBe(false);
  });
});
