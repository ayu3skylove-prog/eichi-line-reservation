---
name: project_v5_impl
description: v5/v6仕様書の実装済み内容（ページ分離・デザイン修正・iCal連携・Gmail SMTP）
metadata:
  type: project
---

v6仕様書（2026-10-18）の実装内容。

**Why:** 玄さん（ディレクター）からの要件定義。美身堂えいち鍼灸院の予約システム改修。

**How to apply:** 以下の実装状況を引き継いで作業を進める。

## 実装済み内容

### v5（2026-10-17以前）
- ページ分離: LP (`index.html`) と予約専用ページ (`reserve.html`) を分離
- デザイン修正: 和モダンUI、メニューカード、週間マトリクス、タイムテーブル
- iCal連携: Googleカレンダーの非公開iCal URLで予定ある時間帯を予約不可に

### v6（2026-10-18）
- `.lp-hero-logo` サイズ拡大: `clamp(108px, 14vw, 148px)` → `clamp(180px, 24vw, 260px)`、`opacity: 0.72` → `opacity: 0.88`
- Gmail SMTP実装（server.js）:
  - Node.js 組み込み `tls` モジュールで SMTPS（port 465）直接実装（npm パッケージ不要）
  - `sendGmailSmtp()`: 生のSMTPプロトコル実装
  - `buildPatientEmailBody()`: 患者向け予約確定メール本文
  - `buildClinicEmailBody()`: 院長向け新規予約通知メール本文
  - `sendBookingEmails()`: POST /api/bookings 後に非同期送信、try-catchでフォールバック
- 新APIエンドポイント:
  - `PUT /api/gmail-settings`: Gmail認証情報の保存（appPasswordは空送信で既存値保持）
  - `POST /api/gmail-test`: 院長宛てテストメール送信
- `GET /api/config`（認証済み）: `gmailAppPassword` は返さず `gmailAppPasswordSet: boolean` を返す
- 管理画面 admin.html/admin.js: Gmail設定フォーム（Gmailアドレス、アプリパスワード、通知先メール、テスト送信ボタン）

## db.json の Gmail 設定フィールド
- `settings.gmailUser`: 送信元Gmailアドレス
- `settings.gmailAppPassword`: Googleアプリパスワード（16桁）
- `settings.notifyEmail`: 院長通知先（未設定時は gmailUser 宛て）
