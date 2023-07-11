import axios from 'axios';
import { Scratch_GL_Data_Formats } from '../dataFormat/format';
import Worker from "./readPixels.worker?worker";
import type { TextureManager } from '@/components/geoScratch/core/texture/textureManager';


export interface TextureDataInfo {
    target: number,
    flip?: boolean,
    width?: number,
    height?: number,
    format: number,
    depth?: number,
    mipLevels?: number,
    arrayLayers?: number
}

export class TextureData implements TextureDataInfo {
    target : number;
    flip : boolean;
    width : number;
    height : number;
    format : number;
    depth : number;
    mipLevels : number;
    arrayLayers : number;
    masterManager: TextureManager;

    ID : WebGLTexture = 0;

    isReady = false;

    constructor(info: TextureDataInfo, manager: TextureManager) {
        this.masterManager = manager;
        this.target = info.target;
        this.flip = info.flip ? info.flip : false;
        this.width = info.width ? info.width : 0;
        this.height = info.height ? info.height : 0;
        this.format = info.format;
        this.depth =  info.depth ? info.depth : 1;
        this.mipLevels = info.mipLevels ? info.mipLevels : 1;
        this.arrayLayers = info.arrayLayers ? info.arrayLayers : 1;
    }

    static Create(rc: WebGL2RenderingContext, info: TextureDataInfo, manager: TextureManager) {
        let texture = new TextureData(info, manager);
        texture.ID = rc.createTexture()!;

        if (texture.width !== 0 && texture.height !== 0) {
            rc.bindTexture(texture.target, texture.ID);
            rc.texStorage2D(texture.target, texture.mipLevels, Scratch_GL_Data_Formats[texture.format].internalFormat, texture.width, texture.height);
            rc.bindTexture(info.target, null);
        }

        return texture;
    }

    FillByBuffer(rc: WebGL2RenderingContext, level: number,  width: number, height: number, pbo: WebGLBuffer) {
        let format = Scratch_GL_Data_Formats[this.format];

        rc.bindBuffer(rc.PIXEL_UNPACK_BUFFER, pbo);
        rc.bindTexture(this.target, this.ID);
        if (this.flip) rc.pixelStorei(rc.UNPACK_FLIP_Y_WEBGL, true);
        rc.texImage2D(this.target, level, format.internalFormat, width, height, 0, format.format, format.type, 0);
        rc.pixelStorei(rc.UNPACK_FLIP_Y_WEBGL, false);

        if (this.mipLevels > 1) {
            rc.generateMipmap(this.target);
        }
        rc.bindBuffer(rc.PIXEL_UNPACK_BUFFER, null);
        rc.bindTexture(this.target, null);
    }
    
    async FillByImage(rc: WebGL2RenderingContext, level: number, url: string, width: number, height: number) {
                    
        this.width = width;
        this.height = height;

        rc.bindTexture(this.target, this.ID);
        rc.texStorage2D(this.target, this.mipLevels, Scratch_GL_Data_Formats[this.format].internalFormat, this.width, this.height);
        rc.bindTexture(this.target, null);
        
        const format = Scratch_GL_Data_Formats[this.format];
        const that = this;
        const worker = new Worker();
        let _flip: ImageOrientation = "from-image";

        if (that.flip) {
            rc.pixelStorei(rc.UNPACK_FLIP_Y_WEBGL, true);
            _flip = "flipY"
        }

        axios.get(url, {responseType: "blob"})
        .then((response) => {
            if (format.dataType === "Float_Point") {
                    worker.postMessage([response.data, _flip]);
                    worker.onmessage = function(e) {

                        rc.bindTexture(that.target, that.ID);
                        rc.texSubImage2D(that.target, level, 0, 0, width, height, format.format, format.type, new Float32Array(e.data));
                        rc.pixelStorei(rc.UNPACK_FLIP_Y_WEBGL, false);
                
                        if (that.mipLevels > 1) {
                            rc.generateMipmap(that.target);
                        }

                        rc.bindTexture(that.target, null);
                        worker.terminate();
                    }
            }
            else {
                createImageBitmap(response.data, {imageOrientation: _flip, premultiplyAlpha: "none", colorSpaceConversion: "default"})
                    .then((imageBitmap) => {
                        rc.bindTexture(that.target, that.ID);
                        rc.texSubImage2D(that.target, level, 0, 0, width, height, format.format, format.type, imageBitmap);
                        rc.pixelStorei(rc.UNPACK_FLIP_Y_WEBGL, false);
                
                        if (that.mipLevels > 1) {
                            rc.generateMipmap(that.target);
                        }

                        rc.bindTexture(that.target, null);
                    });
                }
        });
    }

