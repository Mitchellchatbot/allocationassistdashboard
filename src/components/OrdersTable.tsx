import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { recentOrders } from "@/lib/mock-data";

const statusStyles: Record<string, string> = {
  completed: "bg-success/15 text-success border-success/30 hover:bg-success/20",
  processing: "bg-warning/15 text-warning border-warning/30 hover:bg-warning/20",
  shipped: "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20",
};

const OrdersTable = () => {
  return (
    <Card className="gradient-card border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Recent Orders
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">Order</TableHead>
              <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">Customer</TableHead>
              <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">Amount</TableHead>
              <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-muted-foreground text-xs uppercase tracking-wider text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentOrders.map((order) => (
              <TableRow key={order.id} className="border-border/30 hover:bg-secondary/50">
                <TableCell className="font-display text-sm font-medium">{order.id}</TableCell>
                <TableCell className="text-sm">{order.customer}</TableCell>
                <TableCell className="font-display text-sm font-medium">{order.amount}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusStyles[order.status]}>
                    {order.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground text-right">{order.date}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default OrdersTable;
