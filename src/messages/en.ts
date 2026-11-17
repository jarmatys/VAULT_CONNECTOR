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
  footer: {
    privacy: "Privacy policy",
    terms: "Terms",
    sourceCode: "Source code",
    builtBy: "Built by Jarosław Armatys",
  },
} as const;

export type Messages = typeof en;
