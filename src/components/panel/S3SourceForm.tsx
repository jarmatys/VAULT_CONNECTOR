"use client";
// The S3 form. A client component only to keep what the account typed after a refused attempt and to show the check in
// progress; the location comes back filled in, the key never does.
import { Button, Card, CardContent, CardFooter, Field, FieldDescription, FieldGroup, FieldLabel, FormGrid, Input } from "@softure-ai/theme-notion";
import Link from "next/link";
import { useActionState } from "react";
import type { S3FormState } from "../../app/(panel)/panel/source/s3/form-state.ts";
import { en } from "../../messages/en.ts";

interface S3SourceFormProps {
  readonly action: (previous: S3FormState, formData: FormData) => Promise<S3FormState>;
  readonly initial: S3FormState;
  readonly cancelHref: string;
}

export function S3SourceForm({ action, initial, cancelHref }: S3SourceFormProps) {
  const [state, submit, isPending] = useActionState(action, initial);
  const { values } = state;
  return (
    <Card>
      <form action={submit} className="grid gap-6" data-testid="s3-form">
        <CardContent className="grid gap-6">
          {state.error !== null && (
            <p role="alert" className="rounded-lg bg-red-bg px-4 py-3 text-body text-red" data-testid="s3-error">
              {en.s3.errors[state.error]}
            </p>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="s3-endpoint">{en.s3.endpoint}</FieldLabel>
              <Input id="s3-endpoint" name="endpoint" type="url" inputMode="url" required autoComplete="off" spellCheck={false} defaultValue={values.endpoint} placeholder="https://" />
              <FieldDescription>{en.s3.endpointHint}</FieldDescription>
            </Field>
            <FormGrid columns={2}>
              <Field>
                <FieldLabel htmlFor="s3-bucket">{en.s3.bucket}</FieldLabel>
                <Input id="s3-bucket" name="bucket" required autoComplete="off" spellCheck={false} defaultValue={values.bucket} />
              </Field>
              <Field>
                <FieldLabel htmlFor="s3-region">{en.s3.region}</FieldLabel>
                <Input id="s3-region" name="region" autoComplete="off" spellCheck={false} defaultValue={values.region} placeholder="auto" />
                <FieldDescription>{en.s3.regionHint}</FieldDescription>
              </Field>
            </FormGrid>
            <Field>
              <FieldLabel htmlFor="s3-prefix">{en.s3.prefix}</FieldLabel>
              <Input id="s3-prefix" name="prefix" autoComplete="off" spellCheck={false} defaultValue={values.prefix} />
              <FieldDescription>{en.s3.prefixHint}</FieldDescription>
            </Field>
            <FormGrid columns={2}>
              <Field>
                <FieldLabel htmlFor="s3-access-key-id">{en.s3.accessKeyId}</FieldLabel>
                <Input id="s3-access-key-id" name="accessKeyId" required autoComplete="off" spellCheck={false} />
              </Field>
              <Field>
                <FieldLabel htmlFor="s3-secret-access-key">{en.s3.secretAccessKey}</FieldLabel>
                <Input id="s3-secret-access-key" name="secretAccessKey" type="password" required autoComplete="new-password" spellCheck={false} />
              </Field>
            </FormGrid>
            <FieldDescription>{en.s3.keysHint}</FieldDescription>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending ? en.s3.submitting : en.s3.submit}
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href={cancelHref}>{en.s3.cancel}</Link>
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
