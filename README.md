# Payload SNS Lab

React / Vite / Tailwind CSSの画面を、Payload / Next.js / SQLiteにREST APIで接続する学習用SNSです。Wave 1のローカル認証、Wave 2の投稿、Wave 3のフォローを実装しています。

## 起動

Node.js **24.22.2**を推奨します（Payload 3.92.1の要件は `^22.23.4 || >=24.22.1`）。通常のNode.js 20では実行できません。

```sh
nvm use
npm ci
npm run setup
npm run migrate
npm run seed
npm run dev
```

- SNS画面: http://127.0.0.1:5173
- Payload管理画面: http://127.0.0.1:4310/admin
- 一般ユーザー: `alice` / `bob`
- 管理者: `admin`

パスワードは `apps/backend/.env` の `SEED_MEMBER_PASSWORD` と `SEED_ADMIN_PASSWORD` です。setupがローカル検証用の値をランダム生成し、このファイルを権限600で保存します。`.env`を公開しないでください。seedの再実行は既存ユーザーを変更しません。後で管理画面からパスワードを変更した場合は、その変更後の値を使用します。

`setup`は既存の.envを上書きしません。SQLiteのデータは `apps/backend/data/sns.db` に残ります。停止は起動したターミナルでCtrl+Cです。サーバーはループバックにだけバインドします。

既存環境を更新する場合は、サーバーを停止して `npm run migrate` を実行してから起動してください。既存ユーザーは保持され、必要な投稿・フォロー用テーブルが追加されます。

## いま試せること

1. `alice`でログインして、認証済みのアカウントを確認。
2. ブラウザーを再読込して、ログイン状態が戻ることを確認。
3. 「接続のしくみ」でAPIとCookieの役割を確認。
4. 「APIとのやりとり」で実際のリクエストのパスと結果を確認。
5. ログアウトし、ログイン画面に戻ることを確認。
6. `admin`でログインし、管理画面でユーザーを確認・追加。一般ユーザーは管理画面を利用できません。

7. ログイン後の投稿フォームで500文字以内の本文を投稿。新着順・20件ずつの一覧に反映されます。
8. 自分の投稿の「削除」→「削除する」を押して削除。他人の投稿には削除ボタンが出ません。

ブラウザーの開発者ツールのNetworkでも通信を確認できます。パスワードはHTTPSで保護されたログインリクエストの本文として送るのが本番構成です。このローカル検証はHTTPで、CookieのSecureはproductionで有効になります。ブラウザーのlocalStorageに認証情報を保存しません。

## 画面からDBまで

```text
ブラウザー React / Vite / Tailwind CSS  :5173
  └─ /api へのHTTPリクエスト
       └─ Viteプロキシ → Payload / Next.js  :4310
            ├─ 認証とアクセス制御
            └─ SQLite  apps/backend/data/sns.db
```

フロントのコードはPayloadやSQLiteを直接importしません。バックエンドではusersの定義からAPI、認証、管理画面が生成されます。Viteのプロキシは開発用です。公開時のリバースプロキシとHTTPSは後続の設計対象です。

## Wave 1のAPI

| API | 用途 |
| --- | --- |
| `POST /api/users/login` | usernameとpasswordでログインしHttpOnly Cookieを発行 |
| `GET /api/users/me` | 現在のユーザー。未認証はuserがnull |
| `POST /api/users/logout` | 現在のセッションを終了 |
| `GET /api/users` | ログインユーザーによるプロフィール取得 |
| `POST /api/users` | 管理者だけがユーザー作成 |
| `PATCH /api/users/:id` | 管理者だけがユーザー変更 |
| `GET /api/access` | 操作権限を取得。許可されない項目が省略される場合あり |

セッションは1時間です。画面はフォーカス復帰時と60秒ごとに状態を確認し、セッションが終わっていればログイン画面へ戻ります。ログアウトはサーバーのセッションも終了するため、古いCookieを再送しても使えません。

