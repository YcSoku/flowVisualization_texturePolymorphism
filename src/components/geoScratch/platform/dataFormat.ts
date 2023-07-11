export enum ScratchDataFormat {
    R8G8B8A8_UBYTE = 0,
    R32_SFLOAT,
    R32G32_SFLOAT,
    R32G32B32_SFLOAT,
    R32G32B32A32_SFLOAT,
    
    Format_Num
}

export interface DataFormat {
    internalFormat: number,
    format: number,
    type: number,
    components: number,
    dataType: "Integer" | "Float_Point" 
    size: number
}

export interface DataFormats {
    [formatName: number]: DataFormat
}