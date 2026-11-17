// Fills the operator's placeholders in the legal text from the instance's settings.
import { legalEn } from "../messages/legal.ts";
import type { Operator } from "../settings.ts";

/** Replaces `{operator}` and `{contact}`; an instance without them gets the neutral wording from the dictionary. */
export function fillOperator(text: string, operator: Operator | null): string {
  const name = operator?.name ?? legalEn.unnamedOperator;
  const contact = operator?.contact ?? legalEn.unnamedContact;
  return text.replaceAll("{operator}", name).replaceAll("{contact}", contact);
}