Cookie認証のAPIテストでは、許可されたOriginを付けてください。今回のPayloadではCSRF許可リストを設定しているため、OriginもSec-Fetch-SiteもないクライアントからのCookie認証は拒否されます。CORSを広く許可する設定にはしていません。

## データと権限の設計

`apps/backend/src/collections/Users.ts` がユーザーの定義です。usernameは一意、roleはmemberかadmin、メールは本人か管理者だけが読めます。一般ユーザーのユーザー作成・更新・削除、role変更、管理画面へのアクセスはサーバーで拒否します。ユーザー削除は関連データの扱いを決めるまで管理者にも提供しません。

`auth: { loginWithUsername: ... }` がPayloadの標準認証を有効にします。パスワードの保存・照合とセッションはPayloadが担当します。管理画面でユーザーを追加するときは12文字以上のパスワードを設定します。

生成された実テーブルやインデックスは、次で確認できます。ユーザーデータや認証情報は表示しません。

```sh
npm run db:inspect
```

`users`に加えて、セッション、管理画面の設定やロック、マイグレーション用の補助テーブルが見えます。初期マイグレーションは `apps/backend/src/migrations/` に保存しています。開発時の自動スキーマ反映は無効にし、マイグレーションを明示的に実行します。

データ定義を変更した場合は次の順です。

```sh
npm run generate:types -w @sns/backend
npm run migrate:create -w @sns/backend
npm run migrate
```

サーバー内でPayloadのLocal APIを使う際は、利用者操作には `overrideAccess: false` と認証ユーザーを指定します。このWaveではUIから標準REST APIを使い、権限を迂回するLocal APIはseedに限定しています。

## 検証

```sh
npm run typecheck
npm run build
# 別ターミナルで npm run dev を起動した状態で実行
npm run test:auth
npm run test:posts
npm run test:follows
```

統合テストはViteプロキシ経由でPayloadとSQLiteを操作します。未認証の拒否、誤パスワード、Cookie属性、meによる復元、秘密フィールドの非公開、権限変更の拒否、管理者権限、不正Origin、ユーザー名重複、ログアウト後の古いCookieの無効化を確認します。

テストはseedのパスワードを使うので、admin/aliceのパスワードを変更した環境ではテスト用の別DBを用意してください。失敗回数によるロックは5回・10分です。意図的に誤パスワードを繰り返すと、検証ユーザーがロックされます。

管理画面とバックエンドのビルドにはWebpackを使います。SNSフロントのビルドはViteです。開発サーバーを止めてからproductionビルドを実行してください。公開デプロイ、メール送信、パスワードリセットUIは今回の対象外です。

## 次のWave

Wave 3（フォロー）まで完了しました。次はWave 4のOktaです。詳細は[要件Doc](docs/payload-sns-plan.md)と、[チケット台帳](TICKETS.md)を参照してください。Okta環境・アプリ登録権限はWave 4で確認し、実環境で成功するまで完了にはしません。

## Wave 2: 投稿のしくみ

Reactの `Timeline.tsx` → `POST /api/posts` → Payloadのアクセス制御とHook → SQLiteの `posts` テーブル、という順に処理します。独自のCRUDルートやSQLをフロントから呼ぶ実装は不要です。`Posts.ts` のCollection定義から標準REST APIと管理画面が生成されます。

| API | 挙動 |
| --- | --- |
| `POST /api/posts` | 本文を送信。ログインユーザーをauthorとしてサーバーが設定 |
| `GET /api/posts?sort=-createdAt,-id&limit=20&page=1&depth=1` | 新着順、同時刻はID降順。authorのプロフィールを展開 |
| `GET /api/posts?where[author][equals]=1` | 特定ユーザーの投稿を絞り込む標準API |
| `DELETE /api/posts/:id` | 本人の投稿だけ削除。管理者にも他人の削除権限は付けない |
| `PATCH /api/posts/:id` | 投稿編集は対象外のため全ユーザーで拒否 |

`body`は空白だけを拒否し、UTF-16コード単位で最大500文字です（絵文字によっては2文字分）。改行を保持し、HTMLは文字として表示します。送信中は二重操作を防ぎ、取得失敗時は一覧の再読込ができます。ページ分割は都度取得するため、別ユーザーが投稿・削除するとページ境界は変わります。

