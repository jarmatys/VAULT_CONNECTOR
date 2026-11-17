import { FunnelPixel } from "@softure-ai/analytics/next";
import { BUTTON_VARIANT_LOOK, CHECKBOX_LOOK, FIELD_LABEL_LOOK, THEME_SWITCH_LOOK } from "@softure-ai/theme-flat-paint";
import { ButtonAnchor, ThemeSwitch } from "@softure-ai/ui";
import { Waitlist } from "@softure-ai/waitlist/next";
import { en } from "../../messages/en.ts";
import { readSettings } from "../../settings.ts";
import { PRIVACY_POLICY_PATH, WAITLIST_PLACEMENT, WAITLIST_SCOPE } from "../../site.ts";

const copy = en.landing;

// The landing page (gate 0): the promise, the waitlist for the hosted version, the five pains and how each is
// answered, and the source code (AGPL-3.0 section 13). The pixel counts the visit in the cookieless funnel. The page is
// prerendered, so SOURCE_CODE_URL is read at build time.
export default function LandingPage() {
  const { sourceCodeUrl } = readSettings(process.env);
  return (
    <main className="mx-auto grid max-w-measure gap-section px-4 py-16">
      <FunnelPixel step="landing" />
      <header className="grid gap-4">
        <h1 className="text-display">{copy.title}</h1>
        <p className="text-body">{copy.lead}</p>
      </header>

      <section aria-labelledby="waitlist-title" className="card-surface grid gap-4 p-card">
        <h2 id="waitlist-title" className="text-section">
          {copy.waitlistTitle}
        </h2>
        <p className="text-body-sm text-muted">{copy.status}</p>
        <Waitlist
          placement={WAITLIST_PLACEMENT}
          consentLabels={{ [WAITLIST_SCOPE]: <ConsentLabel /> }}
          emailProps={{ placeholder: copy.emailPlaceholder }}
          classNames={{ submit: BUTTON_VARIANT_LOOK.primary }}
          fieldClassNames={{ label: FIELD_LABEL_LOOK }}
          scopeClassNames={CHECKBOX_LOOK}
        />
      </section>

      <section aria-labelledby="pains-title" className="grid gap-6">
        <h2 id="pains-title" className="text-section">
          {copy.painsTitle}
        </h2>
        <ol className="grid gap-6">
          {copy.pains.map(({ pain, answer }) => (
            <li key={pain} className="grid gap-1 border-l-2 border-accent pl-4">
              <p className="text-body text-muted">{pain}</p>
              <p className="text-body font-semibold">{answer}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3">
        <p className="text-body-sm text-muted">{copy.sourceCodeNote}</p>
        <div>
          <ButtonAnchor variant="primary" href={sourceCodeUrl} className={BUTTON_VARIANT_LOOK.primary}>
            {copy.sourceCode}
          </ButtonAnchor>
        </div>
      </section>

      <ThemeSwitch unstyled classNames={THEME_SWITCH_LOOK} />
    </main>
  );
}

/** The consent statement with the privacy policy linked. */
function ConsentLabel() {
  const [before, after] = copy.waitlistConsent.split(copy.privacyPolicy);
  return (
    <>
      {before}
      <a href={PRIVACY_POLICY_PATH} className="underline">
        {copy.privacyPolicy}
      </a>
      {after}
    </>
  );
}
