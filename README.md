# vibe-cooking-expo

A cooking navigation app built with Expo + React Native, ported from
vibe-cooking-nuxt. Designed for hands-free recipe guidance while cooking.

## Purpose

Enable cooks to follow recipes step-by-step without touching their phone.
Menu selection is done by hand; once cooking starts, voice dialogue and
automatic progression keep the experience hands-free.

## Features

- Recipe selection (1-5 items, fixed bottom action bar)
- Recipe detail with ingredient scaling by servings
- Shopping list with checkbox persistence
- Multi-recipe scheduling with Gantt chart (greedy scheduler + hygiene
  correction)
- Interactive cooking navigation with step-by-step progress
- Voice dialogue system (STT via Voxtral ASR, TTS via ElevenLabs or
  expo-speech)
- AI-powered intent classification and Q&A during cooking (Mistral / Claude)
- Settings (servings, burner count, AsyncStorage persistence)
- Safe Area support (iPhone notch / home indicator)
- Auto port selection for concurrent Expo instances
- VPS proxy mode and direct client mode
- E2E tests with Playwright

## Architecture

Frontend: Expo (React Native for Web) deployed to Cloudflare Workers via
GitHub Actions on push to main.

Backend: API proxy running on a VPS at temp.synome.jp. Forwards requests to
Mistral, Claude, and ElevenLabs APIs so that API keys stay server-side.

config.json controls the API routing mode:

- `direct_client` - the app calls AI APIs directly from the client (API keys
  required in .env)
- `vps_proxy` - the app routes all AI calls through the VPS proxy (no client
  API keys needed)

TTS engine is also configured in config.json:

- `online_elevenlabs` - uses ElevenLabs API
- `offline_expospeech` - uses expo-speech (device TTS)

## Setup

```bash
npm install
cp .env.sample .env
```

Edit .env as needed, then set config.json to the desired apiMode and tts
engine.

```bash
npm run start
npm run ios
npm run web
```

## Scripts

| Script           | Description                          |
| ---------------- | ------------------------------------ |
| start            | Launch Expo with auto port selection |
| ios              | Launch on iOS simulator              |
| android          | Launch on Android emulator           |
| web              | Launch in browser                    |
| deploy:vps       | Deploy API proxy to VPS              |
| api:vps          | Set apiMode to vps_proxy             |
| api:direct       | Set apiMode to direct_client         |
| format           | Run Prettier                         |
| format:check     | Check Prettier formatting            |
| build:web        | Export web build via Expo            |
| e2e:server       | Start E2E test server on port 19006  |
| e2e:offline      | Run E2E tests with offline TTS       |
| e2e:online       | Run E2E tests with online TTS        |
| e2e:both         | Run E2E tests with both TTS engines  |
| e2e              | Run Playwright tests                 |
| e2e:ui           | Run Playwright tests with UI         |
| typecheck        | TypeScript type check                |
| scrape:recipes   | Scrape recipe data from Ajinomoto    |
| validate:recipes | Validate recipe JSON schema          |

## Environment Variables

Defined in .env (see .env.sample).

| Variable                        | Required | Description           |
| ------------------------------- | -------- | --------------------- |
| EXPO_PUBLIC_VPS_API_BASE_URL    | Yes      | VPS proxy base URL    |
| EXPO_PUBLIC_MUSIC_LINK          | No       | Background music link |
| EXPO_PUBLIC_MISTRAL_API_KEY     | \*       | Mistral API key       |
| EXPO_PUBLIC_CLAUDE_API_KEY      | \*       | Claude API key        |
| EXPO_PUBLIC_ELEVENLABS_API_KEY  | \*       | ElevenLabs API key    |
| EXPO_PUBLIC_ELEVENLABS_VOICE_ID | No       | ElevenLabs voice ID   |
| EXPO_PUBLIC_ELEVENLABS_MODEL    | No       | ElevenLabs model ID   |

(\*) Required only when apiMode is direct_client.

## Main Files

