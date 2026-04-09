import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useZohoPipeline, PAGE_SIZE } from "@/hooks/use-zoho-pipeline";
import { ArrowRight, AlertTriangle, CheckCircle, Clock, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const statusConfig = {
  "on-track": { label: "On Track", className: "bg-success/10 text-success border-success/20", icon: CheckCircle },
  "at-risk": { label: "Needs Attention", className: "bg-warning/10 text-warning border-warning/20", icon: Clock },
  "delayed": { label: "Delayed", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
};

const LeadsPipeline = () => {
  const { workflow } = useFilteredData();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading, isError } = useZohoPipeline(page, search);
  const doctors = data?.doctors ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(0); // reset to first page on new search
  };

  return (
    <DashboardLayout title="Doctor Progress" subtitle="Track each doctor's journey from application to placement">
      <Card className="mb-5 shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Where Doctors Are Right Now</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
            {workflow.map((stage, i) => (
              <div key={stage.name} className="flex items-center gap-1.5">
                <div className="rounded-lg border border-kpi/60 bg-kpi px-3 py-2.5 text-center min-w-[100px] hover:shadow-md hover:scale-[1.02] transition-all duration-200">
                  <p className="text-lg font-semibold text-foreground tabular-nums">{stage.count}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">{stage.name}</p>
                </div>
                {i < workflow.length - 1 && <ArrowRight className="h-3 w-3 text-primary/30 shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
              All Doctors ({total.toLocaleString()})
            </CardTitle>
            <div className="relative w-full sm:w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search by name, specialty..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="h-7 pl-7 text-[11px] bg-secondary/50 border-0"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <p className="text-[12px] text-muted-foreground py-8 text-center">Loading leads…</p>
          ) : doctors.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-8 text-center">
              {search ? "No doctors match your search" : "No leads found for selected region"}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 px-4">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wide h-8">ID</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8">Doctor</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden sm:table-cell">Specialty</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8">Current Step</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden md:table-cell">From → To</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden lg:table-cell">License Type</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden lg:table-cell">Recruiter</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Days in Step</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doctors.map(doc => {
                      const st = statusConfig[doc.status];
                      const StIcon = st.icon;
                      return (
                        <TableRow key={doc.id} className="hover:bg-muted/30">
                          <TableCell className="text-[10px] font-mono text-muted-foreground py-2.5">{doc.id}</TableCell>
                          <TableCell className="text-[12px] font-medium py-2.5">{doc.name}</TableCell>
                          <TableCell className="text-[11px] text-muted-foreground py-2.5 hidden sm:table-cell">{doc.specialty}</TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant="outline" className="text-[9px] font-medium">{doc.stage}</Badge>
                          </TableCell>
                          <TableCell className="text-[10px] text-muted-foreground py-2.5 hidden md:table-cell">{doc.origin} → {doc.destination}</TableCell>
                          <TableCell className="text-[10px] font-medium py-2.5 hidden lg:table-cell">{doc.license}</TableCell>
                          <TableCell className="text-[11px] text-muted-foreground py-2.5 hidden lg:table-cell">{doc.assignedTo}</TableCell>
                          <TableCell className="text-[12px] text-right font-medium py-2.5 tabular-nums">{doc.daysInStage}</TableCell>
                          <TableCell className="py-2.5">
                            <div className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${st.className}`}>
                              <StIcon className="h-2.5 w-2.5" />{st.label}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-border/50 mt-3">
                  <p className="text-[11px] text-muted-foreground">
                    Page {page + 1} of {totalPages.toLocaleString()} — {total.toLocaleString()} total
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default LeadsPipeline;
