import { BUTTON_VARIANT_LOOK, THEME_SWITCH_LOOK } from "@softure-ai/theme-flat-paint";
import { ButtonAnchor, ThemeSwitch } from "@softure-ai/ui";
import { en } from "../messages/en.ts";
import { readSettings } from "../settings.ts";

// The placeholder home page until the landing page (VC-2): the promise, the state of the product and the source link.
// The page is prerendered, so SOURCE_CODE_URL is read at build time.
export default function HomePage() {
  const { sourceCodeUrl } = readSettings(process.env);
  return (
    <main className="mx-auto grid max-w-measure gap-6 px-4 py-16">
      <h1 className="text-display">{en.home.title}</h1>
      <p className="text-body">{en.home.lead}</p>
      <p className="text-body-sm text-muted">{en.home.status}</p>
      <div>
        <ButtonAnchor variant="primary" href={sourceCodeUrl} className={BUTTON_VARIANT_LOOK.primary}>
          {en.home.sourceCode}
        </ButtonAnchor>
      </div>
      <ThemeSwitch unstyled classNames={THEME_SWITCH_LOOK} />
    </main>
  );
}
