// The app's English copy. Every user-visible string, `aria-label` included, comes from here.
export const en = {
  meta: {
    title: "VaultConnector",
    description: "Read-only access to the folders you pick from your Obsidian vault, from Claude and other AI assistants.",
  },
  home: {
    title: "VaultConnector",
    lead: "Your notes, in your assistant: only the folders you pick, read-only, from any device.",
    status: "Coming soon. The hosted version is being built in the open.",
    sourceCode: "Read the source code",
  },
  auth: {
    consentBefore: "I accept the ",
    terms: "terms",
    consentBetween: " and the ",
    privacy: "privacy policy",
    consentAfter: ".",
    githubNoticeBefore: "Continuing with GitHub creates your account if you have none, and means you accept the ",
    githubNoticeAfter: ".",
    githubDivider: "Or sign up with GitHub",
  },
  panel: {
    title: "Your panel",
    nav: "Panel",
    signedInAs: "Signed in as",
    nextStepLabel: "Next step",
    nextStepTitle: "Connect your vault",
    nextStepBody:
      "Connect the git repository that holds your vault, read-only. Then you pick the folders your assistant may read; nothing is shared before you pick.",
    nextStepSoon: "Connecting a repository opens here soon.",
  },
  switches: {
    registrationClosed: {
      label: "Registration closed",
      description: "When on, nobody can create an account, with a password or with GitHub; existing accounts still sign in.",
    },
  },
} as const;

export type Messages = typeof en;
