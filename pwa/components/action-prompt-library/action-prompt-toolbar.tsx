type Props = {
  categories: readonly string[];
  category: string;
  query: string;
  favoritesOnly: boolean;
  onCategoryChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onFavoritesToggle: () => void;
};

export function ActionPromptToolbar({
  categories,
  category,
  query,
  favoritesOnly,
  onCategoryChange,
  onQueryChange,
  onFavoritesToggle,
}: Props) {
  return (
    <section className="action-prompt-toolbar" aria-label="プロンプト検索">
      <label>
        <span>検索</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="例：note、SNS、YouTube、物販"
        />
      </label>
      <label>
        <span>用途</span>
        <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <button
        className={favoritesOnly ? "active" : ""}
        type="button"
        onClick={onFavoritesToggle}
        aria-pressed={favoritesOnly}
      >
        ★ お気に入り{favoritesOnly ? "のみ" : ""}
      </button>
    </section>
  );
}