| Path                            | Role                                |
| ------------------------------- | ----------------------------------- |
| app/index.tsx                   | Home (recipe selection)             |
| app/recipe/[id].tsx             | Recipe detail                       |
| app/shopping/[id].tsx           | Shopping list                       |
| app/schedule/[id].tsx           | Multi-recipe scheduling             |
| app/cook-interactive/[id].tsx   | Cooking navigation                  |
| app/settings.tsx                | Settings                            |
| contexts/AppSettingsContext.tsx | Shared settings + persistence       |
| hooks/useVoiceDialogue.ts       | Voice dialogue state machine        |
| hooks/useVoiceCommands.ts       | Speech-to-text via Voxtral ASR      |
| services/ai.ts                  | AI orchestration (intent, Q&A, TTS) |
| services/apiConfig.ts           | API mode and key management         |
| services/vpsClient.ts           | VPS proxy HTTP client               |
| services/voxtralAsr.ts          | Voxtral ASR streaming client        |
| services/anthropicClient.ts     | Claude API client                   |
| utils/gantt.ts                  | Gantt chart generation              |
| utils/recipe.ts                 | Ingredient scaling utilities        |
| utils/scheduler.ts              | Multi-recipe greedy scheduler       |
| utils/scheduleStore.ts          | In-memory store for schedule data   |

## Data Assets

| Path                          | Description                |
| ----------------------------- | -------------------------- |
| data/recipe.json              | Recipe dataset             |
| data/gantt/recipes-gantt.json | Pre-built Gantt data       |
| data/gantt/schema-v1.json     | Gantt data schema          |
| data/recipe-img/              | Recipe images (gitignored) |

Recipe images are excluded from the repository. Run `npm run scrape:recipes`
to download them locally.

## Design System

See DESIGN_SYSTEM.md for design principles and color/typography specs.
Theme tokens are defined in constants/theme.ts.

## Scraping / Data Update

```bash
npm run scrape:recipes
npm run validate:recipes
```

- Script: scripts/scraping-ajinomoto.py
- Validation: scripts/validate_recipe_json.py
- Output: data/recipe.json, data/recipe-img/

## Differences from Nuxt Version

Multi-recipe scheduling and voice recognition, which were missing in the
initial Expo port, are now implemented. The Expo version has feature parity
with the Nuxt version.

---

# vibe-cooking-expo

Expo + React Native で構築した料理ナビゲーションアプリ。vibe-cooking-nuxt
からの移植版。調理中のハンズフリー操作を目指す。

## 目的

調理中に手がふさがっていても、レシピ手順を追えるようにする。献立選択は手操作、
調理開始後は音声対話と自動進行でハンズフリー体験を提供する。

## 機能

- 献立選択 (1-5 件、下部固定アクションバー)
- レシピ詳細 (人数による分量スケール)
- 買い出しリスト (チェックボックス管理)
- 複数レシピスケジューリング (ガントチャート、貪欲法スケジューラ + 衛生補正)
- インタラクティブ調理ナビ (ステップ進行)
- 音声対話システム (STT: Voxtral ASR, TTS: ElevenLabs / expo-speech)
- AI によるインテント分類と調理中 Q&A (Mistral / Claude)
- 設定 (人数、コンロ口数、AsyncStorage 永続化)
- Safe Area 対応 (iPhone ノッチ / ホームインジケータ)
- 自動ポート選択 (複数 Expo インスタンスの同時起動)
- VPS プロキシモードとダイレクトクライアントモード
- Playwright による E2E テスト

## アーキテクチャ

フロントエンド: Expo (React Native for Web) を Cloudflare Workers にデプロイ。
main ブランチへの push 時に GitHub Actions で自動デプロイ。

バックエンド: temp.synome.jp の VPS で API プロキシを稼働。Mistral, Claude,
ElevenLabs API へのリクエストを中継し、API キーをサーバー側に保持する。

config.json で API ルーティングモードを切り替える:

- `direct_client` - クライアントから AI API を直接呼び出す (.env に API キーが
  必要)
- `vps_proxy` - 全 AI 呼び出しを VPS プロキシ経由にする (クライアント側の API
  キー不要)

TTS エンジンも config.json で設定:

- `online_elevenlabs` - ElevenLabs API を使用
- `offline_expospeech` - expo-speech (デバイス内蔵 TTS) を使用

## セットアップ

```bash
npm install
cp .env.sample .env
```

.env を編集し、config.json で apiMode と TTS エンジンを設定する。

```bash
npm run start
npm run ios
npm run web
```

## スクリプト

