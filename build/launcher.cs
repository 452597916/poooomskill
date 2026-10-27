// PoooomSkill 启动器（万智云集）
//
// 职责：
//   1) 把 Windows 用户与内置的 Node.js 运行时隔开——用户只看到 PoooomSkill.exe，双击即用；
//   2) 单实例：再次双击只会把已有窗口调到前台，不会多开，也不会开第二个界面窗口；
//   3) 系统托盘：窗口关掉后自动收起到右下角托盘（统计继续记录），
//      托盘双击可重新打开界面，右键菜单包含统计速览、重新扫描、生成钩子、开机自启等；
//   4) agent 钩子通过 --run-script 转发：GUI 子系统不弹黑框，stdin/stdout 以原始字节转发，
//      保证返回给 agent 的 JSON 一字不差。
//
// 编译（由 build/prepare-runtime.mjs 调用）：
//   csc /target:winexe /platform:x64 /optimize+ /codepage:65001
//       /win32icon:icon.ico /win32manifest:launcher.manifest
//       /out:PoooomSkill.exe launcher.cs
//
// 注意：Windows 自带的 csc 只支持 C# 5：
//       不能用字符串插值、内联 out 声明、?. 与表达式体成员。

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyTitle("PoooomSkill")]
[assembly: System.Reflection.AssemblyDescription("PoooomSkill —— 本地 AI 技能管理台")]
[assembly: System.Reflection.AssemblyCompany("万智云集")]
[assembly: System.Reflection.AssemblyProduct("PoooomSkill")]
[assembly: System.Reflection.AssemblyCopyright("Copyright © 2026 万智云集 · https://poooom.com")]
[assembly: System.Reflection.AssemblyTrademark("万智云集")]
[assembly: System.Reflection.AssemblyVersion("1.2.1.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.2.1.0")]
[assembly: System.Reflection.AssemblyInformationalVersion("1.2.1")]

namespace PoooomSkill
{
    /* ================= 紫色品牌色 Renderer ================= */

    /// <summary>把品牌紫色 #8b5cf6 注入 WinForms 菜单系统颜色表</summary>
    internal sealed class BrandColorTable : ProfessionalColorTable
    {
        // 品牌主色（紫色）+ 米白背景（与应用界面一致）
        private static readonly Color Brand = Color.FromArgb(139, 92, 246);       // #8b5cf6
        private static readonly Color BrandDark = Color.FromArgb(109, 40, 217);  // #6d28d9
        private static readonly Color BrandWeak = Color.FromArgb(240, 235, 255);  // #f0ebff
        private static readonly Color Bg = Color.FromArgb(251, 250, 248);        // 页面米白
        private static readonly Color BgAlt = Color.FromArgb(247, 245, 242);     // 卡片米白
        private static readonly Color Line = Color.FromArgb(228, 224, 218);       // 分隔线
        private static readonly Color TextMuted = Color.FromArgb(111, 106, 99);

        // 菜单面板背景
        public override Color MenuBorder { get { return Line; } }
        public override Color MenuItemBorder { get { return Color.Transparent; } }

        // 悬停高亮
        public override Color MenuItemSelected { get { return BrandWeak; } }
        public override Color MenuItemSelectedGradientBegin { get { return BrandWeak; } }
        public override Color MenuItemSelectedGradientEnd { get { return BrandWeak; } }
        public override Color ButtonSelectedHighlight { get { return Brand; } }
        public override Color ButtonSelectedHighlightBorder { get { return BrandDark; } }
        public override Color ButtonCheckedHighlight { get { return Brand; } }
        public override Color ButtonCheckedHighlightBorder { get { return BrandDark; } }
        public override Color ButtonPressedHighlight { get { return BrandDark; } }
        public override Color ButtonPressedHighlightBorder { get { return BrandDark; } }

        // 菜单项背景
        public override Color MenuItemPressedGradientBegin { get { return BrandWeak; } }
        public override Color MenuItemPressedGradientEnd { get { return BrandWeak; } }

        // 分隔线
        public override Color SeparatorDark { get { return Line; } }
        public override Color SeparatorLight { get { return Color.White; } }

        // 下拉/展开项
        public override Color ImageMarginGradientBegin { get { return BgAlt; } }
        public override Color ImageMarginGradientMiddle { get { return BgAlt; } }
        public override Color ImageMarginGradientEnd { get { return BgAlt; } }
        public override Color ToolStripDropDownBackground { get { return Bg; } }
        public override Color ToolStripContentPanelGradientBegin { get { return Bg; } }
        public override Color ToolStripContentPanelGradientEnd { get { return Bg; } }
        public override Color ToolStripPanelGradientBegin { get { return Bg; } }
        public override Color ToolStripPanelGradientEnd { get { return Bg; } }
        public override Color OverflowButtonGradientBegin { get { return Bg; } }
        public override Color OverflowButtonGradientMiddle { get { return BgAlt; } }
        public override Color OverflowButtonGradientEnd { get { return BgAlt; } }
    }

