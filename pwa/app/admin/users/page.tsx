import { PwaAdminUsersPage as Phase10AdminPage } from "@/components/pwa-admin-users-page";

import polish from "./admin-users-polish.module.css";
import styles from "./admin-users-page.module.css";

export default function AdminUsersPage() {
  return (
    <div className={`${styles.scope} ${polish.polish}`}>
      <Phase10AdminPage />
    </div>
  );
}
