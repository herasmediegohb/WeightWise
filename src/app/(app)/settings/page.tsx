import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { BackupSettings } from "@/components/backup-settings";
import { ReminderSettings } from "@/components/reminder-settings";
import { SettingsForm } from "@/components/settings-form";
import { getDb, schema } from "@/db";
import { listBackups, offsiteConfigured } from "@/lib/backup";
import { getVapidKeys } from "@/lib/push";
import { lastTick } from "@/lib/scheduler";
import { aiConfigured } from "@/lib/ai";
import { authConfigured } from "@/lib/auth";
import { suggestCalorieTarget } from "@/lib/calc";
import { getOverview, getProfile } from "@/lib/data";
import { getClock } from "@/lib/session";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const p = await getProfile();
  if (!p) redirect("/onboarding");
  const { today, tz, nowMs } = await getClock();
  const db = await getDb();
  const [o, { publicKey }, tick, backups, [{ devices }]] = await Promise.all([
    getOverview(p, today),
    getVapidKeys(),
    lastTick(),
    listBackups(),
    db.select({ devices: sql<number>`count(*)`.mapWith(Number) }).from(schema.pushSubscriptions),
  ]);
  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <h1 className="mb-5 text-3xl font-semibold tracking-tight">Settings</h1>
      <div className="mb-4">
        <ReminderSettings
          publicKey={publicKey}
          devices={devices}
          weighIn={p.reminderWeighIn}
          water={p.reminderWater}
          checkin={p.notifyCheckin}
          lastTick={tick?.toISOString() ?? null}
          serverNow={nowMs}
        />
      </div>
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
        backups={
          <BackupSettings
            offsite={offsiteConfigured()}
            tz={tz}
            backups={backups.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() }))}
          />
        }
      />
    </div>
  );
}
