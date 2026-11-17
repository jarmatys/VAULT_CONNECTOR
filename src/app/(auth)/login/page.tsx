// The module's login page (password form, the GitHub button when GitHub sign-in is configured), plus the terms a
// GitHub sign-up accepts.
import { getOidcProviders } from "@softure-ai/auth/server";
import { LoginPage, type AuthPageProps } from "@softure-ai/auth/next";
import { getSoftureConfig } from "@softure-ai/core/next";
import { AuthExtras } from "../auth-extras.tsx";
import { GithubNotice } from "../github-notice.tsx";

export default function Login(props: AuthPageProps) {
  const hasProviders = getOidcProviders(getSoftureConfig()).length > 0;
  return (
    <>
      <LoginPage {...props} />
      {hasProviders ? (
        <AuthExtras>
          <GithubNotice />
        </AuthExtras>
      ) : null}
    </>
  );
}
