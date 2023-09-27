use std::mem::ManuallyDrop;
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub fn activate() {
  vscode::window::showInformationMessage("🦀 (activated) Hello from rust and {{project-name}}! 🦀");
  let greet_command = ManuallyDrop::new(Closure::new(|| {
    vscode::window::showInformationMessage("🦀 (command) Closures work! 🦀");
  }));
  vscode::commands::registerCommand("{{project-name}}.helloWorld", &greet_command);
}

#[wasm_bindgen]
pub fn deactivate() {}

pub mod vscode {
  use super::*;

  pub mod commands {
    use super::*;
    #[wasm_bindgen(module = "vscode")]
    extern "C" {
      #[wasm_bindgen(js_namespace = commands)]
      pub fn registerCommand(s: &str, f: &Closure<dyn FnMut()>);
    }
  }

  pub mod window {
    use super::*;

    #[wasm_bindgen(module = "vscode")]
    extern "C" {
      // lug in vscode.window.showInformationMessage
      // module is vscode, namespace is window, function is showInformationMessage
      #[wasm_bindgen(js_namespace = window)]
      pub fn showInformationMessage(s: &str);
    }
  }
}
