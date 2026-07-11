// Mock API layer. In a real app these would be real `fetch("/api/...")` calls
// to your backend — kept as local mock data + simulated latency here so this
// example runs standalone with no server. The shape (async functions
// returning typed-ish objects) mirrors what a real API client looks like, so
// the agent has a realistic pattern to follow if you ask it to wire up a new
// widget against "the API".

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getKpis() {
  await wait(150);
  return [
    { id: "revenue", label: "Revenue (MTD)", value: 482300, format: "currency", delta: 0.084 },
    { id: "orders", label: "Orders", value: 3204, format: "number", delta: 0.021 },
    { id: "churn", label: "Churn Rate", value: 0.021, format: "percent", delta: -0.004 },
  ];
}

export async function getRevenueTrend() {
  await wait(150);
  return [
    { day: "Mon", revenue: 58000 },
    { day: "Tue", revenue: 61200 },
    { day: "Wed", revenue: 59800 },
    { day: "Thu", revenue: 67300 },
    { day: "Fri", revenue: 72100 },
    { day: "Sat", revenue: 54200 },
    { day: "Sun", revenue: 48900 },
  ];
}

export async function getOrders({ status = "all" } = {}) {
  await wait(150);
  const orders = [
    { id: "#1042", customer: "Acme Co", amount: 1200, status: "paid" },
    { id: "#1043", customer: "Globex", amount: 860, status: "pending" },
    { id: "#1044", customer: "Initech", amount: 2430, status: "paid" },
    { id: "#1045", customer: "Umbrella Corp", amount: 990, status: "refunded" },
    { id: "#1046", customer: "Soylent LLC", amount: 1710, status: "paid" },
  ];
  return status === "all" ? orders : orders.filter((o) => o.status === status);
}
