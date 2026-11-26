# 张开嘴清理 · 免安装版
# 纯 PowerShell + WPF 实现，仅依赖 Windows 自带的 .NET Framework，无需安装 Node / Rust / VS。
# 只清理系统临时目录、浏览器缓存、缩略图、日志与回收站，绝不触碰个人文档。

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$script:AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:IsAdmin = $false
$script:Phase = 'idle'
$script:Results = @()
$script:Indicators = @()
$script:Window = $null
$script:UI = @{}

# ============================ 通用工具 ============================

function Format-Size {
    param([int64]$Bytes)
    if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ('{0:N1} MB' -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ('{0:N0} KB' -f ($Bytes / 1KB)) }
    return ('{0} B' -f $Bytes)
}

function New-Brush {
    param([string]$Hex)
    $conv = [System.Windows.Media.BrushConverter]::new()
    return $conv.ConvertFromString($Hex)
}

function Test-Admin {
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        $p = [Security.Principal.WindowsPrincipal]::new($id)
        return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch { return $false }
}

function Get-DiskSummary {
    $parts = @()
    foreach ($d in @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' -ErrorAction SilentlyContinue)) {
        $freeGB = [math]::Round($d.FreeSpace / 1GB, 1)
        $totalGB = [math]::Round($d.Size / 1GB, 1)
        $parts += ('{0} {1} GB 可用 / {2} GB' -f $d.DeviceID, $freeGB, $totalGB)
    }
    if ($parts.Count -eq 0) { return '磁盘信息不可用' }
    return ($parts -join '    ·    ')
}

# ============================ 清理项 ============================

function Get-Categories {
    # 环境变量理论上一定有，缺失时降级而不是抛异常，避免整轮扫描中断
    $local = $env:LOCALAPPDATA
    if (-not $local) { $local = [Environment]::GetFolderPath('LocalApplicationData') }
    $win = $env:WINDIR
    if (-not $win) { $win = 'C:\Windows' }

    $tempPaths = @($env:TEMP)
    if ($win) { $tempPaths += (Join-Path $win 'Temp') }

    $thumbDir = $null
    $logPaths = @()
    $roots    = @()
    if ($local) {
        $thumbDir = Join-Path $local 'Microsoft\Windows\Explorer'
        $logPaths = @(
            (Join-Path $local 'CrashDumps'),
            (Join-Path $local 'Microsoft\Windows\WER\ReportQueue'),
            (Join-Path $local 'Microsoft\Windows\WER\ReportArchive')
        )
        $roots = @(
            (Join-Path $local 'Google\Chrome\User Data'),
            (Join-Path $local 'Microsoft\Edge\User Data'),
            (Join-Path $local 'BraveSoftware\Brave-Browser\User Data'),
            (Join-Path $local '360Chrome\Chrome\User Data'),
            (Join-Path $local 'Tencent\QQBrowser\User Data')
        )
    }

    $browser = @()
    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        foreach ($prof in @(Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue)) {
            foreach ($sub in @('Cache', 'Code Cache', 'GPUCache', 'Service Worker')) {
                $p = Join-Path $prof.FullName $sub
                if (Test-Path -LiteralPath $p) { $browser += $p }
            }
        }
    }

    return @(
        [pscustomobject]@{ Name='系统临时文件';   Note='程序安装残留与临时数据';   Paths=@($tempPaths); Filter=$null;             Special=$null;     Size=[int64]0; Selected=$true }
        [pscustomobject]@{ Name='浏览器缓存';     Note='Chrome / Edge 等网页缓存'; Paths=@($browser);   Filter=$null;             Special=$null;     Size=[int64]0; Selected=$true }
        [pscustomobject]@{ Name='缩略图缓存';     Note='资源管理器预览缩略图';     Paths=@($thumbDir);  Filter='thumbcache_*.db'; Special=$null;     Size=[int64]0; Selected=$true }
        [pscustomobject]@{ Name='日志与错误报告'; Note='崩溃转储与错误报告存档';   Paths=@($logPaths);  Filter=$null;             Special=$null;     Size=[int64]0; Selected=$true }
        [pscustomobject]@{ Name='回收站';         Note='已删除但未清空的文件';     Paths=@();           Filter=$null;             Special='recycle'; Size=[int64]0; Selected=$true }
    )
}