    /// <summary>使用 BrandColorTable 的菜单渲染器</summary>
    internal sealed class BrandRenderer : ToolStripProfessionalRenderer
    {
        public BrandRenderer() : base(new BrandColorTable()) { }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            ToolStripMenuItem mi = e.Item as ToolStripMenuItem;
            if (mi == null) { base.OnRenderItemText(e); return; }

            // 置灰不可点的项（品牌标题区）用 muted 颜色
            if (!mi.Enabled)
            {
                e.TextColor = Color.FromArgb(111, 106, 99);
                e.TextFont = new Font(e.TextFont, FontStyle.Bold);
            }
            // 选中态（hover）用白色字 + 紫底（由 ColorTable 提供）
            else if (mi.Selected)
            {
                e.TextColor = Color.White;
            }
            else
            {
                e.TextColor = Color.FromArgb(28, 27, 25);   // ink #1c1b19
            }
            base.OnRenderItemText(e);
        }

        protected override void OnRenderItemBackground(ToolStripItemRenderEventArgs e)
        {
            ToolStripMenuItem mi = e.Item as ToolStripMenuItem;
            if (mi != null && mi.Selected && mi.Enabled)
            {
                // hover 时画品牌紫色圆角背景
                Rectangle r = Rectangle.Round(e.Graphics.ClipBounds);
                r.Inflate(-2, -1);
                using (SolidBrush br = new SolidBrush(Color.FromArgb(139, 92, 246)))
                using (GraphicsPath p = RoundedRect(r, 4))
                {
                    e.Graphics.FillPath(br, p);
                }
                return;
            }
            base.OnRenderItemBackground(e);
        }

