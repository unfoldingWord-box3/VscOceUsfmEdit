import * as vscode from 'vscode';
import { UsfmDocumentAbstraction, UsfmEditorAbstraction } from './usfmOutline';
//@ts-ignore
import {Proskomma} from 'proskomma-core';
//@ts-ignore
import {PipelineHandler} from 'proskomma-json-tools';
import * as fs from 'fs';
import * as path from 'path';

interface InternalUsfmJsonFormat{
    orgPerf: any,
    strippedUsfm: {
        version: number,
        text: string
    },
    alignmentData: {
        version: number,
        perf: any,
    }
}

interface UsfmMessage{
    command: string,
    content?: InternalUsfmJsonFormat,
    requestId?: number,
    commandArg?: string,
    response?: any,
}

export function disposeAll(disposables: vscode.Disposable[]): void {
	while (disposables.length) {
		const item = disposables.pop();
		if (item) {
			item.dispose();
		}
	}
}

function deepCopy(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
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


async function usfmToInternalJson( mergedUsfm: string ): Promise<InternalUsfmJsonFormat> {

    //first get the perf from the usfm
    const pk = new Proskomma();
    pk.importDocument({lang: "xxx", abbr: "yyy"}, "usfm", mergedUsfm);
    const mergedPerf = JSON.parse(pk.gqlQuerySync("{documents {perf}}").data.documents[0].perf);


    //Now split it using a pipeline.
    const pipelIneH = new PipelineHandler({proskomma: new Proskomma()});
    const stripAlignmentPipeline_outputs = pipelIneH.runPipeline("stripAlignmentPipeline", {
        perf: mergedPerf
    });

    const myStrippedPerf = stripAlignmentPipeline_outputs.perf;
    const strippedAlign = stripAlignmentPipeline_outputs.strippedAlignment;

    //convert the stripped perf back into usfm.
    const perfToUsfmPipeline_outputs = await pipelIneH.runPipeline("perfToUsfmPipeline", {
        perf: myStrippedPerf
    });
    const myStrippedUsfm = perfToUsfmPipeline_outputs.usfm;


    return {
        orgPerf: mergedPerf,
        strippedUsfm: {
            version: 0,
            text: myStrippedUsfm
        },
        alignmentData: {
            version: 0,
            perf: strippedAlign,
        }
    };
}

async function internalJsonToUsfm( json: InternalUsfmJsonFormat ): Promise<string> {
    //here we run the reverse were we merge it together before saving it out.
    
    //first convert the stripped usfm back into perf

    const pk = new Proskomma();
    pk.importDocument({lang: "xxx", abbr: "yyy"}, "usfm", json.strippedUsfm.text);
    const myStrippedPerf = JSON.parse(pk.gqlQuerySync("{documents {perf}}").data.documents[0].perf);


    //now bring up the pipeline in order to merge it back with the alignment data
    const pipelineH = new PipelineHandler({proskomma: new Proskomma()});
    const mergeAlignmentPipeline_output = await pipelineH.runPipeline('mergeAlignmentPipeline', {
        perf: myStrippedPerf,
        strippedAlignment: json.alignmentData.perf,
    });
    const mergedPerf = mergeAlignmentPipeline_output.perf;

    //now convert that mergedPerf back into usfm
    const perfToUsfmPipeline_outputs = pipelineH.runPipeline("perfToUsfmPipeline", {
        perf: mergedPerf,
    });
    const mergedUsfm = perfToUsfmPipeline_outputs.usfm;

    return mergedUsfm;
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
            documentData = await usfmToInternalJson( fileDataString );
        }

        return new UsfmDocument( uri, documentData!, updateFlusher );
    }


    private readonly _uri: vscode.Uri;
    private _documentData: InternalUsfmJsonFormat;

    //This way we can tell if the document is dirty or not
    private _savedDocumentData: InternalUsfmJsonFormat | undefined;

    private constructor(
        uri: vscode.Uri,
        documentData: InternalUsfmJsonFormat,
        private updateFlusher: UpdateFlushable,
    ){
        super();
        this._uri = uri;
        this._documentData = documentData;

        //register a hook which notifies us if another program has modified our file.
        const changeWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this._uri, "*"));
        this._register(changeWatcher);
        changeWatcher.onDidChange(() => {
            console.log( "changeWatcher onDidChange " + this._uri.toString() );
            if( !this.isClosed && !this.isDirty ){
                this.revert( new vscode.CancellationTokenSource().token );
            }
        });


        this._savedDocumentData = deepCopy(this._documentData);
    }

    public get isDirty(): boolean {
        if( this._savedDocumentData === undefined ){ return true; }
        if( this._documentData.alignmentData.version !== this._savedDocumentData.alignmentData.version ){ return true; }
        if( this._documentData.strippedUsfm.version !== this._savedDocumentData.strippedUsfm.version ){ return true; }
        return false;
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
        console.log( "Disposing document " + this._uri.toString() );

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

        console.log( "making edit on version " + this._documentData.strippedUsfm.version );

		this._onDidChange.fire({
			label: 'onDidChangeLabel', //<-- Not sure where this comes through.
			undo: async () => {
                console.log( "undoing edit" );

                const replacedData = this._documentData;
                this._documentData = { ...lastDocumentState };

                this._documentData.alignmentData.version = replacedData.alignmentData.version + 1 + Math.random();
                this._documentData.strippedUsfm.version = replacedData.strippedUsfm.version + 1 + Math.random();
                console.log( "Undoing edit now on version " + this._documentData.strippedUsfm.version );
				this._onDidChangeDocument.fire({
					content: this._documentData,
				});
			},
			redo: async () => {
                console.log( "redoing edit" );

                const replacedData = this._documentData;
                this._documentData = { ...newContent };
                this._documentData.alignmentData.version = replacedData.alignmentData.version + 1 + Math.random();
                this._documentData.strippedUsfm.version = replacedData.strippedUsfm.version + 1 + Math.random();
                console.log( "Redoing edit now on version " + this._documentData.strippedUsfm.version );
				this._onDidChangeDocument.fire({
					content: this._documentData,
				});
			}
		});

        this._onDidChangeDocument.fire({
            content: this._documentData
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
        if( !this._documentData ){ return; }
        if( cancellation.isCancellationRequested ){ return; }

  
        const encoder = new TextEncoder();

        // With the save also convert the data back to the internal format
        // so if there was data lost in the conversion we see it.
        if( !isBackup ){
            // Loop through the _delegates and let each one of them flush updates to us
            await this.updateFlusher.flushUpdates();

            // Now convert the data back to usfm.
            const usfmData = await internalJsonToUsfm( this._documentData );
            const usfmDataArray = encoder.encode(usfmData);
    
            await vscode.workspace.fs.writeFile(targetResource, usfmDataArray);


            const lastDocumentState = this._documentData;
            this._documentData = await usfmToInternalJson( usfmData );
            this._documentData.alignmentData.version = lastDocumentState.alignmentData.version + 1 + Math.random();
            this._documentData.strippedUsfm.version = lastDocumentState.strippedUsfm.version + 1 + Math.random();
           
            this._onDidChangeDocument.fire({
                content: this._documentData
            });

            //update the saved data so isDirty resets.
            this._savedDocumentData = deepCopy(this._documentData);
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
        console.log( "started revert" );
        //get the new version number now so that if edits happen after the revert finishes
        //we don't overwrite anymore.
        const newAlignmentVersion = this._documentData.alignmentData.version + (1 + Math.random())*.001;
        const newStrippedUsfmVersion = this._documentData.strippedUsfm.version + (1 + Math.random())*.001;


        const fileDataArray = await vscode.workspace.fs.readFile(this.uri);
        const fileDataString = new TextDecoder().decode(fileDataArray);
        const documentData = await usfmToInternalJson( fileDataString );

        //only update if the version is still relevant.
        if( newAlignmentVersion > this._documentData.alignmentData.version &&
            newStrippedUsfmVersion > this._documentData.strippedUsfm.version ){

            const lastDocumentState = this._documentData;

            //update the version numbers to be more then what it was so that the revert
            //can go through.
            this._documentData = documentData;
            this._documentData.alignmentData.version = newAlignmentVersion;
            this._documentData.strippedUsfm.version = newStrippedUsfmVersion;

            this._onDidChangeDocument.fire({
                content: this._documentData
            });

            //update the saved data so isDirty resets.
            this._savedDocumentData = deepCopy(this._documentData);
            console.log( "finished revert" );
        }else{
            console.log( "canceled revert" );
        }
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
			// Tell VS Code that the document has been edited by the use.
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
		}));

		document.onDidDispose(() => disposeAll(listeners));


        // const configuration = vscode.workspace.getConfiguration();
        // const target = vscode.ConfigurationTarget.Workspace;

        // //await configuration.update( 'usfmEditor.testConfigurationString', "potatoes", false );
        

        // const testConfigurationString = vscode.workspace?.getConfiguration("usfmEditor").get('testConfigurationString', "fish" );
        // console.log("testConfigurationString3: " + testConfigurationString);

        // const testConfigurationInteger = vscode.workspace?.getConfiguration("usfmEditor").get('testConfigurationInteger', 1 );
        // console.log("testConfigurationInteger3: " + testConfigurationInteger);

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

    public async getActiveViewName( webviewPanel: vscode.WebviewPanel ): Promise<string>{
        const message : UsfmMessage = {
            command: 'getActiveViewName'
        };
        const response = await this.postMessageWithResponse( webviewPanel, message );
        return response.response!;
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


    async selectReference(reference: string): Promise<void> {
        const selectReferenceCommand : UsfmMessage = {
            command: 'selectReference',
            commandArg: reference
        };

        //Find if there is a webview already looking at this reference.
        let foundView = false;
        for( const webviewPanel of this.webviews.all() ){
            const activeView = await this.getActiveViewName( webviewPanel );
            if( activeView === "view_stripped_usfm" ){
                foundView = true;
                webviewPanel.webview.postMessage(selectReferenceCommand);
            }
        }
        
        //Now if none of them were on the stripped_usfm view,
        //Then we will just send it to the first one to pop it over.
        if( !foundView ){
            for( const webviewPanel of this.webviews.all() ){
                webviewPanel.webview.postMessage(selectReferenceCommand);
                break;
            }
        }
    }

    async alignReference(reference: string): Promise<void> {
        const alignReferenceCommand : UsfmMessage = {
            command: 'alignReference',
            commandArg: reference
        };

        //Find if there is a webview already looking at this reference.
        let foundView = false;
        for( const webviewPanel of this.webviews.all() ){
            const activeView = await this.getActiveViewName( webviewPanel );
            if( activeView === "view_align_usfm" ){
                foundView = true;
                webviewPanel.webview.postMessage(alignReferenceCommand);
            }
        }
        
        //Now if none of them were on the stripped_usfm view,
        //Then we will just send it to the first one to pop it over.
        if( !foundView ){
            for( const webviewPanel of this.webviews.all() ){
                webviewPanel.webview.postMessage(alignReferenceCommand);
                break;
            }
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
                const callback = this._callbacks.get(message.requestId!);
                callback?.(message);
                this._callbacks.delete(message.requestId!);
                break;

            case 'getConfiguration': //This makes it so that the webview can get a configuration.
                const configurationName = message.commandArg;
                if( configurationName ){
                    const configuration = vscode.workspace?.getConfiguration("usfmEditor").get(configurationName );
                    webviewPanel.webview.postMessage({
                        command: 'response',
                        requestId: message.requestId,
                        response: configuration
                    });
                }
                break;
            
            case 'getFile':
                const filePath = message.commandArg!;
                const firstWorkSpaceFolder = vscode.workspace?.workspaceFolders?.[0]?.uri.fsPath;
                const filePathRebased = firstWorkSpaceFolder ? path.join(firstWorkSpaceFolder, filePath) : filePath;

                if (filePathRebased) {
                    fs.readFile(filePathRebased, 'utf8', (err, data) => {
                        if (err) {
                            // Handle error
                            console.error(err);
                        } else {
                            webviewPanel.webview.postMessage({
                                command: 'response',
                                requestId: message.requestId,
                                response: data,
                            });
                        }
                    });
                }
                break;
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
