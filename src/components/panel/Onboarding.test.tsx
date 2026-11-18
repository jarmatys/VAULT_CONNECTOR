// The guided setup rendered on the server: a new account sees only the first step, a waiting index shows its share,
// and a finished setup points at the first question. The URL is the one passed, and the sentence form says what happened.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { en } from "../../messages/en.ts";
import { getOnboarding, type OnboardingFacts } from "../../onboarding/onboarding-steps.ts";
import { Onboarding, type OnboardingProps } from "./Onboarding.tsx";

const NEW_ACCOUNT: OnboardingFacts = {
  hasSource: false,
  sharedFolders: 0,
  sync: "none",
  notes: 0,
  indexed: 0,
  hasIndexFailure: false,
  isAssistantConnected: false,
};
const URL = "https://vault.example.test/api/mcp";

function render(facts: OnboardingFacts, overrides: Partial<OnboardingProps> = {}): string {
  return renderToStaticMarkup(
    <Onboarding
      onboarding={getOnboarding(facts)}
      sourceLabel={facts.hasSource ? "example/vault" : null}
      sharedFolders={facts.sharedFolders}
      notes={facts.notes}
      indexed={facts.indexed}
      connectorUrl={URL}
      description=""
      descriptionNotice="none"
      descriptionAction={() => Promise.resolve()}
      {...overrides}
    />,
  );
}

function cardsOf(html: string): string[] {
  return [...html.matchAll(/data-testid="onboarding-(\w+)" data-state="(\w+)"/g)].map((match) => `${match[1] ?? ""}:${match[2] ?? ""}`);
}

describe("Onboarding", () => {
  it("lists the five steps and opens only the first card for a new account, with its primary action", () => {
    const html = render(NEW_ACCOUNT);

    for (const title of Object.values(en.onboarding.steps)) expect(html).toContain(title);
    expect(cardsOf(html)).toEqual(["source:current"]);
    expect(html).toContain(`aria-label="${en.panel.nextStepLabel}"`);
    expect(html).toContain(en.panel.nextStepAction);
    expect(html).not.toContain(URL);
  });

  it("shows the index filling, the connector URL with its copy button and the first question once a folder is shared", () => {
    const html = render({ ...NEW_ACCOUNT, hasSource: true, sharedFolders: 2, sync: "running", notes: 6, indexed: 2 });

    expect(cardsOf(html)).toEqual(["source:done", "folders:done", "index:current", "assistant:todo", "question:todo"]);
    expect(html).toContain(en.onboarding.indexWaiting);
    expect(html).toContain("2 / 6");
    expect(html).toContain(URL);
    expect(html).toContain('data-slot="copy-button"');
    expect(html).toContain(en.onboarding.copyUrl);
    expect(html).toContain(en.onboarding.questionExample);
    expect(html).not.toContain('data-testid="onboarding-complete"');
  });

  it("says the index failed in words, not only by colour", () => {
    const html = render({ ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "failed" });

    expect(cardsOf(html)).toContain("index:failed");
    expect(html).toContain(en.onboarding.indexFailed);
    expect(html).toContain('role="alert"');
  });

  it("says Claude has connected and the setup is complete, leaving the question as the step to do", () => {
    const html = render({ ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "succeeded", notes: 3, indexed: 3, isAssistantConnected: true });

    expect(cardsOf(html)).toEqual(["source:done", "folders:done", "index:done", "assistant:done", "question:current"]);
    expect(html).toContain(en.onboarding.assistantDone);
    expect(html).toContain(en.onboarding.questionComplete);
  });

  it("tells a shared folder with no note that it is empty instead of waiting", () => {
    const html = render({ ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "succeeded" });

    expect(html).toContain(en.onboarding.indexEmpty);
  });

  it("keeps the saved sentence and says when it was saved or too long", () => {
    const facts = { ...NEW_ACCOUNT, hasSource: true, sharedFolders: 1, sync: "running" } as const;

    expect(render(facts, { description: "My garden notes", descriptionNotice: "saved" })).toContain(en.connectors.descriptionSaved);
    expect(render(facts, { description: "My garden notes" })).toContain("My garden notes");
    expect(render(facts, { descriptionNotice: "too_long" })).toContain('data-testid="description-error"');
  });
});
