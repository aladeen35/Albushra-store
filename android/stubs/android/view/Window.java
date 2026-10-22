package android.view;
public abstract class Window {
  public static final int FEATURE_NO_TITLE = 1;
  public abstract void setStatusBarColor(int color);
  public abstract void setNavigationBarColor(int color);
  public abstract View getDecorView();
}
