
(function () {
    const vscode = acquireVsCodeApi();

    const textEditor = document.querySelector( '#text-box' );

    // Save the initial text content
    let text = textEditor.value;

    // Add an input event listener to detect changes in the textEditor
    textEditor.addEventListener('input', text_changed);

    function text_changed( e ) {
        // Check if the content has changed
        if ( text !== e.target.value ) {
            // Update the stored text
            text = e.target.value;

            console.log( "Text changed" );

            // Send a message to the extension to update
            vscode.postMessage( {
                command: 'update',
                text: text
            } );
        }
    }

    // Listen for messages from the extension to update the textEditor
    window.addEventListener( 'message', e => {
        if ( e.data.command === 'update' ) {
            if( text !== e.data.text ){
                text = e.data.text;
                textEditor.value = text;
            }
        }
    });

    vscode.postMessage( { command: 'ready'} );
})();