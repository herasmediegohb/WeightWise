import { redirect } from "next/navigation";
import { getProfile, getWeights } from "@/lib/data";
import { getClock } from "@/lib/session";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const [profile, weights, clock] = await Promise.all([getProfile(), getWeights(), getClock()]);
  if (profile) redirect("/");
  return (
    <Onboarding
      today={clock.today}
      tz={clock.tz}
      existing={
        weights.length
          ? {
              earliest: { date: weights[0].date, weightLb: weights[0].weightLb },
              latest: { date: weights[weights.length - 1].date, weightLb: weights[weights.length - 1].weightLb },
              count: weights.length,
            }
          : null
      }
    />
  );
}
