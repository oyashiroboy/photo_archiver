# Photo Share Static CMS (Cloudflare Workers)

Node.js だけで写真共有用の静的サイトを生成し、Wrangler でデプロイできるテンプレートです。

## 特徴

- 設定ファイル (`config/gallery.config.json`) 駆動
- 1コマンドで画像派生生成 + ZIP生成 + 表示データ生成
- Cloudflare Workers (Static Assets) 配信
- Basic認証でアクセス保護
- Worker名 (`wrangler` の `name`) も設定ファイルで可変

## クイックスタート

1. 依存インストール

```bash
npm install
```

2. 設定編集

- `config/gallery.config.json` の以下を編集
- `site` (タイトル等。任意で `favicon` も指定可)
- `deploy.workerName`
- `tabs` と `sections`

3. 写真を配置

- 元画像を `static/IMG/<セクションフォルダ>/...` に配置

4. 生成実行

```bash
npm run build:gallery
```

5. ローカル確認

```bash
npm run dev:gallery
```

6. デプロイ

```bash
npm run deploy:gallery
```

## コマンド

- `npm run build:gallery`
  - 画像変換 (`IMG_light`, `IMG_thumb`)
  - セクションZIP生成 (`ZIP`)
  - `static/gallery-data.json` 生成

- `npm run prepare:wrangler`
  - `gallery.config.json` の `deploy.workerName` を使って `.wrangler.generated.toml` を生成

- `npm run dev:gallery`
  - `prepare:wrangler` 実行後に `wrangler dev --config .wrangler.generated.toml`

- `npm run deploy:gallery`
  - `prepare:wrangler` 実行後に `wrangler deploy --config .wrangler.generated.toml`

## 認証

Basic認証は有効です。`GALLERY_PASSWORD` が必須です。

- ローカル: `.dev.vars` に `GALLERY_PASSWORD=your-password`
- 本番: `wrangler secret put GALLERY_PASSWORD`

## 設定仕様

詳細は `docs/config-schema.md` を参照してください。

## OSS公開時の注意

- 実写真データ（`static/IMG*`, `static/ZIP`）は公開前に削除してください
- サンプル画像や `.gitkeep` のみ残す運用を推奨します

## License

This repository uses a dual-license model:

- Non-commercial use: PolyForm Noncommercial 1.0.0
- Commercial use: separate commercial agreement with the author is required

See `LICENSE` for details.

