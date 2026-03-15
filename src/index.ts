/**
 * Cloudflare Workers + Static Assets で Basic認証をかける
 *
 * パスワードのみで認証（ユーザー名は何を入れても無視）
 *
 * @see https://developers.cloudflare.com/workers/examples/basic-auth/
 * @see https://developers.cloudflare.com/workers/static-assets/binding/
 */

export interface Env {
  GALLERY_PASSWORD: string;
  ASSETS: Fetcher;
}

const encoder = new TextEncoder();

/**
 * タイミング攻撃を防ぐ安全な文字列比較
 * @see https://developers.cloudflare.com/workers/runtime-apis/web-crypto/#timingsafeequal
 */
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.byteLength !== bBytes.byteLength) {
    // 長さが異なる場合も一定時間で比較（長さのリークを防ぐ）
    return !crypto.subtle.timingSafeEqual(aBytes, aBytes);
  }

  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 環境変数未設定の場合はアクセス拒否（安全側に倒す）
    if (!env.GALLERY_PASSWORD) {
      return new Response("Server configuration error.", { status: 500 });
    }

    const url = new URL(request.url);

    // /logout: 401を返してブラウザのBasic認証キャッシュを無効化
    // WWW-Authenticateヘッダーを付けないことで再ダイアログを防ぐ
    if (url.pathname === "/logout") {
      return new Response("Logged out.", { status: 401 });
    }

    // Authorization ヘッダーの確認
    const authorization = request.headers.get("Authorization");

    if (!authorization) {
      return new Response("Authentication required.", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Photo Archive", charset="UTF-8"',
        },
      });
    }

    const [scheme, encoded] = authorization.split(" ");

    // Basic スキーム以外は拒否
    if (!encoded || scheme !== "Basic") {
      return new Response("Malformed authorization header.", { status: 400 });
    }

    // Base64 デコード
    const buffer = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(buffer).normalize();

    // user:password 形式の分割
    const index = decoded.indexOf(":");
    if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
      return new Response("Invalid authorization value.", { status: 400 });
    }

    // パスワードのみ検証（ユーザー名は無視）
    const password = decoded.substring(index + 1);

    if (!timingSafeEqual(password, env.GALLERY_PASSWORD)) {
      return new Response("Invalid credentials.", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Photo Archive", charset="UTF-8"',
        },
      });
    }

    // 認証通過 → 静的アセットを配信
    const response = await env.ASSETS.fetch(request);

    // キャッシュヘッダー最適化
    // - private: CDNキャッシュには載せない（認証が必要なため）
    // - 画像: ブラウザキャッシュ1日（ZIP一括DL高速化にも効く）
    // - HTML/その他: 毎回サーバーに再検証を要求
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'"
    );

    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.startsWith("image/")) {
      headers.set("Cache-Control", "private, max-age=86400");
    } else {
      headers.set("Cache-Control", "private, no-cache");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
