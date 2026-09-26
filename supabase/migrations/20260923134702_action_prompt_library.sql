create table if not exists public.action_prompt_categories (
  id uuid primary key default gen_random_uuid(),
  category_key text not null unique check (category_key ~ '^[a-z0-9_-]{2,64}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  description text not null default '',
  icon text not null default '⌘' check (char_length(icon) between 1 and 16),
  sort_order integer not null default 100 check (sort_order between 0 and 100000),
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.action_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{2,79}$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category_key text not null references public.action_prompt_categories(category_key) on update cascade,
  side_hustle text not null default '' check (char_length(side_hustle) <= 120),
  description text not null default '' check (char_length(description) <= 500),
  recommended_ai text not null default 'ChatGPT' check (recommended_ai in ('ChatGPT','Claude','Gemini')),
  input_schema jsonb not null default '[]'::jsonb check (jsonb_typeof(input_schema) = 'array'),
  prompt_template text not null check (char_length(btrim(prompt_template)) between 1 and 30000),
  status text not null default 'draft' check (status in ('draft','active','inactive')),
  sort_order integer not null default 100 check (sort_order between 0 and 100000),
  version integer not null default 1 check (version >= 1),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.action_prompt_categories enable row level security;
alter table public.action_prompt_templates enable row level security;

revoke all on table public.action_prompt_categories from anon, public;
revoke all on table public.action_prompt_templates from anon, public;
grant select, insert, update on table public.action_prompt_categories to authenticated;
grant select, insert, update on table public.action_prompt_templates to authenticated;

create policy "active users read prompt categories"
on public.action_prompt_categories
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (action_prompt_categories.status = 'active' or p.role = 'admin')
  )
);

create policy "active admins insert prompt categories"
on public.action_prompt_categories
for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  )
);

create policy "active admins update prompt categories"
on public.action_prompt_categories
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  )
);

create policy "active users read prompt templates"
on public.action_prompt_templates
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          action_prompt_templates.status = 'active'
          and exists (
            select 1
            from public.action_prompt_categories c
            where c.category_key = action_prompt_templates.category_key
              and c.status = 'active'
          )
        )
      )
  )
);

create policy "active admins insert prompt templates"
on public.action_prompt_templates
for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  )
);

create policy "active admins update prompt templates"
on public.action_prompt_templates
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  )
);

insert into public.action_prompt_categories(category_key, display_name, description, icon, sort_order, status)
values
  ('content','記事・コンテンツ','note・Brain・Tips・ブログなどの記事や有料コンテンツ。','✎',10,'active'),
  ('sns','SNS','X・Instagram・Threadsなどの発信と運用。','↗',20,'active'),
  ('video','動画・YouTube','YouTube・ショート動画の企画、構成、台本。','▶',30,'active'),
  ('design','画像・デザイン','画像生成、サムネイル、バナーなどの指示作成。','▧',40,'active'),
  ('affiliate','アフィリエイト','比較軸、企画、読者の購入判断支援。','¥',50,'active'),
  ('sales','物販・販売','商品説明、販売ページ、デジタル商品の販売支援。','▣',60,'active'),
  ('crowdwork','クラウドソーシング','案件応募、提案、受託作業の整理。','◇',70,'active'),
  ('research','リサーチ','市場・競合・テーマの調査設計。','⌕',80,'active'),
  ('efficiency','業務効率化','繰り返し作業の手順化・テンプレート化。','◎',90,'active')
on conflict(category_key) do nothing;

