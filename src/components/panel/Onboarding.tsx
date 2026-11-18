// The guided setup on the overview (VC-12, FR-5): the five steps in one list, each with its state, then a card for every
// step that is open, so a new account goes from a source to its first answer on one screen. Rendered on the server from
// the step model (onboarding-steps.ts); the page passes what it read. Only the step to do now carries the screen's one
// primary action (DESIGN.md); the copy button is the kit's (`CopyButton`), the URL stays selectable next to it.
import { formatMessage } from "@softure-ai/core";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CodeBlock,
  CopyButton,
  Label,
  MiniProgress,
  Steps,
  Textarea,
  type StepItem,
} from "@softure-ai/theme-notion";
import Link from "next/link";
import type { ReactNode } from "react";
import { DESCRIPTION_FIELD } from "../../mcp/connector-paths.ts";
import { MAX_VAULT_DESCRIPTION_LENGTH } from "../../mcp/profile/vault-description.ts";
import { en } from "../../messages/en.ts";
import { ONBOARDING_STEP_IDS, type Onboarding as OnboardingModel, type OnboardingStep, type OnboardingStepId, type OnboardingStepState } from "../../onboarding/onboarding-steps.ts";
import { CONNECTORS_PATH, STATUS_PATH } from "../../panel-paths.ts";
import { FOLDERS_PATH } from "../../vault/folders/folder-paths.ts";
import { SOURCE_PATH } from "../../vault/sources/source-paths.ts";

const copy = en.onboarding;

/** What the "About your vault" form shows after a save on this screen. */
export type DescriptionNotice = "none" | "saved" | "too_long";

export interface OnboardingProps {
  readonly onboarding: OnboardingModel;
  /** The connected repository or bucket, or null. */
  readonly sourceLabel: string | null;
  readonly sharedFolders: number;
  readonly notes: number;
  readonly indexed: number;
  readonly connectorUrl: string;
  readonly description: string;
  readonly descriptionNotice: DescriptionNotice;
  readonly descriptionAction: (formData: FormData) => Promise<void>;
}

export function Onboarding(props: OnboardingProps) {
  const { onboarding } = props;
  const items: StepItem[] = onboarding.steps.map((step) => ({ key: step.id, title: copy.steps[step.id], state: step.state }));
  return (
    <>
      <Card>
        <CardContent>
          <Steps label={copy.progressLabel} layout="list" steps={items} />
        </CardContent>
      </Card>
      <section aria-label={en.panel.nextStepLabel} className="grid gap-3">
        <h2 className="text-section-label text-muted-foreground">{en.panel.nextStepLabel}</h2>
        {onboarding.steps
          .filter((step) => step.isOpen)
          .map((step) => (
            <StepCard key={step.id} step={step}>
              {renderStepBody(step.id, props, onboarding.current === step.id)}
            </StepCard>
          ))}
      </section>
    </>
  );
}

function renderStepBody(id: OnboardingStepId, props: OnboardingProps, isCurrent: boolean): StepBody {
  switch (id) {
    case "source":
      return {
        title: en.panel.nextStepTitle,
        content: (
          <>
            <p>{en.panel.nextStepBody}</p>
            {props.sourceLabel !== null && (
              <p data-testid="panel-source">
                {en.panel.nextStepConnected} <span className="font-mono font-medium">{props.sourceLabel}</span>
              </p>
            )}
          </>
        ),
        footer: <ActionLink href={SOURCE_PATH} label={props.sourceLabel === null ? en.panel.nextStepAction : en.panel.nextStepManage} isPrimary={isCurrent} />,
      };
    case "folders":
      return {
        title: en.panel.foldersStepTitle,
        content: (
          <>
            <p>{en.panel.foldersStepBody}</p>
            <p data-testid="panel-folders">
              {en.panel.foldersStepCount} <span className="font-medium">{String(props.sharedFolders)}</span>
            </p>
          </>
        ),
        footer: <ActionLink href={FOLDERS_PATH} label={en.panel.foldersStepAction} isPrimary={isCurrent} />,
      };
    case "index":
      return {
        title: en.panel.statusStepTitle,
        content: <IndexBody step={props.onboarding.steps.find((step) => step.id === "index")} notes={props.notes} indexed={props.indexed} />,
        footer: <ActionLink href={STATUS_PATH} label={en.panel.statusStepAction} isPrimary={false} />,
      };
    case "assistant":
      return {
        title: copy.steps.assistant,
        content: <AssistantBody {...props} isDone={props.onboarding.steps.some((step) => step.id === "assistant" && step.state === "done")} isCurrent={isCurrent} />,
        footer: <ActionLink href={CONNECTORS_PATH} label={copy.assistantManage} isPrimary={false} />,
      };
    case "question":
      return {
        title: copy.steps.question,
        content: (
          <>
            {props.onboarding.isComplete && (
              <p role="status" className="text-green" data-testid="onboarding-complete">
                {copy.questionComplete}
              </p>
            )}
            <p>{copy.questionBody}</p>
            <CodeBlock wrap data-testid="onboarding-example">
              {copy.questionExample}
            </CodeBlock>
          </>
        ),
        footer: null,
      };
  }
}

