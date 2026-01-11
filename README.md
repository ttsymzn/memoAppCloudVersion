# MemoApp - クラウド版メモアプリ

Supabaseを使用したプレミアムなメモアプリケーションです。ユーザー認証、タグ管理、プライベート/パブリックメモ機能を備えています。

## 機能

- ✉️ **メール認証ログイン** - メールアドレスに送信されるマジックリンクでログイン
- 👤 **ユーザーごとのメモ管理** - 各ユーザーが自分のメモを管理
- 🔒 **プライベート/パブリック切り替え** - メモを非公開または公開に設定
- 🏷️ **タグ管理** - グループ化されたタグでメモを整理
- 🔍 **検索機能** - 内容やタグで素早く検索
- 💾 **自動保存** - 編集中のメモを自動的に保存
- ⌨️ **キーボードショートカット** - 効率的な操作

## セットアップ手順

### 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com)にアクセスしてアカウントを作成
2. 新しいプロジェクトを作成
3. プロジェクトのURLとAPIキー（anon public key）をメモ

### 2. データベースのセットアップ

Supabaseのダッシュボードで、SQL Editorを開き、以下のいずれかを実行:

#### 新規セットアップの場合
`supabase/schema.sql` の内容をコピーして実行

#### 既存のデータベースをマイグレーションする場合
`supabase/migration.sql` の内容をコピーして実行

**重要**: マイグレーション後、既存のメモにuser_idを割り当てる必要があります:
```sql
-- 既存のメモを削除する場合
DELETE FROM memos WHERE user_id IS NULL;

-- または特定のユーザーに割り当てる場合
UPDATE memos SET user_id = 'your-user-id' WHERE user_id IS NULL;

-- その後、user_idをNOT NULLに設定
ALTER TABLE memos ALTER COLUMN user_id SET NOT NULL;
```

### 3. メール認証の設定

1. Supabaseダッシュボードで **Authentication** > **Providers** に移動
2. **Email** プロバイダーが有効になっていることを確認
3. **Email Templates** で、必要に応じてメールテンプレートをカスタマイズ
4. **URL Configuration** で、Site URLを設定（例: `http://localhost:8000` または本番URL）

### 4. アプリケーションの設定

`index.html` の `SUPABASE_CONFIG` セクションを更新:

```javascript
window.SUPABASE_CONFIG = {
    url: 'https://your-project.supabase.co',
    key: 'your-anon-public-key'
};
```

### 5. アプリケーションの起動

ローカルサーバーを起動:

```bash
# Pythonを使用する場合
python -m http.server 8000

# Node.jsのhttp-serverを使用する場合
npx http-server -p 8000
```

ブラウザで `http://localhost:8000` を開きます。

## 使い方

### ログイン

1. メールアドレスを入力して「ログインコードを送信」をクリック
2. メールに届いたリンクをクリック
3. 自動的にログインされ、アプリが表示されます

### メモの作成

1. 「New Memo」ボタンをクリック、または `Alt + N` を押す
2. 1行目がタイトルになります
3. タグを選択（複数選択可能）
4. プライベート/パブリックを切り替え
5. 自動保存されます（または `Ctrl + S` で手動保存）

### タグの管理

- サイドバーの「+」ボタンでタグを追加
- タグにカーソルを合わせて設定アイコンをクリックして編集
- グループ名、色、順序を設定可能

### キーボードショートカット

- `/` - 検索にフォーカス
- `Alt + N` - 新しいメモを作成
- `Ctrl + S` - メモを保存（編集時）
- `Esc` - モーダルを閉じる

## データベーススキーマ

### memos テーブル
- `id` - UUID (主キー)
- `user_id` - UUID (外部キー: auth.users)
- `content` - TEXT (メモの内容)
- `tags` - UUID[] (タグIDの配列)
- `color` - TEXT (カードの背景色)
- `is_public` - BOOLEAN (公開/非公開)
- `created_at` - TIMESTAMP
- `updated_at` - TIMESTAMP

### tags テーブル
- `id` - UUID (主キー)
- `name` - TEXT (タグ名)
- `tag_group` - TEXT (グループ名)
- `sort_order` - INTEGER (表示順序)
- `color` - TEXT (タグの色)
- `created_at` - TIMESTAMP

## セキュリティ

- Row Level Security (RLS) が有効
- ユーザーは自分のメモのみ編集・削除可能
- パブリックメモは他のユーザーも閲覧可能
- 認証されたユーザーのみアクセス可能

## トラブルシューティング

### ログインメールが届かない
- スパムフォルダを確認
- Supabaseのメール設定を確認
- カスタムSMTPを設定することも可能

### メモが表示されない
- ブラウザのコンソールでエラーを確認
- Supabaseのログを確認
- RLSポリシーが正しく設定されているか確認

### 既存のメモが見えない
- マイグレーション後、既存のメモにuser_idが設定されているか確認
- SQLで確認: `SELECT * FROM memos WHERE user_id IS NULL;`

## ライセンス

MIT License

## 開発者

このアプリケーションは、モダンなWeb技術とSupabaseを使用して構築されています。
