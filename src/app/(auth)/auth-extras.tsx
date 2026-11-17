// The column under an auth module page, in the page's width, for what the module's page has no slot for.
import type { ReactNode } from "react";

export function AuthExtras({ children }: { readonly children: ReactNode }) {
  return <div className="mx-auto box-border grid w-full gap-3 px-4 pb-8 sm:max-w-md">{children}</div>;
}
