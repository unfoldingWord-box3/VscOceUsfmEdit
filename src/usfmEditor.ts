import * as vscode from 'vscode';
import { UsfmEditorThingy } from './usfmOutline';


function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export class UsfmEditorProvider implements vscode.CustomTextEditorProvider,  UsfmEditorThingy{

    private onUsfmDocumentChangedSet = new Set< (e: vscode.TextDocumentChangeEvent) => void >();
    private onUsfmActiveEditorChangedSet = new Set< (e: vscode.TextDocument) => void >();
    private liveWebViews = new Set<vscode.WebviewPanel>();

    public static register(context: vscode.ExtensionContext): [vscode.Disposable, UsfmEditorThingy] {
        const provider = new UsfmEditorProvider(context);
        return [vscode.window.registerCustomEditorProvider(UsfmEditorProvider.viewType, provider), provider];
    }

    private static readonly viewType = 'com.lansfords.usfmEditor';

    constructor(private readonly context: vscode.ExtensionContext) {
        
    }
    selectLine(lineNumber: number): void {
        this.liveWebViews.forEach(webviewPanel => {
            webviewPanel.webview.postMessage({
                command: 'selectLine',
                lineNumber
            });
        });
    }
    onUsfmActiveEditorChanged(callback: (e: vscode.TextDocument) => void): void {
        this.onUsfmActiveEditorChangedSet.add(callback);
    }
    onUsfmDocumentChanged(callback: (e: vscode.TextDocumentChangeEvent) => void): void {
        this.onUsfmDocumentChangedSet.add(callback);
    }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        webviewPanel.onDidChangeViewState(e => {
            if (e.webviewPanel.active) {
                this.onUsfmActiveEditorChangedSet.forEach(callback => {
                    callback(document);
                });
            }
        });

        this.onUsfmActiveEditorChangedSet.forEach(callback => {
            callback(document);
        });

        const updateWebview = () => {
            webviewPanel.webview.postMessage({
                command: 'update',
                text: document.getText()
            });
            // this.onUsfmActiveEditorChangedSet.forEach(callback => {
            //     callback(document);
            // });
        };

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
                this.onUsfmDocumentChangedSet.forEach(callback => {
                    callback(e);
                });
            }
        });

        // const activeEditorSubscription = vscode.window.onDidChangeActiveTextEditor(e => {
        //     if (e?.document.uri.toString() === document.uri.toString()) {
        //         updateWebview();
        //         this.onUsfmActiveEditorChangedSet.forEach(callback => {
        //             callback(e?.document);
        //         });
        //     }
        // });
        
        const messageSubscription = webviewPanel.webview.onDidReceiveMessage(e => {
            switch (e.command) {
                case 'update':
                    this.updateTextDocument(document, e.text);
                    break;
                case 'ready':
                    updateWebview();
                    break;
            }
        });

        this.liveWebViews.add(webviewPanel);
        
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            messageSubscription.dispose();
            //activeEditorSubscription.dispose();
            this.liveWebViews.delete(webviewPanel);
        });

        updateWebview();
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        // Local path to script and css for the webview
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'media', 'usfmEditor.js'));

        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'media', 'reset.css'));

        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'media', 'vscode.css'));

        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'media', 'usfmEditor.css'));


        const viteLogoUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'webview-ui', 'build', 'vite.svg'));

        const reactIndexJsUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'webview-ui', 'build', 'assets', 'index.js'));
        
        const reactIndexCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'webview-ui', 'build', 'assets', 'index.css'));

        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();

        return /* html */`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">

                <!--
                Use a content security policy to only allow loading images from https or from our extension directory,
                and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <link nonce="${nonce}" href="${styleResetUri}" rel="stylesheet" />
                <link nonce="${nonce}" href="${styleVSCodeUri}" rel="stylesheet" />
                <link nonce="${nonce}" href="${styleMainUri}" rel="stylesheet" />

                <title>Usfm Editor</title>


                <meta charset="UTF-8" />
                <link rel="icon" type="image/svg+xml" href="${viteLogoUri}" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <script nonce="${nonce}" type="module" crossorigin src="${reactIndexJsUri}"></script>
                <link nonce="${nonce}" rel="stylesheet" crossorigin href="${reactIndexCssUri}">
            </head>
            <body>

                <h1>Usfm Editor</h1>

                <textarea id="text-box"></textarea>

                <div id="root"></div>
                
                <script nonce="${nonce}" src="${scriptUri}"></script>



            </body>
            </html>`;
    }


    private updateTextDocument(document: vscode.TextDocument, text: any) {

        if( document.isClosed ) { return; }
        if( text === document.getText() ) { return; }

        const edit = new vscode.WorkspaceEdit();

        // Just replace the entire document every time for this example extension.
        // A more complete extension should compute minimal edits instead.
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            text);

        return vscode.workspace.applyEdit(edit);
    }
}

