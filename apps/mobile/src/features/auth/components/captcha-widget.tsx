import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { AUTH_CONFIG } from "../auth.config";

interface CaptchaWidgetProps {
  onTokenChange: (token: string | null) => void;
  // Turnstile tokens are single-use; change this key after every submit to
  // load a fresh widget and get a new token.
  resetKey: number;
}

// Turnstile has no native SDK, so the widget runs in a WebView and posts the
// token back. The site key is JSON-encoded to keep it a plain string literal.
function buildTurnstileHtml(siteKey: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad" async defer></script>
  </head>
  <body style="margin:0;background:transparent">
    <div id="captcha"></div>
    <script>
      function post(message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); }
      function onTurnstileLoad() {
        turnstile.render("#captcha", {
          sitekey: ${JSON.stringify(siteKey)},
          theme: "auto",
          callback: function (token) { post({ type: "token", token: token }); },
          "expired-callback": function () { post({ type: "expired" }); },
          "error-callback": function () { post({ type: "error" }); }
        });
      }
    </script>
  </body>
</html>`;
}

/** Reads the token from a widget message; anything else clears the token. */
function parseCaptchaMessage(data: string): string | null {
  try {
    const message: unknown = JSON.parse(data);

    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "token" &&
      "token" in message &&
      typeof message.token === "string"
    ) {
      return message.token;
    }
  } catch {
    // Malformed messages clear the token below.
  }

  return null;
}

/** Renders Cloudflare Turnstile when a site key is configured; otherwise nothing. */
export function CaptchaWidget({ onTokenChange, resetKey }: CaptchaWidgetProps) {
  if (!AUTH_CONFIG.captchaSiteKey) {
    return null;
  }

  return (
    <View className="h-20 w-full">
      <WebView
        key={resetKey}
        originWhitelist={["*"]}
        scrollEnabled={false}
        source={{
          baseUrl: AUTH_CONFIG.captchaBaseUrl,
          html: buildTurnstileHtml(AUTH_CONFIG.captchaSiteKey)
        }}
        style={{ backgroundColor: "transparent" }}
        onMessage={(event: WebViewMessageEvent) => {
          onTokenChange(parseCaptchaMessage(event.nativeEvent.data));
        }}
      />
    </View>
  );
}

/** True when the form must wait for a captcha token before it can submit. */
export function isCaptchaPending(token: string | null): boolean {
  return Boolean(AUTH_CONFIG.captchaSiteKey) && !token;
}
