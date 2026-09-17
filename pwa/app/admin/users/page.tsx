import { PwaAdminUsersPage as Phase10AdminPage } from "@/components/pwa-admin-users-page";

import styles from "./admin-users-page.module.css";

export default function AdminUsersPage() {
  return (
    <div className={styles.scope}>
      <Phase10AdminPage />
    </div>
  );
}
