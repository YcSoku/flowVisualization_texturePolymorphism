export interface BindingInfo {
    binding: number,
    stride: number,
    inputRate?: number
}

export interface AttributeInfo {
    binding: number,
    location: number,
    format: number,
    offset: number
}

export interface BufferInfo {
    size: number,
    usage: number,
}

// export class Buffer 