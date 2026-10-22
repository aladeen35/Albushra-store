package sa.bushra.store;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * The store as an app: a full-screen WebView serving the storefront bundled in assets/ from a
 * private https origin, so absolute paths (/js/app.js), client-side routes (/p/slug) and
 * localStorage behave exactly like on the website.
 *
 * Once the store is live, set REMOTE_URL to its address and the app opens the real store instead
 * of the bundled offline demo (same UI, live products and orders).
 */
public class MainActivity extends Activity {
  static final String REMOTE_URL = "";
  static final String VERSION = "0.2";
  static final String HOST = "app.bushra.local";
  static final String HOME = "https://" + HOST + "/";
  static final int SPLASH_BG = Color.parseColor("#0F1A0E");
  static final Map<String, String> TYPES = new HashMap<>();

  static {
    TYPES.put("html", "text/html");
    TYPES.put("js", "text/javascript");
    TYPES.put("css", "text/css");
    TYPES.put("json", "application/json");
    TYPES.put("webmanifest", "application/manifest+json");
    TYPES.put("svg", "image/svg+xml");
    TYPES.put("png", "image/png");
    TYPES.put("jpg", "image/jpeg");
    TYPES.put("webp", "image/webp");
    TYPES.put("woff2", "font/woff2");
    TYPES.put("txt", "text/plain");
  }

  WebView web;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    requestWindowFeature(Window.FEATURE_NO_TITLE);
    web = new WebView(this);
    // Same dark green as the launch screen and the web splash: one continuous splash, no white flash.
    web.setBackgroundColor(SPLASH_BG);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setUserAgentString(s.getUserAgentString() + " AlbushraApp/" + VERSION);
    web.addJavascriptInterface(new Bridge(), "BushraApp");
    web.setWebViewClient(new AssetClient());
    setContentView(web);
    if (state != null) web.restoreState(state);
    else web.loadUrl(REMOTE_URL.isEmpty() ? HOME : REMOTE_URL);
  }

  @Override
  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    web.saveState(out);
  }

  @Override
  public void onBackPressed() {
    // Let the page close an open drawer/dialog first, then go back in history, then leave.
    web.evaluateJavascript("!!(window.__appBack && window.__appBack())", new ValueCallback<String>() {
      @Override
      public void onReceiveValue(String handled) {
        if ("true".equals(handled)) return;
        if (web.canGoBack()) web.goBack();
        else finish();
      }
    });
  }

  /** Called from the page (window.BushraApp) to match the system bars to the screen underneath. */
  class Bridge {
    @JavascriptInterface
    public void systemBars(final String color, final boolean lightBackground) {
      runOnUiThread(new Runnable() {
        @Override
        public void run() {
          int c = Color.parseColor(color);
          Window w = getWindow();
          w.setStatusBarColor(c);
          w.setNavigationBarColor(c);
          int flags = lightBackground ? (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : 0;
          w.getDecorView().setSystemUiVisibility(flags);
          web.setBackgroundColor(c);
        }
      });
    }
  }

  class AssetClient extends WebViewClient {
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
      String host = request.getUrl().getHost();
      if (HOST.equals(host)) return false;
      // Live store: stay inside the app for the store's own domain.
      return REMOTE_URL.isEmpty() || !REMOTE_URL.contains("//" + host);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
      Uri url = request.getUrl();
      if (!HOST.equals(url.getHost())) return null;
      String path = url.getPath();
      if (path == null || path.equals("/")) path = "/index.html";
      String asset = path.substring(1);
      String ext = asset.lastIndexOf('.') > asset.lastIndexOf('/') ? asset.substring(asset.lastIndexOf('.') + 1) : "";
      InputStream in = open(asset);
      if (in == null && ext.isEmpty()) {
        // Client-side route (e.g. /p/slug): serve the app shell.
        in = open("index.html");
        ext = "html";
      }
      if (in == null) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), null);
      String type = TYPES.containsKey(ext) ? TYPES.get(ext) : "application/octet-stream";
      Map<String, String> headers = new HashMap<>();
      headers.put("Access-Control-Allow-Origin", "*");
      return new WebResourceResponse(type, "utf-8", 200, "OK", headers, in);
    }

    InputStream open(String asset) {
      try {
        return getAssets().open(asset);
      } catch (IOException e) {
        return null;
      }
    }
  }
}