insert into public.action_prompt_templates
(slug,title,category_key,side_hustle,description,recommended_ai,input_schema,prompt_template,status,sort_order)
values
('note-article-plan','note記事の企画・構成','content','note副業','テーマから読者ニーズ、タイトル案、見出し構成、執筆方針をまとめます。','ChatGPT',
'[{"key":"topic","label":"記事テーマ","placeholder":"例：AI初心者向けの副業","multiline":false},{"key":"audience","label":"想定する相手","placeholder":"例：30代会社員、初心者","multiline":false},{"key":"goal","label":"この記事で読者にしてほしいこと","placeholder":"例：具体的な一歩を決める","multiline":false},{"key":"notes","label":"追加条件・素材","placeholder":"事実として使ってよい情報、避けたい表現、文字数など","multiline":true}]'::jsonb,
$prompt$あなたは日本語の編集者兼コンテンツ企画者です。
以下の条件から、note向け記事の企画を作成してください。

テーマ: {{topic}}
想定読者: {{audience}}
目的: {{goal}}
追加条件・素材: {{notes}}

【出力】
- 読者の悩み・知りたいこと
- タイトル候補5案
- 記事の結論
- 見出し構成
- 各見出しで扱う内容
- 読後に取れる具体的な行動

【ルール】
ユーザーが入力していない実体験・実績・レビューを事実として作らない。
価格、統計、ランキング、最新仕様など変動する情報を未確認のまま断定しない。
不足情報があっても架空の事実で補完せず、一般論または「例」と明示する。$prompt$,'active',10),
('paid-content-value','有料コンテンツの価値設計','content','デジタル商品','無料部分と有料部分の役割を分け、購入後に得られる具体的な価値を整理します。','Claude',
'[{"key":"topic","label":"販売したいテーマ","placeholder":"例：AI副業の始め方","multiline":false},{"key":"audience","label":"想定購入者","placeholder":"例：AI初心者","multiline":false},{"key":"goal","label":"購入者が到達したい状態","placeholder":"例：最初の作業を開始できる","multiline":false},{"key":"notes","label":"追加条件・素材","placeholder":"使ってよい事実、含めたい手順など","multiline":true}]'::jsonb,
$prompt$あなたはデジタルコンテンツ設計者です。
以下の情報だけを根拠に、有料コンテンツの価値設計をしてください。

テーマ: {{topic}}
想定購入者: {{audience}}
到達してほしい状態: {{goal}}
追加条件・素材: {{notes}}

無料で伝える範囲、有料で深掘りする範囲、購入判断に必要な説明、章構成、実行チェックリストを提案してください。
成果保証、架空の実績、存在しない購入者レビュー、根拠のない希少性は使わないでください。$prompt$,'active',20),
('x-post-series','X投稿シリーズ作成','sns','SNS運用','発信テーマから単発投稿ではなく、継続しやすい投稿シリーズを作ります。','ChatGPT',
'[{"key":"topic","label":"発信テーマ","placeholder":"例：AI副業","multiline":false},{"key":"audience","label":"想定読者","placeholder":"例：副業初心者","multiline":false},{"key":"goal","label":"投稿で達成したいこと","placeholder":"例：保存・プロフィール遷移","multiline":false},{"key":"notes","label":"追加条件・素材","placeholder":"使ってよい実績、避けたい表現など","multiline":true}]'::jsonb,
$prompt$あなたはSNS編集者です。
X向けに、以下の条件で継続投稿できる企画を作成してください。

発信テーマ: {{topic}}
想定読者: {{audience}}
目的: {{goal}}
追加条件・素材: {{notes}}

【出力】
1. 投稿の柱を3〜5個
2. 各柱の投稿ネタ
3. すぐ投稿できる本文案を5本
4. 過度な煽りを避けたCTA
5. 次に検証するポイント

入力されていない実績・収益・体験談は作らないでください。$prompt$,'active',30),
('instagram-caption','Instagram投稿文','sns','SNS運用','画像やリールの内容に合わせた読みやすいキャプションを作ります。','ChatGPT',
'[{"key":"topic","label":"投稿内容","placeholder":"画像・リールで伝える内容","multiline":false},{"key":"audience","label":"想定読者","placeholder":"誰に届けたいか","multiline":false},{"key":"goal","label":"目的","placeholder":"保存・コメント・プロフィール遷移など","multiline":false},{"key":"notes","label":"追加条件・素材","placeholder":"語調、ハッシュタグ方針など","multiline":true}]'::jsonb,
$prompt$Instagram投稿のキャプションを作成してください。

投稿内容: {{topic}}
想定読者: {{audience}}
目的: {{goal}}
追加条件・素材: {{notes}}

冒頭で内容が分かり、本文は読みやすく区切り、最後に自然なCTAを入れてください。
ハッシュタグは内容に必要な場合だけ候補を出してください。
存在しない体験談や実績は追加しないでください。$prompt$,'active',40),
('youtube-plan','YouTube動画企画','video','動画副業','動画テーマからタイトル、冒頭、構成、サムネイル訴求まで整理します。','Gemini',
'[{"key":"topic","label":"動画テーマ・扱うゲーム/題材","placeholder":"例：初心者向けゲーム攻略","multiline":false},{"key":"audience","label":"想定視聴者","placeholder":"例：初心者プレイヤー","multiline":false},{"key":"goal","label":"視聴後にしてほしいこと","placeholder":"例：次の動画を見る","multiline":false},{"key":"notes","label":"追加条件・素材","placeholder":"確認済み仕様、動画尺など","multiline":true}]'::jsonb,
$prompt$YouTube動画の企画を作成してください。

動画テーマ: {{topic}}
想定視聴者: {{audience}}
目的: {{goal}}
追加条件・素材: {{notes}}

タイトル案5個、冒頭30秒の設計、全体構成、離脱を防ぐ工夫、サムネイルで伝える一言、概要欄に入れる要素を出してください。
確認できないゲーム仕様・数値・最新情報は断定しないでください。$prompt$,'active',50),
('youtube-script','YouTube台本','video','動画副業','話す内容を導入・本編・まとめへ整理し、自然な口語台本にします。','Claude',
'[{"key":"topic","label":"動画テーマと必ず話す内容","placeholder":"動画テーマと素材","multiline":false},{"key":"audience","label":"想定視聴者","placeholder":"誰向けか","multiline":false},{"key":"goal","label":"視聴者に残したい結論","placeholder":"最終的な結論","multiline":false},{"key":"notes","label":"追加条件・素材","placeholder":"動画尺、口調など","multiline":true}]'::jsonb,
$prompt$YouTube用の話し言葉の台本を作成してください。

テーマ・必須内容: {{topic}}
想定視聴者: {{audience}}
最終的に伝えたい結論: {{goal}}
追加条件・素材: {{notes}}

導入、本編、まとめの順で構成し、冗長な前置きを避けてください。
入力されていない個人的体験やプレイ実績を一人称の事実として作らないでください。$prompt$,'active',60),
('image-prompt','画像生成プロンプト','design','クリエイティブ','用途・雰囲気・構図を整理し、画像AIへ渡しやすい指示へ変換します。','ChatGPT',
'[{"key":"topic","label":"作りたい画像・用途","placeholder":"例：YouTubeサムネイル","multiline":false},{"key":"audience","label":"想定する見る人","placeholder":"誰向けの画像か","multiline":false},{"key":"goal","label":"画像で最も伝えたいこと","placeholder":"例：ゲーム配信の勢い","multiline":false},{"key":"notes","label":"追加条件・素材","placeholder":"色調、人物、避ける要素など","multiline":true}]'::jsonb,
$prompt$画像生成AIへ渡す、明確で再現しやすい画像生成プロンプトを作ってください。

作りたい画像・用途: {{topic}}
想定する見る人: {{audience}}
最も伝えたいこと: {{goal}}
追加条件・素材: {{notes}}

被写体、構図、カメラ距離、表情/ポーズ、背景、光、色調、質感、避ける要素の順に整理してください。
実在ブランドのロゴや第三者の特徴的な商標要素は勝手に追加しないでください。$prompt$,'active',70),
('affiliate-research','アフィリエイト企画・比較軸','affiliate','アフィリエイト','紹介候補を選ぶ前に、読者の判断基準と比較に必要な情報を整理します。','Gemini',
'[{"key":"topic","label":"扱いたいジャンル・商品カテゴリ","placeholder":"例：PC周辺機器","multiline":false},{"key":"audience","label":"想定読者","placeholder":"例：初めて購入する人","multiline":false},{"key":"goal","label":"読者の購入判断をどう助けたいか","placeholder":"判断できる状態","multiline":false},{"key":"notes","label":"確認済み情報・制約","placeholder":"公式情報など","multiline":true}]'::jsonb,
$prompt$アフィリエイト向けの企画設計をしてください。

ジャンル・商品カテゴリ: {{topic}}
想定読者: {{audience}}
目的: {{goal}}
確認済み情報・制約: {{notes}}

読者の悩み、比較軸、確認すべき一次情報、記事/投稿の構成、誤認を避ける注意点を整理してください。
価格、在庫、評価、キャンペーン、ランキングは最新確認なしに断定しないでください。
実際に使っていない商品を使用経験があるように書かないでください。$prompt$,'active',80),
('product-listing','商品・サービス説明文','sales','物販','確認済みの商品情報から、誤解を招きにくい販売文を作ります。','ChatGPT',
'[{"key":"topic","label":"商品・サービスの確認済み情報","placeholder":"仕様・内容など","multiline":false},{"key":"audience","label":"想定購入者","placeholder":"誰向けか","multiline":false},{"key":"goal","label":"購入者に理解してほしい価値","placeholder":"価値・使い方","multiline":false},{"key":"notes","label":"追加条件","placeholder":"注意点など","multiline":true}]'::jsonb,
$prompt$販売ページ用の商品・サービス説明文を作成してください。

確認済みの商品情報: {{topic}}
想定購入者: {{audience}}
伝えたい価値: {{goal}}
追加条件: {{notes}}

特徴、向いている人、使い方、注意点、購入前に確認すべき点の順に分かりやすく整理してください。
入力されていない仕様、効果、実績、レビュー、保証内容は作らないでください。$prompt$,'active',90),
('crowdwork-proposal','クラウドソーシング応募文','crowdwork','受託副業','案件文と自分の事実情報から、簡潔で読みやすい提案文を作ります。','Claude',
'[{"key":"topic","label":"案件内容・募集要件","placeholder":"募集文の要点","multiline":false},{"key":"audience","label":"依頼者の想定ニーズ","placeholder":"依頼者が重視しそうなこと","multiline":false},{"key":"goal","label":"応募で伝えたい強み","placeholder":"対応方針","multiline":false},{"key":"notes","label":"自分について事実として使える情報","placeholder":"実績・経験は事実のみ","multiline":true}]'::jsonb,
$prompt$クラウドソーシング案件への応募文を作成してください。

案件内容・募集要件: {{topic}}
依頼者の想定ニーズ: {{audience}}
伝えたい強み・対応方針: {{goal}}
自分について事実として使える情報: {{notes}}

短い挨拶、要件理解、対応できること、進め方、確認事項の順でまとめてください。
入力されていない経験年数、案件実績、資格、売上、成果は絶対に作らないでください。$prompt$,'active',100),
('market-research','市場・競合リサーチ設計','research','共通','調べるべき項目と情報源を先に整理し、思いつきだけの調査を防ぎます。','Gemini',
'[{"key":"topic","label":"調査したい市場・テーマ","placeholder":"市場やテーマ","multiline":false},{"key":"audience","label":"対象顧客","placeholder":"誰の市場か","multiline":false},{"key":"goal","label":"調査結果で決めたいこと","placeholder":"決めたい判断","multiline":false},{"key":"notes","label":"既に分かっている情報","placeholder":"既知情報","multiline":true}]'::jsonb,
$prompt$市場・競合リサーチの計画を作成してください。

調査テーマ: {{topic}}
対象顧客: {{audience}}
調査結果で決めたいこと: {{goal}}
既に分かっている情報: {{notes}}

調査項目、優先して確認する一次情報、競合比較表の項目、判断基準、追加で確認すべき未知情報を整理してください。
最新情報が必要な項目は「Webで最新確認が必要」と明示してください。$prompt$,'active',110),
('work-efficiency','作業手順・テンプレート化','efficiency','共通','繰り返し作業を分解し、チェックリストと再利用テンプレートへ変換します。','ChatGPT',
'[{"key":"topic","label":"効率化したい作業","placeholder":"繰り返し作業","multiline":false},{"key":"audience","label":"この手順を使う人","placeholder":"初心者、自分、チームなど","multiline":false},{"key":"goal","label":"理想の完了状態","placeholder":"完了条件","multiline":false},{"key":"notes","label":"現在のやり方・制約","placeholder":"現状・制約","multiline":true}]'::jsonb,
$prompt$次の作業を、初心者でも再現しやすい手順へ整理してください。

効率化したい作業: {{topic}}
この手順を使う人: {{audience}}
理想の完了状態: {{goal}}
現在のやり方・制約: {{notes}}

作業を準備・実行・確認・保存の段階へ分解し、チェックリスト、コピペ用テンプレート、失敗しやすい点を出してください。
入力されていない社内ルールや事実は作らないでください。$prompt$,'active',120)
on conflict(slug) do nothing;
