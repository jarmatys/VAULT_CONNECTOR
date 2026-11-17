"use client";
// Picking an end-to-end encrypted vault. The vault's encryption password is typed here and turned into the vault's key
// in the browser (the same scrypt the note app's clients run); only the key is sent. The password field has no `name`,
// so it is never part of the submitted form, and it is cleared once the key is derived.
import { Button, Field, FieldDescription, FieldLabel, Input } from "@softure-ai/theme-notion";
import { useRef, useState, type FormEvent } from "react";
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
  const [phase, setPhase] = useState<"idle" | "deriving" | "submitting">("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    if (keyRef.current === null || passwordRef.current === null || formRef.current === null) return;
    if (keyRef.current.value !== "") return;
    event.preventDefault();
    const password = passwordRef.current.value;
    if (password === "") return;
    setPhase("deriving");
    keyRef.current.value = toHex(await deriveVaultKey(password, salt));
    passwordRef.current.value = "";
    setPhase("submitting");
    formRef.current.requestSubmit();
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
        <Button type="submit" size="lg" disabled={phase !== "idle"}>
          {phase === "deriving" ? en.headlessSync.deriving : phase === "submitting" ? en.headlessSync.connecting : en.headlessSync.connect}
        </Button>
      </div>
    </form>
  );
}
