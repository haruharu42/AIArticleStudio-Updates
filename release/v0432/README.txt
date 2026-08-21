AI Article Studio v0.4.3.2
================================

This update makes the completed-article copy path safe for publication.

- Web AI creation stays inside the Article Creator screen; no separate application window is opened.
- STEP 4 "作成へ" moves to STEP 5 title preparation in the same screen.
- Title prompt copy, response paste, title selection, article prompt copy, and completed article paste are shown one item at a time.
- Markdown table rows are preserved without reconstruction or column merging.
- STEP 6 keeps separate source, image-insertion, and clean publish copies.
- The clean publish copy removes internal illustration markers and the final illustration summary.
- Image-insertion markers remain visible and highlighted in the preview.
- Anime image prompts explicitly avoid glossy app icons, sticker graphics, and glowing bubble UI.
- The article theme supports AIおまかせ and manual input.
- The recent-work panel supports up to 10 stored items with load and delete actions.
- The paste fields can be cleared without deleting settings or the selected title.
- Existing API generation remains connected to the validated legacy API action.
- Article data, settings, history, and updater backups are preserved.

The updater accepts canonical v0.4.2.9, v0.4.3.0, or v0.4.3.1, applies the complete payload, and validates the UI and publish-copy core before setting v0.4.3.2.