interface StepBody {
  readonly title: string;
  readonly content: ReactNode;
  readonly footer: ReactNode;
}

function IndexBody({ step, notes, indexed }: { readonly step: OnboardingStep | undefined; readonly notes: number; readonly indexed: number }) {
  const state = step?.state ?? "todo";
  const percent = notes === 0 ? (state === "done" ? 100 : 0) : (Math.min(indexed, notes) / notes) * 100;
  const message =
    state === "failed" ? copy.indexFailed : state === "done" ? (notes === 0 ? copy.indexEmpty : copy.indexDone) : copy.indexWaiting;
  return (
    <>
      <p role={state === "failed" ? "alert" : "status"} className={state === "failed" ? "text-red" : undefined} data-testid="onboarding-index-message">
        {message}
      </p>
      <MiniProgress value={percent} tone={state === "failed" ? "danger" : state === "done" ? "success" : "default"} label={`${String(Math.min(indexed, notes))} / ${String(notes)}`} />
      <p data-testid="panel-status">
        {en.status.indexed}: <span className="font-medium">{`${String(indexed)} / ${String(notes)}`}</span>
      </p>
    </>
  );
}

function AssistantBody(props: OnboardingProps & { readonly isDone: boolean; readonly isCurrent: boolean }) {
  return (
    <>
      {props.isDone ? (
        <p role="status" className="text-green" data-testid="onboarding-assistant-done">
          {copy.assistantDone}
        </p>
      ) : (
        <p>{copy.assistantBody}</p>
      )}
      <ol aria-label={copy.assistantStepsLabel} className="grid list-decimal gap-1 pl-5">
        {copy.assistantSteps.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <div className="grid gap-2">
        <p className="text-small font-medium">{copy.urlLabel}</p>
        <div className="flex flex-wrap items-center gap-2">
          <CodeBlock wrap className="min-w-0 flex-1 basis-60" data-testid="connector-url">
            {props.connectorUrl}
          </CodeBlock>
          <CopyButton value={props.connectorUrl} label={copy.copyUrl} copiedLabel={copy.urlCopied} variant={props.isCurrent ? "default" : "secondary"} />
        </div>
      </div>
      <form action={props.descriptionAction} className="grid gap-2" data-testid="description-form">
        <Label htmlFor={DESCRIPTION_FIELD}>{en.connectors.descriptionTitle}</Label>
        <p className="text-small text-muted-foreground">{en.connectors.descriptionBody}</p>
        <Textarea id={DESCRIPTION_FIELD} name={DESCRIPTION_FIELD} defaultValue={props.description} rows={2} />
        {props.descriptionNotice === "too_long" && (
          <p role="alert" className="text-small text-red" data-testid="description-error">
            {formatMessage(en.connectors.descriptionTooLong, { max: MAX_VAULT_DESCRIPTION_LENGTH })}
          </p>
        )}
        {props.descriptionNotice === "saved" && (
          <p role="status" className="text-small text-green" data-testid="description-saved">
            {en.connectors.descriptionSaved}
          </p>
        )}
        <div>
          <Button type="submit" variant="secondary">
            {en.connectors.descriptionSave}
          </Button>
        </div>
      </form>
    </>
  );
}

function ActionLink({ href, label, isPrimary }: { readonly href: string; readonly label: string; readonly isPrimary: boolean }) {
  return (
    <Button asChild size="lg" variant={isPrimary ? "default" : "secondary"}>
      <Link href={href}>{label}</Link>
    </Button>
  );
}

// Literal class names per state, so Tailwind generates each one; the same colours as the theme's `Steps` badges.
const STEP_NUMBER_STATE: Readonly<Record<OnboardingStepState, string>> = {
  done: "bg-green-tag text-green-tag-foreground",
  current: "bg-primary text-primary-foreground",
  todo: "bg-secondary text-muted-foreground",
  failed: "bg-red-tag text-red-tag-foreground",
};

interface StepCardProps {
  readonly step: OnboardingStep;
  readonly children: StepBody;
}

/** One open step: its number (as in the list above) coloured by its state, the title, what it does, and its action. */
function StepCard({ step, children }: StepCardProps) {
  return (
    <Card data-testid={`onboarding-${step.id}`} data-state={step.state}>
      <CardHeader className="flex items-center gap-3">
        <span aria-hidden className={`flex size-6 shrink-0 items-center justify-center rounded-md text-small font-medium ${STEP_NUMBER_STATE[step.state]}`}>
          {ONBOARDING_STEP_IDS.indexOf(step.id) + 1}
        </span>
        <CardTitle className="text-heading-3">{children.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-body">{children.content}</CardContent>
      {children.footer !== null && <CardFooter className="flex flex-wrap gap-2">{children.footer}</CardFooter>}
    </Card>
  );
}
