import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

const Settings = () => {
  return (
    <DashboardLayout title="Settings" subtitle="Manage your account and preferences">
      <div className="max-w-2xl space-y-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-display">Organization</CardTitle>
            <CardDescription className="text-xs">Company information and branding</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Company Name</Label>
              <Input defaultValue="Allocation Assist" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Primary Contact Email</Label>
              <Input defaultValue="admin@allocationassist.com" className="h-9 text-sm" />
            </div>
            <Button size="sm">Save Changes</Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-display">Notifications</CardTitle>
            <CardDescription className="text-xs">Configure alert preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "New lead notifications", desc: "Get notified when a new lead is assigned", default: true },
              { label: "Pipeline alerts", desc: "Alert when leads are stuck in a stage", default: true },
              { label: "Weekly digest", desc: "Receive a weekly performance summary", default: false },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch defaultChecked={item.default} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
