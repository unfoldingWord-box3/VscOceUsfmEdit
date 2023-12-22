
function findEdit(before, after) {
    //First find where the text is different from the start.
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) {
        start++;
    }
    //Now find where the text is different from the end
    let end = before.length - 1;
    while (end >= start && (end - start) >= (before.length - after.length) && end + after.length - before.length >= 0 && before[end] === after[end + after.length - before.length]) {
        end--;
    }
    //inc end because we want it to be the first char not changed, instead of the last char changed
    end++;
    return { start, end, newText: after.slice(start, end + after.length - before.length) };
}
function useEdit(before, edit) {
    return before.slice(0, edit.start) + edit.newText + before.slice(edit.end);
}


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


    function selectLine( lineNumber ){
        console.log( "The message got to the webview to select line: " + lineNumber );

        //textEditor is a html textArea
        //Need to loop through finding \n lineNumber times.


        const findNextEnter = (searchStart) => {
            const nextEnter = text.indexOf( '\n', searchStart );
            if( nextEnter === -1 ){
                return text.length;
            }
            return nextEnter;
        };

        let lineStart = 0;
        let lineEnd = findNextEnter( lineStart );
        let lineCount = 0;

        while( lineCount < lineNumber ){
            lineStart = lineEnd + 1;
            lineEnd = findNextEnter( lineStart );
            lineCount++;
        }

        textEditor.selectionStart = lineStart;
        textEditor.selectionEnd = lineEnd;
        textEditor.focus();

    }

    // Listen for messages from the extension to update the textEditor
    window.addEventListener( 'message', e => {
        if ( e.data.command === 'update' ) {
            if( text !== e.data.text ){
                text = e.data.text;
                textEditor.value = text;
            }
        }else if( e.data.command === 'selectLine' ){
            selectLine( e.data.lineNumber );
        }
    });

    vscode.postMessage( { command: 'ready'} );
})();