// Round-trip a contract's worked examples through the generated rust-axum models.
//
// scripts/check-codegen.sh copies this into each generated crate as tests/examples.rs, appends a
// `#[test]` naming that contract's example directories and schemas, and runs `cargo test`. It exists
// because rust-axum's worst defect is invisible to every grep: the crate compiles, the symbols are
// all present, and the server accepts every request — but it hands the implementation
// `cover_type == "LifeCover"` rather than `"life"`, and writes that back onto the wire. Only
// deserialising a real payload and serialising it again shows it.
//
// Each example must also pass the generated validators, which is what the server runs on every
// request before a trait method sees it. A pattern mangled on its way into a Rust string literal
// compiles, round-trips and then rejects every valid value — so this is not optional.
//
// Two differences are tolerated because they are the same value: integers come back as floats
// (`40` -> `40.0`) where the schema says `number`, and timestamps come back normalised to UTC.
// Everything else must survive unchanged.

use chrono::DateTime;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::path::PathBuf;

fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::String(x), Value::String(y)) => {
            x == y
                || matches!(
                    (DateTime::parse_from_rfc3339(x), DateTime::parse_from_rfc3339(y)),
                    (Ok(p), Ok(q)) if p == q
                )
        }
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len() && x.iter().all(|(k, p)| y.get(k).is_some_and(|q| same(p, q)))
        }
        _ => a == b,
    }
}

/// Every example in `<OPENLIFE_EXAMPLES>/<dir>`, as `T` and back. Returns one line per failure.
fn round_trip<T: DeserializeOwned + Serialize + validator::Validate>(dir: &str) -> Vec<String> {
    let dir = PathBuf::from(std::env::var("OPENLIFE_EXAMPLES").expect("OPENLIFE_EXAMPLES")).join(dir);
    let mut failures = vec![];
    let mut seen = 0;
    for entry in std::fs::read_dir(&dir).unwrap_or_else(|e| panic!("{}: {e}", dir.display())) {
        let path = entry.unwrap().path();
        if path.extension().is_none_or(|e| e != "json") {
            continue;
        }
        seen += 1;
        let original: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        match serde_json::from_value::<T>(original.clone()) {
            Err(err) => failures.push(format!("{}: does not deserialise: {err}", path.display())),
            Ok(model) => {
                if let Err(err) = model.validate() {
                    failures.push(format!("{}: fails the generated validators: {err}", path.display()));
                }
                let back = serde_json::to_value(&model).unwrap();
                if !same(&original, &back) {
                    failures.push(format!("{}: changed on the way back out:\n{back}", path.display()));
                }
            }
        }
    }
    // An empty directory would pass vacuously, which is how a renamed folder stops being tested.
    assert!(seen > 0, "{}: no examples found", dir.display());
    failures
}
