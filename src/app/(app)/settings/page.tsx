import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/settings-form";
import { aiConfigured } from "@/lib/ai";
import { authConfigured } from "@/lib/auth";
import { suggestCalorieTarget } from "@/lib/calc";
import { getOverview, getProfile } from "@/lib/data";
import { getClock } from "@/lib/session";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const p = await getProfile();
  if (!p) redirect("/onboarding");
  const { today } = await getClock();
  const o = await getOverview(p, today);
  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <h1 className="mb-5 text-3xl font-semibold tracking-tight">Settings</h1>
      <SettingsForm
        today={today}
        expenditure={o.expenditure.kcal}
        suggestedCalories={suggestCalorieTarget(o.expenditure.kcal, p.paceLbPerWeek, p.sex)}
        aiEnabled={aiConfigured()}
        authEnabled={authConfigured()}
        initial={{
          name: p.name,
          birthdate: p.birthdate,
          sex: p.sex,
          heightIn: p.heightIn,
          startWeightLb: p.startWeightLb,
          startDate: p.startDate,
          goalWeightLb: p.goalWeightLb,
          paceLbPerWeek: p.paceLbPerWeek,
          activityLevel: p.activityLevel,
          calorieTarget: p.calorieTarget,
          proteinTargetG: p.proteinTargetG,
          waterTargetOz: p.waterTargetOz,
        }}
      />
    </div>
  );
}
