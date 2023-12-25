// import { useState } from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'


//This code was given as an example for using Monica with Vite.  I am not including it until I run into a problem that will tell me why.
//it is needed for the editor.
import { OnChange, OnMount, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};
loader.config({ monaco });
loader.init().then(/* ... */);


//Determine the color scheme from vscode.  So body will have an attribute with the name on it, so if it includes "light"
//in it we will go with light otherwise we will be dark.
//reference to body
const body = document.querySelector('body');
const vscodeTheme = body?.getAttribute( "data-vscode-theme-id" )
const editorColorScheme = (vscodeTheme?.toLowerCase().includes( "light" )) ? "light" : "vs-dark";

import Editor from '@monaco-editor/react';
import { editor } from 'monaco-editor/esm/vs/editor/editor.api';
import { useCallback, useEffect } from 'react';
import React from 'react';


interface Edit {
  text: string,
  startLineNumber: number,
  startColumn: number,
  endLineNumber: number,
  endColumn: number,
}
interface UsfmMessage{
  command: string,
  text?: string,
  edits?: Edit[]
}
interface VsCodeStub{
  postMessage: (message: UsfmMessage) => void
}

interface EditWithTime{
  edit: Edit,
  time: number
}

interface EditWithTimePtr{
  current: EditWithTime[]
}

