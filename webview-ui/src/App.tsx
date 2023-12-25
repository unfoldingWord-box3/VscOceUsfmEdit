// import { useState } from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'


//This code was given as an example for using Monica with Vite.  I am not including it until I run into a problem that will tell me why.
//it is needed for the editor.
import { loader } from '@monaco-editor/react';
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
import { useCallback, useEffect } from 'react';
import React from 'react';

interface VsCodeStub{
  postMessage: (message: { command: string, text?: string, version?: number }) => void
}
export default function App() {

  const vscodeRef = React.useRef<VsCodeStub | null>(null);


  const [ textState, _setTextState ] = React.useState<{text: string, version: number}>( {text:"",version:0} );
  


  const setTextState = useCallback( (newState: { text: string, version: number }) => {
    if( newState.text === textState.text ){
      console.log( "Ignoring changes because text is the same" );
    }else if( newState.version < textState.version ){
      console.log( "Ignoring changes because version is lower " + newState.version + " <= " + textState.version );
    }else{
      console.log( "Received changes because version is higher " + newState.version + " > " + textState.version );
      _setTextState( newState );
    }
  },[textState]);


  //see if the function acquireVsCodeApi exists.
  //Ignore if acquireVsCodeApi does not exist.
  // @ts-expect-error acquireVsCodeApi exists in vscode.
  if (typeof acquireVsCodeApi === 'function' && vscodeRef.current === null ) {
    // @ts-expect-error acquireVsCodeApi exists in vscode.
    vscodeRef.current = acquireVsCodeApi();
  }

  //Go ahead and subscribe to the plugin events.
  useEffect(() => {
    const messageEventListener = (e: {data: {command: string, text: string, version: number}}) => {
      if( e.data.command === 'update' ){
        setTextState( { text:e.data.text, version:e.data.version} );
      }
    };
    window.addEventListener('message', messageEventListener);

    return () => window.removeEventListener('message', messageEventListener);
  }, [setTextState]);
  

  useEffect( () => {
    if ( vscodeRef.current ) {
      vscodeRef.current?.postMessage({ command: 'ready' });
    }
  }, []);

  const handleEditorChange = (value: string | undefined, _event: unknown ) => {
    if( value !== undefined && value !== textState.text ){
      const newVersion = textState.version; //keep the old version the document itself will send us a new version.
      setTextState( {text:value, version: newVersion} );
      if( vscodeRef.current ) vscodeRef.current?.postMessage({ command: 'update', text: value, version: newVersion });
    }
  }

  return <>
    <Editor 
    height="80vh" width="90vh" defaultLanguage="text" 
    theme={editorColorScheme} 
    value={textState.text} 
    onChange={handleEditorChange} 
    />
  </>
}
