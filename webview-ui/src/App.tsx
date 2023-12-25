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
import { useEffect } from 'react';
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
  version?: number,
  text?: string,
  edits?: Edit[]
}
interface VsCodeStub{
  postMessage: (message: UsfmMessage) => void
}


 
export default function App() {

  const vscodeRef = React.useRef<VsCodeStub | null>(null);

  const editorRef = React.useRef<editor.IEditor | null>(null);

  const handleEditorChange : OnChange = (value,ev) => {
    if( value !== undefined && ev !== undefined ) {
      const edits = ev.changes.map( (change) => {
        return {
          startLineNumber: change.range.startLineNumber,
          startColumn: change.range.startColumn,
          endLineNumber: change.range.endLineNumber,
          endColumn: change.range.endColumn,
          text: change.text 
        };  
      });
      if( vscodeRef.current )vscodeRef.current?.postMessage({ command: 'edit', edits: edits, version: ev.versionId });
    }
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
      if( e.data.command === 'update' ){
        console.log( "Received update with version " + e.data.version  );
        if( editorRef.current !== null ){
          const model: editor.ITextModel | null = editorRef.current.getModel() as editor.ITextModel | null;
          if( model !== null ){
            if( e.data.version !== undefined && e.data.text !== undefined && model.getVersionId() < e.data.version ){
              console.log( "Model had older version " + model.getVersionId() + " and received version " + e.data.version + "" );
              model.setValue(e.data.text);
            }else{
              console.log( "Model had newer version " + model.getVersionId() + " and received version " + e.data.version + "" );
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
            if( e.data.version !== undefined && e.data.edits !== undefined && model.getVersionId() < e.data.version ){
              model.pushEditOperations(null, e.data.edits.map( (edit) => {
                return {
                  range: new monaco.Range(edit.startLineNumber, edit.startColumn, edit.endLineNumber, edit.endColumn),
                  text: edit.text
                };
              }),()=>[]);
            }
          }
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
