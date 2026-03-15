# gallery.config.json schema (v1)

`config/gallery.config.json` は写真ギャラリー生成と Wrangler デプロイ名を制御する設定ファイルです。

## 最小構成

```json
{
  "site": {
    "title": "Photo Archive",
    "subtitle": "Event Gallery",
    "favicon": "favicon.ico",
    "noticeHtml": "...",
    "footer": "&copy; ..."
  },
  "deploy": {
    "workerName": "my-photo-archive"
  },
  "paths": {
    "originalRoot": "static/IMG",
    "lightRoot": "static/IMG_light",
    "thumbRoot": "static/IMG_thumb",
    "zipRoot": "static/ZIP",
    "galleryDataPath": "static/gallery-data.json"
  },
  "image": {
    "lightShortSide": 1900,
    "lightJpegQuality": 80,
    "thumbWidth": 400,
    "thumbWebpQuality": 70,
    "batch": 4
  },
  "zip": {
    "maxSizeMiB": 25,
    "recompressLevel": 9
  },
  "tabs": [
    {
      "id": "day1",
      "label": "1日目",
      "descriptionHtml": "",
      "sections": [
        {
          "id": "opening",
          "title": "開会",
          "folder": "開会",
          "zipEnabled": true,
          "isOral": false
        }
      ]
    }
  ]
}
```

## フィールド

- `site.title`: ヘッダータイトル
- `site.subtitle`: ヘッダーサブタイトル
- `site.favicon`: 任意。ファビコン指定。文字列 (`"favicon.ico"`) またはオブジェクト (`{"href":"favicon.png","type":"image/png"}`)
- `site.noticeHtml`: ページ上部のお知らせHTML
- `site.footer`: フッターHTML
- `site.hero`: 任意。`thumb`, `light`, `original`, `caption`

- `deploy.workerName`: Wrangler の Worker 名。`deploy:gallery` / `dev:gallery` 実行時に `.wrangler.generated.toml` へ反映されます

- `paths.originalRoot`: 元画像ルート
- `paths.lightRoot`: 軽量版画像の出力先
- `paths.thumbRoot`: サムネイル画像の出力先
- `paths.zipRoot`: ZIPの出力先
- `paths.galleryDataPath`: `index.html` が読み込むデータJSON出力先

- `image.lightShortSide`: 軽量版の短辺サイズ
- `image.lightJpegQuality`: 軽量版JPEG品質（JPEG入力時）
- `image.thumbWidth`: サムネイル幅
- `image.thumbWebpQuality`: サムネイルWebP品質
- `image.batch`: 変換並列数

- `zip.maxSizeMiB`: ZIPサイズ警告閾値
- `zip.recompressLevel`: 再圧縮レベル（0-9）

- `tabs[].id`: タブID（一意）
- `tabs[].label`: タブ表示名
- `tabs[].descriptionHtml`: タブ先頭説明（任意）
- `tabs[].sections[]`: セクション定義
- `sections[].id`: セクションID（全体で一意）
- `sections[].title`: セクション見出し
- `sections[].folder`: `originalRoot` からの相対フォルダ（`IMG/` プレフィックスがあっても可）
- `sections[].zipEnabled`: false の場合はZIPを作成しない
- `sections[].isOral`: true の場合は注意文を表示

## 出力される成果物

- `paths.lightRoot`: 軽量版画像
- `paths.thumbRoot`: WebPサムネイル
- `paths.zipRoot`: セクション別ZIP
- `paths.galleryDataPath`: 表示用JSON

