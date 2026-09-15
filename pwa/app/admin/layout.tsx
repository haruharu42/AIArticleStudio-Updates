import type { ReactNode } from "react";

import { AdminRouteGuard } from "@/components/admin-route-guard";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminRouteGuard>{children}</AdminRouteGuard>;
}
