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
    nextStepAction: "Connect a repository",
    nextStepConnected: "Connected:",
    nextStepManage: "Manage the source",
  },
  source: {
    title: "Vault source",
    lead: "The git repository that holds your vault. The product reads it, never writes to it, and reads nothing else.",
    unconfigured: "This instance has no GitHub App set up for vault sources, so a repository cannot be connected yet.",
    connectTitle: "Connect a GitHub repository",
    connectBody:
      "You install our GitHub App on one repository, the one with your vault, with read-only access to its contents. GitHub then asks you to confirm it is you.",
    connectAction: "Connect on GitHub",
    connectedTitle: "Connected",
    connectedBody: "Your vault is read from",
    branch: "Branch",
    disconnectedTitle: "Disconnected",
    disconnectedBody:
      "GitHub no longer lets us read this repository: the App was removed, suspended or no longer has the repository. Connect it again to carry on.",
    reconnectAction: "Connect again",
    disconnectAction: "Disconnect",
    disconnectNote: "Disconnecting forgets the repository here. To revoke the access on GitHub too, uninstall the App in your GitHub settings.",
    linked: "The repository is connected.",
    errors: {
      "vault.link_expired": "That link has expired or was already used. Start again.",
      "vault.link_denied": "GitHub authorization was declined, so nothing was connected.",
      "vault.link_pending_approval": "An owner of the organization has to approve the installation on GitHub. Connect again once they have.",
      "vault.link_not_yours": "That installation does not belong to your GitHub account, so nothing was connected.",
      "vault.link_one_repository": "Pick exactly one repository when you install the App (Only select repositories, one repository).",
      "vault.link_permissions": "The App must have read-only access to contents. Nothing was connected.",
      "vault.link_unavailable": "GitHub did not answer. Try again in a moment.",
    },
  },
  panelShell: {
    brand: "VaultConnector",
    menuTitle: "Menu",
    menuDescription: "The panel's sections.",
    openMenu: "Open the menu",
    sections: {
      overview: "Overview",
      source: "Vault source",
      password: "Password",
    },
  },
  switches: {
    registrationClosed: {
      label: "Registration closed",
      description: "When on, nobody can create an account, with a password or with GitHub; existing accounts still sign in.",
    },
  },
} as const;

export type Messages = typeof en;
