package sa.bushra.store;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
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
 */
public class MainActivity extends Activity {
  static final String HOST = "app.bushra.local";
  static final String HOME = "https://" + HOST + "/";
  static final Map<String, String> TYPES = new HashMap<>();

  static {
    TYPES.put("html", "text/html");
    TYPES.put("js", "text/javascript");
    TYPES.put("css", "text/css");
    TYPES.put("json", "application/json");
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
    getWindow().setStatusBarColor(Color.parseColor("#F3F3F0"));
    web = new WebView(this);
    web.setBackgroundColor(Color.parseColor("#F3F3F0"));
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    web.setWebViewClient(new AssetClient());
    setContentView(web);
    if (state != null) web.restoreState(state);
    else web.loadUrl(HOME);
  }

  @Override
  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    web.saveState(out);
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
    else super.onBackPressed();
  }

  class AssetClient extends WebViewClient {
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
      // Stay inside the app for store pages; nothing else is reachable offline.
      return !HOST.equals(request.getUrl().getHost());
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