    FillByData(rc: WebGL2RenderingContext, level: number,  width: number, height: number, data: ArrayBufferView) {
        let format = Scratch_GL_Data_Formats[this.format];

        rc.bindTexture(this.target, this.ID);
        if (this.flip) rc.pixelStorei(rc.UNPACK_FLIP_Y_WEBGL, true);
        rc.texImage2D(this.target, level, format.internalFormat, width, height, 0, format.format, format.type, data);
        rc.pixelStorei(rc.UNPACK_FLIP_Y_WEBGL, false);

        if (this.mipLevels > 1) {
            rc.generateMipmap(this.target);
        }
        rc.bindTexture(this.target, null);
    }

    UpdateByBuffer(rc: WebGL2RenderingContext, level: number, xoffset: number, yoffset: number, width: number, height: number) {

        rc.bindTexture(this.target, this.ID);
        rc.texSubImage2D(this.target, level, xoffset, yoffset, width, height, Scratch_GL_Data_Formats[this.format].format, Scratch_GL_Data_Formats[this.format].type, 0);
        rc.bindTexture(this.target, null);
    }

    UpdateByData(rc: WebGL2RenderingContext, level: number, xoffset: number, yoffset: number, width: number, height: number, data: ArrayBufferView) {
        
        rc.bindTexture(this.target, this.ID);
        rc.pixelStorei(rc.UNPACK_ALIGNMENT, 1);
        rc.texSubImage2D(this.target, level, xoffset, yoffset, width, height, Scratch_GL_Data_Formats[this.format].format, Scratch_GL_Data_Formats[this.format].type, data);
        rc.bindTexture(this.target, null);
    }

    UpdateByImage(rc: WebGL2RenderingContext, level: number, url: string) {
        this.masterManager.Lock();

        const format = Scratch_GL_Data_Formats[this.format];
        const that = this;
        const worker = new Worker();
        let _flip: ImageOrientation = "from-image";
        if (that.flip) {
            rc.pixelStorei(rc.UNPACK_FLIP_Y_WEBGL, true);
            _flip = "flipY"
        }

        axios.get(url, {responseType: "blob"})
        .then((response) => {
            if (format.dataType === "Float_Point") {
                    worker.postMessage([response.data, _flip]);
                    worker.onmessage = function(e) {

                        rc.bindTexture(that.target, that.ID);
                        rc.texSubImage2D(that.target, level, 0, 0, that.width, that.height, format.format, format.type, new Float32Array(e.data));
                        rc.pixelStorei(rc.UNPACK_FLIP_Y_WEBGL, false);
                
                        if (that.mipLevels > 1) {
                            rc.generateMipmap(that.target);
                        }

                        rc.bindTexture(that.target, null);
                        worker.terminate();
                        that.masterManager.Unlock();
                    }
            }
            else {
                createImageBitmap(response.data, {imageOrientation: _flip, premultiplyAlpha: "none", colorSpaceConversion: "default"})
                    .then((imageBitmap) => {
                        rc.bindTexture(that.target, that.ID);
                        rc.texSubImage2D(that.target, level, 0, 0, that.width, that.height, format.format, format.type, imageBitmap);
                        rc.pixelStorei(rc.UNPACK_FLIP_Y_WEBGL, false);
                
                        if (that.mipLevels > 1) {
                            rc.generateMipmap(that.target);
                        }

                        rc.bindTexture(that.target, null);
                        that.masterManager.Unlock();
                    });
                }
        });
    }

    Bind(rc: WebGL2RenderingContext, unit: number) {
        rc.activeTexture(rc.TEXTURE0 + unit);
        rc.bindTexture(this.target, this.ID);
    }

    Delete(rc: WebGL2RenderingContext) {
        rc.deleteTexture(this.ID);
    }
}