// The English text of the privacy policy and the terms. `{operator}` and `{contact}` are filled from the instance's
// settings (OPERATOR_NAME, OPERATOR_CONTACT). A change to this text is a new history entry in
// src/lib/legal-documents.ts on the day it takes effect.

/** One section of a legal document: paragraphs, then an optional list. */
export interface LegalSectionCopy {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly items?: readonly string[];
}

export interface LegalDocumentCopy {
  readonly title: string;
  readonly description: string;
  readonly intro: string;
  readonly sections: readonly LegalSectionCopy[];
}

export const legalEn = {
  /** Stands in for `{operator}` when the instance sets no OPERATOR_NAME. */
  unnamedOperator: "the operator of this instance",
  /** Stands in for `{contact}` when the instance sets no OPERATOR_CONTACT. */
  unnamedContact: "the contact details published on this site",
  privacyPolicy: {
    title: "Privacy policy",
    description: "What VaultConnector stores, where, for how long, who processes it, and how to delete it.",
    intro:
      "VaultConnector gives an AI assistant read-only access to the folders you pick from your notes vault. This policy says what this instance stores, where, for how long and who helps run it. It is run by {operator}. Write to {contact} with any question about your data.",
    sections: [
      {
        id: "what-we-store",
        title: "What we store",
        paragraphs: ["We store only what the service needs to work:"],
        items: [
          "Account data: your email address, a hash of your password (never the password itself) or the id of the GitHub account you sign in with, and your sessions.",
          "Your vault source: which repository, bucket or folder you connected, and the read-only access you granted to it, kept encrypted and used only to copy your picked folders.",
          "Copies of the folders you picked: the notes in them, and nothing from folders you did not pick. Nothing is copied before you pick a folder.",
          "The search index of those notes: passages of their text with keyword and meaning (embedding) data, so your assistant can search them.",
          "Your assistant connections: the apps you connected and their access tokens, kept as hashes.",
          "Usage counts: how many notes, how much storage and how many searches your account uses, to apply your plan's limits.",
          "Your waitlist sign-up, if you joined it: your email address and your consent.",
          "Technical logs: request times, errors and the address a request came from, kept to keep the service running and safe. Logs never contain the text of your notes.",
        ],
      },
      {
        id: "where-it-is-stored",
        title: "Where it is stored",
        paragraphs: [
          "On the hosted version, your account data, the copies of your folders and the search index are stored in the European Union: the database in an EU region and the copies in storage restricted to the EU. The service itself runs on Cloudflare's network, which answers requests from the data centre nearest to you.",
          "On the hosted version, the meaning (embedding) data of your notes is computed by Cloudflare Workers AI, with an openly published multilingual model, on Cloudflare's network. The same model turns your assistant's search queries into meaning data when it searches. That computation may run in a data centre outside the European Union; Cloudflare receives the passages and the queries only to compute the data, as our processor, and the result is stored with the search index in the EU. A self-hosted instance computes it wherever its operator set it up, or not at all.",
          "A self-hosted instance stores everything wherever its operator runs it.",
        ],
      },
      {
        id: "how-we-use-it",
        title: "How we use it",
        paragraphs: [
          "We use your data only to provide the service: to copy your picked folders, keep the copies in step with your source, index them and answer your assistant's requests.",
          "Your assistant reads your notes through read-only tools. The service never writes, moves or deletes anything in your vault source.",
          "Nobody reads your notes to run the service. The panel shows folder names and counts, never note text.",
        ],
      },
      {
        id: "no-training",
        title: "No training",
        paragraphs: [
          "Your notes, the index of them and what your assistant asks are never used to train any AI model, ours or anyone else's, and are never sold or shared for advertising.",
          "The assistant you connect (for example Claude or ChatGPT) receives the passages it asks for, under that provider's own terms and privacy policy.",
        ],
      },
      {
        id: "processors",
        title: "Who processes it",
        paragraphs: ["The hosted version uses these processors, each only for its part of the service:"],
        items: [
          "Cloudflare: runs the service, stores the copies of your folders in the EU, serves the site, and computes the meaning data of your notes (Workers AI).",
          "Neon: hosts the database in an EU region.",
          "The mail delivery provider: sends account mail such as password resets. It will be named here before the first mail is sent.",
          "The payment provider: takes payments for paid plans. It will be named here before payments open.",
          "GitHub and the other sources you connect are not our processors: they hold your vault, and we only read from them with the access you grant.",
        ],
      },
      {
        id: "how-long-we-keep-it",
        title: "How long we keep it",
        paragraphs: [
          "We keep your data while your account exists. When you unpick a folder or disconnect your source, its copies and its part of the index are deleted at the next sync.",
          "When you delete your account, your account data, the copies of your folders, the search index and your assistants' tokens are deleted at once. Encrypted database backups still hold them until the backups expire, at most 31 days later.",
          "Technical logs are kept for at most 30 days.",
        ],
      },
      {
        id: "your-rights",
        title: "Your rights and how to delete your data",
        paragraphs: [
          "You can see and change your data in the panel, download it as a file, and delete your account and everything in it from the panel at any time.",
          "You can also ask {operator} to access, correct, export or delete your data, or object to how it is used, at {contact}. You may complain to your data protection authority.",
        ],
      },
      {
        id: "cookies",
        title: "Cookies",
        paragraphs: [
          "We set only the cookies the service needs: your session when you are signed in, and your choice of light or dark scheme. No advertising or tracking cookies.",
        ],
      },
    ],
  } satisfies LegalDocumentCopy,
  terms: {
    title: "Terms of service",
    description: "The rules for using VaultConnector: your account, your content, plans and the limits of the service.",
    intro:
      "These terms apply to your use of this VaultConnector instance, run by {operator}. By creating an account you accept them. Write to {contact} with any question.",
    sections: [
      {
        id: "the-service",
        title: "The service",
        paragraphs: [
          "VaultConnector copies the folders you pick from your notes vault and lets the AI assistants you connect read and search them, read-only. It never changes your vault source.",
          "VaultConnector is not affiliated with Obsidian or with any assistant provider. It works with Obsidian vaults and with assistants that support remote connectors.",
        ],
      },
      {
        id: "your-account",
        title: "Your account",
        paragraphs: [
          "You need an account to use the service. Keep your password and your assistants' access to yourself; you are responsible for what is done with them.",
          "You must be old enough to agree to these terms where you live, and at least 16.",
        ],
      },
      {
        id: "your-content",
        title: "Your content",
        paragraphs: [
          "Your notes stay yours. You give us only the right to copy, index and serve the folders you pick to the assistants you connect, for as long as you keep them picked.",
          "Connect only sources and notes you have the right to use. Notes are treated as data: text in a note is never followed as an instruction by the service.",
        ],
      },
      {
        id: "acceptable-use",
        title: "Acceptable use",
        paragraphs: ["Do not use the service to:"],
        items: [
          "store or share content that is illegal where you or we are;",
          "reach another account's data, test the service's security without our written consent, or overload it;",
          "resell access to the hosted service.",
        ],
      },
      {
        id: "plans-and-payment",
        title: "Plans and payment",
        paragraphs: [
          "Each plan has limits on notes, storage and searches, shown on the site. Paid plans are billed in advance for a month or a year and give access for the period paid. Prices and taxes are shown before you pay.",
        ],
      },
      {
        id: "source-code",
        title: "Source code",
        paragraphs: [
          "The software is free and open source under the GNU Affero General Public License, version 3. The source code of this instance is linked at the bottom of every page, and you may run it yourself.",
        ],
      },
      {
        id: "availability-and-liability",
        title: "Availability and liability",
        paragraphs: [
          "We work to keep the service available and your data safe, but we provide it as it is, without a promise that it is always available or free of errors. Keep your own vault as the source of truth: the service holds copies only.",
          "To the extent the law allows, we are not liable for indirect losses, and our liability is limited to what you paid for the service in the last twelve months. Nothing in these terms limits rights the law gives you as a consumer.",
        ],
      },
      {
        id: "ending",
        title: "Ending your use",
        paragraphs: [
          "You can delete your account at any time from the panel. We may suspend or close an account that breaks these terms, and we will tell you why unless the law forbids it.",
        ],
      },
      {
        id: "changes",
        title: "Changes to these terms",
        paragraphs: [
          "When these terms change, the new text and a summary of the change are published here with the date it takes effect, and the change history below lists every version. We tell account holders of material changes before they take effect.",
        ],
      },
    ],
  } satisfies LegalDocumentCopy,
} as const;
