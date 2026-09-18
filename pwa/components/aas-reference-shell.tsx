"use client";

import Link from "next/link";

export type ReferenceNavKey = "home" | "create" | "library" | "ranking" | "profile";

export function AasReferenceHeader({
  hasUnreadNotifications = false,
}: {
  hasUnreadNotifications?: boolean;
} = {}) {
  return (
    <header className="aas-reference-header">
      <Link className="aas-reference-brand" href="/" aria-label="AI Article Studio ホーム">
        <strong>AAS</strong>
        <span>
          <b>AI Article Studio</b>
          <small>書くを、もっとシンプルに。</small>
        </span>
      </Link>
      <nav className="aas-reference-header-actions" aria-label="クイックメニュー">
        <Link href="/missions" aria-label="ミッション・お知らせ"><span aria-hidden="true">♧</span>{hasUnreadNotifications ? <i aria-hidden="true" /> : null}</Link>
        <Link href="/settings" aria-label="メニュー"><span aria-hidden="true">☰</span></Link>
      </nav>
    </header>
  );
}

function NavItem({
  active,
  href,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  href: string;
  icon: string;
  label: string;
  onClick?: () => void;
}) {
  const className = active ? "active" : "";
  if (onClick) {
    return (
      <button className={className} type="button" aria-current={active ? "page" : undefined} onClick={onClick}>
        <span aria-hidden="true">{icon}</span>
        {label}
      </button>
    );
  }
  return (
    <Link className={className} href={href} aria-current={active ? "page" : undefined}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </Link>
  );
}

export function AasReferenceBottomNav({
  active,
  onLibrary,
}: {
  active: ReferenceNavKey;
  onLibrary?: () => void;
}) {
  return (
    <nav className="aas-reference-bottom-nav" aria-label="メインナビゲーション">
      <NavItem active={active === "home"} href="/" icon="⌂" label="ホーム" />
      <NavItem active={active === "create"} href="/create" icon="＋" label="作成" />
      <NavItem active={active === "library"} href="/?section=library" icon="▤" label="ライブラリ" onClick={onLibrary} />
      <NavItem active={active === "ranking"} href="/ranking" icon="♛" label="ランキング" />
      <NavItem active={active === "profile"} href="/profile" icon="♙" label="プロフィール" />
    </nav>
  );
}
