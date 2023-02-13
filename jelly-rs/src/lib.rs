use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen(module = "vscode")]
extern "C" {
    // lug in vscode.window.showInformationMessage
    // module is vscode, namespace is window, function is showInformationMessage
    #[wasm_bindgen(js_namespace = window)]
    fn showInformationMessage(s: &str);
}

#[wasm_bindgen]
pub fn greet(name: &str) {
    showInformationMessage(&format!("Hello, {}!", name));
}