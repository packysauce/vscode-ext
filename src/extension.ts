// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-jelly" is now active!');
	const jelly = await import('../dist/jelly-rs');

	// Canvas view
	const canvas = vscode.window.createWebviewPanel(
		"jelly",
		"Jelly",
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			enableCommandUris: true,
			retainContextWhenHidden: true,
		}
	);
	canvas.webview.html = `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Jelly</title>
		</head>
		<body>
			<canvas id="canvas"></canvas>
			<script>
				const canvas = document.querySelector('#canvas');
				const ctx = canvas.getContext('2d');
				ctx.fillStyle = 'green';
				ctx.fillRect(0, 0, 100, 100);
			</script>
		</body>
		</html>
	`;

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	[
		vscode.commands.registerCommand('vscode-jelly.showCanvas', () => {
			canvas.reveal();
		}),
		vscode.commands.registerCommand('vscode-jelly.helloWorld', () => {
			jelly.greet("Hello World");
		}),
	].forEach((d) => context.subscriptions.push(d));
}

// This method is called when your extension is deactivated
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
