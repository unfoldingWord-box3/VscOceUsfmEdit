import * as vscode from 'vscode';
import * as path from 'path';



export class RawTextOutlineProvider implements vscode.TreeDataProvider< string > {

	private _onDidChangeTreeData: vscode.EventEmitter< string | undefined> = new vscode.EventEmitter<string | undefined>();
	readonly onDidChangeTreeData: vscode.Event<string | undefined> = this._onDidChangeTreeData.event;

    
    //This gets updated whenever the contests get refreshed.
	private editor: vscode.TextEditor | undefined;
	private lines: string[] | undefined;

	private autoRefresh = true;

	constructor(private context: vscode.ExtensionContext) {
		vscode.window.onDidChangeActiveTextEditor(() => this.onActiveEditorChanged());
		vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e));
		this.autoRefresh = vscode.workspace.getConfiguration('rawTextOutline').get('autorefresh', false);
		vscode.workspace.onDidChangeConfiguration(() => {
			this.autoRefresh = vscode.workspace.getConfiguration('rawTextOutline').get('autorefresh', false);
		});
		this.onActiveEditorChanged();
	}

	refresh(location?: string): void {
        //This gets called for example from when the active editor changes.
		this.parseStuff();
		if (location) {
			this._onDidChangeTreeData.fire(location);
		} else {
			this._onDidChangeTreeData.fire(undefined);
		}
	}
    //So rename gets called by a registered command.  So I can come back to this and make it something about deleting a line or something like that.

	// rename(offset: number): void {
	// 	vscode.window.showInputBox({ placeHolder: 'Enter the new label' }).then(value => {
	// 		const editor = this.editor;
	// 		const tree = this.tree;
	// 		if (value !== null && value !== undefined && editor && tree) {
	// 			editor.edit(editBuilder => {
	// 				const path = json.getLocation(this.text, offset).path;
	// 				let propertyNode: json.Node | undefined = json.findNodeAtLocation(tree, path);
	// 				if (propertyNode.parent?.type !== 'array') {
	// 					propertyNode = propertyNode.parent?.children ? propertyNode.parent.children[0] : undefined;
	// 				}
	// 				if (propertyNode) {
	// 					const range = new vscode.Range(editor.document.positionAt(propertyNode.offset), editor.document.positionAt(propertyNode.offset + propertyNode.length));
	// 					editBuilder.replace(range, `"${value}"`);
	// 					setTimeout(() => {
	// 						this.parseTree();
	// 						this.refresh(offset);
	// 					}, 100);
	// 				}
	// 			});
	// 		}
	// 	});
	// }

	private onActiveEditorChanged(): void {
		if (vscode.window.activeTextEditor) {
			if (vscode.window.activeTextEditor.document.uri.scheme === 'file') {
				const enabled = vscode.window.activeTextEditor.document.languageId === 'python';
				vscode.commands.executeCommand('setContext', 'rawTextOutlineEnabled', enabled);
				if (enabled) {
					this.refresh();
				}
			}
		} else {
			vscode.commands.executeCommand('setContext', 'rawTextOutlineEnabled', false);
		}
	}

	private onDocumentChanged(changeEvent: vscode.TextDocumentChangeEvent): void {
		if (this.lines && this.autoRefresh && changeEvent.document.uri.toString() === this.editor?.document.uri.toString()) {
            this.parseStuff();
            this._onDidChangeTreeData.fire(undefined);
		}
	}

	private parseStuff(): void {
		this.editor = vscode.window.activeTextEditor;
		if (this.editor && this.editor.document) {
			const text = this.editor.document.getText();
			this.lines = text.split('\n');
		}
	}

	getChildren(location?: string): Thenable<string[]> {
        const _location = location ? location : 'root';
        const path = _location.split('.');

        if( path[path.length-1] === 'root') {
            let rows: string[] = [];
            if( this.lines ) {
                rows = this.lines.map((line, index) => `${_location}.line ${index}`);
            }
            return Promise.resolve(rows);
        }

        if( path[path.length-1].startsWith('line') ) {
            const rows = [
                `${_location}.reversed`,
                `${_location}.uppercase`,
                `${_location}.lowercase` ];
            return Promise.resolve(rows);
        }

        return Promise.resolve([]);
	}

	getTreeItem(location?: string): vscode.TreeItem {
		if (!this.lines) {
			throw new Error('Invalid tree');
		}
		if (!this.editor) {
			throw new Error('Invalid editor');
		}

        const _location = location ? location : 'root';
        const location_path = _location.split('.');

        let content = "document";
        let hasChildren = false;
        if( location_path.length < 2 ){
            content = "document";
            hasChildren = true;
        }else{
            const line_number = parseInt(location_path[1].split(' ')[1]);

            if( isNaN(line_number) || line_number >= this.lines.length ){
                throw (new Error(`Could not find line number ${line_number}`));
            }

            content = this.lines[line_number];

            if( location_path.length === 3 ){
                if( location_path[2] === 'reversed' ){
                    content = 'reversed: ' + content.split('').reverse().join('');
                }else if( location_path[2] === 'uppercase' ){
                    content = 'uppercase: ' + content.toUpperCase();
                }else if( location_path[2] === 'lowercase' ){
                    content = 'lowercase: ' + content.toLowerCase();
                }
            }else{
                hasChildren = true;
            }
        }


        const treeItem: vscode.TreeItem = new vscode.TreeItem(content, hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        // treeItem.command = {
        //     command: 'extension.openJsonSelection',
        //     title: '',
        //     arguments: [new vscode.Range(this.editor.document.positionAt(valueNode.offset), this.editor.document.positionAt(valueNode.offset + valueNode.length))]
        // };
        // treeItem.iconPath = this.getIcon(valueNode);
        // treeItem.contextValue = valueNode.type;
        return treeItem;
	}


    //----

    //In the example this is registered to the command above.
	// select(range: vscode.Range) {
	// 	if (this.editor) {
	// 		this.editor.selection = new vscode.Selection(range.start, range.end);
	// 	}
	// }
}
