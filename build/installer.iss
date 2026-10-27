; PoooomSkill 安装包脚本（Inno Setup 6）
; 编译：ISCC.exe build\installer.iss
;
; 遵循的 Windows 主流安装规范：
;   · 按用户安装到 %LOCALAPPDATA%\Programs，不需要管理员权限、不弹 UAC
;   · 注册标准卸载入口（设置 → 应用），带图标、发行商与版权信息
;   · 安装前先停掉正在运行的旧实例，卸载前自动清理写入各 agent 的技能与钩子
;   · setup.exe 本身带完整版本资源（公司 / 版权 / 产品名 / 版本）

#define AppName        "PoooomSkill"
#define AppVersion     "1.2.1"
#define AppPublisher   "万智云集"
#define AppURL         "https://poooom.com"
#define AppContact     "contact@poooom.com"
#define AppCopyright   "Copyright (C) 2026 万智云集 (https://poooom.com)"
#define AppExe         "PoooomSkill.exe"

[Setup]
AppId={{5FF7C744-ADA7-48FF-A322-02DDDB243338}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
AppContact={#AppContact}
AppCopyright={#AppCopyright}
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany={#AppPublisher}
VersionInfoCopyright={#AppCopyright}
VersionInfoDescription={#AppName} 安装程序
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}

DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
; 显示目录选择页，允许用户自定义安装路径（默认仍落在 %LOCALAPPDATA%\Programs）
DisableDirPage=no
DisableProgramGroupPage=yes
AllowNoIcons=yes

; 按用户安装：最低权限，不请求管理员
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

OutputDir=..\release
OutputBaseFilename={#AppName}-Setup-{#AppVersion}-x64
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}（{#AppPublisher}）
WizardStyle=modern
WizardImageFile=wizard-large.bmp
WizardSmallImageFile=wizard-small.bmp
Compression=lzma2/max
SolidCompression=yes

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0

; 进程占用由 [Code] 里的 --stop 精确处理，避免 Restart Manager 弹出难以理解的对话框
CloseApplications=no
RestartApplications=no

[Languages]
Name: "cn"; MessagesFile: "ChineseSimplified.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "开机自动启动 {#AppName}（静默驻留托盘，让技能调用统计持续记录）"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "staging\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; Comment: "{#AppName} —— 本地 AI 技能管理台"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon; Comment: "{#AppName} —— 本地 AI 技能管理台"
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExe}"; Parameters: "--tray"; Tasks: startupicon
Name: "{autoprograms}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"

[Registry]
; 让「运行」对话框可以直接输 PoooomSkill 启动
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\{#AppExe}"; ValueType: string; ValueName: ""; ValueData: "{app}\{#AppExe}"; Flags: uninsdeletekey

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\{#AppExe}"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopPoooomSkill"
Filename: "{app}\{#AppExe}"; Parameters: "--uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemovePoooomSkillWrites"

[Code]
{ 安装前先停掉正在运行的旧实例（含托盘常驻），避免文件被占用 }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  OldExe: String;
begin
  Result := '';
  OldExe := ExpandConstant('{app}\{#AppExe}');
  if FileExists(OldExe) then
    Exec(OldExe, '--stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

{ 卸载时提示数据目录位置，避免用户误以为备注也被删掉了 }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{userappdata}\{#AppName}');
    if DirExists(DataDir) then
      MsgBox('卸载完成。' + #13#10 + #13#10 +
             '你的中文备注与调用统计仍保留在：' + #13#10 + DataDir + #13#10 + #13#10 +
             '如需一并删除，请手动删除该文件夹。',
             mbInformation, MB_OK);
  end;
end;