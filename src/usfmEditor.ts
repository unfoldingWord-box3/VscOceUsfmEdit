import * as vscode from 'vscode';
import { UsfmDocumentAbstraction, UsfmEditorAbstraction } from './usfmOutline';

interface InternalUsfmJsonFormat{
    strippedUsfm: {
        version: number,
        text: string
    },
    alignmentData: {
        version: number,
        //TODO_: Add more here
    }
}
interface UsfmMessage{
    command: string,
    content?: InternalUsfmJsonFormat,
    requestId?: number,
    lineNumber?: number,
}

export function disposeAll(disposables: vscode.Disposable[]): void {
	while (disposables.length) {
		const item = disposables.pop();
		if (item) {
			item.dispose();
		}
	}
}

export abstract class Disposable {
	private _isDisposed = false;

	protected _disposables: vscode.Disposable[] = [];

    public isClosed = false;

	public dispose(): any {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		disposeAll(this._disposables);
	}

	protected _register<T extends vscode.Disposable>(value: T): T {
		if (this._isDisposed) {
			value.dispose();
		} else {
			this._disposables.push(value);
		}
		return value;
	}

	protected get isDisposed(): boolean {
		return this._isDisposed;
	}
}


function usfmToInternalJson( usfm: string ): InternalUsfmJsonFormat {
    //This is a stopgap measure where we just put everything into strippedUsfm
    return {
        strippedUsfm: {
            version: 0,
            text: usfm
        },
        alignmentData: {
            version: 0
        }
    };
}

function internalJsonToUsfm( json: InternalUsfmJsonFormat ): string {
    //This is the reverse of that stopgap
    return json.strippedUsfm.text;
}


interface UpdateFlushable{
    //async function flushUpdates
    flushUpdates(): Promise<void>;
}



class UsfmDocument extends Disposable implements vscode.CustomDocument, UsfmDocumentAbstraction {

    static async create(
        uri: vscode.Uri,
        backupId: string | undefined,
        updateFlusher: UpdateFlushable
    ): Promise< UsfmDocument | PromiseLike<UsfmDocument>>{
        //If we have a backup, read that.  Otherwise read the resource from the workspace
        
        //The backup files will be in JSON format, the normal data files will be in usfm format.
        //The reason for this decision os that that if there is escape, we don't have to do a reconcile
        //into a steady state representable in usfm which may not be possible if the user is half way through
        //typing a structure or something.
        let documentData: InternalUsfmJsonFormat | undefined;
        if( typeof backupId === "string" ){
            const backupDataArray = await vscode.workspace.fs.readFile(vscode.Uri.parse(backupId));
            const backupDataString = new TextDecoder().decode(backupDataArray);
            documentData = JSON.parse(backupDataString);
        }else{
            const fileDataArray = await vscode.workspace.fs.readFile(uri);
            const fileDataString = new TextDecoder().decode(fileDataArray);
            documentData = usfmToInternalJson( fileDataString );
        }

        return new UsfmDocument( uri, documentData!, updateFlusher );
    }


    private readonly _uri: vscode.Uri;
    private _documentData: InternalUsfmJsonFormat;

    private constructor(
        uri: vscode.Uri,
        documentData: InternalUsfmJsonFormat,
        private updateFlusher: UpdateFlushable,
    ){
        super();
        this._uri = uri;
        this._documentData = documentData;
    }

    public get uri(): vscode.Uri {
        return this._uri;
    }

    public get documentData(): InternalUsfmJsonFormat {
        return this._documentData;
    }

    public getStrippedUsfmText(): string {
        if( this._documentData === undefined ){
            return "";
        }
        return this._documentData.strippedUsfm.text;
    }

    private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
    /**
     * An event that is emitted when the document is disposed of.
     */
    public readonly onDidDispose = this._onDidDispose.event;
    
    /**
	 * Called by VS Code when there are no more references to the document.
	 *
	 * This happens when all editors for it have been closed.
	 */
    dispose(): void {
        this._onDidDispose.fire();
        super.dispose();
        this.isClosed = true;
    }

