import * as vscode from 'vscode';
import * as path from 'path';

export interface UsfmDocumentAbstraction extends vscode.CustomDocument{
    getStrippedUsfmText(): string;
}
export interface UsfmEditorAbstraction {
    onUsfmActiveEditorChanged: vscode.Event<UsfmDocumentAbstraction>;
    onUsfmDocumentChanged(callback: (e: vscode.CustomDocumentEditEvent<UsfmDocumentAbstraction>) => void): void;
    selectReference( reference: string ): void;
}

interface VerseIndex{
    number: string,
}
interface ChapterIndex{
    number: string,
    verses: VerseIndex[],
}

export class UsfmOutlineProvider implements vscode.TreeDataProvider< string > {

	private _onDidChangeTreeData: vscode.EventEmitter< string | undefined> = new vscode.EventEmitter<string | undefined>();
	readonly onDidChangeTreeData: vscode.Event<string | undefined> = this._onDidChangeTreeData.event;

    
    //This gets updated whenever the contests get refreshed.
    private index: ChapterIndex[] = [];
	//private editor: vscode.TextEditor | undefined;
	//private lines: string[] | undefined;

	private autoRefresh = true;

	constructor(private context: vscode.ExtensionContext, private editorProvider: UsfmEditorAbstraction) {

        editorProvider.onUsfmActiveEditorChanged(e => this.onUsfmActiveEditorChanged(e)) ;
		editorProvider.onUsfmDocumentChanged(e => this.onUsfmDocumentChanged(e));


		this.autoRefresh = vscode.workspace?.getConfiguration('usfmEditor.outline').get('autoRefresh', true);
		vscode.workspace.onDidChangeConfiguration(() => {
			this.autoRefresh = vscode.workspace.getConfiguration('usfmEditor.outline').get('autoRefresh', true);
		});
		this.onUsfmActiveEditorChanged(undefined);
	}

	refresh(location?: string, document?: UsfmDocumentAbstraction): void {
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

	private onUsfmActiveEditorChanged( document?: UsfmDocumentAbstraction): void {
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

	private onUsfmDocumentChanged(e: vscode.CustomDocumentEditEvent<UsfmDocumentAbstraction>): void {
		if (this.autoRefresh) {
            //Need to pass the document from the event into parseStuff
            this.parseStuff( e.document );
            this._onDidChangeTreeData.fire(undefined);
		}
	}

	private parseStuff( document?: UsfmDocumentAbstraction ): void {
        if( document ){
            var strippedUsfm = document.getStrippedUsfmText();
            //chapter finder regex
            const chapterFinderRegex = /\\c ([0-9]+)/g;
            const verseFinderRegex = /\\v ([0-9]+)/g;

            this.index = [];
            let currentChapter: ChapterIndex | null = null;

            let chapterMatch = chapterFinderRegex.exec(strippedUsfm);
            let verseMatch = verseFinderRegex.exec(strippedUsfm);

            while( chapterMatch !== null || verseMatch !== null ){
                if( chapterMatch !== null && (verseMatch === null || chapterMatch.index < verseMatch.index)){
                    currentChapter = {
                        number: chapterMatch[1],
                        verses: []
                    };
                    this.index.push(currentChapter);
                    chapterMatch = chapterFinderRegex.exec(strippedUsfm);
                }else if( verseMatch !== null && currentChapter !== null ){
                    currentChapter.verses.push({
                        number:verseMatch[1],
                    });
                    verseMatch = verseFinderRegex.exec(strippedUsfm);
                }
            }

        }
	}

	getChildren(location?: string): Thenable<string[]> {
        const _location = location ? location : '';

        const path = _location.split(':');
        const chapter = path.length > 0 ? path[0] : '';
        const verse   = path.length > 1 ? path[1] : '';

        //if the chapter is an empty string just return the list of all the chapters.
        if( chapter === '' ){
            return Promise.resolve(this.index.map(c => c.number));
        }

        //next if the verse is an empty string return all the verses under the chapter.
        if( verse === '' ){
            return Promise.resolve(this.index.find(c => c.number === chapter)?.verses.map(v => `${chapter}:${v.number}`) || []);
        }

        //If it doesn't need the chapters or the verses then it can just return an empty array
        //because the verses do not have children.
        return Promise.resolve([]);
	}

	getTreeItem(location?: string): vscode.TreeItem {
		if (!this.index) {
			throw new Error('Invalid tree');
		}


        const _location = location ? location : 'root';

        let content = "document";
        let hasChildren = false;
        let isSelectable = false;


        const path = _location.split(':');
        const chapter = path.length > 0 ? path[0] : '';
        const verse   = path.length > 1 ? path[1] : '';

        //If the chapter is an empty string this is the root so the content of document is fine.
        if( chapter === '' ){
            content = "document";
            hasChildren = true;
            isSelectable = true;
        }else{
            if( verse === '' ){
                content = `chapter ${chapter}`;
                hasChildren = true;
                isSelectable = true;
            }else{
                content = `verse ${chapter}:${verse}`;
                hasChildren = false;
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

    selectReference( location: string ): void {
        if( location === undefined ){ return; }

        this.editorProvider.selectReference( location );
    }


    //----

    //In the example this is registered to the command above.
	// select(range: vscode.Range) {
	// 	if (this.editor) {
	// 		this.editor.selection = new vscode.Selection(range.start, range.end);
	// 	}
	// }
}
