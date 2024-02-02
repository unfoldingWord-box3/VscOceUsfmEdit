// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { UsfmEditorProvider } from './usfmEditor';
import { UsfmOutlineProvider } from './usfmOutline';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('The extension "usfmeditor" is now active!');


	const [usfmEditorProviderDisposable, usfmEditorProviderObject] = UsfmEditorProvider.register(context);
	context.subscriptions.push( usfmEditorProviderDisposable );


	const usfmOutlineProvider = new UsfmOutlineProvider(context, usfmEditorProviderObject);
	vscode.window.registerTreeDataProvider('com.oceEditorTools.usfmOutline', usfmOutlineProvider);

	vscode.commands.registerCommand('usfmOutline.selectReference', (location: string) => {
		usfmOutlineProvider.selectReference(location);
	});
	vscode.commands.registerCommand("usfmOutline.alignReference", (location: string) => {
		usfmOutlineProvider.alignReference(location);
	});
}

// This method is called when your extension is deactivated
export function deactivate() {}
