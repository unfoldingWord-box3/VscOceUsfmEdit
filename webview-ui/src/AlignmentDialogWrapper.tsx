// @ts-ignore
import React from 'react';

console.log("AlignmentDialogWrapper Started")

interface AlignmentDialogWrapperProps {
    reference: string;
    getConfiguration: (key: string) => Promise<any>;
    getFile: (path: string) => Promise<string|undefined>;
    navigateAndReadFile: (key: string) => Promise<any>;
    getUsfm: () => Promise<string|undefined>;
}

interface SourceMapI{
    [key: string]: string
}

const AlignmentDialogWrapper: React.FC<AlignmentDialogWrapperProps> = ({
    reference,
    getConfiguration,
    getFile,
    getUsfm,
    navigateAndReadFile,
}) => {
    //state var for the source map.
    const [sourceMap, setSourceMap] = React.useState<SourceMapI>({});

    const [targetUsfm, setTargetUsfm] = React.useState<string>("");
    const [originalUsfm, setOriginalUsfm] = React.useState<string>("");

    async function getSourceMap(){
        console.log( "requesting sourceMap:", reference );
        let sourceMap : any = await getConfiguration("sourceMap");
        if( Object.keys(sourceMap).length == 0 ){ 
            sourceMap = {"(.*)\\.usfm": "source/\\1.usfm"};
            console.log( "received sourceMap is null", sourceMap );
        }
        console.log( "received sourceMap:", sourceMap );
        setSourceMap(sourceMap);
    }

    if( Object.keys(sourceMap).length == 0 ){ 
        console.log( "requesting targetUsfm:", {reference} );
        getSourceMap(); 
    }else{
        console.log( "Have sourceMap:", sourceMap );
    }

    async function _getUsfm(){
        console.log( "_getUsfm() requesting USFM:", {reference} );
        const fileContent = await getUsfm();
        console.log( "_getUsfm() received USFM. " + fileContent?.substring(0,400) );
        if( fileContent ){
            const response = await navigateAndReadFile('OriginalBibleUsfm');
            const originalLangContent = response?.contents
            console.log( "_getUsfm() received original USFM. ", originalLangContent?.substring(0,400) );
            if (originalLangContent) {
                setOriginalUsfm(originalLangContent)
            }
            setTargetUsfm(fileContent);
        }
    }

    if( targetUsfm === "" ){ 
        console.log( "requesting targetUsfm:", {reference} );
        _getUsfm(); 
    } else {
        console.log( "Have targetUsfm. " + targetUsfm );
    }

    return (
        <div>
            <p>Alignment dialog wrapper</p>
            <p>{reference}</p>
            <p>{Object.entries(sourceMap).map( ([key, value]) => <p>{key} : {value}</p>)}</p>
            <p>Small file:</p>
            <p>{targetUsfm}</p>
        </div>
    )
}


export default AlignmentDialogWrapper