// The app's English copy. Every user-visible string, `aria-label` included, comes from here.
export const en = {
  meta: {
    title: "VaultConnector",
    description: "Read-only access to the folders you pick from your Obsidian vault, from Claude and other AI assistants.",
  },
  landing: {
    title: "Your notes, in your assistant",
    lead: "VaultConnector lets Claude read the folders you pick from your Obsidian vault, read-only, from any device, with no computer left running.",
    status: "The hosted version is being built in the open. Join the waitlist and we will write once when it opens.",
    waitlistTitle: "Join the waitlist",
    emailPlaceholder: "you@example.com",
    waitlistConsent: "Email me when the hosted version opens. I agree to the privacy policy.",
    privacyPolicy: "privacy policy",
    sourceCode: "Read the source code",
    sourceCodeNote: "Open source under the AGPL-3.0. You can run it yourself for free.",
    painsTitle: "What it fixes",
    pains: [
      {
        pain: "A local connector works only while your computer is on.",
        answer: "VaultConnector runs in the cloud, so your phone can reach your notes at any hour.",
      },
      {
        pain: "Setting it up means config files, terminals and Docker.",
        answer: "You connect your vault and add the connector to Claude from one page, in about two minutes.",
      },
      {
        pain: "Whole files land in the conversation, which costs tokens and finds little.",
        answer: "Search by keyword and by meaning returns the passages that matter, with the path of each note.",
      },
      {
        pain: "You want to share some folders, not your whole vault.",
        answer: "Nothing is shared until you pick folders, and every tool is read-only.",
      },
      {
        pain: "The assistant forgets it has your notes and has to be reminded.",
        answer: "The connector tells the assistant when to look in your notes, so you can just ask.",
      },
    ],
  },
  footer: {
    privacy: "Privacy policy",
    terms: "Terms",
    sourceCode: "Source code",
    builtBy: "Built by Jarosław Armatys",
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