`author`はusersへのRelationshipです。生成されたSQLiteでは必須の `author_id` と外部キーになり、authorとcreatedAtにインデックスが付きます。Payloadのロック管理用の関連テーブルにもpostsへの参照が追加されます。ユーザー削除は現在禁止しており、将来許可する際は関連投稿の保持・削除と外部キーの挙動を合わせて設計します。

投稿者の偽装はHookで拒否し、削除はAccess Controlが `author = ログインユーザーID` の条件を適用します。プロフィールを展開しても、他人のemailやパスワードのハッシュは返りません。投稿時刻をクライアントから上書きすることも許可しません。

投稿テストはalice/bobで一時投稿を作り、終了時に削除します。空白、文字数境界、偽装、他人の削除、編集拒否、21件のページ分割、関連先の秘密情報非公開、SQLiteの保存を確認します。専用のローカル検証環境で実行してください。

参考: [Collection Hooks](https://payloadcms.com/docs/hooks/collections)、[Access Control](https://payloadcms.com/docs/access-control/overview)。

## Wave 3: ユーザーとフォロー

ログイン後に「ユーザー・フォロー」を開きます。ユーザー一覧の「フォローする」で関係を作成し、「自分のフォロー中」で確認できます。「詳細と投稿を見る」ではプロフィールとその人の投稿を表示します。自分にはフォローボタンを出さず、解除後は再フォローできます。一覧は20件ずつ取得します。

| API | 用途・権限 |
| --- | --- |
| `GET /api/users?sort=username&limit=20&page=1` | ログインユーザー向けのプロフィール一覧 |
| `GET /api/users/:id` | ユーザー詳細。メールの非公開制御は従来どおり |
| `POST /api/follows` | `{ "following": 対象ID }` を送信。followerはログインユーザーから決定 |
| `GET /api/follows?where[follower][equals]=自分のID&depth=1` | 自分のフォロー中。followingのプロフィールを展開 |
| `DELETE /api/follows/:id` | 関係レコードのIDを指定して解除。follower本人のみ許可 |
| `PATCH /api/follows/:id` | 関係の書き換えは全員拒否。変更は解除と新規作成で行う |

`follows`は、usersを2回参照する中間テーブルです。1人が複数の人をフォローでき、1人が複数の人からフォローされる「多対多」を表現します。各関係レコードからusersへの参照は単一のRelationshipです。

`Follows.ts`の `indexes: [{ fields: ['follower', 'following'], unique: true }]` から、SQLiteに `UNIQUE (follower_id, following_id)` が生成されます。存在チェックだけでは同時送信で競合するため、重複の最終防御をDBに任せます。実際のマイグレーションは `apps/backend/src/migrations/20261029_105104.ts` にあります。

Hookで自己フォロー・他人名義・不正な対象ID・対象ユーザー不在を拒否します。対象確認のLocal APIには `req` と `overrideAccess: false` を指定します。解除はAccess Controlのfollower条件で制限し、管理者にも他人の関係を解除する権限を付けていません。閲覧は認証済みユーザーに許可します。ユーザー削除は引き続き禁止です。

作成・解除後はサーバーから関係を再取得します。他タブで変更済みの場合も再取得して操作を続けられます。Payloadの標準応答では、重複作成は400、権限制御で削除済みレコードが見つからない場合は403になるため、HTTPステータスだけで「未ログイン」とは判断せず、meで認証状態を確認します。

`npm run test:follows` は6件の同時作成、DB一意インデックス、本人制約、自己フォロー、対象不在、解除済みへの再解除、再フォロー、投稿のauthor絞り込みを確認します。alice→bobの既存関係があると、その関係を壊さないようテストをスキップします。全項目を検証するには専用DBを使うか、画面からその関係を解除して実行してください。テスト自身が作成した関係と投稿は後処理で削除します。

公式資料: [Payloadの複合インデックス](https://payloadcms.com/docs/database/indexes)。
