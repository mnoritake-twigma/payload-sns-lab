# Wave 4: Oktaの設定と確認

状態: 連携コードとモックOIDCテストを実装済み。実際のOktaでのログインは未確認です。ユーザーから「Okta環境あり・アプリ登録可能」と確認済みで、issuer URLとアプリ設定の入力待ちです。Wave 4全体は未完了として扱います。

## 1. Oktaにアプリを登録

Okta Admin ConsoleのApplicationsからCreate App Integrationを開き、次の設定で専用の検証アプリを作成します。フロントはReactですが、認証コード交換と秘密情報の保持をバックエンドが担当するため、種類はWeb Applicationです。

| 項目 | 設定 |
| --- | --- |
| Sign-in method | OIDC - OpenID Connect |
| Application type | Web Application |
| Name | Payload SNS Lab |
| Grant type | Authorization Code |
| Client authentication | Client secret (`client_secret_basic`) |
| PKCE | S256を使用。必須化できる場合は有効にする |
| Sign-in redirect URI | `http://127.0.0.1:5173/api/oidc/callback` |
| Login initiated by | App Only |
| Assignments | 検証に使うユーザーまたはグループだけを割り当てる |
| Scopes | `openid profile` |
| ID token signature | RS256 |

この実装はSNS側のログアウトを提供し、Okta側のSSOログアウトURLは呼びません。Sign-out redirect URIを使うSLOは別機能です。Okta全体からのログアウトを利用者に期待させないよう、画面でも説明します。

## 2. ローカルに設定

`apps/backend/.env` の次の値を設定してください。ファイルはGitの対象外です。client secretはチャット、README、フロントの `VITE_*` 環境変数へ貼り付けません。

```dotenv
APP_URL=http://127.0.0.1:5173
OKTA_ISSUER=https://YOUR_OKTA_ORG
OKTA_CLIENT_ID=YOUR_CLIENT_ID
OKTA_CLIENT_SECRET=YOUR_CLIENT_SECRET
```

issuerは実際に使用するAuthorization Serverの値です。Org Authorization Serverなら組織のベースURL、Custom Authorization Serverなら例えば `https://YOUR_OKTA_ORG/oauth2/default` です。末尾のパスを推測せず、Okta側で確認したIssuer URIを使ってください。認可ポリシーがある場合は、検証アプリと割当ユーザーのAuthorization Codeフローを許可します。

アプリは `http://127.0.0.1:5173/` から開いてください。`localhost`は別ホストであり、APP_URLや登録済みredirect URIと混在させません。Cookieはブラウザーのホストに紐付きます。

## 3. 起動と接続確認

Node.js 24.22.2を使用します。既存サーバーを止めてから以下を実行します。

```sh
npm ci
npm run migrate
npm run okta:check
npm run dev
```

`okta:check` はDiscoveryメタデータへの接続だけを確認します。client secretの正しさとユーザー割当は、実ログインで確認する必要があります。設定変更とカスタム認証Strategyの変更後はサーバーを再起動してください。

未設定ならログイン画面のOktaボタンは無効です。設定済みなら「Oktaでログイン」からOktaへ移動します。初回は `okta_...` というSNS専用usernameで一般ユーザーを作成します。表示名はID tokenのname、なければ「Oktaユーザー」です。ローカルのalice/bobとは別ユーザーです。

## 4. 認証の流れ

```text
Reactのログインフォーム
  → POST /api/oidc/login（Originを確認）
  → Okta /authorize（state・nonce・PKCE challenge）
  → Oktaで本人確認
  → GET /api/oidc/callback（認証コード）
  → サーバーからOkta /token（client secret・PKCE verifier）
  → ID tokenの署名・issuer・audience・期限・nonceを検証
  → issuer＋subjectからSNSユーザーを解決
  → SNS専用HttpOnly Cookieを発行（1時間）
  → Payload Custom Strategyがreq.userを設定
  → 既存のposts/followsのAccess Controlを適用
```

