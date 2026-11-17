import { FunnelPixel } from "@softure-ai/analytics/next";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@softure-ai/theme-notion";
import { ThemeSwitch } from "@softure-ai/ui";
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
    <main data-slot="landing" className="mx-auto grid w-full max-w-content-width gap-12 px-4 py-16 md:py-24">
      <FunnelPixel step="landing" />
      <header className="grid gap-3">
        <h1 className="text-page-title text-balance">{copy.title}</h1>
        <p className="text-body text-muted-foreground">{copy.lead}</p>
      </header>

      <Card aria-labelledby="waitlist-title" role="region">
        <CardHeader>
          <CardTitle id="waitlist-title" className="text-heading-3">
            {copy.waitlistTitle}
          </CardTitle>
          <CardDescription>{copy.status}</CardDescription>
        </CardHeader>
        <CardContent>
          <Waitlist
            placement={WAITLIST_PLACEMENT}
            consentLabels={{ [WAITLIST_SCOPE]: <ConsentLabel /> }}
            emailProps={{ placeholder: copy.emailPlaceholder }}
          />
        </CardContent>
      </Card>

      <section aria-labelledby="pains-title" className="grid gap-4">
        <h2 id="pains-title" className="text-heading-2">
          {copy.painsTitle}
        </h2>
        <ol className="grid gap-4">
          {copy.pains.map(({ pain, answer }) => (
            <li key={pain} className="grid gap-1 border-l-2 border-border pl-4">
              <p className="text-body text-muted-foreground">{pain}</p>
              <p className="text-body font-medium">{answer}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3">
        <p className="text-ui text-muted-foreground">{copy.sourceCodeNote}</p>
        <div>
          <Button asChild size="lg">
            <a href={sourceCodeUrl}>{copy.sourceCode}</a>
          </Button>
        </div>
      </section>

      <ThemeSwitch />
    </main>
  );
}

/** The consent statement with the privacy policy linked. */
function ConsentLabel() {
  const [before, after] = copy.waitlistConsent.split(copy.privacyPolicy);
  return (
    <>
      {before}
      <a href={PRIVACY_POLICY_PATH} className="text-link underline underline-offset-2">
        {copy.privacyPolicy}
      </a>
      {after}
    </>
  );
}