function Get-RecycleSize {
    try {
        $shell = New-Object -ComObject Shell.Application
        $bin = $shell.NameSpace(0x0A)
        $sum = [int64]0
        foreach ($it in @($bin.Items())) { try { $sum += [int64]$it.Size } catch { } }
        return $sum
    } catch { return [int64]0 }
}

function Get-CategoryFiles {
    param($Cat)
    $all = @()
    foreach ($p in $Cat.Paths) {
        if (-not $p) { continue }
        if (-not (Test-Path -LiteralPath $p)) { continue }
        if ($Cat.Filter) {
            $all += @(Get-ChildItem -LiteralPath $p -Filter $Cat.Filter -File -Force -ErrorAction SilentlyContinue)
        } else {
            $all += @(Get-ChildItem -LiteralPath $p -Recurse -File -Force -ErrorAction SilentlyContinue)
        }
    }
    return $all
}

function Measure-Category {
    param($Cat)
    if ($Cat.Special -eq 'recycle') { return (Get-RecycleSize) }
    $bytes = [int64]0
    foreach ($f in @(Get-CategoryFiles $Cat)) {
        try { $bytes += [int64]$f.Length } catch { }
    }
    return $bytes
}

function Clear-Category {
    param($Cat)
    if ($Cat.Special -eq 'recycle') {
        $before = Get-RecycleSize
        $ok = $false
        try { Clear-RecycleBin -Force -ErrorAction Stop; $ok = $true } catch { }
        if (-not $ok) {
            try {
                $shell = New-Object -ComObject Shell.Application
                foreach ($it in @($shell.NameSpace(0x0A).Items())) {
                    try { Remove-Item -LiteralPath $it.Path -Recurse -Force -ErrorAction Stop } catch { }
                }
            } catch { }
        }
        return $before
    }

    $freed = [int64]0
    foreach ($f in @(Get-CategoryFiles $Cat)) {
        $len = [int64]0
        try { $len = [int64]$f.Length } catch { $len = 0 }
        # 被占用的文件会抛异常，跳过即可，只统计真正删掉的
        try { [System.IO.File]::Delete($f.FullName); $freed += $len } catch { }
    }
    return $freed
}

# ============================ 命令行兜底 ============================

function Show-ConsoleMode {
    Write-Host ''
    Write-Host '  ==========================================' -ForegroundColor DarkCyan
    Write-Host '    张开嘴清理 · 命令行模式' -ForegroundColor Cyan
    Write-Host '    （图形界面不可用时自动切换）' -ForegroundColor DarkGray
    Write-Host '  ==========================================' -ForegroundColor DarkCyan
    while ($true) {
        Write-Host ''
        Write-Host '    1) 扫描并清理垃圾'
        Write-Host '    2) 查看磁盘剩余空间'
        Write-Host '    0) 退出'
        $sel = Read-Host '    请选择'
        switch ($sel) {
            '1' {
                $cats = @(Get-Categories)
                $total = [int64]0
                foreach ($c in $cats) {
                    Write-Host ('    正在扫描 {0} ...' -f $c.Name) -NoNewline
                    $s = Measure-Category $c
                    $c.Size = $s
                    $total += $s
                    Write-Host (' {0}' -f (Format-Size $s))
                }
                Write-Host ('    合计可清理：{0}' -f (Format-Size $total)) -ForegroundColor Green
                if ($total -le 0) { continue }
                $ok = Read-Host '    确认清理？(Y/N)'
                if ($ok -match '^[Yy]') {
                    $freed = [int64]0
                    foreach ($c in $cats) {
                        Write-Host ('    清理 {0} ...' -f $c.Name) -NoNewline
                        $f = Clear-Category $c
                        $freed += $f
                        Write-Host (' 释放 {0}' -f (Format-Size $f))
                    }
                    Write-Host ('    清理完成，共释放 {0}' -f (Format-Size $freed)) -ForegroundColor Green
                }
            }
            '2' { Write-Host ('    ' + (Get-DiskSummary)) }
            '0' { return }
            default { Write-Host '    请输入 0 / 1 / 2' -ForegroundColor Yellow }
        }
    }
}

# ============================ 界面 XAML ============================

