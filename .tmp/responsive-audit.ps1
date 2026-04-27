$ErrorActionPreference = "Stop"

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profile = Join-Path (Get-Location) ".tmp\cdp-responsive-profile"
$port = 9227
$url = "http://127.0.0.1:5174/"
$screenshotDir = Join-Path (Get-Location) ".tmp\responsive"

if (Test-Path $profile) {
  Remove-Item -LiteralPath $profile -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $screenshotDir | Out-Null

$args = @(
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--remote-debugging-port=$port",
  "--user-data-dir=$profile",
  "about:blank"
)

$process = Start-Process -FilePath $chrome -ArgumentList $args -PassThru -WindowStyle Hidden

try {
  $version = $null
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      $version = Invoke-RestMethod "http://127.0.0.1:$port/json/version"
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  if (-not $version) {
    throw "Chrome DevTools did not start"
  }

  $tab = Invoke-RestMethod -Method Put "http://127.0.0.1:$port/json/new?$url"
  $socket = [System.Net.WebSockets.ClientWebSocket]::new()
  $null = $socket.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

  $nextId = 0
  function Send-Cdp {
    param(
      [string]$Method,
      [hashtable]$Params = @{}
    )

    $script:nextId += 1
    $id = $script:nextId
    $payload = @{ id = $id; method = $Method; params = $Params } | ConvertTo-Json -Depth 30 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $null = $socket.SendAsync(
      [ArraySegment[byte]]::new($bytes),
      [System.Net.WebSockets.WebSocketMessageType]::Text,
      $true,
      [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult()

    while ($true) {
      $parts = New-Object System.Collections.Generic.List[string]
      do {
        $buffer = New-Object byte[] 1048576
        $result = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $parts.Add([Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count))
      } while (-not $result.EndOfMessage)

      $text = [string]::Concat($parts)
      if (-not $text) {
        continue
      }
      $message = $text | ConvertFrom-Json
      if ($message.id -eq $id) {
        return $message
      }
    }
  }

  Send-Cdp "Page.enable" | Out-Null
  Send-Cdp "Runtime.enable" | Out-Null

  $prepareStorageExpression = @'
(() => {
  localStorage.removeItem('goodnight-project-index');
  localStorage.removeItem('goodnight-project-store');
  localStorage.setItem('goodnight-app-style', 'workbench');
  return true;
})()
'@

  $auditExpression = @'
(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const click = async (selector, label) => {
    const candidates = Array.from(document.querySelectorAll(selector));
    const target = label
      ? candidates.find((el) => (el.textContent || el.getAttribute('aria-label') || '').includes(label))
      : candidates[0];
    if (!target) return false;
    target.click();
    await wait(250);
    return true;
  };
  const audit = (label) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const root = document.documentElement;
    const body = document.body;
    const selectors = [
      '.app-shell-desktop',
      '.app-header',
      '.app-workbench-row',
      '.app-workbench-allotment',
      '.app-main-desktop',
      '.floating-ai-workspace',
      '.gn-agent-workspace',
      '.chat-shell',
      '.chat-shell-header',
      '.chat-agent-lane-tabs',
      '.chat-agent-panel',
      '.chat-composer',
      '.chat-composer-embedded-input',
      '.chat-reference-menu',
      '.chat-settings-drawer'
    ];
    const hiddenByAncestor = (el) => {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (Number(style.opacity) === 0 || style.pointerEvents === 'none') return true;
      }
      return false;
    };
    const visibleBox = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && !hiddenByAncestor(el) && rect.width > 1 && rect.height > 1;
    };
    const offenders = Array.from(document.querySelectorAll('body *'))
      .filter(visibleBox)
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < -1 || rect.right > vw + 1)
      .slice(0, 40)
      .map(({ el, rect }) => ({
        tag: el.tagName.toLowerCase(),
        className: String(el.className).slice(0, 120),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width)
      }));
    const tinyTargets = Array.from(document.querySelectorAll('button, [role="button"], a, select, input, textarea'))
      .filter(visibleBox)
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width < 44 || rect.height < 36)
      .slice(0, 30)
      .map(({ el, rect }) => ({
        tag: el.tagName.toLowerCase(),
        className: String(el.className).slice(0, 100),
        label: (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }));
    const measured = Object.fromEntries(
      selectors.map((selector) => {
        const el = document.querySelector(selector);
        if (!el) return [selector, null];
        const rect = el.getBoundingClientRect();
        return [selector, {
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }];
      })
    );
    return {
      label,
      theme: document.documentElement.dataset.theme || 'unknown',
      viewport: `${vw}x${vh}`,
      rootScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      clientWidth: root.clientWidth,
      horizontalOverflow: root.scrollWidth > window.innerWidth + 1 || body.scrollWidth > window.innerWidth + 1,
      offenders,
      tinyTargets,
      measured
    };
  };

  const results = [];
  results.push(audit('base'));
  await click('.chat-shell-drawer-toggle', 'Context');
  results.push(audit('context-drawer'));
  await click('.chat-shell-drawer-toggle', 'Run');
  results.push(audit('run-drawer'));
  await click('.chat-composer-plus-btn');
  results.push(audit('reference-menu'));
  await click('[aria-label="设置"]');
  results.push(audit('settings-drawer'));
  return results;
})()
'@

  $sizes = @(
    @{ width = 375; height = 812 },
    @{ width = 768; height = 1024 },
    @{ width = 1280; height = 720 },
    @{ width = 1440; height = 900 }
  )
  $themes = @("dark", "light")
  $results = @()

  foreach ($theme in $themes) {
    foreach ($size in $sizes) {
      Send-Cdp "Emulation.setDeviceMetricsOverride" @{
        width = $size.width
        height = $size.height
        deviceScaleFactor = 1
        mobile = $false
      } | Out-Null
      Send-Cdp "Page.navigate" @{ url = $url } | Out-Null
      Start-Sleep -Milliseconds 700
      Send-Cdp "Runtime.evaluate" @{
        expression = $prepareStorageExpression
        returnByValue = $true
        awaitPromise = $true
      } | Out-Null
      Send-Cdp "Runtime.evaluate" @{
        expression = "localStorage.setItem('goodnight-theme-mode', '$theme')"
        returnByValue = $true
      } | Out-Null
      Send-Cdp "Page.reload" @{ ignoreCache = $true } | Out-Null
      Start-Sleep -Milliseconds 1800

      Send-Cdp "Runtime.evaluate" @{
        expression = "document.querySelector('.project-manager-form input')?.focus()"
        returnByValue = $true
      } | Out-Null
      Send-Cdp "Input.insertText" @{
        text = "Responsive Audit Project"
      } | Out-Null
      Send-Cdp "Runtime.evaluate" @{
        expression = "document.querySelector('.project-manager-form textarea')?.focus()"
        returnByValue = $true
      } | Out-Null
      Send-Cdp "Input.insertText" @{
        text = "Check layout at multiple resolutions, including long text wrapping and popover clipping."
      } | Out-Null
      Start-Sleep -Milliseconds 250
      Send-Cdp "Runtime.evaluate" @{
        expression = "document.querySelector('.project-manager-form button[type=submit]')?.click()"
        returnByValue = $true
      } | Out-Null
      Start-Sleep -Milliseconds 2000

      $response = Send-Cdp "Runtime.evaluate" @{
        expression = $auditExpression
        returnByValue = $true
        awaitPromise = $true
      }
      $value = $response.result.result.value
      foreach ($item in $value) {
        $results += $item
      }

      if ($theme -eq "dark") {
        $shot = Send-Cdp "Page.captureScreenshot" @{ format = "png"; captureBeyondViewport = $false }
        $file = Join-Path $screenshotDir "workbench-$($theme)-$($size.width)x$($size.height).png"
        [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String($shot.result.data))
      }
    }
  }

  Write-Output ($results | ConvertTo-Json -Depth 30)
} finally {
  if ($socket) {
    $socket.Dispose()
  }
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
  }
}
