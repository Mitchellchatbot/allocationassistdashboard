import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const Settings = () => (
  <DashboardLayout title="Settings" subtitle="Account and notification preferences">
    <div className="max-w-xl space-y-4">
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[13px] font-semibold">Organization</CardTitle>
          <CardDescription className="text-[11px]">Company details</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Company Name</Label>
            <Input defaultValue="Allocation Assist" className="h-8 text-[12px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Contact Email</Label>
            <Input defaultValue="info@allocationassist.com" className="h-8 text-[12px]" />
          </div>
          <Button size="sm" className="h-7 text-[11px]">Save</Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[13px] font-semibold">Notifications</CardTitle>
          <CardDescription className="text-[11px]">Alert preferences</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {[
            { label: "New doctor applications", desc: "Notify when a doctor applies", default: true },
            { label: "Pipeline bottleneck alerts", desc: "Alert when doctors are stuck in a stage", default: true },
            { label: "Licensing updates", desc: "License approval and rejection notifications", default: true },
            { label: "Weekly performance digest", desc: "Weekly email with key metrics", default: false },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium">{item.label}</p>
                <p className="text-[10px] text-muted-foreground">{item.desc}</p>
              </div>
              <Switch defaultChecked={item.default} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>
);

export default Settings;
