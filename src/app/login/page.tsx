import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Logo } from "@/components/nav";
import { SESSION_COOKIE, authConfigured, authRequired, verifySessionToken } from "@/lib/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!authRequired()) redirect("/");
  if (await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <Logo size={44} />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">WeightWise</h1>
      {authConfigured() ? (
        <>
          <p className="mt-2 text-muted">Enter your password to continue.</p>
          <LoginForm />
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed">
          <p className="font-semibold">One step left</p>
          <p className="mt-1 text-muted">
            Set an <code className="font-mono text-fg">APP_PASSWORD</code> environment variable in your
            Vercel project, then redeploy. The app stays locked until you do.
          </p>
        </div>
      )}
    </main>
  );
}
