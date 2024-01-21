import React from 'react';

interface AlignmentDialogWrapperProps {
    reference: string;
}

const AlignmentDialogWrapper: React.FC<AlignmentDialogWrapperProps> = ({
    reference
}) => {

    return (
        <div>
            {reference}
        </div>
    )
}


export default AlignmentDialogWrapper