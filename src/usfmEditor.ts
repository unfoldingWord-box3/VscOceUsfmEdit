import * as vscode from 'vscode';
import { UsfmEditorAbstraction } from './usfmOutline';

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

export class UsfmEditorProvider implements vscode.CustomTextEditorProvider,  UsfmEditorAbstraction{

    private onUsfmDocumentChangedSet = new Set< (e: vscode.TextDocumentChangeEvent) => void >();
    private onUsfmActiveEditorChangedSet = new Set< (e: vscode.TextDocument) => void >();
    private liveWebViews = new Set<vscode.WebviewPanel>();

    public static register(context: vscode.ExtensionContext): [vscode.Disposable, UsfmEditorAbstraction] {
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
                <link rel="icon" type="image/svg+xml" href="${viteLogoUri}" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <script type="module" crossorigin src="${reactIndexJsUri}"></script>
                <link rel="stylesheet" crossorigin href="${reactIndexCssUri}">
            </head>
            <body>

                <h1>Usfm Editor</h1>

                <textarea id="text-box"></textarea>

                <div id="root"></div>
                
                <script src="${scriptUri}"></script>



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

