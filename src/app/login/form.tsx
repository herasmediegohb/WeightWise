"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";
import { Button, Field } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        error={state?.error}
      />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Sign in
      </Button>
    </form>
  );
}