$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="张开嘴清理" Width="940" Height="620"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        ResizeMode="NoResize" WindowStartupLocation="CenterScreen"
        FontFamily="Microsoft YaHei UI, Segoe UI">
  <Border CornerRadius="16" BorderThickness="1" BorderBrush="#232D42">
    <Border.Background>
      <LinearGradientBrush StartPoint="0,0" EndPoint="0.55,1">
        <GradientStop Color="#1A2438" Offset="0" />
        <GradientStop Color="#0B0F18" Offset="1" />
      </LinearGradientBrush>
    </Border.Background>
    <Grid>
      <Grid.RowDefinitions>
        <RowDefinition Height="42" />
        <RowDefinition Height="*" />
        <RowDefinition Height="30" />
      </Grid.RowDefinitions>

      <Grid x:Name="TitleBar" Grid.Row="0" Background="Transparent">
        <TextBlock Text="张开嘴清理" Margin="20,0,0,0" VerticalAlignment="Center"
                   Foreground="#8FA0BE" FontSize="12" />
        <StackPanel Orientation="Horizontal" HorizontalAlignment="Right"
                    VerticalAlignment="Center" Margin="0,0,10,0">
          <TextBlock x:Name="BtnMin" Text="—" Foreground="#7C879E" FontSize="13"
                     Padding="10,2" Cursor="Hand" />
          <TextBlock x:Name="BtnClose" Text="✕" Foreground="#7C879E" FontSize="12"
                     Padding="10,2" Cursor="Hand" />
        </StackPanel>
      </Grid>

      <Grid Grid.Row="1">
        <Grid x:Name="IdlePanel">
          <Image x:Name="EarthImage" Width="360" Height="360" Opacity="0.92"
                 HorizontalAlignment="Center" VerticalAlignment="Top"
                 RenderOptions.BitmapScalingMode="HighQuality" />
          <StackPanel VerticalAlignment="Bottom" HorizontalAlignment="Center" Margin="0,0,0,40">
            <TextBlock Text="山雨涤尘垢，潮退万象新" Foreground="#8FA0BE" FontSize="14"
                       HorizontalAlignment="Center" />
            <Border x:Name="ScanBtn" Width="230" Height="50" CornerRadius="25"
                    Background="#FFFFFF" Margin="0,22,0,0" Cursor="Hand">
              <TextBlock Text="扫描电脑" Foreground="#10151F" FontSize="15"
                         FontWeight="SemiBold" HorizontalAlignment="Center" VerticalAlignment="Center" />
            </Border>
            <TextBlock Text="检查临时文件、浏览器缓存、缩略图、日志与回收站"
                       Foreground="#5F6B82" FontSize="12" HorizontalAlignment="Center"
                       Margin="0,14,0,0" />
          </StackPanel>
        </Grid>

        <Grid x:Name="ResultPanel" Visibility="Collapsed" Margin="36,0,36,0">
          <Grid.RowDefinitions>
            <RowDefinition Height="Auto" />
            <RowDefinition Height="*" />
            <RowDefinition Height="Auto" />
          </Grid.RowDefinitions>
          <StackPanel Grid.Row="0" Margin="0,4,0,0">
            <TextBlock x:Name="TotalText" Text="" Foreground="#E8ECF5" FontSize="19" />
            <TextBlock x:Name="SubText" Text="" Foreground="#6E7A93" FontSize="12" Margin="0,5,0,0" />
          </StackPanel>
          <ScrollViewer Grid.Row="1" VerticalScrollBarVisibility="Auto" Margin="0,14,0,0">
            <StackPanel x:Name="CatList" />
          </ScrollViewer>
          <Grid Grid.Row="2" Margin="0,12,0,20">
            <Border x:Name="CleanBtn" Width="210" Height="46" CornerRadius="23"
                    Background="#FFFFFF" HorizontalAlignment="Center" Cursor="Hand">
              <TextBlock x:Name="CleanBtnText" Text="清理选中项" Foreground="#10151F" FontSize="14"
                         FontWeight="SemiBold" HorizontalAlignment="Center" VerticalAlignment="Center" />
            </Border>
            <TextBlock x:Name="AgainBtn" Text="重新扫描" Foreground="#7C879E" FontSize="12"
                       HorizontalAlignment="Right" VerticalAlignment="Center"
                       Margin="0,0,14,0" Cursor="Hand" />
          </Grid>
        </Grid>
      </Grid>

      <TextBlock x:Name="FooterText" Grid.Row="2" Margin="20,0,20,0" VerticalAlignment="Center"
                 Foreground="#4E5972" FontSize="11" Text="" />
    </Grid>
  </Border>