        private static GraphicsPath RoundedRect(Rectangle r, int radius)
        {
            int d = radius * 2;
            GraphicsPath p = new GraphicsPath();
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }
    }

    /* ================= 全局热键 ================= */

    /// <summary>接收全局热键的隐藏窗口：Ctrl+K 唤醒界面（被占用时退化到 Ctrl+Alt+K）</summary>
    internal sealed class HotkeyWindow : NativeWindow
    {
        private const int WM_HOTKEY = 0x0312;
        private const uint MOD_ALT = 0x0001, MOD_CONTROL = 0x0002, MOD_SHIFT = 0x0004, MOD_WIN = 0x0008;
        private const uint VK_K = 0x4B;

        private int registeredId;
        private string registeredLabel = "";

        /// <summary>用户按下热键（由主线程消息循环派发）</summary>
        public event Action Pressed;

        public HotkeyWindow()
        {
            CreateHandle(new CreateParams());
        }

        /// <summary>按顺序尝试几组组合键，第一个成功的生效</summary>
        public bool Register()
        {
            int id = 0x504F;   // 'P''O'
            uint[][] tries = new uint[][]
            {
                new uint[] { MOD_CONTROL, VK_K },
                new uint[] { MOD_CONTROL | MOD_ALT, VK_K },
                new uint[] { MOD_CONTROL | MOD_SHIFT, VK_K },
                new uint[] { MOD_CONTROL | MOD_ALT, 0x50 },   // Ctrl+Alt+P
            };
            string[] labels = new string[] { "Ctrl+K", "Ctrl+Alt+K", "Ctrl+Shift+K", "Ctrl+Alt+P" };
            for (int i = 0; i < tries.Length; i++)
            {
                if (RegisterHotKey(Handle, id, tries[i][0], tries[i][1]))
                {
                    registeredId = id;
                    registeredLabel = labels[i];
                    Program.Log("全局热键已注册：" + registeredLabel);
                    return true;
                }
            }
            Program.Log("全局热键注册失败（均被其他程序占用），界面内 Ctrl+K 仍可用");
            return false;
        }

        public string Label { get { return registeredLabel; } }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY)
            {
                Action h = Pressed;
                if (h != null) h();
            }
            base.WndProc(ref m);
        }

        /// <summary>注销热键并销毁隐藏窗口（退出时调用）</summary>
        public void Unregister()
        {
            if (registeredId != 0)
            {
                try { UnregisterHotKey(Handle, registeredId); } catch { }
                registeredId = 0;
            }
            try { DestroyHandle(); } catch { }
        }

        [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
        [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    }

    /* ================= 主程序 ================= */

    internal static class Program
    {
        private const string NodeRelative = @"runtime\node.exe";
        private const string ServerRelative = @"server\index.mjs";
        private const string MutexName = @"Local\PoooomSkill.SingleInstance";
        private const string ShowEventName = @"Local\PoooomSkill.ShowWindow";
        private const string QuitEventName = @"Local\PoooomSkill.Shutdown";
        private const string WindowTitleMark = "PoooomSkill";
        private const int ASFW_ANY = -1;
        public const int SW_RESTORE = 9;

        private const string Usage =
            "PoooomSkill —— 本地 AI 技能管理台\n\n" +
            "  PoooomSkill.exe                              启动并打开界面（已有实例时只调到前台）\n" +
            "  PoooomSkill.exe --tray                       静默启动：只驻留托盘，不弹窗口\n" +
            "  PoooomSkill.exe --status                     输出运行状态（JSON）\n" +
            "  PoooomSkill.exe --stop                       停止正在运行的实例（含托盘常驻）\n" +
            "  PoooomSkill.exe --uninstall                  撤销写入各 agent 的技能与钩子\n" +
            "  PoooomSkill.exe --run-script <脚本> [参数…]  供 agent 钩子调用\n";

        private static Mutex guiMutex;

        [STAThread]
        private static int Main(string[] args)
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string node = Path.Combine(root, NodeRelative);
            if (!File.Exists(node))
            {
                Fail("找不到内置运行时，安装可能不完整：\n" + node +
                     "\n\n请重新运行安装程序，或到 https://poooom.com 获取最新版本。");
                return 2;
            }

            List<string> extra = new List<string>();
            int hookIndex = Array.IndexOf(args, "--run-script");
            bool hookMode = hookIndex >= 0;
            string script;

            if (hookMode)
            {
                if (hookIndex + 1 >= args.Length) { Fail(Usage); return 3; }
                script = args[hookIndex + 1];
                for (int k = hookIndex + 2; k < args.Length; k++) extra.Add(args[k]);
            }
            else
            {
                script = Path.Combine(root, ServerRelative);
                foreach (string a in args)
                {
                    if (a.EndsWith("index.mjs", StringComparison.OrdinalIgnoreCase)) continue;
                    extra.Add(a);
                }
            }

            bool needResult =
                hookMode ||
                Contains(args, "--status") ||
                Contains(args, "--uninstall") ||
                Contains(args, "--stop");

            if (!needResult) return RunGui(root, Contains(args, "--tray"));
            if (Contains(args, "--stop")) StopRunningInstances();

            List<string> all = new List<string>();
            all.Add(script); all.AddRange(extra);

            ProcessStartInfo psi = NodeStartInfo(root);
            psi.Arguments = JoinArguments(all);
            return RunAndForward(psi, hookMode);
        }

        private static int RunGui(string root, bool startHidden)
        {
            Application.EnableVisualStyles();

            int port = 5273;
            string portEnv = Environment.GetEnvironmentVariable("POOOOMSKILL_PORT");
            if (!string.IsNullOrEmpty(portEnv))
            {
                int p;
                if (int.TryParse(portEnv, out p) && p > 0) port = p;
            }
            string url = "http://127.0.0.1:" + port;
            string dataDir = DataDir();

            bool created;
            guiMutex = new Mutex(true, MutexName, out created);

            EventWaitHandle showEv = null;
            EventWaitHandle quitEv = null;
            try { showEv = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName); } catch { }
            try { quitEv = new EventWaitHandle(false, EventResetMode.AutoReset, QuitEventName); } catch { }

            if (!created)
            {
                if (!startHidden && showEv != null)
                {
                    try { AllowSetForegroundWindow(ASFW_ANY); } catch { }
                    try { showEv.Set(); Log("已有实例在运行，已请求它显示窗口"); }
                    catch (Exception ex) { Log("发送显示信号失败：" + ex.Message); }
                }
                return 0;
            }
            Log("界面模式启动：startHidden=" + startHidden);

            if (showEv != null) { try { showEv.Reset(); } catch { } }
            if (quitEv != null) { try { quitEv.Reset(); } catch { } }

            try
            {
                Directory.CreateDirectory(dataDir);
                File.WriteAllText(LauncherPidPath(), Process.GetCurrentProcess().Id.ToString());
            }
            catch { }

            Process nodeProc;
            try
            {
                ProcessStartInfo psi = NodeStartInfo(root);
                psi.Arguments = "\"" + Path.Combine(root, ServerRelative) + "\"";
                nodeProc = Process.Start(psi);
            }
            catch (Exception ex) { Fail("启动内置服务失败：" + ex.Message); return 5; }

            if (!WaitForServer(url + "/api/state", 25000))
            {
                Fail("内置服务启动超时，请查看日志：\n" + Path.Combine(dataDir, "poooomskill.log"));
                try { if (nodeProc != null && !nodeProc.HasExited) nodeProc.Kill(); } catch { }
                return 6;
            }

            try
            {
                TrayContext ctx = new TrayContext(root, dataDir, url, nodeProc, showEv, quitEv, startHidden);
                Application.Run(ctx);
            }
            catch (Exception ex)
            {
                Log("界面循环异常：" + ex.ToString());
                Fail("界面启动失败：" + ex.Message);
            }

            try { if (nodeProc != null && !nodeProc.HasExited) nodeProc.Kill(); } catch { }
            try { File.Delete(LauncherPidPath()); } catch { }
            GC.KeepAlive(guiMutex);
            return 0;
        }

        private static bool WaitForServer(string probeUrl, int timeoutMs)
        {
            DateTime until = DateTime.Now.AddMilliseconds(timeoutMs);
            while (DateTime.Now < until)
            {
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(probeUrl);
                    req.Timeout = 1500;
                    req.Method = "GET";
                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    {
                        if ((int)resp.StatusCode == 200) return true;
                    }
                }
                catch { }
                Thread.Sleep(400);
            }
            return false;
        }

        private static void StopRunningInstances()
        {
            try { using (EventWaitHandle ev = EventWaitHandle.OpenExisting(QuitEventName)) ev.Set(); }
            catch { }
            int pid = 0;
            try { int.TryParse(File.ReadAllText(LauncherPidPath()).Trim(), out pid); } catch { }
            if (pid <= 0) return;
            DateTime until = DateTime.Now.AddSeconds(10);
            while (DateTime.Now < until)
            {
                Process p;
                try { p = Process.GetProcessById(pid); } catch { break; }
                string name = "";
                try { name = p.ProcessName; } catch { }
                if (name.IndexOf("PoooomSkill", StringComparison.OrdinalIgnoreCase) < 0) break;
                Thread.Sleep(200);
            }
            Thread.Sleep(300);
        }

        public static string DataDir()
        {
            string custom = Environment.GetEnvironmentVariable("POOOOMSKILL_DATA");
            if (!string.IsNullOrEmpty(custom)) return custom;
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PoooomSkill");
        }

        public static string LauncherPidPath()
        {
            return Path.Combine(DataDir(), "launcher.pid");
        }

        public static void Log(string message)
        {
            try
            {
                string dir = DataDir();
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "launcher.log"),
                    "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + message + "\n");
            }
            catch { }
        }

        public static ProcessStartInfo NodeStartInfo(string root)
        {
            ProcessStartInfo psi = new ProcessStartInfo(Path.Combine(root, NodeRelative));
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WorkingDirectory = root;
            string launcherPath;
            try { launcherPath = Application.ExecutablePath; }
            catch { launcherPath = Path.Combine(root, "PoooomSkill.exe"); }
            psi.EnvironmentVariables["POOOOMSKILL_LAUNCHER"] = launcherPath;
            psi.EnvironmentVariables["POOOOMSKILL_HOME"] = root;
            return psi;
        }

        public static IntPtr FindAppWindow()
        {
            IntPtr found = IntPtr.Zero;
            EnumWindows(delegate(IntPtr h, IntPtr l)
            {
                if (!IsWindowVisible(h)) return true;
                StringBuilder title = new StringBuilder(512);
                GetWindowText(h, title, title.Capacity);
                if (title.ToString().IndexOf(WindowTitleMark, StringComparison.OrdinalIgnoreCase) < 0) return true;
                StringBuilder cls = new StringBuilder(256);
                GetClassName(h, cls, cls.Capacity);
                string c = cls.ToString();
                if (c.StartsWith("Chrome_WidgetWin") || c.StartsWith("MozillaWindowClass"))
                {
                    found = h;
                    return false;
                }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        private static bool Contains(string[] args, string value)
        {
            foreach (string a in args) if (a == value) return true;
            return false;
        }

        private static int RunAndForward(ProcessStartInfo psi, bool forwardStdin)
        {
            psi.RedirectStandardInput = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            byte[] payload = forwardStdin ? ReadAll(Console.OpenStandardInput()) : new byte[0];
            try
            {
                using (Process p = Process.Start(psi))
                {
                    if (p == null) { Fail("无法启动内置运行时。"); return 4; }
                    Thread errPump = new Thread(delegate()
                    {
                        try { WriteAll(Console.OpenStandardError(), p.StandardError.BaseStream); }
                        catch { }
                    });
                    errPump.IsBackground = true;
                    errPump.Start();
                    try
                    {
                        if (payload.Length > 0)
                        {
                            p.StandardInput.BaseStream.Write(payload, 0, payload.Length);
                            p.StandardInput.BaseStream.Flush();
                        }
                        p.StandardInput.Close();
                    }
                    catch { }
                    WriteAll(Console.OpenStandardOutput(), p.StandardOutput.BaseStream);
                    p.WaitForExit();
                    errPump.Join(1500);
                    return p.ExitCode;
                }
            }
            catch (Exception ex) { Fail("运行失败：" + ex.Message); return 5; }
        }

        private static byte[] ReadAll(Stream s)
        {
            using (MemoryStream ms = new MemoryStream())
            {
                byte[] buf = new byte[8192];
                int n;
                while ((n = s.Read(buf, 0, buf.Length)) > 0) ms.Write(buf, 0, n);
                return ms.ToArray();
            }
        }

        private static void WriteAll(Stream dest, Stream src)
        {
            byte[] buf = new byte[8192];
            int n;
            while ((n = src.Read(buf, 0, buf.Length)) > 0) dest.Write(buf, 0, n);
            dest.Flush();
        }

        private static string JoinArguments(List<string> items)
        {
            StringBuilder sb = new StringBuilder();
            foreach (string a in items)
            {
                if (sb.Length > 0) sb.Append(' ');
                sb.Append(Quote(a));
            }
            return sb.ToString();
        }

        private static string Quote(string s)
        {
            if (s.Length > 0 && s.IndexOfAny(new char[] { ' ', '\t', '"' }) < 0) return s;
            StringBuilder sb = new StringBuilder("\"");
            int backslashes = 0;
            foreach (char c in s)
            {
                if (c == '\\') { backslashes++; sb.Append(c); }
                else if (c == '"') { sb.Append('\\', backslashes + 1).Append('"'); backslashes = 0; }
                else { sb.Append(c); backslashes = 0; }
            }
            sb.Append('\\', backslashes).Append('"');
            return sb.ToString();
        }

        private static void Fail(string message)
        {
            try { MessageBox.Show(message, "PoooomSkill", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
            catch { }
            try
            {
                byte[] bytes = Encoding.UTF8.GetBytes(message + "\n");
                Stream err = Console.OpenStandardError();
                err.Write(bytes, 0, bytes.Length);
                err.Flush();
            }
            catch { }
        }

        /* ================= 本地 HTTP 小工具 ================= */

        public static string HttpGet(string url)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 3000;
                req.Method = "GET";
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (Stream s = resp.GetResponseStream())
                using (MemoryStream ms = new MemoryStream())
                {
                    s.CopyTo(ms);
                    return Encoding.UTF8.GetString(ms.ToArray());
                }
            }
            catch { return null; }
        }

        public static string HttpPost(string url, string body)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 5000;
                req.Method = "POST";
                req.ContentType = "application/json";
                byte[] payload = Encoding.UTF8.GetBytes(body ?? "{}");
                req.ContentLength = payload.Length;
                using (Stream sw = req.GetRequestStream()) sw.Write(payload, 0, payload.Length);
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (Stream s = resp.GetResponseStream())
                using (MemoryStream ms = new MemoryStream())
                {
                    s.CopyTo(ms);
                    return Encoding.UTF8.GetString(ms.ToArray());
                }
            }
            catch { return null; }
        }

        /* ================= 开机自启（注册表 Run key）================= */

        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunValue = "PoooomSkill";

        public static bool IsAutoStartEnabled()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey, false))
                {
                    if (k == null) return false;
                    object v = k.GetValue(RunValue);
                    return v != null && v.ToString().IndexOf("PoooomSkill", StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch { return false; }
        }

        public static void SetAutoStart(bool enable)
        {
            try
            {
                if (enable)
                {
                    string exe = Application.ExecutablePath;
                    string cmd = "\"" + exe + "\" --tray";
                    using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
                    {
                        if (k != null) k.SetValue(RunValue, cmd, RegistryValueKind.String);
                    }
                }
                else
                {
                    using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey, true))
                    {
                        if (k != null) k.DeleteValue(RunValue, false);
                    }
                }
            }
            catch (Exception ex) { Log("设置开机自启失败：" + ex.Message); }
        }

        /* ================= Win32 ================= */

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
        [DllImport("user32.dll")] private static extern bool AllowSetForegroundWindow(int pid);
    }

    /* ================= 托盘上下文 ================= */

    /// <summary>托盘常驻 + 窗口生命周期管理 + 美化右键菜单</summary>
    internal sealed class TrayContext : ApplicationContext
    {
        private readonly Form host = new Form();
        private readonly NotifyIcon tray = new NotifyIcon();
        private readonly System.Windows.Forms.Timer poll = new System.Windows.Forms.Timer();

        private readonly string root;
        private readonly string dataDir;
        private readonly string profileDir;
        private readonly string url;
        private readonly string apiState;
        private readonly string apiScan;
        private readonly string apiGenerate;
        private readonly string apiStatsClear;
        private readonly Process nodeProc;
        private readonly EventWaitHandle showEv;
        private readonly EventWaitHandle quitEv;

        // 品牌标题区（置灰不可点，实时显示版本与统计）
        private ToolStripMenuItem menuTitle;
        private ToolStripMenuItem menuAutoStart;
        private ToolStripMenuItem menuOpen;
        private HotkeyWindow hotkey;

        private bool windowRequested;
        private bool windowSeen;
        private bool balloonShown;
        private bool quitting;
        private volatile bool pendingShow;
        private volatile bool pendingQuit;
        private DateTime spawnedAt = DateTime.MinValue;

        public TrayContext(string root, string dataDir, string url, Process nodeProc,
                           EventWaitHandle showEv, EventWaitHandle quitEv, bool startHidden)
        {
            this.root = root;
            this.dataDir = dataDir;
            this.url = url;
            this.apiState = url + "/api/state";
            this.apiScan = url + "/api/scan";
            this.apiGenerate = url + "/api/generate";
            this.apiStatsClear = url + "/api/stats/clear";
            this.nodeProc = nodeProc;
            this.showEv = showEv;
            this.quitEv = quitEv;
            this.profileDir = Path.Combine(dataDir, "browser-profile");
            Program.Log("托盘初始化：开始（startHidden=" + startHidden + "）");

            host.ShowInTaskbar = false;
            host.FormBorderStyle = FormBorderStyle.None;
            host.WindowState = FormWindowState.Minimized;
            host.Size = new Size(1, 1);
            host.Visible = false;
            IntPtr hostHandle = host.Handle;

            tray.Icon = LoadTrayIcon();
            tray.Text = "PoooomSkill · 本地 AI 技能管理台";
            tray.DoubleClick += delegate { ShowOrFocus(); };
            tray.Visible = true;
            Program.Log("托盘初始化：图标已加载");

            BuildMenu();

            // 全局热键：由隐藏窗口接收 WM_HOTKEY，按下即唤醒界面
            hotkey = new HotkeyWindow();
            hotkey.Pressed += delegate { ShowOrFocus(); };
            if (hotkey.Register() && !string.IsNullOrEmpty(hotkey.Label) && menuOpen != null)
            {
                menuOpen.Text = "  打开界面   " + hotkey.Label;
            }

            poll.Interval = 500;
            poll.Tick += delegate { Tick(); };
            poll.Start();

            // 启动后异步拉一次状态刷新菜单标题
            ThreadPool.QueueUserWorkItem(delegate { RefreshTitle(); });

            if (startHidden) { windowRequested = false; }
            else { ShowOrFocus(); }

            Thread watcher = new Thread(WatchSignals);
            watcher.IsBackground = true;
            watcher.Start();
            Program.Log("托盘已就绪（startHidden=" + startHidden + "）");
        }

        /* ---------- 菜单构建 ---------- */

        private void BuildMenu()
        {
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Renderer = new BrandRenderer();
            menu.Font = new Font("Microsoft YaHei UI", 9F);
            menu.ShowImageMargin = false;
            menu.Padding = new Padding(4);

            // 品牌标题区（置灰不可点）
            menuTitle = new ToolStripMenuItem("PoooomSkill  加载中…");
            menuTitle.Enabled = false;
            menuTitle.Margin = new Padding(0, 0, 0, 4);
            menu.Items.Add(menuTitle);
            menu.Items.Add(new ToolStripSeparator());

            // ■ 主操作
            ToolStripMenuItem openMain = new ToolStripMenuItem("  打开界面");
            menuOpen = openMain;
            openMain.Font = new Font(openMain.Font, FontStyle.Bold);
            openMain.Click += delegate { ShowOrFocus(); };
            menu.Items.Add(openMain);

            ToolStripMenuItem rescan = new ToolStripMenuItem("  重新扫描技能");
            rescan.Click += delegate { AsyncPost(apiScan, "重新扫描", "技能清单已刷新"); };
            menu.Items.Add(rescan);

            ToolStripMenuItem generate = new ToolStripMenuItem("  生成并写入到各 agent");
            generate.Click += delegate { AsyncPost(apiGenerate, "生成钩子", "已写入斜杠命令 / 钩子 / 别名技能"); };
            menu.Items.Add(generate);

            ToolStripMenuItem stats = new ToolStripMenuItem("  使用统计速览");
            stats.Click += delegate { ShowStatsBalloon(); };
            menu.Items.Add(stats);

            menu.Items.Add(new ToolStripSeparator());

            // ■ 管理
            ToolStripMenuItem openData = new ToolStripMenuItem("  打开数据目录");
            openData.Click += delegate { OpenDataDir(); };
            menu.Items.Add(openData);

            ToolStripMenuItem openLog = new ToolStripMenuItem("  打开运行日志");
            openLog.Click += delegate { OpenLogFile(); };
            menu.Items.Add(openLog);

            ToolStripMenuItem openHome = new ToolStripMenuItem("  打开官网 poooom.com");
            openHome.Click += delegate { OpenUrl("https://poooom.com"); };
            menu.Items.Add(openHome);

            // 开机自启（勾选状态，菜单打开时实时刷新）
            menuAutoStart = new ToolStripMenuItem("  开机自启");
            menuAutoStart.CheckOnClick = false;
            menuAutoStart.Click += delegate { ToggleAutoStart(); };
            menu.Items.Add(menuAutoStart);

            menu.Items.Add(new ToolStripSeparator());

            // ■ 关于 + 退出
            ToolStripMenuItem about = new ToolStripMenuItem("  关于 PoooomSkill");
            about.Click += delegate { ShowAbout(); };
            menu.Items.Add(about);

            ToolStripMenuItem quit = new ToolStripMenuItem("  退出 PoooomSkill");
            quit.ForeColor = Color.FromArgb(184, 84, 26);
            quit.Click += delegate { Quit(); };
            menu.Items.Add(quit);

            // 菜单打开前刷新自启勾选状态
            menu.Opening += delegate {
                try { menuAutoStart.Checked = Program.IsAutoStartEnabled(); } catch { }
            };

            tray.ContextMenuStrip = menu;
            Program.Log("托盘初始化：菜单已就绪");
        }

        /* ---------- 状态刷新 ---------- */

        private void RefreshTitle()
        {
            string json = Program.HttpGet(apiState);
            if (string.IsNullOrEmpty(json)) { SetTitle("PoooomSkill  服务连接中…"); return; }
            try
            {
                // 手搓 JSON 解析（C# 5 无 Newtonsoft.Json），够这几个字段用了
                string ver = Extract(json, "\"version\"");
                string skillCount = CountArray(json, "\"skills\"");
                string total = Extract(json, "\"total\"");
                string groups = CountArray(json, "\"groups\"");

                string title = "PoooomSkill  v" + (string.IsNullOrEmpty(ver) ? "1.2.1" : ver) +
                    "  · " + (string.IsNullOrEmpty(skillCount) ? "?" : skillCount) + " 个技能" +
                    "  · " + (string.IsNullOrEmpty(groups) ? "?" : groups) + " 个分组" +
                    "  · 累计 " + (string.IsNullOrEmpty(total) ? "?" : total) + " 次调用";
                SetTitle(title);
            }
            catch (Exception ex) { Program.Log("刷新菜单标题失败：" + ex.Message); }
        }

        private void SetTitle(string text)
        {
            if (menuTitle != null && host.IsHandleCreated)
            {
                host.BeginInvoke((Action)delegate { menuTitle.Text = text; });
            }
        }

        private static string Extract(string json, string key)
        {
            // 找 "key":value，value 可能是字符串或数字
            string needle = key + ":";
            int i = json.IndexOf(needle, StringComparison.Ordinal);
            if (i < 0) return null;
            i += needle.Length;
            while (i < json.Length && (json[i] == ' ' || json[i] == '\t')) i++;
            if (i >= json.Length) return null;
            if (json[i] == '"')
            {
                int end = json.IndexOf('"', i + 1);
                if (end < 0) return null;
                return json.Substring(i + 1, end - i - 1);
            }
            // 数字
            int start = i;
            while (i < json.Length && (char.IsDigit(json[i]) || json[i] == '-' || json[i] == '.')) i++;
            if (i == start) return null;
            return json.Substring(start, i - start);
        }

        private static string CountArray(string json, string key)
        {
            int i = json.IndexOf(key, StringComparison.Ordinal);
            if (i < 0) return null;
            int open = json.IndexOf('[', i);
            if (open < 0) return null;
            // 简单大括号计数，不管字符串里的括号
            int depth = 0, items = 0, j = open;
            while (j < json.Length)
            {
                char c = json[j];
                if (c == '"') { j++; while (j < json.Length && json[j] != '"') { if (json[j] == '\\') j++; j++; } }
                if (c == '[') depth++;
                else if (c == ']') { depth--; if (depth == 0) break; }
                else if (c == '{' && depth >= 1) items++;
                j++;
            }
            return items.ToString();
        }

        /* ---------- 托盘图标 ---------- */

        private Icon LoadTrayIcon()
        {
            try
            {
                string ico = Path.Combine(root, "PoooomSkill.ico");
                if (File.Exists(ico))
                {
                    Size want = SystemInformation.SmallIconSize;
                    return new Icon(ico, want);
                }
            }
            catch (Exception ex) { Program.Log("读取托盘图标失败：" + ex.Message); }
            try
            {
                Icon fallback = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (fallback != null) return fallback;
            }
            catch { }
            return SystemIcons.Application;
        }

        /* ---------- 核心动作 ---------- */

        private void ShowOrFocus()
        {
            if (quitting) return;
            IntPtr h = Program.FindAppWindow();
            Program.Log("显示窗口：已有窗口=" + (h != IntPtr.Zero));
            if (h != IntPtr.Zero)
            {
                Program.ShowWindow(h, Program.SW_RESTORE);
                Program.SetForegroundWindow(h);
                windowRequested = true;
                windowSeen = true;
                tray.Visible = false;
                return;
            }
            OpenWindow();
        }

        private void OpenWindow()
        {
            try
            {
                string browser = FindBrowser();
                Program.Log("打开界面窗口：浏览器=" + (browser == null ? "（默认浏览器）" : browser));
                if (browser != null)
                {
                    ProcessStartInfo psi = new ProcessStartInfo(browser);
                    psi.UseShellExecute = false;
                    psi.Arguments =
                        "--app=" + url +
                        " --window-size=1320,880" +
                        " --no-first-run --no-default-browser-check" +
                        " --user-data-dir=\"" + profileDir + "\"";
                    Process.Start(psi);
                }
                else
                {
                    ProcessStartInfo psi = new ProcessStartInfo(url);
                    psi.UseShellExecute = true;
                    Process.Start(psi);
                }
            }
            catch (Exception ex) { Program.Log("打开窗口失败：" + ex.Message); }
            windowRequested = true;
            windowSeen = false;
            spawnedAt = DateTime.Now;
            tray.Visible = false;
        }

        private static string FindBrowser()
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string[] candidates = new string[]
            {
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
            };
            foreach (string p in candidates) if (File.Exists(p)) return p;
            return null;
        }

        private void OpenDataDir()
        {
            try { Process.Start("explorer.exe", "\"" + dataDir + "\""); } catch { }
        }

        private void OpenLogFile()
        {
            try
            {
                string log = Path.Combine(dataDir, "poooomskill.log");
                if (File.Exists(log)) Process.Start("notepad.exe", "\"" + log + "\"");
                else Process.Start("explorer.exe", "\"" + dataDir + "\"");
            }
            catch { }
        }

        private static void OpenUrl(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
        }

        private void ToggleAutoStart()
        {
            bool current = Program.IsAutoStartEnabled();
            Program.SetAutoStart(!current);
            bool after = Program.IsAutoStartEnabled();
            ShowBalloonTip(3000, "PoooomSkill",
                after ? "已开启开机自启（静默驻留托盘）" : "已关闭开机自启",
                ToolTipIcon.Info);
            if (menuAutoStart != null) menuAutoStart.Checked = after;
        }

        private void ShowStatsBalloon()
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                string json = Program.HttpGet(apiState);
                if (string.IsNullOrEmpty(json))
                {
                    ShowBalloonTip(4000, "PoooomSkill", "服务暂无响应，请确认主程序正在运行。", ToolTipIcon.Warning);
                    return;
                }
                string skills = CountArray(json, "\"skills\"");
                string total = Extract(json, "\"total\"");
                string agents = CountArray(json, "\"byAgent\"");
                string msg = string.Format(
                    "已扫描 {0} 个技能，累计被调用 {1} 次，覆盖 {2} 种 agent。",
                    skills ?? "?", total ?? "?", agents ?? "?");
                ShowBalloonTip(5000, "PoooomSkill · 使用统计", msg, ToolTipIcon.Info);
            });
        }

        private void AsyncPost(string endpoint, string actionName, string successMsg)
        {
            ShowBalloonTip(2500, "PoooomSkill", "正在" + actionName + "…", ToolTipIcon.None);
            ThreadPool.QueueUserWorkItem(delegate
            {
                string resp = Program.HttpPost(endpoint, "{}");
                if (resp != null)
                {
                    ShowBalloonTip(4000, "PoooomSkill", successMsg, ToolTipIcon.Info);
                    RefreshTitle();
                }
                else
                {
                    ShowBalloonTip(4000, "PoooomSkill", actionName + "失败，请确认主程序正在运行。", ToolTipIcon.Warning);
                }
            });
        }

        private void ShowAbout()
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                string json = Program.HttpGet(apiState);
                string ver = "1.2.1";
                string skills = "?";
                if (!string.IsNullOrEmpty(json))
                {
                    string v = Extract(json, "\"version\"");
                    if (!string.IsNullOrEmpty(v)) ver = v;
                    string s = CountArray(json, "\"skills\"");
                    if (!string.IsNullOrEmpty(s)) skills = s;
                }
                string msg =
                    "PoooomSkill  v" + ver + "\n\n" +
                    "本地 AI 技能管理台 · 把散落在各个 AI 客户端里的技能\n" +
                    "用中文管起来、用中文调用、用数据说话。\n\n" +
                    "已扫描技能：" + skills + " 个\n\n" +
                    "作者：万智云集\n" +
                    "官网：https://poooom.com";
                host.BeginInvoke((Action)delegate
                {
                    MessageBox.Show(msg, "关于 PoooomSkill", MessageBoxButtons.OK, MessageBoxIcon.Information);
                });
            });
        }

        private void ShowBalloonTip(int timeout, string title, string msg, ToolTipIcon icon)
        {
            if (!host.IsHandleCreated) return;
            host.BeginInvoke((Action)delegate
            {
                try { tray.ShowBalloonTip(timeout, title, msg, icon); } catch { }
            });
        }

        /* ---------- 轮询 ---------- */

        private void Tick()
        {
            if (quitting) return;
            if (pendingQuit) { pendingQuit = false; Quit(); return; }
            if (pendingShow) { pendingShow = false; ShowOrFocus(); }

            if (nodeProc != null && nodeProc.HasExited) { Quit(); return; }
            if (!windowRequested) return;

            if (Program.FindAppWindow() != IntPtr.Zero) { windowSeen = true; return; }
            if (windowSeen || (DateTime.Now - spawnedAt).TotalSeconds > 12)
            {
                windowRequested = false;
                windowSeen = false;
                tray.Visible = true;
                Program.Log("窗口已关闭，收起到托盘");
                if (!balloonShown)
                {
                    balloonShown = true;
                    try { tray.ShowBalloonTip(3000, "PoooomSkill", "已收起到托盘，双击图标可重新打开界面。", ToolTipIcon.Info); }
                    catch { }
                }
            }
        }

        /* ---------- 退出 ---------- */

        private void Quit()
        {
            if (quitting) return;
            quitting = true;
            try { poll.Stop(); } catch { }
            try { if (hotkey != null) hotkey.Unregister(); } catch { }
            try { tray.Visible = false; tray.Dispose(); } catch { }

            if (nodeProc != null)
            {
                try
                {
                    ProcessStartInfo stop = Program.NodeStartInfo(root);
                    stop.Arguments = "\"" + Path.Combine(root, @"server\index.mjs") + "\" --stop";
                    Process p = Process.Start(stop);
                    if (p != null) p.WaitForExit(3000);
                }
                catch { }
                try { if (!nodeProc.HasExited) nodeProc.Kill(); } catch { }
            }

            IntPtr h = Program.FindAppWindow();
            if (h != IntPtr.Zero)
            {
                uint pid;
                Program.GetWindowThreadProcessId(h, out pid);
                if (pid != 0)
                {
                    try { Process.GetProcessById((int)pid).Kill(); } catch { }
                }
            }

            try { File.Delete(Program.LauncherPidPath()); } catch { }
            Program.Log("已退出（含停服务与关闭窗口）");
            Application.ExitThread();
        }

        /* ---------- 信号监听 ---------- */

        private void WatchSignals()
        {
            WaitHandle[] waits = new WaitHandle[] { showEv, quitEv };
            while (true)
            {
                int idx;
                try { idx = WaitHandle.WaitAny(waits); }
                catch (Exception ex) { Program.Log("信号监听异常退出：" + ex.Message); return; }
                if (idx == 0) { pendingShow = true; }
                else { pendingQuit = true; return; }
            }
        }
    }
}