	private readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<{
		readonly content: InternalUsfmJsonFormat;
	}>());
	/**
	 * Fired to notify webviews that the document has changed.
	 */
	public readonly onDidChangeContent = this._onDidChangeDocument.event;

	private readonly _onDidChange = this._register(new vscode.EventEmitter<{
		readonly label: string,
		undo(): void,
		redo(): void,
	}>());
	/**
	 * Fired to tell VS Code that an edit has occurred in the document.
	 *
	 * This updates the document's dirty indicator.
	 */
	public readonly onDidChange = this._onDidChange.event;



	/**
	 * Called when the user edits the document in a webview.
	 *
	 * This fires an event to notify VS Code that the document has been edited.
	 */
	makeEdit(newContent: InternalUsfmJsonFormat) {
		const lastDocumentState = this._documentData;
        this._documentData = newContent;

        console.log( "made edit" );

		this._onDidChange.fire({
			label: 'onDidChangeLabel', //<-- Not sure where this comes through.
			undo: async () => {
                console.log( "undoing edit" );

                const replacedData = this._documentData;
                this._documentData = { ...lastDocumentState };
                this._documentData.alignmentData.version = this._documentData.alignmentData.version + 1 + Math.random();
                this._documentData.strippedUsfm.version = this._documentData.strippedUsfm.version + 1 + Math.random();
				this._onDidChangeDocument.fire({
					content: this._documentData,
				});
			},
			redo: async () => {
                console.log( "redoing edit" );

                const replacedData = this._documentData;
                this._documentData = { ...newContent };
                this._documentData.alignmentData.version = this._documentData.alignmentData.version + 1 + Math.random();
                this._documentData.strippedUsfm.version = this._documentData.strippedUsfm.version + 1 + Math.random();
				this._onDidChangeDocument.fire({
					content: this._documentData,
				});
			}
		});
	}

	/**
	 * Called by VS Code when the user saves the document.
	 */
	async save(cancellation: vscode.CancellationToken): Promise<void> {
        if( this._documentData && !cancellation.isCancellationRequested ){
            await this.saveAs(this.uri, cancellation, false );
        }
	}



	/**
	 * Called by VS Code when the user saves the document to a new location.
	 */
	async saveAs(targetResource: vscode.Uri, cancellation: vscode.CancellationToken, isBackup: boolean ): Promise<void> {
        if( this._documentData && !cancellation.isCancellationRequested ){
            // Loop through the _delegates and let each one of them flush updates to us
            await this.updateFlusher.flushUpdates();
        }



        const encoder = new TextEncoder();

        // With the save also convert the data back to the internal format
        // so if there was data lost in the conversion we see it.
        if( !isBackup ){
            // Now convert the data back to usfm.
            const usfmData = internalJsonToUsfm( this._documentData );
            const usfmDataArray = encoder.encode(usfmData);
    
            await vscode.workspace.fs.writeFile(targetResource, usfmDataArray);


            const lastDocumentState = this._documentData;
            this._documentData = usfmToInternalJson( usfmData );
            this._documentData.alignmentData.version = lastDocumentState.alignmentData.version + 1 + Math.random();
            this._documentData.strippedUsfm.version = lastDocumentState.strippedUsfm.version + 1 + Math.random();
           
            this._onDidChangeDocument.fire({
                content: this._documentData
            });
        }else{

            //if it is a backup just dump the json data.
            const jsonString = JSON.stringify(this._documentData);
            const jsonArray = encoder.encode(jsonString);

            await vscode.workspace.fs.writeFile(targetResource, jsonArray);
        }
	}


    /**
	 * Called by VS Code when the user calls `revert` on a document.
	 */
	async revert(_cancellation: vscode.CancellationToken): Promise<void> {
        const fileDataArray = await vscode.workspace.fs.readFile(this.uri);
        const fileDataString = new TextDecoder().decode(fileDataArray);
        const documentData = usfmToInternalJson( fileDataString );

        const lastDocumentState = this._documentData;

        //update the version numbers to be more then what it was so that the revert
        //can go through.
        this._documentData = documentData;
        this._documentData.alignmentData.version = lastDocumentState.alignmentData.version + 1 + Math.random();
        this._documentData.strippedUsfm.version = lastDocumentState.strippedUsfm.version + 1 + Math.random();


		this._onDidChangeDocument.fire({
			content: this._documentData
		});
	}

	/**
	 * Called by VS Code to backup the edited document.
	 *
	 * These backups are used to implement hot exit.
	 */
	async backup(destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
		await this.saveAs(destination, cancellation, true);

		return {
			id: destination.toString(),
			delete: async () => {
				try {
					await vscode.workspace.fs.delete(destination);
				} catch {
					// noop
				}
			}
		};
	}
}


