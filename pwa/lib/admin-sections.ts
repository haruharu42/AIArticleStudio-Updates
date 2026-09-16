export type AdminSectionId =
  | "users"
  | "free-plan"
  | "sales"
  | "promotion"
  | "knowledge"
  | "security"
  | "operations";

export type AdminSection = {
  id: AdminSectionId;
  href: `/admin/${string}`;
  eyebrow: string;
  title: string;
  shortTitle: string;
  description: string;
};

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    id: "users",
    href: "/admin/users",
    eyebrow: "USERS & ACCESS",
    title: "ユーザー・利用権",
    shortTitle: "ユーザー・利用権",
    description: "ユーザー承認、停止・再開、PWA利用権、利用コードの発行と管理。",
  },
  {
    id: "free-plan",
    href: "/admin/free-trial",
    eyebrow: "FREE PLAN",
    title: "無料利用・回数制限",
    shortTitle: "無料利用設定",
    description: "無料ユーザーの日次回数、リセット時刻、個別利用状況を管理。",
  },
  {
    id: "sales",
    href: "/admin/sales",
    eyebrow: "SALES",
    title: "販売・アップグレード導線",
    shortTitle: "販売設定",
    description: "外部購入URL、利用コード、PWA向けStripe販売スイッチを管理。",
  },
  {
    id: "promotion",
    href: "/admin/promotion",
    eyebrow: "PROMOTION",
    title: "販売促進・SNS",
    shortTitle: "販売促進・SNS",
    description: "販売記事、SNS投稿、キャンペーンなどのプロモーション機能。",
  },
  {
    id: "knowledge",
    href: "/admin/knowledge",
    eyebrow: "KNOWLEDGE",
    title: "ナレッジ管理",
    shortTitle: "ナレッジ管理",
    description: "ジャンル・サブジャンル候補や学習候補を確認・承認。",
  },
  {
    id: "security",
    href: "/admin/security",
    eyebrow: "ADMIN MFA",
    title: "管理者MFA・認証器",
    shortTitle: "管理者MFA",
    description: "管理者のTOTP認証器を確認し、紛失対策用の予備認証器を管理。",
  },
  {
    id: "operations",
    href: "/admin/operations",
    eyebrow: "SECURITY & OPS",
    title: "セキュリティ・運用",
    shortTitle: "セキュリティ・運用",
    description: "セキュリティ監査、容量監視、運用イベントとシステム状態を確認。",
  },
] as const;

export const ADMIN_HOME_SHORTCUT_IDS: readonly AdminSectionId[] = [
  "users",
  "free-plan",
  "sales",
  "security",
  "operations",
];