</Window>
'@

# ============================ 界面逻辑 ============================

function Refresh-UI {
    try { $script:Window.Dispatcher.Invoke([Action] {}, [System.Windows.Threading.DispatcherPriority]::Render) } catch { }
}

function Update-RowVisual {
    param([int]$Index)
    if ($Index -lt 0 -or $Index -ge $script:Indicators.Count) { return }
    $r = $script:Results[$Index]
    $ind = $script:Indicators[$Index]
    if ($null -eq $ind) { return }
    if ($r.Size -le 0) {
        $ind.Text = '—'
        $ind.Foreground = New-Brush '#3A465C'
    } elseif ($r.Selected) {
        $ind.Text = '✓'
        $ind.Foreground = New-Brush '#4ADE80'
    } else {
        $ind.Text = '○'
        $ind.Foreground = New-Brush '#3A465C'
    }
}

function Update-Total {
    $sum = [int64]0
    $picked = 0
    foreach ($r in $script:Results) {
        if ($r.Selected) { $sum += $r.Size; if ($r.Size -gt 0) { $picked++ } }
    }
    $script:UI['TotalText'].Text = '可清理 ' + (Format-Size $sum)
    $script:UI['SubText'].Text = ('已选 {0} 项 · 点击分类可取消勾选' -f $picked)
}

function Toggle-Category {
    param([int]$Index)
    if ($script:Phase -ne 'scanned') { return }
    $r = $script:Results[$Index]
    if ($r.Size -le 0) { return }
    $r.Selected = -not $r.Selected
    Update-RowVisual $Index
    Update-Total
}

function Build-Rows {
    $list = $script:UI['CatList']
    $list.Children.Clear()
    $script:Indicators = @()

    for ($i = 0; $i -lt $script:Results.Count; $i++) {
        $r = $script:Results[$i]

        $row = New-Object System.Windows.Controls.Border
        $row.CornerRadius = [System.Windows.CornerRadius]::new(10)
        $row.Background = New-Brush '#151D2E'
        $row.Padding = [System.Windows.Thickness]::new(16, 11, 16, 11)
        $row.Margin = [System.Windows.Thickness]::new(0, 0, 0, 8)
        $row.Cursor = [System.Windows.Input.Cursors]::Hand

        $grid = New-Object System.Windows.Controls.Grid
        $c1 = New-Object System.Windows.Controls.ColumnDefinition
        $c1.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star)
        $c2 = New-Object System.Windows.Controls.ColumnDefinition
        $c2.Width = [System.Windows.GridLength]::new(0, [System.Windows.GridUnitType]::Auto)
        [void]$grid.ColumnDefinitions.Add($c1)
        [void]$grid.ColumnDefinitions.Add($c2)

        $left = New-Object System.Windows.Controls.StackPanel
        $name = New-Object System.Windows.Controls.TextBlock
        $name.Text = $r.Name
        $name.Foreground = New-Brush '#E8ECF5'
        $name.FontSize = 14
        $note = New-Object System.Windows.Controls.TextBlock
        $note.Text = $r.Note
        $note.Foreground = New-Brush '#66718A'
        $note.FontSize = 11
        $note.Margin = [System.Windows.Thickness]::new(0, 3, 0, 0)
        [void]$left.Children.Add($name)
        [void]$left.Children.Add($note)
        [System.Windows.Controls.Grid]::SetColumn($left, 0)
        [void]$grid.Children.Add($left)

        $right = New-Object System.Windows.Controls.StackPanel
        $right.Orientation = [System.Windows.Controls.Orientation]::Horizontal
        $right.VerticalAlignment = [System.Windows.VerticalAlignment]::Center

        $size = New-Object System.Windows.Controls.TextBlock
        if ($r.Size -gt 0) { $size.Text = Format-Size $r.Size } else { $size.Text = '无内容' }
        $size.Foreground = New-Brush '#9AA6BF'
        $size.FontSize = 13
        $size.VerticalAlignment = [System.Windows.VerticalAlignment]::Center

        $ind = New-Object System.Windows.Controls.TextBlock
        $ind.Text = '✓'
        $ind.FontSize = 14
        $ind.Margin = [System.Windows.Thickness]::new(14, 0, 0, 0)
        $ind.VerticalAlignment = [System.Windows.VerticalAlignment]::Center

        [void]$right.Children.Add($size)
        [void]$right.Children.Add($ind)
        [System.Windows.Controls.Grid]::SetColumn($right, 1)
        [void]$grid.Children.Add($right)

        $row.Child = $grid
        [void]$list.Children.Add($row)

        $script:Indicators += $ind
        $idx = $i
        $handler = { param($s, $e) Toggle-Category $idx }.GetNewClosure()
        $row.Add_MouseLeftButtonUp($handler)
        Update-RowVisual $idx
    }
}

