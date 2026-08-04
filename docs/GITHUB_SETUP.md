# GitHub管理メモ

## 推奨リポジトリ名

`eichi-line-reservation`

## 目的

美身堂 えいち鍼灸院のLINE公式アカウントから案内する予約システムを管理するためのリポジトリです。

## 初回作成時

GitHubで新しいリポジトリを作成します。

- Repository name: `eichi-line-reservation`
- Visibility: Private
- README追加: しない
- .gitignore追加: しない
- License追加: しない

作成後、リポジトリ名を Codex に伝えると、現在のコードをアップロードできます。

## 管理方針

- 画面や予約ロジックの変更はGitHubに残す
- 実予約データはGitHubに入れない
- 公開サーバーのパスワードや秘密情報は `.env` やサーバー側の環境変数で管理する
- 大きな変更前にコミットしておく

## GitHubに入れないファイル

`.gitignore` で以下を除外しています。

- `data/db.json`
- `data/db.json.*`
- `.env`
- `node_modules/`

