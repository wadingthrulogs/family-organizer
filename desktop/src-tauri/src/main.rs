// Family Organizer — desktop shell.
//
// This is a thin native window around the app the Pi already serves over HTTPS.
// It deliberately holds no application logic: the UI and every API call come
// from the server, so the web experience and the desktop app can never drift.
//
// The only two problems it solves that a browser window doesn't:
//   1. Boot ordering — at login the Docker stack is usually not up yet, so we
//      show a local splash and poll /api/v1/health until the server answers.
//   2. Self-healing — if the stack restarts under a wall display nobody is
//      watching, we fall back to the splash and re-enter the app on recovery.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, fs, path::PathBuf, thread, time::Duration};

use tauri::{Manager, Url, WebviewWindow};

/// Used when neither $FAMILY_ORGANIZER_URL nor the config file is set.
const DEFAULT_URL: &str = "https://familyorganizer.tail411eff.ts.net";
const HEALTH_PATH: &str = "/api/v1/health";

/// How often we retry while waiting for the server to come up at boot.
const BOOT_POLL_INTERVAL: Duration = Duration::from_secs(2);
/// How often we re-check health once the app is on screen.
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(15);
/// Consecutive watchdog failures before we fall back to the splash screen.
/// Deliberately not 1 — a single blip shouldn't yank a page out from under
/// someone who is mid-interaction.
const WATCHDOG_FAILURES_BEFORE_RESET: u32 = 3;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

/// Resolution order: env var, then config file, then the compiled-in default.
/// The config file keeps the deployed binary reusable on another household's Pi
/// without a rebuild.
fn resolve_app_url() -> String {
    if let Ok(url) = env::var("FAMILY_ORGANIZER_URL") {
        let url = url.trim().to_string();
        if !url.is_empty() {
            return url;
        }
    }

    if let Some(path) = config_file_path() {
        if let Ok(contents) = fs::read_to_string(&path) {
            let url = contents.trim().to_string();
            if !url.is_empty() {
                return url;
            }
        }
    }

    DEFAULT_URL.to_string()
}

fn config_file_path() -> Option<PathBuf> {
    let base = env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|_| env::var("HOME").map(|h| PathBuf::from(h).join(".config")))
        .ok()?;
    Some(base.join("family-organizer").join("url"))
}

fn is_healthy(base_url: &str) -> bool {
    let url = format!("{}{}", base_url.trim_end_matches('/'), HEALTH_PATH);
    ureq::get(&url)
        .timeout(REQUEST_TIMEOUT)
        .call()
        .map(|response| response.status() == 200)
        .unwrap_or(false)
}

/// Push a line of text into the splash page. Best-effort: if the webview has
/// already navigated to the remote app, the helper is gone and this is a no-op.
fn set_splash_status(window: &WebviewWindow, message: &str) {
    let escaped = message.replace('\\', "\\\\").replace('\'', "\\'");
    let _ = window.eval(&format!(
        "if (window.setStatus) {{ window.setStatus('{}') }}",
        escaped
    ));
}

fn set_splash_host(window: &WebviewWindow, host: &str) {
    let escaped = host.replace('\\', "\\\\").replace('\'', "\\'");
    let _ = window.eval(&format!(
        "if (window.setHost) {{ window.setHost('{}') }}",
        escaped
    ));
}

/// Boot-wait, then watchdog, forever. Runs off the main thread so the window
/// paints immediately.
fn supervise(window: WebviewWindow, app_url: String, splash_url: Url) {
    let target = match Url::parse(&app_url) {
        Ok(url) => url,
        Err(err) => {
            set_splash_status(&window, &format!("Invalid server URL: {err}"));
            return;
        }
    };

    loop {
        // ── Wait for the server ──
        // Both helpers are re-applied every tick: the splash document may not
        // have finished parsing when the first eval fires, and after a watchdog
        // reset it's a fresh document with the helpers reset.
        let mut attempt: u32 = 0;
        while !is_healthy(&app_url) {
            attempt += 1;
            set_splash_host(&window, &app_url);
            set_splash_status(
                &window,
                &format!("Waiting for the server… (attempt {attempt})"),
            );
            thread::sleep(BOOT_POLL_INTERVAL);
        }

        set_splash_status(&window, "Connected. Loading…");
        if let Err(err) = window.navigate(target.clone()) {
            set_splash_status(&window, &format!("Could not open the app: {err}"));
            thread::sleep(BOOT_POLL_INTERVAL);
            continue;
        }

        // ── Watch it while it's up ──
        let mut failures: u32 = 0;
        loop {
            thread::sleep(WATCHDOG_INTERVAL);
            if is_healthy(&app_url) {
                failures = 0;
                continue;
            }
            failures += 1;
            if failures >= WATCHDOG_FAILURES_BEFORE_RESET {
                break;
            }
        }

        // Server went away — park on the splash and wait for it to return.
        if window.navigate(splash_url.clone()).is_err() {
            // If we can't even reach the splash the window is gone; stop.
            return;
        }
        set_splash_status(&window, "Lost the server. Reconnecting…");
    }
}

fn main() {
    // WebKitGTK's DMA-BUF renderer produces torn, striped output on this Pi's
    // 270°-rotated HDMI output — flat fills land correctly but text and borders
    // smear into single scanlines. Disabling it renders cleanly. Must happen
    // before the webview initialises. Only set when the caller hasn't expressed
    // a preference, so it stays overridable with an explicit env var.
    if env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("main window is declared in tauri.conf.json");

            let app_url = resolve_app_url();
            let splash_url = window.url()?;

            thread::spawn(move || supervise(window, app_url, splash_url));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Family Organizer desktop shell");
}