短期の認証フロー情報は暗号化したHttpOnly Cookie（10分）に保存し、stateの消費をDBの一意制約で記録します。同じcallbackを同時に送っても処理は1回だけです。redirect先は設定したAPP_URLに固定し、任意のreturn URLを受け付けません。

## 5. データとセッション

| Collection | 用途 |
| --- | --- |
| `users.authProvider` | local / okta。既存ユーザーはlocal。外部ユーザーのパスワードログインを禁止 |
| `auth-identities` | issuer・subject・user。issuer＋subjectを複合一意制約 |
| `oidc-sessions` | SNSセッションのSHA-256ハッシュ・user・expiresAt。生トークンは保存しない |
| `oidc-flows` | 使用済みstateのハッシュと期限。callbackの再利用を拒否 |

認証専用3Collectionは管理者を含む公開APIから読み書きできません。検証済みcallbackや認証Strategyからだけ内部処理として操作します。このため `overrideAccess: true` の使用箇所はseedに加えて認証内部処理にもあります。通常の投稿・フォロー操作は権限を迂回しません。

SQLiteアダプターは既定でトランザクションを開始しないため、初回ユーザー・外部ID対応・SNSセッションの作成では、固定バージョンの `@payloadcms/drizzle` APIで明示的に開始します。プロセス内では処理を順番に行い、DBの一意制約とロールバックで途中のユーザーだけ残る状態を防ぎます。高負荷・複数プロセス運用は別途検証対象です。

ローカル認証とOkta認証は同じ `payload-token` Cookieを使用します。ローカルの場合はPayload JWT、Oktaの場合はランダムなopaque値で、カスタムStrategyが期限とDB照合を行います。`/api/users/me` と `/api/users/logout` は両方式で共通です。Oktaセッションの自動延長は行わず、期限後は再ログインします。OktaのID/access tokenとclient secretをフロントへ返さず、refresh tokenも要求・保存しません。

「ログアウト」はSNSセッションを失効させ、古いCookieを再送しても保護APIを利用できなくします。OktaのSSO Cookieは残るので、再ログイン時にパスワードを再入力せず認証できる場合があります。また、Okta側の無効化を既発行SNSセッションへ即時反映する機能はなく、最大1時間の期限で終了します。

## 6. 検証済みと未検証

`npm run test:oidc` は一時ディレクトリの専用SQLiteと署名鍵を生成し、実装本体のOIDC処理とPayload RESTハンドラーを呼び出します。アプリ本体にモック用エンドポイントや認証を省略する設定はありません。

検証済み: state不一致、別フローCookie、Cookie改ざんと期限切れ、認可キャンセル、署名改ざん、issuer/audience/nonce不一致、ID token期限切れと欠落、PKCE不一致、callbackの同時再利用、初回対応付けの同時実行、me、非公開Collection、管理者制限、投稿・フォローの本人制約、SNSセッション期限切れ、改ざん、ログアウト後の拒否、Oktaユーザーのローカルログイン禁止。

実Oktaで確認が必要な項目:

- [ ] Discovery接続とclient認証
- [ ] 割当ユーザーのログイン、必要なMFA、認可キャンセル
- [ ] 初回のSNSユーザー作成と再ログインでの同一ユーザー解決
- [ ] 画面から投稿・フォロー・解除
- [ ] ブラウザー再読込とサーバー再起動後の復元
- [ ] SNSログアウト後の保護API拒否
- [ ] SNSログアウトとOkta SSO継続の説明を確認

モック成功だけではWave 4完了にしません。実環境の結果は[チケット台帳](../TICKETS.md)へ記録します。

## 公式資料

- [Okta: Web Applicationの登録とリダイレクトログイン](https://developer.okta.com/docs/guides/sign-into-web-app-redirect/main/)
- [Okta: Authorization Code with PKCE](https://developer.okta.com/docs/guides/implement-grant-type/authcodepkce/main/)
- [Okta: アプリとIdPのセッション](https://developer.okta.com/docs/concepts/session/)
- [Payload: Custom Strategies](https://payloadcms.com/docs/authentication/custom-strategies)
- [openid-client](https://github.com/panva/openid-client)
