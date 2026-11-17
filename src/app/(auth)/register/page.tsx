// The module's register page with the product's consent label, and GitHub as the other way to sign up when it is
// configured and registration is open.
import { isRegistrationClosed, getOidcProviders } from "@softure-ai/auth/server";
import { createRegisterPage, getAuthMessages, oidcSignInAction, type AuthPageProps } from "@softure-ai/auth/next";
import { OidcSignIn } from "@softure-ai/auth/ui";
import { getSoftureConfig } from "@softure-ai/core/next";
import { getModuleContext } from "../../../auth/module-context.ts";
import { en } from "../../../messages/en.ts";
import { PANEL_PATH } from "../../../panel-paths.ts";
import { AuthExtras } from "../auth-extras.tsx";
import { GithubNotice } from "../github-notice.tsx";
import { LegalLinks } from "../legal-links.tsx";

const ModuleRegisterPage = createRegisterPage({
  consentLabel: (
    <>
      {en.auth.consentBefore}
      <LegalLinks />
      {en.auth.consentAfter}
    </>
  ),
});

export default async function Register(props: AuthPageProps) {
  const config = getSoftureConfig();
  const providers = getOidcProviders(config).map((provider) => ({ id: provider.id, name: provider.name }));
  const isClosed = await isRegistrationClosed(await getModuleContext());
  return (
    <>
      <ModuleRegisterPage {...props} />
      {providers.length === 0 || isClosed ? null : (
        <AuthExtras>
          <p className="text-center text-body-sm text-muted">{en.auth.githubDivider}</p>
          <OidcSignIn action={oidcSignInAction} providers={providers} messages={getAuthMessages(config)} next={PANEL_PATH} />
          <GithubNotice />
        </AuthExtras>
      )}
    </>
  );
}
