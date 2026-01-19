# リンク機能のテスト例

メモアプリに以下のようなテキストを入力すると、自動的にリンクに変換されます：

## Webリンク
- https://www.google.com
- http://example.com
- www.github.com

## ファイルリンク（file://プロトコル）
- file:///home/user/documents/report.pdf
- file:///C:/Users/username/Desktop/file.txt

## ファイルパス（自動的にfile://リンクに変換）
- /home/user/documents/memo.txt
- /usr/local/bin/app
- C:\Users\username\Documents\report.docx
- D:\Program Files\Application\app.exe

## メールアドレス
- example@example.com
- user.name@company.co.jp
- contact@test-domain.org

## 使用例

以下のようなメモを作成してテストできます：

```
プロジェクト資料

参考URL: https://github.com/example/project
ドキュメント: file:///home/user/docs/specification.pdf
設定ファイル: /etc/config/app.conf
問い合わせ: support@example.com
```

## 注意事項

1. **Webリンク**: 新しいタブで開きます（`target="_blank"`）
2. **ファイルリンク**: ブラウザのセキュリティ設定により、ローカルファイルへのアクセスが制限される場合があります
3. **メールリンク**: デフォルトのメールクライアントが起動します
4. **リンクの色**:
   - Webリンク: 紫色（`--primary-light`）
   - ファイルリンク: 緑色
   - メールリンク: 青色
