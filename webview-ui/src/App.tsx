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


interface InternalUsfmJsonFormat{
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
    content?: InternalUsfmJsonFormat,
    requestId?: number,
    lineNumber?: number,
}
interface VsCodeStub{
  postMessage: (message: UsfmMessage) => void
}

 
export default function App() {

  const vscodeRef = React.useRef<VsCodeStub | null>(null);

  const editorRef = React.useRef<editor.IEditor | null>(null);


  const _documentDataRef = React.useRef<InternalUsfmJsonFormat>({
    strippedUsfm: {
      version: -1,
      text: ""
    },
    alignmentData: {
      version: -1,
      //TODO: Add more here
    }
  });

  const ignoreChangeCountRef = React.useRef(0);

  const setDocumentData = ( newDocumentData : InternalUsfmJsonFormat ) => {
    _documentDataRef.current = newDocumentData;
  }

  const getDocumentData = () : InternalUsfmJsonFormat => {
    _documentDataRef.current.strippedUsfm.text = (editorRef.current?.getModel() as editor.ITextModel)?.getValue() || "";
    return _documentDataRef.current;
  }


  const handleEditorChangeDebounced = ( _value : string | undefined, _ev : editor.IModelContentChangedEvent ) : void => {
    ignoreChangeCountRef.current = 0;
    //debounced edit send.
    console.log( "Sending a sync message because of an edit.");
    vscodeRef.current?.postMessage({ command: 'sync', content: getDocumentData() });
  }

  const handleEditorChangeDebounceRef = React.useRef(0);
  const handleEditorChange : OnChange = (value,_ev ) => {
    if( ignoreChangeCountRef.current > 0 ){
      ignoreChangeCountRef.current -= 1;
      return;
    }
    //inc the stripped version if the text has changed.
    _documentDataRef.current.strippedUsfm.version += 1 + Math.random();

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
        let newDocumentData = getDocumentData();
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
          //Don't bother sending a reply if we have an outgoing edit waiting to go.
          if( handleEditorChangeDebounceRef.current === 0 ){
            doSendReply = true;
          }
        }
        if( doUpdateState ){
          setDocumentData(newDocumentData);
        }
        if( doEditorUpdate ){
          ignoreChangeCountRef.current += 1;
          const position = editorRef.current?.getPosition();
          model.setValue(e.data.content.strippedUsfm.text);
          if( position )editorRef.current?.setPosition(position);
        }
        if( doSendReply ){
          console.log( "sending reply because the webview has a newer version" );
          if( vscodeRef.current )vscodeRef.current?.postMessage({ command: 'sync', content: newDocumentData });
        }
      }else if( e.data.command === 'flushUpdates' ){
        if( vscodeRef.current ){
          //First we sync our data.
          vscodeRef.current?.postMessage({ command: 'sync', content: getDocumentData() });
          //and then we respond with the id to indicate that we have done so.
          vscodeRef.current?.postMessage({ command: 'response', requestId: e.data.requestId });
        }
      }else if( e.data.command === 'selectLine' ){
        const lineNumber = e.data.lineNumber!;
        editorRef.current?.revealLineInCenter(lineNumber);
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
