# vibe-cooking-expo

`vibe-cooking-nuxt` をベースに Expo + React Native へ移植した iPhone 向けアプリです。

## 実装済み（MVP）
- 献立選択（1〜5件、下部固定アクション）
- レシピ詳細（分量スケール、手順表示）
- 買い出しリスト（チェック管理）
- 調理ナビ（ステップ進行、疑似音声ボタン、簡易タイマー、ガント表示）
- 設定画面（人数・コンロ口数、AsyncStorage 永続化）
- Safe Area 対応（iPhone ノッチ/ホームインジケータ考慮）

## セットアップ
```bash
npm install
npm run ios
```

## 主要ファイル
- `app/index.tsx` ホーム
- `app/recipe/[id].tsx` レシピ詳細
- `app/shopping/[id].tsx` 買い出し
- `app/cook-interactive/[id].tsx` 調理ナビ
- `app/settings.tsx` 設定
- `contexts/AppSettingsContext.tsx` 共有設定と永続化
- `utils/gantt.ts` ガント生成ロジック
- `utils/recipe.ts` 分量スケール等

## Nuxt版からの差分
- 複数料理選択後の画面は未実装（1件選択導線を優先）
- 音声認識は未実装（疑似ボタン入力）
