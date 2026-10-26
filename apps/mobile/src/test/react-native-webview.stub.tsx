// react-native-webview ships Flow source that Vitest cannot parse, and a
// WebView needs a native runtime anyway; tests render nothing in its place.
export function WebView(): null {
  return null;
}

export interface WebViewMessageEvent {
  nativeEvent: { data: string };
}
