package android.webkit;
public class WebView extends android.view.View {
  public WebView(android.content.Context context) { super(context); }
  public WebSettings getSettings() { throw new RuntimeException("stub"); }
  public void setWebViewClient(WebViewClient client) { throw new RuntimeException("stub"); }
  public WebBackForwardList restoreState(android.os.Bundle inState) { throw new RuntimeException("stub"); }
  public WebBackForwardList saveState(android.os.Bundle outState) { throw new RuntimeException("stub"); }
  public void loadUrl(String url) { throw new RuntimeException("stub"); }
  public boolean canGoBack() { throw new RuntimeException("stub"); }
  public void goBack() { throw new RuntimeException("stub"); }
  public void addJavascriptInterface(Object object, String name) { throw new RuntimeException("stub"); }
  public void evaluateJavascript(String script, ValueCallback<String> resultCallback) { throw new RuntimeException("stub"); }
}