export function findEdit( before: string, after: string ): { start: number, end: number, newText: string } {
    //First find where the text is different from the start.
    let start = 0;
    while( start < before.length && start < after.length && before.charAt(start) === after.charAt(start) ){
        start++;
    }

    //Now find where the text is different from the end
    let end = before.length - 1;
    while( end >= start && (end-start) >= (before.length-after.length) &&  end+after.length-before.length >= 0 && before[end] === after[end+after.length-before.length]){
        end--;
    }

    //inc end because we want it to be the first char not changed, instead of the last char changed
    end++;

    return { start, end, newText: after.slice(start, end+after.length-before.length) };
}

export function useEdit( before: string, edit: { start: number, end: number, newText: string } ): string {
    return before.slice(0, edit.start) + edit.newText + before.slice(edit.end);
}

export class UsfmEditorProvider implements vscode.CustomEditorProvider<UsfmDocument>,  UsfmEditorAbstraction, UpdateFlushable{


    public static register(context: vscode.ExtensionContext): [vscode.Disposable, UsfmEditorAbstraction] {
        const provider = new UsfmEditorProvider(context);
        return [vscode.window.registerCustomEditorProvider(UsfmEditorProvider.viewType, provider,{
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: true
        }), provider];
    }

    private static readonly viewType = 'com.lansfords.usfmEditor';

	/**
	 * Tracks all known webviews.  
     * The class takes care of automatically dropping references to the webviews when they close.
	 */
	private readonly webviews = new WebviewCollection();


    constructor(private readonly _context: vscode.ExtensionContext) {
        
    }

	//#region CustomEditorProvider

    async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<UsfmDocument> {
        const document: UsfmDocument = await UsfmDocument.create(uri, openContext.backupId, this );

        const listeners: vscode.Disposable[] = [];

        listeners.push(document.onDidChange( e => {
            this._onDidChangeCustomDocument.fire({
                document,
                ...e,
            });
        }));


		listeners.push(document.onDidChangeContent(e => {
			// Update all webviews when the document changes
			for (const webviewPanel of this.webviews.get(document.uri)) {

                const updateMessage: UsfmMessage = {
                    command: 'sync',
                    content: document.documentData,
                };
                webviewPanel.webview.postMessage(updateMessage);
			}
            
            const editEvent: vscode.CustomDocumentEditEvent<UsfmDocument> = {
                document,
                undo: () => {},
                redo: () => {},
                ...e
            };
            

            this._onDidChangeCustomDocument.fire(editEvent);
		}));

		document.onDidDispose(() => disposeAll(listeners));

		return document;
    }

    async resolveCustomEditor(document: UsfmDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
		// Add the webview to our internal set of active webviews
		this.webviews.add(document.uri, webviewPanel);

        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(document, e, webviewPanel));
        
