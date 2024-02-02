import { useState } from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'
//@ts-ignore
import EpiteleteHtml from "epitelete-html";


//This code was given as an example for using Monica with Vite.  I am not including it until I run into a problem that will tell me why.
//it is needed for the editor.

//Determine the color scheme from vscode.  So body will have an attribute with the name on it, so if it includes "light"
//in it we will go with light otherwise we will be dark.
//reference to body
const body = document.querySelector('body');
const vscodeTheme = body?.getAttribute( "data-vscode-theme-id" )

import { useEffect } from 'react';
import React from 'react';

//@ts-ignore
import {Editor as OceEditor} from '@oce-editor-tools/mui-core';

interface InternalUsfmJsonFormat{
  orgPerf: any,
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
  commandArg?: string,
  response?: any,
}
interface VsCodeStub{
  postMessage: (message: UsfmMessage) => void
}

interface AppState{
  activeView: string,
  alignmentReference: string,
}
 
export default function App() {

  const vscodeRef = React.useRef<VsCodeStub | null>(null);

  //make a react state for AppState
  const [appState, setAppState] = useState<AppState>({
    activeView: "view_stripped_usfm",
    alignmentReference: ""
  })

  const verbose = true
  const docSetId = "Xxx/en_act" // just dummy values
  const [ready,setReady] = useState(false)
  const [mounted,setMounted] = useState(false)
  const [usePerf,setUsePerf] = useState(false)
  const [epiteleteHtml, setEpiteleteHtml] = useState(
    new EpiteleteHtml(
      { proskomma: undefined, docSetId, options: { historySize: 100 } }
    )
  )

  useEffect(() => {
    async function loadUsfm() {
      console.log("sideload perf")
      await epiteleteHtml.sideloadPerf('RUT', usePerf)
      setReady(true)
    }
    if (epiteleteHtml && usePerf) loadUsfm()
  }, [epiteleteHtml,usePerf])

  useEffect(() => {
    console.log("set mounted")
    setMounted(true)
    //see if the function acquireVsCodeApi exists.
    //Ignore if acquireVsCodeApi does not exist.
    // @ts-expect-error acquireVsCodeApi exists in vscode.
    if (typeof acquireVsCodeApi === 'function' && vscodeRef.current === null ) {
      console.log("acquireVsCodeApi exists!")
      // @ts-expect-error acquireVsCodeApi exists in vscode.
      vscodeRef.current = acquireVsCodeApi();
      console.log("send ready")
      vscodeRef.current?.postMessage({ command: 'ready' });
    }
  }, [])

  const _documentDataRef = React.useRef<InternalUsfmJsonFormat>({
    orgPerf: {},
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
    console.log( "newDocumentData");
    console.log(newDocumentData)
    _documentDataRef.current = newDocumentData;
  }

  const getDocumentData = () : InternalUsfmJsonFormat => {
    return {
      orgPerf: {},
      strippedUsfm: {
        version: -1,
        text: ""
      },
      alignmentData: {
        version: -1,
        //TODO: Add more here
      }
    }
  }

  const selectReference = ( reference: string ) => {    
    console.log(reference)
  }

  const _requestIdRef = React.useRef(1);
  const _callbacksRef = React.useRef<Map<number, (response: UsfmMessage) => void>>(new Map());

  //Go ahead and subscribe to the plugin events.
  useEffect(() => {
    const messageEventListener = (e: {data: UsfmMessage}) => {
      const model: undefined = undefined;
      //If the model doesn't exist yet, just drop the sync so we don't think we are up to date,
      //when we are not.
      console.log( "messageEventListener:", e );
      console.log( "content:", e?.data?.content );
      if( e.data.command === 'sync' && e.data.content && e.data.content.orgPerf ){
        console.log("update perf")
        setUsePerf(e.data.content.orgPerf)
      }
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
          doSendReply = true;
        }
        if( doUpdateState ){
          setDocumentData(newDocumentData);
        }
        if( doEditorUpdate ){
          ignoreChangeCountRef.current += 1;
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
      }else if( e.data.command === 'selectReference' ){
        console.log( "Selecting reference " + e.data.commandArg );
        if( e.data.commandArg ){
          selectReference( e.data.commandArg );
        }
        setAppState( { ...appState, activeView: 'view_stripped_usfm' } );
      }else if( e.data.command === 'alignReference' ){
        console.log( "performing alignment " + e.data.commandArg );
        setAppState( { ...appState, activeView: 'view_align_usfm', alignmentReference: e.data.commandArg || '' } );
      }else if( e.data.command === 'getActiveViewName' ){
        if( vscodeRef.current ){
          console.log( "Sending the active view is " + appState.activeView );
          vscodeRef.current?.postMessage({ command: 'response', requestId: e.data.requestId, response: appState.activeView });
        }
      }else if( e.data.command === 'response' ){
        if( e.data.requestId ){
          const callback = _callbacksRef.current.get(e.data.requestId);
          if( callback ){
            callback(e.data);
            _callbacksRef.current.delete(e.data.requestId);
          }
        }      
      }
    };
    window.addEventListener('message', messageEventListener);

    return () => window.removeEventListener('message', messageEventListener);
  }, [appState]);
    
  const onSave = (bookCode: String, usfmText: String) => {
    console.log(`save button clicked: ${bookCode}, ${usfmText}`) 
  }
  const onReferenceSelected = (reference: any) => {
    console.log(`onReferenceSelected: ${reference}`)
  }
  const onRenderToolbar = (props: any) => {
    const { items } = props
    const _items: any = items
      .filter((item: { key: string; }) => 
           (item?.key !== "print") 
        && (item?.key !== "lock"))
    console.log(_items)
    return [..._items]
  }

  const editorProps = {
    epiteleteHtml,
    bookId: 'rut',
    onSave,
    onReferenceSelected,
    onRenderToolbar,
    reference: {
      bookId: 'rut',
      chapter: 1,
      verse: 4,
    },
    verbose
  }
   
  const displayFont = 'sans-serif';
  const displayFontSize = 'medium';
  const displayLineHeight = '1.4';
  
  return (
    <div>
      <p>ActiveView {appState.activeView}</p>
      <div key="1" style={{ fontFamily: displayFont, fontSize: displayFontSize, lineHeight: displayLineHeight }}>
        { ready ? <OceEditor key="1" {...editorProps} /> : 'Loading...' }
      </div>
    </div>
  )
}
