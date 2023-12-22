import * as vscode from 'vscode';
import * as path from 'path';

export interface UsfmEditorAbstraction {
    onUsfmActiveEditorChanged(callback: (e: vscode.TextDocument) => void): unknown;
    onUsfmDocumentChanged(callback: (e: vscode.TextDocumentChangeEvent) => void): void;
    selectLine( lineNumber: number ): void;
}

export class UsfmOutlineProvider implements vscode.TreeDataProvider< string > {

	private _onDidChangeTreeData: vscode.EventEmitter< string | undefined> = new vscode.EventEmitter<string | undefined>();
	readonly onDidChangeTreeData: vscode.Event<string | undefined> = this._onDidChangeTreeData.event;

    
    //This gets updated whenever the contests get refreshed.
	//private editor: vscode.TextEditor | undefined;
	private lines: string[] | undefined;

	private autoRefresh = true;

	constructor(private context: vscode.ExtensionContext, private editorProvider: UsfmEditorAbstraction) {

        editorProvider.onUsfmActiveEditorChanged(e => this.onUsfmActiveEditorChanged(e)) ;
		editorProvider.onUsfmDocumentChanged(e => this.onUsfmDocumentChanged(e));


		this.autoRefresh = vscode.workspace.getConfiguration('usfmOutline').get('autoRefresh', true);
		vscode.workspace.onDidChangeConfiguration(() => {
			this.autoRefresh = vscode.workspace.getConfiguration('usfmOutline').get('autoRefresh', true);
		});
		this.onUsfmActiveEditorChanged(undefined);

	}

	refresh(location?: string, document?: vscode.TextDocument): void {
        //This gets called for example from when the active editor changes.
		this.parseStuff( document );
		this._onDidChangeTreeData.fire(location);
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

	private onUsfmActiveEditorChanged( document?: vscode.TextDocument): void {
        if (document) {
            var enabled = document !== undefined;
            vscode.commands.executeCommand('setContext', 'usfmOutlineEnabled', enabled);
            if (enabled) {
                this.refresh(undefined, document);
            }
        }else{
            this.refresh( undefined, undefined );
        }

	}

	private onUsfmDocumentChanged(changeEvent: vscode.TextDocumentChangeEvent): void {
		if (this.autoRefresh) {
            //Need to pass the document from the event into parseStuff
            this.parseStuff( changeEvent.document );
            this._onDidChangeTreeData.fire(undefined);
		}
	}

	private parseStuff( document?: vscode.TextDocument ): void {
        if( document ){
            this.lines = document.getText().split('\n');
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


        const _location = location ? location : 'root';
        const location_path = _location.split('.');

        let content = "document";
        let hasChildren = false;
        let isSelectable = false;
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
                isSelectable = true;
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

        if( isSelectable ){
            treeItem.contextValue = "selectable";
        }

        return treeItem;
	}

    selectLine( location: string ): void {
        if( location === undefined ){ return; }
        
        const location_path = location.split('.');

        if( location_path.length >= 2 ){
            const line_number = parseInt(location_path[1].split(' ')[1]);

            if( isNaN(line_number) || this.lines === undefined || line_number >= this.lines.length ){
                throw (new Error(`Could not find line number ${line_number}`));
            }

            this.editorProvider.selectLine( line_number );
        }
    }


    //----

    //In the example this is registered to the command above.
	// select(range: vscode.Range) {
	// 	if (this.editor) {
	// 		this.editor.selection = new vscode.Selection(range.start, range.end);
	// 	}
	// }
}
