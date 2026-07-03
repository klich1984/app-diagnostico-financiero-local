//! Tests for REQ-105: restricted SQL capabilities.
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-102 +
//!          §REQ-104 + §REQ-105
//! Design:  `openspec/changes/mvp-financiero-local-first/design.md` §2
//!          (topología — "Capacidades mínimas") + §6 (capabilities)
//! Task:    T-105
//! Test #:  slice 2 / test #3
//!
//! RED PHASE: today, `capabilities/default.json` only contains `core:default`.
//! - Test 1 (`sql:default` is present) FAILS today as an assertion failure — that is
//!   the expected RED state for REQ-105.
//! - Tests 2 and 3 are guard tests: they verify that the capability file does NOT
//!   grant `fs:default` or `shell:default` and that it scopes to `main` only.
//!   They pass today and MUST keep passing in GREEN so no unsafe capability is
//!   silently introduced.
//!
//! This file does NOT reference any Rust module, so it compiles cleanly even
//! before the IMPL phase. The RED comes purely from the data-driven assertion
//! in test 1.

mod common;

/// REQ-105 / Scenario: capability file grants `sql:default` so the WebView
/// can run queries through `tauri-plugin-sql`. Currently absent — RED.
#[test]
fn req_105_capabilities_default_json_contains_sql_default_permission() {
    let caps = parse_capabilities();

    let permissions = permissions_array(&caps);

    assert!(
        permissions.iter().any(|p| p == "sql:default"),
        "REQ-105: capabilities/default.json must contain `sql:default` \
         in `permissions` (found: {:?})",
        permissions,
    );
}

/// REQ-105 / Scenario: the WebView must NOT be granted filesystem or shell
/// permissions. The MVP does not need them; granting them widens the attack
/// surface unnecessarily (design §2 — "Capacidades mínimas").
#[test]
fn req_105_capabilities_default_json_does_not_contain_fs_default_or_shell_default() {
    let caps = parse_capabilities();
    let permissions = permissions_array(&caps);

    for forbidden in ["fs:default", "shell:default", "http:default", "os:default"] {
        assert!(
            !permissions.iter().any(|p| p == forbidden),
            "REQ-105: capabilities/default.json must NOT grant `{forbidden}` \
             (found permissions: {:?})",
            permissions,
        );
    }
}

/// REQ-105 / Scenario: the capability must scope to the `main` window only.
/// This prevents a second window (e.g. an injected popup) from inheriting
/// SQL access.
#[test]
fn req_105_capabilities_default_json_has_scope_to_main_window_only() {
    let caps = parse_capabilities();

    let windows = caps
        .get("windows")
        .and_then(|w| w.as_array())
        .unwrap_or_else(|| panic!("REQ-105: capabilities/default.json must declare a `windows` array"));

    let window_names: Vec<&str> = windows.iter().filter_map(|v| v.as_str()).collect();

    assert!(
        window_names.contains(&"main"),
        "REQ-105: capabilities/default.json must scope to the `main` window \
         (found windows: {:?})",
        window_names,
    );
    assert_eq!(
        window_names.len(),
        1,
        "REQ-105: capabilities/default.json must scope to exactly one window \
         (`main`), found {:?}",
        window_names,
    );
}

// -- helpers --------------------------------------------------------------

fn parse_capabilities() -> serde_json::Value {
    let raw = common::read_text(&common::capabilities_default_path());
    serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("REQ-105: capabilities/default.json must be valid JSON: {e}"))
}

fn permissions_array(caps: &serde_json::Value) -> Vec<String> {
    caps.get("permissions")
        .and_then(|p| p.as_array())
        .unwrap_or_else(|| panic!("REQ-105: capabilities/default.json must have a `permissions` array"))
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect()
}