function Start-Scan-Core {
    if ($script:Phase -eq 'working') { return }
    $script:Phase = 'working'

    $script:UI['IdlePanel'].Visibility = 'Collapsed'
    $script:UI['ResultPanel'].Visibility = 'Visible'
    $script:UI['CatList'].Children.Clear()
    $script:UI['TotalText'].Text = '正在扫描…'
    $script:UI['SubText'].Text = '扫描不会删除任何文件'
    $script:UI['CleanBtnText'].Text = '请稍候'
    $script:UI['CleanBtn'].Opacity = 0.4
    Refresh-UI

    $cats = @(Get-Categories)
    foreach ($c in $cats) {
        $script:UI['SubText'].Text = '正在扫描：' + $c.Name
        Refresh-UI
        $c.Size = Measure-Category $c
        $c.Selected = ($c.Size -gt 0)
    }
    $script:Results = @($cats)
    $script:Phase = 'scanned'

    Build-Rows

    $hasAny = @($script:Results | Where-Object { $_.Size -gt 0 }).Count
    if ($hasAny -eq 0) {
        $script:UI['TotalText'].Text = '没有可清理的垃圾'
        $script:UI['SubText'].Text = '你的电脑已经很干净了'
    } else {
        Update-Total
    }
    $script:UI['CleanBtnText'].Text = '清理选中项'
    $script:UI['CleanBtn'].Opacity = 1
}

function Start-Clean-Core {
    if ($script:Phase -eq 'done') { Start-Scan; return }
    if ($script:Phase -ne 'scanned') { return }

    $picked = @($script:Results | Where-Object { $_.Selected -and $_.Size -gt 0 })
    if ($picked.Count -eq 0) {
        $script:UI['SubText'].Text = '请先勾选要清理的项目'
        return
    }

    $script:Phase = 'working'
    $script:UI['CleanBtnText'].Text = '清理中…'
    $script:UI['CleanBtn'].Opacity = 0.4
    Refresh-UI

    $freed = [int64]0
    foreach ($c in $picked) {
        $script:UI['SubText'].Text = '正在清理：' + $c.Name
        Refresh-UI
        $freed += (Clear-Category $c)
    }

    $script:Phase = 'done'
    $script:UI['CatList'].Children.Clear()
    $script:UI['TotalText'].Text = '清理完成，释放 ' + (Format-Size $freed)
    $script:UI['SubText'].Text = '你的电脑又轻了一点'
    $script:UI['CleanBtnText'].Text = '再次扫描'
    $script:UI['CleanBtn'].Opacity = 1
}

# 事件入口包一层异常处理，避免某一项出错导致整个窗口崩掉
function Start-Scan {
    try { Start-Scan-Core }
    catch {
        $script:Phase = 'idle'
        try {
            $script:UI['ResultPanel'].Visibility = 'Collapsed'
            $script:UI['IdlePanel'].Visibility = 'Visible'
            $script:UI['FooterText'].Text = '扫描失败：' + $_.Exception.Message
        } catch { }
    }
}

function Start-Clean {
    try { Start-Clean-Core }
    catch {
        $script:Phase = 'scanned'
        try {
            $script:UI['SubText'].Text = '清理中断：' + $_.Exception.Message
            $script:UI['CleanBtnText'].Text = '重试清理'
            $script:UI['CleanBtn'].Opacity = 1
        } catch { }
    }
}

