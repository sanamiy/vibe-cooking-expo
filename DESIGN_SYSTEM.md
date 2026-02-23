# Vibe Cooking デザインシステム

このドキュメントは `design-system-preview.png` を元に、実装時に参照しやすいよう整理したものです。

## 1. デザイン原則

- **親しみやすさ**: 丸みのある形状、柔らかい配色、軽いトーン。
- **楽しさ**: 明るいアクセントカラーとカラフルなタグで、料理体験をポジティブに。
- **視認性**: 背景は低コントラスト、要素は十分なコントラストと余白で整理。

## 2. カラートークン

> 画像から読み取った推定値。実装時は必要に応じて微調整してください。

### 2.1 Primary / Secondary

- `--color-primary: #FF6B6B`
- `--color-secondary: #4ECDC4`
- `--color-accent: #F7E06E`

### 2.2 Playful Palette

- `--color-purple: #A29DE4`
- `--color-orange: #FFA16D`
- `--color-blue: #5BB7EA`
- `--color-success: #6BD89D`
- `--color-warning: #FFD166`

### 2.3 Neutral / Base

- `--color-bg: #F5F3EF`（画面背景）
- `--color-surface: #FFFFFF`（カード・フォーム）
- `--color-text-main: #2F2F2F`
- `--color-text-sub: #7A7A7A`
- `--color-border-soft: #E6E6E6`
- `--color-divider: #FF6B6B`（セクション区切り線）

## 3. タイポグラフィ

### 3.1 フォントファミリー

- 英字見出し: **Quicksand**
- 和文本文: **M PLUS Rounded**

推奨フォールバック:

```css
font-family: "Quicksand", "M PLUS Rounded 1c", "Hiragino Kaku Gothic ProN", sans-serif;
```

### 3.2 タイプスケール（推奨）

- `--font-size-xxl: 36px`（ページタイトル）
- `--font-size-xl: 24px`（セクション見出し）
- `--font-size-lg: 20px`（カード見出し）
- `--font-size-md: 16px`（本文）
- `--font-size-sm: 14px`（補足）
- `--font-size-xs: 12px`（キャプション）

### 3.3 行間

- 見出し: `1.25`
- 本文: `1.6`

## 4. 角丸・余白・影

- 基本角丸: `12px`
- 小さな pill 要素（タグ）: `9999px`
- カード余白: `20px`
- セクション間隔: `24px`〜`40px`
- 軽いシャドウ: `0 4px 12px rgba(0, 0, 0, 0.08)`

## 5. コンポーネント仕様

## 5.1 Buttons

### Variants

1. **Primary**
   - 背景: `--color-primary`
   - 文字: `#FFFFFF`
2. **Secondary**
   - 背景: `--color-secondary`
   - 文字: `#FFFFFF`
3. **Accent**
   - 背景: `--color-accent`
   - 文字: `--color-text-main`
4. **Outline**
   - 背景: `transparent`
   - 枠線: `1px solid --color-primary`
   - 文字: `--color-primary`
5. **Ghost**
   - 背景: `transparent`
   - 文字: `--color-text-main`

### Sizes（推奨）

- `sm`: 高さ `28px` / 左右 `12px` / 文字 `12px`
- `md`（default）: 高さ `36px` / 左右 `16px` / 文字 `14px`
- `lg`: 高さ `44px` / 左右 `20px` / 文字 `16px`

### 状態

- Hover: 明度を少し下げる（`filter: brightness(0.96)`）
- Disabled: 不透明度 `0.5` + `cursor: not-allowed`

## 5.2 Chips / Tags

- 形状: pill
- 高さ: `22px`〜`26px`
- 横余白: `8px`〜`10px`
- 文字サイズ: `11px`〜`12px`
- 用途: 難易度、時間、食材タイプ、状態（対象/予定 など）

## 5.3 Forms

- コンテナ: 白背景カード + 角丸 + シャドウ
- Label: `12px`〜`13px`, セミボールド
- Input/Select/Textarea
  - 高さ: `36px`（textarea 以外）
  - 枠線: `1px solid --color-border-soft`
  - フォーカス: `border-color: --color-secondary`
  - 角丸: `8px`
- 送信ボタン: 幅いっぱいの Primary

## 6. レイアウト指針

- 全体は中央寄せの 1 カラム。
- 推奨コンテンツ幅: `min(760px, 92vw)`
- セクション見出し下に Primary 色の細い区切り線を置く。
- 視線誘導順: タイトル → 色 → 文字 → コンポーネント（Button/Tag/Form）

## 7. 実装用デザイントークン（CSS Variables）

```css
:root {
  --color-primary: #FF6B6B;
  --color-secondary: #4ECDC4;
  --color-accent: #F7E06E;

  --color-purple: #A29DE4;
  --color-orange: #FFA16D;
  --color-blue: #5BB7EA;
  --color-success: #6BD89D;
  --color-warning: #FFD166;

  --color-bg: #F5F3EF;
  --color-surface: #FFFFFF;
  --color-text-main: #2F2F2F;
  --color-text-sub: #7A7A7A;
  --color-border-soft: #E6E6E6;
  --color-divider: #FF6B6B;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-pill: 9999px;

  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.08);
}
```

## 8. 運用ルール

- 新規 UI を作る際は、まず本ドキュメントのトークンを再利用する。
- 新しい色を増やす前に、既存の Playful Palette で表現可能か確認する。
- 似たコンポーネントは Variant 追加で対応し、別物として増やしすぎない。
