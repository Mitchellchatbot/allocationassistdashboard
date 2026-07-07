import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AnimatedTabsList, AnimatedTabContent, AnimatedTabPanel, type AnimatedTabItem } from "@/components/AnimatedTabs";
import { Library, Mail, Hospital as HospitalIcon } from "lucide-react";
import { EmailTemplatesTab } from "@/components/automations/EmailTemplatesTab";
import { HospitalsTab } from "@/components/automations/HospitalsTab";
import { HospitalTemplatesManager } from "@/components/automations/HospitalTemplatesManager";

/**
 * Information — the single home for the content the sends run on: every email
 * template (across all flows/sections) and every hospital (photos, contacts, and
 * the per-hospital emails). Pulled out of the Automations admin tabs + the
 * Profile Sent page so there's one arranged place to see and customise it all.
 */
const TABS: AnimatedTabItem[] = [
  { value: "templates", label: <><Mail className="h-3.5 w-3.5" /> All templates</> },
  { value: "hospitals", label: <><HospitalIcon className="h-3.5 w-3.5" /> Hospitals</> },
];

export default function Information() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("tab") === "hospitals" ? "hospitals" : "templates";
  const [tab, setTab] = useState<string>(initial);

  const onChange = (v: string) => {
    setTab(v);
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Library className="h-6 w-6 text-teal-600" />
            Information
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[760px]">
            One home for the content your emails run on — every template across all flows, and every hospital with its
            photo, contacts, and its own working-opportunity email. View and customise it all here.
          </p>
        </div>

        <AnimatedTabsList items={TABS} value={tab} onChange={onChange} groupId="information" />

        <AnimatedTabContent active={tab}>
          <AnimatedTabPanel value="templates" active={tab}>
            <EmailTemplatesTab />
          </AnimatedTabPanel>
          <AnimatedTabPanel value="hospitals" active={tab}>
            <div className="space-y-5">
              {/* Photos + per-hospital working-opportunity emails (+ Add hospital) */}
              <HospitalTemplatesManager />
              {/* Full registry: contacts, recruiter routing, notes */}
              <HospitalsTab />
            </div>
          </AnimatedTabPanel>
        </AnimatedTabContent>
      </div>
    </DashboardLayout>
  );
}
