import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("admin promotion supports verified prelaunch test and release updates", async () => {
  const [lib, page] = await Promise.all([
    read("lib/admin-promotion.ts"),
    read("components/admin-promotion-page.tsx"),
  ]);

  assert.match(lib, /testingStatus: string/);
  assert.match(lib, /testingNotes: string/);
  assert.match(lib, /releasePlan: string/);
  assert.match(lib, /referenceUrl: string/);
  assert.match(lib, /buildAdminPreviewPromotionPrompt/);
  assert.match(lib, /販売前・テスト中の段階では/);
  assert.match(lib, /実際に確認していない成果・PV・売上・反応・レビュー・感想を作らない/);

  assert.match(page, /key: "preview"/);
  assert.match(page, /テスト・公開予告/);
  assert.match(page, /今回共有してよい確認済み内容/);
  assert.match(page, /公開・販売予定/);
  assert.match(page, /販売前モード/);
  assert.match(page, /useSharedAccessState\(\)/);
  assert.doesNotMatch(page, /loadAccessState/);
});

test("SNS promotion exposes per-platform length presets including paid X long posts", async () => {
  const [lib, page, fields] = await Promise.all([
    read("lib/admin-promotion.ts"),
    read("components/admin-promotion-page.tsx"),
    read("components/admin-promotion/admin-promotion-fields.tsx"),
  ]);

  assert.match(lib, /x-premium-25000/);
  assert.match(lib, /X Premium 最大 25,000文字/);
  assert.match(lib, /threads-attach-10000/);
  assert.match(lib, /Threadsの長文テキスト添付上限/);
  assert.match(lib, /youtube-max/);
  assert.match(lib, /概要欄 最大5,000文字/);
  assert.match(lib, /targetChars: number/);
  assert.match(lib, /目標文字数: 1案あたり約\$\{targetChars\}文字/);
  assert.match(lib, /各投稿本文は目標文字数を超えない/);

  assert.match(page, /from "@\/components\/admin-promotion\/admin-promotion-fields"/);
  assert.match(fields, /SNSごとの文字数設定/);
  assert.match(fields, /SOCIAL_PLATFORM_OPTIONS/);
  assert.match(fields, /その他・自由入力/);
  assert.match(fields, /sanitizeSocialTargetChars/);
  assert.match(fields, /Xは標準投稿とPremium長文/);
  assert.match(fields, /Threadsは通常投稿500文字と最大10,000文字/);
  assert.match(fields, /YouTube Shortsはタイトル100文字以内/);
});

test("campaign and preview prompts inherit the same SNS length plan", async () => {
  const [lib, page] = await Promise.all([
    read("lib/admin-promotion.ts"),
    read("components/admin-promotion-page.tsx"),
  ]);

  assert.match(lib, /type AdminSocialLengthPlan = Record<AdminSocialPlatform, number>/);
  assert.match(lib, /buildAdminCampaignPrompt[\s\S]*?socialLengthPlanBlock\(input\.socialLengths\)/);
  assert.match(lib, /buildAdminPreviewPromotionPrompt[\s\S]*?socialLengthPlanBlock\(input\.socialLengths\)/);
  assert.doesNotMatch(lib, /buildAdminArticlePromotionPrompt[\s\S]{0,2200}socialLengthPlanBlock\(input\.socialLengths\)/);

  assert.match(page, /buildAdminCampaignPrompt\(facts, \{ \.\.\.campaign, socialLengths \}\)/);
  assert.match(page, /buildAdminPreviewPromotionPrompt\(facts, \{ \.\.\.preview, socialLengths \}\)/);
  assert.match(page, /<SocialLengthSettings presetIds=\{socialPresetIds\} plan=\{socialLengths\}/);
});

test("promotion UI is dropdown-first and remains responsive on phones", async () => {
  const [page, lib, css] = await Promise.all([
    read("components/admin-promotion-page.tsx"),
    read("lib/admin-promotion.ts"),
    read("app/phase24-admin-promotion.css"),
  ]);

  assert.match(page, /かんたん作成/);
  assert.match(page, /① 作りたいもの/);
  assert.match(page, /② おすすめプリセット/);
  assert.match(page, /QUICK_PRESETS/);
  assert.match(page, /applyQuickPreset/);
  assert.match(page, /現在の販売設定を確認/);
  assert.match(page, /AI Action Studio（AAS）/);
  assert.doesNotMatch(lib, /AI Article Studio/);
  assert.match(lib, /productName: "AI Action Studio"/);
  assert.match(lib, /12種類の副業専用ウィザード/);
  assert.match(css, /\.admin-promo-quick-start/);
  assert.match(css, /\.admin-promo-quick-grid/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.admin-promo-quick-grid/);
  assert.match(css, /\.admin-promo-length-grid/);
});


test("sales promotion center supports a safe three-step auto setup", async () => {
  const [page, css] = await Promise.all([
    read("components/admin-promotion-page.tsx"),
    read("app/phase24-admin-promotion.css"),
  ]);

  assert.match(page, /3ステップかんたん販促/);
  assert.match(page, /① 販売する商品・プラン/);
  assert.match(page, /② 販売先・誘導先/);
  assert.match(page, /③ 宣伝方法/);
  assert.match(page, /SALES_PRODUCT_OPTIONS/);
  assert.match(page, /SALES_CHANNEL_OPTIONS/);
  assert.match(page, /PROMOTION_METHOD_OPTIONS/);
  assert.match(page, /applyThreeStepPromotion/);
  assert.match(page, /type AdminArticlePromotionInput/);
  assert.match(page, /useState<AdminArticlePromotionInput>/);
  assert.match(page, /sellingConfirmed/);
  assert.match(page, /販売中の確認がないため販売前表現で設定/);
  assert.match(page, /販売設定そのものは変更しません/);
  assert.match(page, /AAS内Stripe（設定時のみ）/);
  assert.match(page, /PWA 7日利用パス（設定時のみ）/);
  assert.match(page, /PWA 月額プラン（設定時のみ）/);
  assert.match(page, /Stripe・7日券・月額を選んでも販売受付は有効化されません/);
  assert.match(css, /\.admin-promo-three-step/);
  assert.match(css, /\.admin-promo-three-step-grid/);
  assert.match(css, /@media \(max-width: 880px\)[\s\S]*?\.admin-promo-three-step-grid/);
});
