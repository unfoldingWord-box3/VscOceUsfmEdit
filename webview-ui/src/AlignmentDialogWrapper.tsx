import React from 'react';

interface AlignmentDialogWrapperProps {
    reference: string;
    getConfiguration: (key: string) => Promise<any>;
    getFile: (path: string) => Promise<string|undefined>;
}

interface SourceMapI{
    [key: string]: string
}

const AlignmentDialogWrapper: React.FC<AlignmentDialogWrapperProps> = ({
    reference,
    getConfiguration,
    getFile
}) => {

    //state var for the source map.
    const [sourceMap, setSourceMap] = React.useState<SourceMapI>({});

    const [smallFile, setSmallFile] = React.useState<string>("");

    async function getSourceMap(){
        console.log( "requesting sourceMap." );
        let sourceMap : any = await getConfiguration("sourceMap");
        if( Object.keys(sourceMap).length == 0 ){ 
            sourceMap = {"(.*)\\.usfm": "source/\\1.usfm"}; 
        }
        console.log( "received sourceMap. " + sourceMap );
        setSourceMap(sourceMap);
    }
    if( Object.keys(sourceMap).length == 0 ){ 
        getSourceMap(); 
    }else{
        console.log( "Have sourceMap. " + sourceMap );
    }

    async function getSmallFile(){
        console.log( "requesting smallFile." );
        let fileContent = await getFile("./bob.txt");
        console.log( "received smallFile. " + fileContent );
        if( fileContent ){
            setSmallFile(fileContent);
        }
    }
    if( smallFile === "" ){ 
        getSmallFile(); 
    }else{
        console.log( "Have smallFile. " + smallFile );
    }

    return (
        <div>
            <p>Alignment dialog wrapper</p>
            <p>{reference}</p>
            <p>{Object.entries(sourceMap).map( ([key, value]) => <p>{key} : {value}</p>)}</p>
            <p>Small file:</p>
            <p>{smallFile}</p>
        </div>
    )
}


export default AlignmentDialogWrapper