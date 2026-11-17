// Under the GitHub button: a GitHub sign-in creates the account when there is none, so the visitor sees the terms it
// accepts there, as the password form's consent box shows them.
import { en } from "../../messages/en.ts";
import { LegalLinks } from "./legal-links.tsx";

export function GithubNotice() {
  return (
    <p className="text-body-sm text-muted" data-testid="github-notice">
      {en.auth.githubNoticeBefore}
      <LegalLinks />
      {en.auth.githubNoticeAfter}
    </p>
  );
}
