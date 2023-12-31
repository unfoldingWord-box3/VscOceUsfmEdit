// import { useState } from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'


//This code was given as an example for using Monica with Vite.  I am not including it until I run into a problem that will tell me why.
//it is needed for the editor.
import { OnChange, OnMount, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker&inline';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker&inline';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker&inline';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline';
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
    console.log( "Getting the editorWorker." );
    return new editorWorker();
  },
};
loader.config({ monaco });
loader.init().then(/* ... */);

// // eslint-disable-next-line @typescript-eslint/ban-types
// function debounce<T extends Function>(cb: T, wait = 20) {
//   let h = 0;
//   const callable = (...args: unknown[]) => {
//       clearTimeout(h);
//       //@ts-expect-error I don't care if this is a number of Timeout, it is just being used in clearTimeout.
//       h = setTimeout(() => cb(...args), wait);
//   };
//   return callable;
// }


//Determine the color scheme from vscode.  So body will have an attribute with the name on it, so if it includes "light"
//in it we will go with light otherwise we will be dark.
//reference to body
const body = document.querySelector('body');
const vscodeTheme = body?.getAttribute( "data-vscode-theme-id" )
const editorColorScheme = (vscodeTheme?.toLowerCase().includes( "light" )) ? "light" : "vs-dark";

import Editor from '@monaco-editor/react';
import { editor } from 'monaco-editor/esm/vs/editor/editor.api';
import { useEffect } from 'react';
import React from 'react';


interface DirtyDocumentFormat{
  strippedUsfm: {
      version: number,
      text: string
  },
  alignmentData: {
      version: number,
      //TODO: Add more here
  }
}
interface UsfmMessage{
  command: string,
  content?: DirtyDocumentFormat
}
interface VsCodeStub{
  postMessage: (message: UsfmMessage) => void
}

 
export default function App() {

  const vscodeRef = React.useRef<VsCodeStub | null>(null);

  const editorRef = React.useRef<editor.IEditor | null>(null);


  const documentDataRef = React.useRef<DirtyDocumentFormat>({
    strippedUsfm: {
      version: -1,
      text: ""
    },
    alignmentData: {
      version: -1,
      //TODO: Add more here
    }
  });

  const setDocumentData = ( newDocumentData : DirtyDocumentFormat ) => {
    documentDataRef.current = newDocumentData;
  }


  //const sendSyncTimeoutRef = React.useRef(0);

  // const handleEditorChange : OnChange = (value,_ev) => {
  //   //const SYNC_DEBOUNCE_TIME_MS = 1000;

  //   if( value !== undefined ){
  //     if( value !== documentDataRef.current.strippedUsfm.text ){
  //       const newDocumentData : DirtyDocumentFormat = {
  //         ...documentDataRef.current,
  //         strippedUsfm: {
  //           version: documentDataRef.current.strippedUsfm.version + 1 + Math.random(),
  //           text: value
  //         }
  //       }
  //       // setDocumentData(newDocumentData);
  //       // const sendSync = () => {
  //       //   console.log( "Sending a sync message because of an edit.");
  //       //   vscodeRef.current?.postMessage({ command: 'sync', content: newDocumentData });
  //       // }
  //       // const debouncedSendSync = debounce(sendSync, SYNC_DEBOUNCE_TIME_MS);
  //       // debouncedSendSync();
  //       setDocumentData(newDocumentData);
  //       const sendSync = () => {
  //         console.log( "Sending a sync message because of an edit.");
  //         vscodeRef.current?.postMessage({ command: 'sync', content: newDocumentData });
  //       }
  //       // clearTimeout( sendSyncTimeoutRef.current );
  //       // // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //       // sendSyncTimeoutRef.current = (setTimeout( sendSync, SYNC_DEBOUNCE_TIME_MS ) as any);
  //       sendSync();
  //     }
  //   }
  // }

  const handleEditorChangeDebounced = ( value : string | undefined, _ev : editor.IModelContentChangedEvent ) : void => {
    if( value !== undefined ){
      if( value !== documentDataRef.current.strippedUsfm.text ){
        const newDocumentData : DirtyDocumentFormat = {
          ...documentDataRef.current,
          strippedUsfm: {
            version: documentDataRef.current.strippedUsfm.version + 1 + Math.random(),
            text: value
          }
        }
 
        setDocumentData(newDocumentData);
        console.log( "Sending a sync message because of an edit.");
        vscodeRef.current?.postMessage({ command: 'sync', content: newDocumentData });
      }
    }
  }

  const handleEditorChangeDebounceRef = React.useRef(0);
  const handleEditorChange : OnChange = (value,_ev ) => {
    const SYNC_DEBOUNCE_TIME_MS = 1000;
    clearTimeout( handleEditorChangeDebounceRef.current );
    
    handleEditorChangeDebounceRef.current = (setTimeout( () => {
      handleEditorChangeDebounced( value, _ev );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, SYNC_DEBOUNCE_TIME_MS) as any);
  }



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
      const model: editor.ITextModel | undefined = editorRef.current?.getModel() as editor.ITextModel | undefined;
      //If the model doesn't exist yet, just drop the sync so we don't think we are up to date,
      //when we are not.
      if( e.data.command === 'sync' && e.data.content && model ){
        let doUpdateState = false;
        let doSendReply = false;
        let doEditorUpdate = false;
        let newDocumentData = documentDataRef.current;
        if( e.data.content.alignmentData.version > newDocumentData.alignmentData.version ){
          doUpdateState = true;
          newDocumentData = {
            ...newDocumentData,
            alignmentData: e.data.content.alignmentData
          };
        }else if( e.data.content.alignmentData.version < newDocumentData.alignmentData.version ){
          doSendReply = true;
        }
        if( e.data.content.strippedUsfm.version > newDocumentData.strippedUsfm.version ){
          doUpdateState = true;
          newDocumentData = {
            ...newDocumentData,
            strippedUsfm: e.data.content.strippedUsfm
          };
          doEditorUpdate = true;
        }else if( e.data.content.strippedUsfm.version < newDocumentData.strippedUsfm.version ){
          doSendReply = true;
        }
        if( doUpdateState ){
          setDocumentData(newDocumentData);
        }
        if( doEditorUpdate ){
          model.setValue(e.data.content.strippedUsfm.text);
        }
        if( doSendReply ){
          console.log( "sending reply because the webview has a newer version" );
          if( vscodeRef.current )vscodeRef.current?.postMessage({ command: 'sync', content: newDocumentData });
        }
      }
    };
    window.addEventListener('message', messageEventListener);

    return () => window.removeEventListener('message', messageEventListener);
  }, []);
  

  return <>
    <Editor 
    height="80vh" width="90vh" defaultLanguage="text" 
    theme={editorColorScheme} 
    onChange={handleEditorChange} 
    onMount={handleEditorMount}
    />
  </>
}
