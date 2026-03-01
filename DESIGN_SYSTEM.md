# Vibe Cooking Design System

This document is organized from `design-system-preview.png` for easy reference during implementation.
The canonical source of truth for tokens is `constants/theme.ts`.

## 1. Design Principles

- Friendliness: Rounded shapes, soft colors, light tone.
- Fun: Bright accent colors and colorful tags make cooking a positive experience.
- Readability: Low-contrast backgrounds with sufficient contrast and spacing for elements.

## 2. Color Tokens

### 2.1 Primary / Secondary

| theme.ts property | Value   |
| ----------------- | ------- |
| primary           | #FF6B6B |
| primaryDark       | #E85B5B |
| secondary         | #4ECDC4 |
| accent            | #F7E06E |

### 2.2 Playful Palette

| theme.ts property | Value   |
| ----------------- | ------- |
| purple            | #A29DE4 |
| orange            | #FFA16D |
| blue              | #5BB7EA |
| success           | #6BD89D |
| warning           | #FFD166 |

### 2.3 Neutral / Base

| theme.ts property | Value   | Usage                         |
| ----------------- | ------- | ----------------------------- |
| bg                | #F5F3EF | Screen background             |
| card              | #FFFFFF | Cards, forms                  |
| text              | #2F2F2F | Primary text                  |
| subText           | #7A7A7A | Secondary text                |
| border            | #E6E6E6 | Borders                       |
| divider           | #FF6B6B | Section divider lines         |
| info              | #EAF6FF | Info backgrounds, step badges |

## 3. Typography

### 3.1 Font Family

- Latin headings: Quicksand
- Japanese body: M PLUS Rounded

Recommended fallback:

```css
font-family: "Quicksand", "M PLUS Rounded 1c", "Hiragino Kaku Gothic ProN", sans-serif;
```

### 3.2 Type Scale (recommended)

- `--font-size-xxl: 36px` (page title)
- `--font-size-xl: 24px` (section heading)
- `--font-size-lg: 20px` (card heading)
- `--font-size-md: 16px` (body)
- `--font-size-sm: 14px` (supplementary)
- `--font-size-xs: 12px` (caption)

### 3.3 Line Height

- Headings: `1.25`
- Body: `1.6`

## 4. Radius, Spacing, Shadows

| Token       | Value  | Usage                               |
| ----------- | ------ | ----------------------------------- |
| radius.sm   | 8px    | Small elements, inputs              |
| radius.md   | 12px   | Default card radius                 |
| radius.lg   | 16px   | Large cards, panels                 |
| radius.pill | 9999px | Pill-shaped elements (tags, badges) |

- Card padding: `20px`
- Section spacing: `24px` - `40px`
- Light shadow: `0 4px 12px rgba(0, 0, 0, 0.08)`

## 5. Component Specs

## 5.1 Buttons

### Variants

1. Primary
   - Background: primary
   - Text: `#FFFFFF`
2. Secondary
   - Background: secondary
   - Text: `#FFFFFF`
3. Accent
   - Background: accent
   - Text: text
4. Outline
   - Background: `transparent`
   - Border: `1px solid` primary
   - Text: primary
5. Ghost
   - Background: `transparent`
   - Text: text

### Sizes (recommended)

- `sm`: height `28px` / horizontal `12px` / font `12px`
- `md` (default): height `36px` / horizontal `16px` / font `14px`
- `lg`: height `44px` / horizontal `20px` / font `16px`

### States

- Hover: slightly darken (`filter: brightness(0.96)`)
- Disabled: opacity `0.5` + `cursor: not-allowed`

## 5.2 Chips / Tags

- Shape: pill
- Height: `22px` - `26px`
- Horizontal padding: `8px` - `10px`
- Font size: `11px` - `12px`
- Use cases: difficulty, time, ingredient type, status

## 5.3 Forms

- Container: white card + radius + shadow
- Label: `12px` - `13px`, semi-bold
- Input/Select/Textarea
  - Height: `36px` (except textarea)
  - Border: `1px solid` border
  - Focus: `border-color:` secondary
  - Radius: radius.sm (8px)
- Submit button: full-width Primary

## 6. Layout Guidelines

- Single-column, centered layout.
- Recommended content width: `min(760px, 92vw)`
- Place a thin primary-colored divider line below section headings.
- Visual hierarchy: Title -> Color -> Text -> Component (Button/Tag/Form)

## 7. Design Tokens (CSS Variables)

Property names map to `theme.colors.*`, `theme.radius.*`, and `theme.shadows.*` in `constants/theme.ts`.

```css
:root {
  --color-primary: #ff6b6b;
  --color-primaryDark: #e85b5b;
  --color-secondary: #4ecdc4;
  --color-accent: #f7e06e;

  --color-purple: #a29de4;
  --color-orange: #ffa16d;
  --color-blue: #5bb7ea;
  --color-success: #6bd89d;
  --color-warning: #ffd166;

  --color-bg: #f5f3ef;
  --color-card: #ffffff;
  --color-text: #2f2f2f;
  --color-subText: #7a7a7a;
  --color-border: #e6e6e6;
  --color-divider: #ff6b6b;
  --color-info: #eaf6ff;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 9999px;

  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.08);
}
```

## 8. Usage Rules

- When building new UI, reuse tokens from this document first.
- Before adding a new color, check if the existing Playful Palette can cover the need.
- Prefer adding Variants to existing components rather than creating similar new ones.

---

# Vibe Cooking デザインシステム

このドキュメントは `design-system-preview.png` を元に、実装時に参照しやすいよう整理したものです。
トークンの正式な定義元は `constants/theme.ts` です。

## 1. デザイン原則

