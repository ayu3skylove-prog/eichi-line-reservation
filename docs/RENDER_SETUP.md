# Render公開手順

LINE公式から患者さんが予約できるようにするための公開手順です。

## 先に知っておくこと

GitHubは「保管場所」です。LINEから開ける予約URLにするには、Renderのような公開サーバーで動かします。

この予約システムは予約データを書き込むため、実運用ではデータが消えない設定が必要です。Renderでは、永続ディスクを付ける設定にします。

## Renderで入れる値

- Service Type: `Web Service`
- Repository: `ayu3skylove-prog/eichi-line-reservation`
- Root Directory: `eichi-line-reservation-upload`
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

## 環境変数

Renderの Environment Variables に以下を追加します。

```text
ADMIN_PASSWORD=管理画面に入る強いパスワード
DB_PATH=/var/data/db.json
```

`ADMIN_PASSWORD` は外部公開前に必ず変更します。

## ディスク

予約データを残すため、Renderの Advanced で Disk を追加します。

```text
Name: reservation-data
Mount Path: /var/data
Size: 1 GB
```

## 公開後に見るURL

Renderが発行したURLが `https://example.onrender.com` だった場合:

```text
患者さん予約ページ
https://example.onrender.com/

管理画面
https://example.onrender.com/admin.html
```

この患者さん予約ページのURLをLINE公式のリッチメニュー、プロフィール、自動応答に貼ります。

## 動作確認

1. 患者さん予約ページを開く
2. メニュー、日付、時間を選ぶ
3. テスト予約を入れる
4. 管理画面にログインする
5. 週カレンダーに予約が出ることを確認する
6. 予約時間に治療時間プラス30分の枠が埋まることを確認する
