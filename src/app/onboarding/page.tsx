import { redirect } from "next/navigation";
import { SetupProblem } from "@/components/setup-problem";
import { problemFrom } from "@/lib/db-health";
import { getProfile, getWeights } from "@/lib/data";
import { getClock } from "@/lib/session";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let profile, weights;
  try {
    [profile, weights] = await Promise.all([getProfile(), getWeights()]);
  } catch (err) {
    console.error("[onboarding]", err);
    return <SetupProblem problem={problemFrom(err)} />;
  }
  const clock = await getClock();
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
