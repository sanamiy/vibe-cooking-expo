/**
 * Eating Window Estimation
 *
 * Estimates the optimal time window to eat each dish after completion
 */

import { RecipeInput, EatingWindow } from "./types";

/**
 * Estimate the optimal eating window for a recipe
 */
export function estimateEatingWindow(recipe: RecipeInput): EatingWindow {
  const name = recipe.name.toLowerCase();
  const stepsText = recipe.steps.map((s) => s.text).join(" ").toLowerCase();
  const category = (recipe.category ?? "").toLowerCase();

  // Default (warm dishes)
  let eat_min = 0;
  let eat_max = 10;
  let reason = "温かいうちにどうぞ";
  let temperature_type: "hot" | "warm" | "cold" = "hot";

  // 煮込み料理・煮物（少し冷ますと味が染みる）
  if (
    ["煮込", "煮物", "肉じゃが", "カレー", "シチュー", "おでん"].some(
      (kw) => name.includes(kw) || stepsText.includes(kw)
    )
  ) {
    eat_min = 3;
    eat_max = 20;
    reason = "少し冷ますと味が馴染んでおいしい";
    temperature_type = "warm";
  }
  // 炒め物（すぐ食べないとべちゃっとする）
  else if (
    ["炒め", "チャーハン", "回鍋肉", "野菜炒め"].some(
      (kw) => name.includes(kw) || stepsText.includes(kw)
    )
  ) {
    eat_min = 0;
    eat_max = 5;
    reason = "熱々のうちに！冷めるとべちゃっとします";
    temperature_type = "hot";
  }
  // 焼き物（肉・魚）
  else if (
    ["焼き", "ステーキ", "ハンバーグ", "照り焼き", "生姜焼き"].some(
      (kw) => name.includes(kw) || stepsText.includes(kw)
    )
  ) {
    eat_min = 1;
    eat_max = 8;
    reason = "少し休ませてから切ると肉汁が落ち着く";
    temperature_type = "hot";
  }
  // 丼物
  else if (["丼", "どんぶり"].some((kw) => name.includes(kw))) {
    eat_min = 0;
    eat_max = 7;
    reason = "ご飯が温かいうちにどうぞ";
    temperature_type = "hot";
  }
  // 汁物・スープ
  else if (
    ["汁", "スープ", "味噌汁", "みそ汁"].some(
      (kw) => name.includes(kw) || stepsText.includes(kw)
    )
  ) {
    eat_min = 1;
    eat_max = 15;
    reason = "熱すぎると火傷するので少し冷ましてから";
    temperature_type = "hot";
  }
  // 揚げ物
  else if (
    ["揚げ", "フライ", "天ぷら", "唐揚げ", "とんかつ"].some(
      (kw) => name.includes(kw) || stepsText.includes(kw)
    )
  ) {
    eat_min = 1;
    eat_max = 5;
    reason = "揚げたてサクサクのうちに！";
    temperature_type = "hot";
  }
  // サラダ・冷菜
  else if (
    ["サラダ", "冷や", "和え物", "マリネ"].some(
      (kw) => name.includes(kw) || stepsText.includes(kw)
    )
  ) {
    eat_min = 0;
    eat_max = 30;
    reason = "冷たいままでOK、急がなくて大丈夫";
    temperature_type = "cold";
  }
  // ポテトサラダ（冷やした方がおいしい）
  else if (name.includes("ポテトサラダ")) {
    eat_min = 5;
    eat_max = 60;
    reason = "冷蔵庫で冷やすとさらにおいしい";
    temperature_type = "cold";
  }
  // 麺類
  else if (
    ["麺", "うどん", "そば", "ラーメン", "パスタ"].some((kw) =>
      name.includes(kw)
    )
  ) {
    eat_min = 0;
    eat_max = 3;
    reason = "麺が伸びる前に急いで！";
    temperature_type = "hot";
  }

  return {
    recipe_id: recipe.id,
    recipe_name: recipe.name,
    eat_min,
    eat_max,
    reason,
    temperature_type,
  };
}
