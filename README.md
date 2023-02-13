# howdy, im a vscode extension written in rust

## points of interest

- `src/extension.ts` is the entry point for the extension
- `jelly-rs` is where the rust is
- `package.json:contributes` is where the extension is registered
- `webpack.config.ts:plugins` is the plugin that tells webpack to bundle the rust

## todo list

- [X] add a command to the command palette
- [ ] add a web view
  - [ ] add canvas to web view
  - [ ] doodle on web view with WGPU
- [ ] webpack extension inspires the imagination
  - [ ] add watchers to the rust
  - [ ] better imports?