- 親しみやすさ: 丸みのある形状、柔らかい配色、軽いトーン。
- 楽しさ: 明るいアクセントカラーとカラフルなタグで、料理体験をポジティブに。
- 視認性: 背景は低コントラスト、要素は十分なコントラストと余白で整理。

## 2. カラートークン

### 2.1 Primary / Secondary

| theme.ts プロパティ | 値      |
| ------------------- | ------- |
| primary             | #FF6B6B |
| primaryDark         | #E85B5B |
| secondary           | #4ECDC4 |
| accent              | #F7E06E |

### 2.2 Playful Palette

| theme.ts プロパティ | 値      |
| ------------------- | ------- |
| purple              | #A29DE4 |
| orange              | #FFA16D |
| blue                | #5BB7EA |
| success             | #6BD89D |
| warning             | #FFD166 |

### 2.3 Neutral / Base

| theme.ts プロパティ | 値      | 用途                     |
| ------------------- | ------- | ------------------------ |
| bg                  | #F5F3EF | 画面背景                 |
| card                | #FFFFFF | カード、フォーム         |
| text                | #2F2F2F | メインテキスト           |
| subText             | #7A7A7A | サブテキスト             |
| border              | #E6E6E6 | 枠線                     |
| divider             | #FF6B6B | セクション区切り線       |
| info                | #EAF6FF | 情報背景、ステップバッジ |

## 3. タイポグラフィ

### 3.1 フォントファミリー

- 英字見出し: Quicksand
- 和文本文: M PLUS Rounded

推奨フォールバック:

```css
font-family: "Quicksand", "M PLUS Rounded 1c", "Hiragino Kaku Gothic ProN", sans-serif;
```

### 3.2 タイプスケール (推奨)

- `--font-size-xxl: 36px` (ページタイトル)
- `--font-size-xl: 24px` (セクション見出し)
- `--font-size-lg: 20px` (カード見出し)
- `--font-size-md: 16px` (本文)
- `--font-size-sm: 14px` (補足)
- `--font-size-xs: 12px` (キャプション)

### 3.3 行間

- 見出し: `1.25`
- 本文: `1.6`

## 4. 角丸、余白、影

| トークン    | 値     | 用途                      |
| ----------- | ------ | ------------------------- |
| radius.sm   | 8px    | 小さな要素、入力欄        |
| radius.md   | 12px   | デフォルトのカード角丸    |
| radius.lg   | 16px   | 大きなカード、パネル      |
| radius.pill | 9999px | ピル型要素 (タグ、バッジ) |

- カード余白: `20px`
- セクション間隔: `24px` - `40px`
- 軽いシャドウ: `0 4px 12px rgba(0, 0, 0, 0.08)`

## 5. コンポーネント仕様

## 5.1 Buttons

### Variants

1. Primary
   - 背景: primary
   - 文字: `#FFFFFF`
2. Secondary
   - 背景: secondary
   - 文字: `#FFFFFF`
3. Accent
   - 背景: accent
   - 文字: text
4. Outline
   - 背景: `transparent`
   - 枠線: `1px solid` primary
   - 文字: primary
5. Ghost
   - 背景: `transparent`
   - 文字: text

### Sizes (推奨)

- `sm`: 高さ `28px` / 左右 `12px` / 文字 `12px`
- `md` (default): 高さ `36px` / 左右 `16px` / 文字 `14px`
- `lg`: 高さ `44px` / 左右 `20px` / 文字 `16px`

### 状態

- Hover: 明度を少し下げる (`filter: brightness(0.96)`)
- Disabled: 不透明度 `0.5` + `cursor: not-allowed`

## 5.2 Chips / Tags

- 形状: pill
- 高さ: `22px` - `26px`
- 横余白: `8px` - `10px`
- 文字サイズ: `11px` - `12px`
- 用途: 難易度、時間、食材タイプ、状態

## 5.3 Forms

- コンテナ: 白背景カード + 角丸 + シャドウ
- Label: `12px` - `13px`, セミボールド
- Input/Select/Textarea
  - 高さ: `36px` (textarea 以外)
  - 枠線: `1px solid` border
  - フォーカス: `border-color:` secondary
  - 角丸: radius.sm (8px)
- 送信ボタン: 幅いっぱいの Primary

## 6. レイアウト指針

- 全体は中央寄せの 1 カラム。
- 推奨コンテンツ幅: `min(760px, 92vw)`
- セクション見出し下に primary 色の細い区切り線を置く。
- 視線誘導順: タイトル -> 色 -> 文字 -> コンポーネント (Button/Tag/Form)

## 7. デザイントークン (CSS Variables)

プロパティ名は `constants/theme.ts` の `theme.colors.*`、`theme.radius.*`、`theme.shadows.*` に対応します。

```css
:root {
  --color-primary: #ff6b6b;
  --color-primaryDark: #e85b5b;
  --color-secondary: #4ecdc4;
  --color-accent: #f7e06e;

  --color-purple: #a29de4;
  --color-orange: #ffa16d;
  --color-blue: #5bb7ea;
  --color-success: #6bd89d;
  --color-warning: #ffd166;

  --color-bg: #f5f3ef;
  --color-card: #ffffff;
  --color-text: #2f2f2f;
  --color-subText: #7a7a7a;
  --color-border: #e6e6e6;
  --color-divider: #ff6b6b;
  --color-info: #eaf6ff;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 9999px;

  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.08);
}
```

## 8. 運用ルール

- 新規 UI を作る際は、まず本ドキュメントのトークンを再利用する。
- 新しい色を増やす前に、既存の Playful Palette で表現可能か確認する。
- 似たコンポーネントは Variant 追加で対応し、別物として増やしすぎない。
