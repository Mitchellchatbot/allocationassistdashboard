export const kpiData = [
  { label: "Total Revenue", value: "$284,520", change: +12.5, prefix: "" },
  { label: "Orders", value: "1,847", change: +8.2, prefix: "" },
  { label: "Avg Order Value", value: "$154.02", change: -2.1, prefix: "" },
  { label: "Conversion Rate", value: "3.24%", change: +0.8, prefix: "" },
];

export const revenueData = [
  { month: "Jan", revenue: 18200, orders: 120 },
  { month: "Feb", revenue: 21400, orders: 142 },
  { month: "Mar", revenue: 19800, orders: 131 },
  { month: "Apr", revenue: 24600, orders: 163 },
  { month: "May", revenue: 27100, orders: 178 },
  { month: "Jun", revenue: 25300, orders: 167 },
  { month: "Jul", revenue: 29800, orders: 195 },
  { month: "Aug", revenue: 31200, orders: 208 },
  { month: "Sep", revenue: 28400, orders: 187 },
  { month: "Oct", revenue: 33100, orders: 219 },
  { month: "Nov", revenue: 35600, orders: 237 },
  { month: "Dec", revenue: 38900, orders: 256 },
];

export const categoryData = [
  { name: "Electronics", sales: 42300 },
  { name: "Clothing", sales: 35800 },
  { name: "Home & Garden", sales: 28100 },
  { name: "Sports", sales: 19400 },
  { name: "Books", sales: 12600 },
];

export const recentOrders = [
  { id: "#ORD-7291", customer: "Sarah Chen", amount: "$342.00", status: "completed" as const, date: "Mar 30" },
  { id: "#ORD-7290", customer: "Marcus Webb", amount: "$128.50", status: "processing" as const, date: "Mar 30" },
  { id: "#ORD-7289", customer: "Elena Rossi", amount: "$567.20", status: "completed" as const, date: "Mar 29" },
  { id: "#ORD-7288", customer: "James Park", amount: "$89.99", status: "shipped" as const, date: "Mar 29" },
  { id: "#ORD-7287", customer: "Ava Mitchell", amount: "$234.00", status: "completed" as const, date: "Mar 28" },
  { id: "#ORD-7286", customer: "Liam Torres", amount: "$445.80", status: "processing" as const, date: "Mar 28" },
];