interface EditRecords{
  waitingOutgoingRecord: EditWithTimePtr,
  outgoingRecord: EditWithTimePtr,
  incomingRecord: EditWithTimePtr
}

 
export default function App() {

  const vscodeRef = React.useRef<VsCodeStub | null>(null);

  const editorRef = React.useRef<editor.IEditor | null>(null);

  const handleEditorChange : OnChange = (value,ev) => {
    if( value !== undefined && ev !== undefined ) {
      const edits = ev.changes.map( (change) => {
        return {
          startLineNumber: change.range.startLineNumber -1,
          startColumn: change.range.startColumn -1,
          endLineNumber: change.range.endLineNumber -1,
          endColumn: change.range.endColumn -1,
          text: change.text 
        };  
      });
      handleOutgoingEdits( edits );
    }
  }

  const editRecords = React.useRef< EditRecords >({
    waitingOutgoingRecord: {
      current: []
    },
    outgoingRecord: {
      current: []
    },
    incomingRecord: {
      current: []
    }
  });

  const filterEditWithBuffer =( buffer: EditWithTimePtr, edits: Edit ) => {
    //first drop edits which are over 10 seconds old
    //buffer.current = buffer.current.filter( (bufferedEdit : EditWithTime) => Date.now() - bufferedEdit.time < 10000 );

    //Now see if the edit is in there.  If it is, just remove the first one.
    const index = buffer.current.findIndex( (bufferedEdit : EditWithTime) => {
      return bufferedEdit.edit.startColumn === edits.startColumn &&
        (bufferedEdit.edit.endColumn === -1 || bufferedEdit.edit.endColumn === edits.endColumn ) &&
        bufferedEdit.edit.startLineNumber === edits.startLineNumber &&
        (bufferedEdit.edit.endLineNumber === -1 ||bufferedEdit.edit.endLineNumber === edits.endLineNumber) &&
        bufferedEdit.edit.text === edits.text
    } );
    if( index > -1 ){
      buffer.current.splice( index, 1 );
      return true;
    }else{
      return false;
    }
  }

  const filterIncomingEdits = useCallback((edits: Edit[] ) => {
    return edits.filter( (edit) => !filterEditWithBuffer( editRecords.current.outgoingRecord, edit ) );
  }, [] );
  const filterOutgoingEdits = useCallback((edits: Edit[] ) => {
    return edits.filter( (edit) => !filterEditWithBuffer( editRecords.current.incomingRecord, edit ) );
  },[]);
  const recordOutgoingEdits = (edits: Edit[] ) => {
    for( const edit of edits ){
      editRecords.current.outgoingRecord.current.push( { edit: edit, time: Date.now() } );
    }
  }

  const handleOutgoingEdits = useCallback((edits: Edit[] ) => {
    if( edits.length > 0 ){
      const filteredEdits = filterOutgoingEdits( edits );

      //Now enqueue all the filtered edits if any in the waitingOutgoingRecord
      filteredEdits.forEach( (edit) => {
        console.log( "Filtered outgoing edit \"" + edit.text  + "\"" );
        editRecords.current.waitingOutgoingRecord.current.push( { edit: edit, time: Date.now() } );
      });
      if( filteredEdits.length < edits.length ){
        console.log( `Filtered ${edits.length - filteredEdits.length} outgoing edits` );
        if( filteredEdits.length == 0 ){
          console.log( "They were " );
          edits.forEach( (edit) => {
            console.log( "\"" + edit.text + "\"" );
          })
        }
      }

      //see if we can merge any of the edits in waitingOutgoingRecord.  If an edit is an insert, i.e. the end and the start are the
      //same and it is the column right after the previous edit, then we can just merge their text and delete the previous edit.
      //but we have to do it from the end to the beginning because otherwise it would mess up the indexes.
      let checkIndex = editRecords.current.waitingOutgoingRecord.current.length - 1;
      const isInsert = (edit: Edit ) => {
        return edit.endLineNumber === edit.startLineNumber &&
          edit.endColumn === edit.startColumn;
      }
      while( checkIndex >= 1 ){
        const editB = editRecords.current.waitingOutgoingRecord.current[checkIndex];
        const editA = editRecords.current.waitingOutgoingRecord.current[checkIndex - 1];

        if( isInsert(editB.edit) && isInsert(editA.edit) && 
          editA.edit.endLineNumber === editB.edit.startLineNumber &&
          (editA.edit.endColumn + editA.edit.text.length) === editB.edit.startColumn ){
            
          //Remove editB
          editRecords.current.waitingOutgoingRecord.current.splice( checkIndex, 1 );

          console.log( "Merging \"" + editA.edit.text + "\" and \"" + editB.edit.text + "\"" );

          //Add the edit to the previous edit
          editA.edit.text = editA.edit.text + editB.edit.text;
        }

        checkIndex--;
      }
    }


    // //Now if the outgoingRecord is empty, send the items in the waitingOutgoingRecord
    // if( editRecords.current.waitingOutgoingRecord.current.length > 0 ){
    //   //Remove old outgoingRecords.
    //   editRecords.current.outgoingRecord.current = editRecords.current.outgoingRecord.current.filter( (bufferedEdit : EditWithTime) => Date.now() - bufferedEdit.time < 10000 );
      
    //   if( editRecords.current.outgoingRecord.current.length === 0 ){
    //     const waitingEdits = editRecords.current.waitingOutgoingRecord.current;
    //     editRecords.current.waitingOutgoingRecord.current = [];
    //     recordOutgoingEdits( waitingEdits.map( (edit) => edit.edit ) );
    //     console.log( `Sending outgoing ${waitingEdits.length} edits` )
    //     waitingEdits.forEach( (edit) => {
    //       console.log( "\"" + edit.edit.text + "\"" );
    //     })
    //     if( vscodeRef.current )vscodeRef.current?.postMessage({ command: 'edit', edits: waitingEdits.map( (edit) => edit.edit ) });
    //   }else{
    //     console.log( "Waiting on previous outgoing" );
    //     editRecords.current.outgoingRecord.current.forEach( (bufferedEdit : EditWithTime) => {
    //       console.log( "\"" + bufferedEdit.edit.text + "\"" );
    //     })
    //   }
    // }else{
    //   console.log( "No edits to send" );
    // }

    //If the outgoingRecord is empty then send the first item in waitingOutgoingRecord.
    if( editRecords.current.waitingOutgoingRecord.current.length > 0 ){
      //Remove old outgoingRecords.
      editRecords.current.outgoingRecord.current = editRecords.current.outgoingRecord.current.filter( (bufferedEdit : EditWithTime) => Date.now() - bufferedEdit.time < 20000 );

      if( editRecords.current.outgoingRecord.current.length === 0 ){
        const poppedFirstWaitingEdit = editRecords.current.waitingOutgoingRecord.current.shift();

        if( poppedFirstWaitingEdit !== undefined ){
          console.log( "Sending outgoing edit \"" + poppedFirstWaitingEdit.edit.text + "\".  The queue has " + editRecords.current.waitingOutgoingRecord.current.length + " items remaining" );
          recordOutgoingEdits( [poppedFirstWaitingEdit.edit] );
          if( vscodeRef.current )vscodeRef.current?.postMessage({ command: 'edit', edits: [poppedFirstWaitingEdit.edit] });
        }
      }else{
        console.log( "Waiting on previous outgoing" );
        editRecords.current.outgoingRecord.current.forEach( (bufferedEdit : EditWithTime) => {
          console.log( "\"" + bufferedEdit.edit.text + "\"" );
        })
      }
    }else{
      console.log( "No edits to send" );
    }

  },[filterOutgoingEdits]);

  const recordIncomingEdits = (edits: Edit[] ) => {
    for( const edit of edits ){
      editRecords.current.incomingRecord.current.push( { edit: edit, time: Date.now() } );
    }
  }
  const recordIncomingUpdate = (text: string) => {
    editRecords.current.incomingRecord.current.push( {
      edit: {
        text: text,
        startLineNumber: 0,
        startColumn: 0,
        endLineNumber: -1,
        endColumn: -1
      },
      time: Date.now()
    });
  }

  const filterIncomingUpdate = useCallback((text: string) => {
    const result = filterEditWithBuffer( editRecords.current.outgoingRecord, {
      text: text,
      startLineNumber: 0,
      startColumn: 0,
      endLineNumber: -1,
      endColumn: -1
    });
    return result;
  },[]);

  const handleEditorMount : OnMount = (editor,_monica) => {
    editorRef.current = editor;

    if ( vscodeRef.current ) {
      vscodeRef.current?.postMessage({ command: 'ready' });
    }
  }

  //see if the function acquireVsCodeApi exists.
  //Ignore if acquireVsCodeApi does not exist.
  // @ts-expect-error acquireVsCodeApi exists in vscode.
  if (typeof acquireVsCodeApi === 'function' && vscodeRef.current === null ) {
    // @ts-expect-error acquireVsCodeApi exists in vscode.
    vscodeRef.current = acquireVsCodeApi();
  }

  //Go ahead and subscribe to the plugin events.
  useEffect(() => {
    const messageEventListener = (e: {data: UsfmMessage}) => {
      if( e.data.command === 'update' ){
        if( editorRef.current !== null ){
          const model: editor.ITextModel | null = editorRef.current.getModel() as editor.ITextModel | null;
          if( model !== null ){
            if( e.data.text !== undefined ){
              if( !filterIncomingUpdate( e.data.text ) ){
                //make sure the text is actually different.
                if( model.getValue() !== e.data.text ){
                  recordIncomingUpdate( e.data.text );
                  //console.log( "Used update \"" + e.data.text + "\"" );
                  model.setValue(e.data.text);
                }else{
                  console.log( "Text is the same" );
                }
              }else{
                console.log( "Filtered update" );
              }
            }else{
              console.log( "Text is undefined" );
            }
          }else{
            console.log( "Model is null" );
          }
        }else{
          console.log( "Editor is null" );
        }
      }else if( e.data.command === 'edit' ){
        if( editorRef.current !== null ){
          const model: editor.ITextModel | null = editorRef.current.getModel() as editor.ITextModel | null;
          if( model !== null ){
            if( e.data.edits !== undefined ){
              const incomingEdits = filterIncomingEdits( e.data.edits );
              if( incomingEdits.length > 0 ){
                recordIncomingEdits( incomingEdits );
                model.pushEditOperations(null, incomingEdits.map( (edit) => {
                  console.log( "Used edits" );
                  incomingEdits.forEach( (edit) => {
                    console.log( "\"" + edit.text + "\"" );
                  })
                  return {
                    range: new monaco.Range(edit.startLineNumber + 1, edit.startColumn + 1, edit.endLineNumber + 1, edit.endColumn + 1),
                    text: edit.text
                  };
                }),()=>[]);
              }else{
                console.log( "Filtered edit" );
                incomingEdits.forEach( (edit) => {
                  console.log( "\"" + edit.text + "\"" );
                })
              }
            }else{
              console.log( "Edits are undefined" );
            }
          }else{
            console.log( "Model is null" );
          }
        }else{
          console.log( "Editor is null" );
        }
      }
      //Let the outgoing edits check if they need to go again.
      handleOutgoingEdits( [] );
    };
    window.addEventListener('message', messageEventListener);

    return () => window.removeEventListener('message', messageEventListener);
  }, [filterIncomingEdits, filterIncomingUpdate, handleOutgoingEdits]);
  

  return <>
    <Editor 
    height="80vh" width="90vh" defaultLanguage="text" 
    theme={editorColorScheme} 
    onChange={handleEditorChange} 
    onMount={handleEditorMount}
    />
  </>
}
