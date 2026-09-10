-- Keep the shared article contract compatible with the Windows ArticleRequest model.
-- A paid article must always have a positive integer price; free articles remain price-less.

begin;

alter table public.articles
    add constraint articles_paid_price_positive_check
    check (
        article_type <> 'paid'
        or (price is not null and price > 0)
    );

commit;
