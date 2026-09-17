import { compileKnowledgeContext, type KnowledgeTask } from "@/lib/knowledge-engine";

export type PromptProfileInput = {
  publicationTarget: "note" | "tips" | "brain" | "blog";
  articleType: "free" | "paid";
  genre: string;
  subgenre: string;
  ageGroup: string;
  gender: string;
};

export function getPromptSpecialization(input: PromptProfileInput, task: KnowledgeTask = "article"): string {
  const audience = input.gender && input.gender !== "AIおまかせ"
    ? `対象性別: ${input.gender}。性別だけから価値観・職業・生活状況を決めつけない。`
    : "";
  return compileKnowledgeContext({
    task,
    publicationTarget: input.publicationTarget,
    articleType: input.articleType,
    genre: input.genre,
    subgenre: input.subgenre,
    ageGroup: input.ageGroup,
    audience,
  }).promptBlock;
}
