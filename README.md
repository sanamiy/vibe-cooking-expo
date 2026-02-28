# vibe-cooking-expo

`vibe-cooking-nuxt` をベースに Expo + React Native へ移植した iPhone 向けアプリです。

## 目的

料理中に手がふさがっていても、できるだけハンズフリーでレシピ手順を理解し、次の行動に進める体験を作ることが目的です。

- 献立選択までは手操作
- 選択後は、できるだけ手を使わずに手順を追える導線
- 手順は一気に提示せず、調理者のテンポに合わせて進行
- タイマーが必要な工程（例: 煮込み）では時間経過を通知

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

### 複数アプリを同一PCで起動する（自動ポート探索）

このリポジトリの `start/ios/android/web` は、起動時に空いているポートを自動探索して Expo を起動します。  
既定では `8081` から順に探索するため、ポート衝突時も別ポートで立ち上がります。

```bash
# 通常起動（空きポートを自動選択）
npm run start

# iOS/Android/Web も同様に自動選択
npm run ios
npm run android
npm run web
```

探索開始ポートを変えたい場合:

```bash
EXPO_PORT_START=19000 npm run start
```

## スクレイピング/データ更新

Nuxt から移植した Python スクリプトでレシピデータと画像を更新できます。

```bash
npm run scrape:recipes
npm run validate:recipes
```

- スクリプト: `scripts/scraping-ajinomoto.py`
- 検証: `scripts/validate_recipe_json.py`
- 出力JSON: `data/recipe.json`
- 画像保存先: `data/recipe-img/`

## デザインシステム

- 移植ドキュメント: `DESIGN_SYSTEM.md`
- テーマトークン: `constants/theme.ts`

## 主要ファイル

- `app/index.tsx` ホーム
- `app/recipe/[id].tsx` レシピ詳細
- `app/shopping/[id].tsx` 買い出し
- `app/cook-interactive/[id].tsx` 調理ナビ
- `app/settings.tsx` 設定
- `contexts/AppSettingsContext.tsx` 共有設定と永続化
- `utils/gantt.ts` ガント生成ロジック
- `utils/recipe.ts` 分量スケール等

## 移行済み資産

- スクレイピングコード: `scripts/scraping-ajinomoto.py`
- 補助スクリプト: `scripts/validate_recipe_json.py`
- レシピデータ: `data/recipe.json`
- ガントデータ: `data/gantt/recipes-gantt.json`
- ガントスキーマ: `data/gantt/schema-v1.json`
- 画像アセット: `data/recipe-img/*`
- デザインシステム文書: `DESIGN_SYSTEM.md`

## Nuxt版からの差分

- 複数料理選択後の画面は未実装（1件選択導線を優先）
- 音声認識は未実装（疑似ボタン入力）
