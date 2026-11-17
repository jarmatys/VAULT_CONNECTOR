"use client";
// Picking an end-to-end encrypted vault. The vault's encryption password is typed here and turned into the vault's key
// in the browser (the same scrypt the note app's clients run); only the key is sent. The password field has no `name`,
// so it is never part of the submitted form. Each attempt starts clean: the key and the password are cleared as soon as
// the form's data is taken, so a refused key is never sent again on the next try.
import { Button, Field, FieldDescription, FieldLabel, Input } from "@softure-ai/theme-notion";
import { useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { deriveVaultKey, toHex } from "../../vault/sources/headless-sync/sync-crypto.ts";
import { en } from "../../messages/en.ts";

interface SyncVaultKeyFormProps {
  readonly action: (formData: FormData) => Promise<never>;
  readonly vaultId: string;
  readonly salt: string;
}

export function SyncVaultKeyForm({ action, vaultId, salt }: SyncVaultKeyFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  /** True only while the form is resubmitted with the derived key, so that submit goes through to the action. */
  const isPassingKey = useRef(false);
  const [isDeriving, setIsDeriving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    if (isPassingKey.current) return;
    event.preventDefault();
    const form = formRef.current;
    const keyInput = keyRef.current;
    const passwordInput = passwordRef.current;
    if (form === null || keyInput === null || passwordInput === null || passwordInput.value === "") return;
    setIsDeriving(true);
    try {
      keyInput.value = toHex(await deriveVaultKey(passwordInput.value, salt));
    } finally {
      setIsDeriving(false);
    }
    // The submit event runs synchronously inside requestSubmit, which also validates the required password field, so
    // both inputs are cleared only after it returns, once the action has its form data.
    isPassingKey.current = true;
    try {
      form.requestSubmit();
    } finally {
      isPassingKey.current = false;
      keyInput.value = "";
      passwordInput.value = "";
    }
  }

  const inputId = `sync-e2ee-${vaultId}`;
  return (
    <form ref={formRef} action={action} onSubmit={(event) => void onSubmit(event)} className="grid gap-4" data-testid="sync-e2ee-form">
      <input type="hidden" name="vaultId" value={vaultId} />
      <input ref={keyRef} type="hidden" name="key" defaultValue="" />
      <Field>
        <FieldLabel htmlFor={inputId}>{en.headlessSync.e2eePassword}</FieldLabel>
        <Input ref={passwordRef} id={inputId} type="password" required autoComplete="off" spellCheck={false} data-testid="sync-e2ee-password" />
        <FieldDescription>{en.headlessSync.e2eeBody}</FieldDescription>
      </Field>
      <div>
        <ConnectButton isDeriving={isDeriving} />
      </div>
    </form>
  );
}

function ConnectButton({ isDeriving }: { readonly isDeriving: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={isDeriving || pending}>
      {isDeriving ? en.headlessSync.deriving : pending ? en.headlessSync.connecting : en.headlessSync.connect}
    </Button>
  );
}
