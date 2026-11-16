import { redirect } from "next/navigation";
import { BottomNav, Sidebar } from "@/components/nav";
import { TzSync } from "@/components/tz-sync";
import { getProfile } from "@/lib/data";
import { getClock } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, clock] = await Promise.all([getProfile(), getClock()]);
  if (!profile) redirect("/onboarding");
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-lime focus:px-4 focus:py-2 focus:font-semibold focus:text-on-lime"
      >
        Skip to content
      </a>
      <TzSync current={clock.tz} />
      <Sidebar name={profile.name} />
      <main
        id="main"
        className="mx-auto w-full max-w-xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] lg:ml-60 lg:max-w-none lg:px-10 lg:pb-12 lg:pt-10"
      >
        <div className="lg:mx-auto lg:max-w-5xl">{children}</div>
      </main>
      <BottomNav />
    </>
  );
}