        this._onUsfmActiveEditorChanged.fire(document);
    }

    
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<UsfmDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    
    private readonly _onUsfmActiveEditorChanged = new vscode.EventEmitter<UsfmDocument>();
    public readonly onUsfmActiveEditorChanged = this._onUsfmActiveEditorChanged.event;


    public saveCustomDocument(document: UsfmDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.save(cancellation);
	}

	public saveCustomDocumentAs(document: UsfmDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.saveAs(destination, cancellation, false );
	}

    
	public revertCustomDocument(document: UsfmDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		return document.revert(cancellation);
	}

	public backupCustomDocument(document: UsfmDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		return document.backup(context.destination, cancellation);
	}
	//#endregion


	/**
	 * Get the static HTML used for in our editor's webviews.
	 */
    private getHtmlForWebview(webview: vscode.Webview): string {
        // Local path to script and css for the webview
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'media', 'reset.css'));

        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'media', 'vscode.css'));

        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'media', 'usfmEditor.css'));


        const reactIndexJsUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'webview-ui', 'build', 'assets', 'index.js'));
        
        const reactIndexCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'webview-ui', 'build', 'assets', 'index.css'));


        return /* html */`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">

                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <link href="${styleResetUri}" rel="stylesheet" />
                <link href="${styleVSCodeUri}" rel="stylesheet" />
                <link href="${styleMainUri}" rel="stylesheet" />

                <title>Usfm Editor</title>


                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <script type="module" crossorigin src="${reactIndexJsUri}"></script>
                <link rel="stylesheet" crossorigin href="${reactIndexCssUri}">
            </head>
            <body>

                <h1>Usfm Editor</h1>

                <div id="root"></div>

            </body>
            </html>`;
    }


    public async flushUpdates(): Promise<void>{
        //Iterate through all of our web panels and request that they flush their updates.
        for( const webviewPanel of this.webviews.all() ){
            const flushUpdateCommand : UsfmMessage = {
                command: 'flushUpdates'
            };
            await this.postMessageWithResponse( webviewPanel, flushUpdateCommand );
        }
        return Promise.resolve();
    }

	private _requestId = 1;
	private readonly _callbacks = new Map<number, (response: UsfmMessage) => void>();

	private postMessageWithResponse(panel: vscode.WebviewPanel, message:UsfmMessage): Promise<UsfmMessage> {
		const requestId = this._requestId++;
		const p = new Promise<UsfmMessage>(resolve => this._callbacks.set(requestId, resolve));

        const out_message: UsfmMessage = {
            ...message,
            requestId
        };
        
		panel.webview.postMessage(out_message);
		return p;
	}


    selectLine(lineNumber: number): void {
        //Iterate through all the webviews.
        for( const webviewPanel of this.webviews.all() ){
            const selectLineCommand : UsfmMessage = {
                command: 'selectLine',
                lineNumber
            };
            webviewPanel.webview.postMessage(selectLineCommand);
        }
    }

    onUsfmDocumentChanged(callback: (e: vscode.CustomDocumentEditEvent<UsfmDocument>) => void): void {
        this.onDidChangeCustomDocument(callback);
    }


    private onMessage(document: UsfmDocument, message: UsfmMessage, webviewPanel: vscode.WebviewPanel) {
		switch (message.command) {
            case 'sync':
                this.updateUsfmDocument(document, message, webviewPanel);
                console.log( "update received" );
                break;
            case 'ready':
                this.updateWebview( document, webviewPanel );
                break;
			case 'response':
				{
					const callback = this._callbacks.get(message.requestId!);
					callback?.(message);
                    this._callbacks.delete(message.requestId!);
					return;
				}
		}
	}

    private updateUsfmDocument(document: UsfmDocument, data: UsfmMessage, webviewPanel: vscode.WebviewPanel) {
        if( document.isClosed ) { return; }

        if( data.command === "sync" && data.content ){
            let doUpdateState = false;
            let doSendReply = false;
            let newDocumentData = document.documentData;
            if( data.content.alignmentData.version > newDocumentData.alignmentData.version ){
                doUpdateState = true;
                newDocumentData = {
                    ...newDocumentData,
                    alignmentData: data.content.alignmentData
                };
            }else if( data.content.alignmentData.version < newDocumentData.alignmentData.version ){
                doSendReply = true;
            }
            if( data.content.strippedUsfm.version > newDocumentData.strippedUsfm.version ){
                doUpdateState = true;
                newDocumentData = {
                    ...newDocumentData,
                    strippedUsfm: data.content.strippedUsfm
                };
            }else if( data.content.strippedUsfm.version < newDocumentData.strippedUsfm.version ){
                doSendReply = true;
            }

            if( doUpdateState ){
                document.makeEdit( newDocumentData );
            }
            if( doSendReply ){
                this.updateWebview( document, webviewPanel );
            }
        }
    };

    private updateWebview(document: UsfmDocument, webviewPanel: vscode.WebviewPanel ) {
        const updateMessage: UsfmMessage = {
            command: 'sync',
            content: document.documentData
        };
        webviewPanel.webview.postMessage(updateMessage);
    };
    

    // public async resolveCustomTextEditor(
    //     document: vscode.TextDocument,
    //     webviewPanel: vscode.WebviewPanel,
    //     token: vscode.CancellationToken
    // ): Promise<void> {
    //     webviewPanel.webview.options = {
    //         enableScripts: true
    //     };
    //     webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    //     webviewPanel.onDidChangeViewState(e => {
    //         if (e.webviewPanel.active) {
    //             this.onUsfmActiveEditorChangedSet.forEach(callback => {
    //                 callback(document);
    //             });
    //         }
    //     });

    //     this.onUsfmActiveEditorChangedSet.forEach(callback => {
    //         callback(document);
    //     });




    //     const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
    //         if (e.document.uri.toString() === document.uri.toString()) {
    //             updateWebview();
    //             this.onUsfmDocumentChangedSet.forEach(callback => {
    //                 callback(e);
    //             });
    //         }
    //     });

    //     // const activeEditorSubscription = vscode.window.onDidChangeActiveTextEditor(e => {
    //     //     if (e?.document.uri.toString() === document.uri.toString()) {
    //     //         updateWebview();
    //     //         this.onUsfmActiveEditorChangedSet.forEach(callback => {
    //     //             callback(e?.document);
    //     //         });
    //     //     }
    //     // });
        
    //     const messageSubscription = webviewPanel.webview.onDidReceiveMessage((e: UsfmMessage) => {
    //         switch (e.command) {
    //             case 'sync':
    //                 updateTextDocument(e);
    //                 console.log( "update received" );
    //                 break;
    //             case 'ready':
    //                 updateWebview();
    //                 break;
    //         }
    //     });


    //     const getDocContent = () : InternalUsfmJsonFormat => {
    //         //check if the document is dirty.
    //         const isDirty = document.isDirty;

    //         //if the document is dirty then it is just json of the DirtyDocumentFormat,
    //         //otherwise we need to construct it.
    //         const result: InternalUsfmJsonFormat = (isDirty) ? 
    //             JSON.parse(document.getText()) :
    //             {
    //                 strippedUsfm: {
    //                     version: 0,
    //                     text: document.getText()
    //                 },
    //                 alignmentData: {
    //                     version: 0
    //                 }
    //             };
    //         return result;
    //     };


    //     this.liveWebViews.add(webviewPanel);
        
    //     webviewPanel.onDidDispose(() => {
    //         changeDocumentSubscription.dispose();
    //         messageSubscription.dispose();
    //         //activeEditorSubscription.dispose();
    //         this.liveWebViews.delete(webviewPanel);
    //     });

    //     updateWebview();
    // }

    


}

/**
 * Tracks all webviews.
 */
class WebviewCollection {

	private readonly _webviews = new Set<{
		readonly resource: string;
		readonly webviewPanel: vscode.WebviewPanel;
	}>();

    public *all(): Iterable<vscode.WebviewPanel> {
        for (const entry of this._webviews) {
            yield entry.webviewPanel;
        }
    }

	/**
	 * Get all known webviews for a given uri.
	 */
	public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
		const key = uri.toString();
		for (const entry of this._webviews) {
			if (entry.resource === key) {
				yield entry.webviewPanel;
			}
		}
	}

	/**
	 * Add a new webview to the collection.
	 */
	public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
		const entry = { resource: uri.toString(), webviewPanel };
		this._webviews.add(entry);

		webviewPanel.onDidDispose(() => {
			this._webviews.delete(entry);
		});
	}
}