| スクリプト       | 説明                                    |
| ---------------- | --------------------------------------- |
| start            | 自動ポート選択で Expo を起動            |
| ios              | iOS シミュレータで起動                  |
| android          | Android エミュレータで起動              |
| web              | ブラウザで起動                          |
| deploy:vps       | API プロキシを VPS にデプロイ           |
| api:vps          | apiMode を vps_proxy に設定             |
| api:direct       | apiMode を direct_client に設定         |
| format           | Prettier 実行                           |
| format:check     | Prettier フォーマットチェック           |
| build:web        | Expo で Web ビルドをエクスポート        |
| e2e:server       | E2E テストサーバーをポート 19006 で起動 |
| e2e:offline      | オフライン TTS で E2E テスト実行        |
| e2e:online       | オンライン TTS で E2E テスト実行        |
| e2e:both         | 両方の TTS エンジンで E2E テスト実行    |
| e2e              | Playwright テスト実行                   |
| e2e:ui           | Playwright テスト (UI モード)           |
| typecheck        | TypeScript 型チェック                   |
| scrape:recipes   | 味の素からレシピデータをスクレイピング  |
| validate:recipes | レシピ JSON スキーマ検証                |

## 環境変数

.env で定義 (.env.sample を参照)。

| 変数                            | 必須 | 説明                 |
| ------------------------------- | ---- | -------------------- |
| EXPO_PUBLIC_VPS_API_BASE_URL    | Yes  | VPS プロキシの URL   |
| EXPO_PUBLIC_MUSIC_LINK          | No   | BGM リンク           |
| EXPO_PUBLIC_MISTRAL_API_KEY     | \*   | Mistral API キー     |
| EXPO_PUBLIC_CLAUDE_API_KEY      | \*   | Claude API キー      |
| EXPO_PUBLIC_ELEVENLABS_API_KEY  | \*   | ElevenLabs API キー  |
| EXPO_PUBLIC_ELEVENLABS_VOICE_ID | No   | ElevenLabs 音声 ID   |
| EXPO_PUBLIC_ELEVENLABS_MODEL    | No   | ElevenLabs モデル ID |

(\*) apiMode が direct_client の場合のみ必要。

## 主要ファイル

| パス                            | 役割                               |
| ------------------------------- | ---------------------------------- |
| app/index.tsx                   | ホーム (レシピ選択)                |
| app/recipe/[id].tsx             | レシピ詳細                         |
| app/shopping/[id].tsx           | 買い出しリスト                     |
| app/schedule/[id].tsx           | 複数レシピスケジューリング         |
| app/cook-interactive/[id].tsx   | 調理ナビ                           |
| app/settings.tsx                | 設定                               |
| contexts/AppSettingsContext.tsx | 共有設定 + 永続化                  |
| hooks/useVoiceDialogue.ts       | 音声対話ステートマシン             |
| hooks/useVoiceCommands.ts       | Voxtral ASR による音声認識         |
| services/ai.ts                  | AI オーケストレーション            |
| services/apiConfig.ts           | API モード / キー管理              |
| services/vpsClient.ts           | VPS プロキシ HTTP クライアント     |
| services/voxtralAsr.ts          | Voxtral ASR ストリーミング         |
| services/anthropicClient.ts     | Claude API クライアント            |
| utils/gantt.ts                  | ガントチャート生成                 |
| utils/recipe.ts                 | 分量スケールユーティリティ         |
| utils/scheduler.ts              | 複数レシピ貪欲法スケジューラ       |
| utils/scheduleStore.ts          | スケジュールデータのメモリ内ストア |

## データ資産

| パス                          | 説明                        |
| ----------------------------- | --------------------------- |
| data/recipe.json              | レシピデータセット          |
| data/gantt/recipes-gantt.json | 事前生成ガントデータ        |
| data/gantt/schema-v1.json     | ガントデータスキーマ        |
| data/recipe-img/              | レシピ画像 (gitignore 対象) |

レシピ画像はリポジトリに含まれない。`npm run scrape:recipes` でローカルに
ダウンロードする。

## デザインシステム

デザイン原則や配色/タイポグラフィの仕様は DESIGN_SYSTEM.md を参照。
テーマトークンは constants/theme.ts で定義。

## スクレイピング / データ更新

```bash
npm run scrape:recipes
npm run validate:recipes
```

- スクリプト: scripts/scraping-ajinomoto.py
- 検証: scripts/validate_recipe_json.py
- 出力: data/recipe.json, data/recipe-img/

## Nuxt 版からの差分

初期の Expo 移植時に未実装だった複数レシピスケジューリングと音声認識は実装済み。
Expo 版は Nuxt 版と機能的に同等。
