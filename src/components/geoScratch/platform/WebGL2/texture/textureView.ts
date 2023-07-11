import type { TextureData,TextureDataInfo } from "./textureData"

export interface TextureViewInfo {
    texture?: TextureData,
    textureDataInfo?: TextureDataInfo,
    viewType: number,
    format: number,
    baseMipLevel?: number,
    levelCount?: number,
    baseArrayLayer?: number,
    layerCount?: number
}

export class TextureView implements TextureViewInfo{

    texture?: TextureData;
    viewType: number;
    format: number;
    baseMipLevel: number;
    levelCount: number;
    baseArrayLayer: number;
    layerCount: number;

    constructor (info: TextureViewInfo) {
        this.texture = info.texture;
        this.viewType = info.viewType;
        this.format = info.format;
        this.baseMipLevel = info.baseMipLevel ? info.baseMipLevel : 0;
        this.levelCount = info.levelCount ? info.levelCount : 1;
        this.baseArrayLayer = info.baseArrayLayer ? info.baseArrayLayer : 0;
        this.layerCount = info.layerCount ? info.layerCount : 1;
    }

    static Create(info: TextureViewInfo) {
        return new TextureView(info);
    }

    Bind(rc: WebGL2RenderingContext, unit: number) {
        this.texture!.Bind(rc, unit);
    }

    Delete(rc: WebGL2RenderingContext) {
        this.texture!.Delete(rc);
    }
}