function Show-Gui {
    Add-Type -AssemblyName PresentationFramework
    Add-Type -AssemblyName PresentationCore
    Add-Type -AssemblyName WindowsBase

    $window = [System.Windows.Markup.XamlReader]::Parse($xaml)
    if ($null -eq $window) { throw '界面解析失败' }
    $script:Window = $window

    $names = @('TitleBar','BtnMin','BtnClose','IdlePanel','ResultPanel','EarthImage','ScanBtn','CleanBtnText','CleanBtn','AgainBtn','CatList','TotalText','SubText','FooterText')
    foreach ($n in $names) {
        $el = $window.FindName($n)
        if ($null -eq $el) { throw ('界面元素缺失：' + $n) }
        $script:UI[$n] = $el
    }

    # 地球图片用绝对路径加载，避免工作目录不同导致加载失败
    $imgPath = Join-Path $script:AppDir 'earth.png'
    if (Test-Path -LiteralPath $imgPath) {
        try {
            $bmp = New-Object System.Windows.Media.Imaging.BitmapImage
            $bmp.BeginInit()
            $bmp.UriSource = [Uri]::new($imgPath)
            $bmp.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
            $bmp.EndInit()
            $script:UI['EarthImage'].Source = $bmp
        } catch { }
    }

    if ($script:IsAdmin) {
        $script:UI['FooterText'].Text = '管理员模式  ·  ' + (Get-DiskSummary)
    } else {
        $script:UI['FooterText'].Text = '普通权限（C 盘深度项目需管理员）  ·  ' + (Get-DiskSummary)
    }

    $titleBar = $script:UI['TitleBar']
    $titleBar.Add_MouseLeftButtonDown({ param($s, $e) try { $script:Window.DragMove() } catch { } })

    $script:UI['BtnMin'].Add_MouseLeftButtonUp({ param($s, $e) try { $script:Window.WindowState = [System.Windows.WindowState]::Minimized } catch { } })
    $script:UI['BtnClose'].Add_MouseLeftButtonUp({ param($s, $e) try { $script:Window.Close() } catch { } })

    $script:UI['ScanBtn'].Add_MouseLeftButtonUp({ param($s, $e) Start-Scan })
    $script:UI['CleanBtn'].Add_MouseLeftButtonUp({ param($s, $e) Start-Clean })
    $script:UI['AgainBtn'].Add_MouseLeftButtonUp({ param($s, $e) Start-Scan })

    $script:UI['ScanBtn'].Add_MouseEnter({ param($s, $e) $script:UI['ScanBtn'].Background = New-Brush '#E8EEF9' })
    $script:UI['ScanBtn'].Add_MouseLeave({ param($s, $e) $script:UI['ScanBtn'].Background = New-Brush '#FFFFFF' })
    $script:UI['CleanBtn'].Add_MouseEnter({ param($s, $e) $script:UI['CleanBtn'].Background = New-Brush '#E8EEF9' })
    $script:UI['CleanBtn'].Add_MouseLeave({ param($s, $e) $script:UI['CleanBtn'].Background = New-Brush '#FFFFFF' })

    # 窗口显示后隐藏黑色控制台窗口
    $window.Add_ContentRendered({
        try {
            if (-not ('ZZ.Native' -as [type])) {
                Add-Type -Namespace ZZ -Name Native -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);'
            }
            $h = [ZZ.Native]::GetConsoleWindow()
            if ($h -ne [IntPtr]::Zero) { [void][ZZ.Native]::ShowWindow($h, 0) }
        } catch { }
    })

    [void]$window.ShowDialog()
}

# ============================ 入口 ============================

if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA) {
    $psExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Start-Process -FilePath $psExe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', ('"' + $PSCommandPath + '"'))
    exit
}

$script:IsAdmin = Test-Admin

$guiState = 'closed'
try {
    Show-Gui
} catch {
    $guiState = $_.Exception.Message
}

function Show-ConsoleWindow {
    try {
        if (-not ('ZZ.Native' -as [type])) {
            Add-Type -Namespace ZZ -Name Native -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);'
        }
        $h = [ZZ.Native]::GetConsoleWindow()
        if ($h -ne [IntPtr]::Zero) { [void][ZZ.Native]::ShowWindow($h, 5) }
    } catch { }
}

if ($guiState -ne 'closed') {
    Show-ConsoleWindow
    try {
        [void][System.Windows.MessageBox]::Show("图形界面启动失败，已切换到命令行模式。`n`n错误信息：$guiState", '张开嘴清理')
    } catch { }
    Write-Host ''
    Write-Host ('  图形界面启动失败：' + $guiState) -ForegroundColor Yellow
    Show-ConsoleMode
}
