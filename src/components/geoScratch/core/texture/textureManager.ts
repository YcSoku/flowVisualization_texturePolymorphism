import { TextureData, type TextureDataInfo } from '../../platform/WebGL2/texture/textureData';
import { TextureView, type TextureViewInfo } from '../../platform/WebGL2/texture/textureView';
import { Sampler, type SamplerInfo} from '../../platform/WebGL2/texture/sampler';
import { Texture } from '../../platform/WebGL2/texture/texture';

interface TextureReverseInfo {
    texture: Texture;
    viewID: number;
    samplerID: number;
}

export class TextureManager {
    private textureView_array: Array<TextureView|null>;
    private sampler_array: Array<Sampler|null>;
    private texture_array: Array<TextureReverseInfo|null>;
    private rc: WebGL2RenderingContext | null = null;

    private lockCount = 0;

    constructor(maxTextureViewNum: number, maxSamplerNum: number, maxTextureNum: number) {
        this.textureView_array = new Array<TextureView|null>(maxTextureViewNum).fill(null);
        this.sampler_array = new Array<Sampler|null>(maxSamplerNum).fill(null);
        this.texture_array = new Array<TextureReverseInfo|null>(maxTextureNum).fill(null);
    }

    static Create(maxTextureViewNum: number, maxSamplerNum: number, maxTextureNum: number) {
        return new TextureManager(maxTextureViewNum, maxSamplerNum, maxTextureNum);
    }

    SetContext(rc: WebGL2RenderingContext) {
        this.rc = rc;
    }

    Delete() {
        this.texture_array.forEach((value: TextureReverseInfo|null, index: number) => {
            if (value !== null) value.texture.Delete(this.rc!);
            this.texture_array[index] = null;
        });
        this.textureView_array.forEach((value: TextureView|null, index: number) => {
            if (value !== null) value.Delete(this.rc!);
            this.textureView_array[index] = null;
        });
        this.sampler_array.forEach((value: Sampler|null, index: number) => {
            if (value !== null) value.Delete(this.rc!);
            this.sampler_array[index] = null;
        });
    }
    
    AddTextureView(info: TextureViewInfo): number {
        let findEmpty = false;
        let index;

        for (index = 0; index < this.textureView_array.length; index++) {
            if (this.textureView_array[index] === null) {
                findEmpty = true;
                break;
            }
        }

        if (!findEmpty) {
            console.log("ERROR::TEXTURE_MANAGER::TEXTUREVIEW_ARRAY_OVERFLOW!");
            return this.textureView_array.length;
        }

        this.textureView_array[index] = this.CreateTextureView(info);
        return index;
    }

    AddSampler(info: SamplerInfo): number {
        let findEmpty = false;
        let index;
        for (index = 0; index < this.textureView_array.length; index++) {
            if (this.sampler_array[index] === info)
                return index;
        }

        for (index = 0; index < this.sampler_array.length; index++) {
            if (this.sampler_array[index] === null) {
                findEmpty = true;
                break;
            }
        }

        if (!findEmpty) {
            console.log("ERROR::TEXTURE_MANAGER::SAMPLER_ARRAY_OVERFLOW!");
            return this.sampler_array.length;
        }
        this.sampler_array[index] = Sampler.Create(this.rc!, info);
        return index;
    }

    SetTexture(textureViewID: number, samplerID: number): number {
        if (textureViewID >= this.textureView_array.length || samplerID >= this.sampler_array.length || this.textureView_array[textureViewID] === null || this.sampler_array[samplerID] === null) {
            console.log("ERROR::TEXTURE_MANAGER::TEXTUREVIEW_OR_SAMPLER_CANNOT_FOUND!");
            return this.texture_array.length;
        }

        let findEmpty = false;
        let index;
        for (index = 0; index < this.texture_array.length; index++) {
            if (this.texture_array[index] === null) {
                findEmpty = true;
                break;
            }
        }

        if (!findEmpty) {
            console.log("ERROR::TEXTURE_MANAGER::TEXTURE_ARRAY_OVERFLOW!");
            return this.texture_array.length;
        }

        this.texture_array[index] = {
            texture: Texture.Create({
                textureView: this.textureView_array[textureViewID]!,
                sampler: this.sampler_array[samplerID]!
            }),
            viewID: textureViewID,
            samplerID: samplerID
        };
        return index;
    }

    GetTextureViewLength() {
        let count = 0;
        for (let i = 0; i < this.textureView_array.length; i++) {
            if (this.textureView_array[i] != null)
                count++;
        }
        return count;
    }

    DeleteTexture(index: number): boolean {
        if (index >= this.texture_array.length || this.texture_array[index] === null) {
            console.log("ERROR::TEXTURE_MANAGER::TEXTUREVIEW_CANNOT_FOUND!");
            return false;
        }

        this.texture_array[index]?.texture.textureView.Delete(this.rc!);
        this.texture_array[index] = null;

        return true;
    }

    Empty() {
        for (let index = 0; index < this.texture_array.length; index++) {
            if (this.texture_array[index] != null) {
                this.texture_array[index]?.texture.textureView.Delete(this.rc!);
                this.texture_array[index] = null;
            }
        }
        for (let index = 0; index < this.sampler_array.length; index++) {
            if (this.sampler_array[index] != null){
                this.sampler_array[index]?.Delete(this.rc!);
                this.sampler_array[index] = null;
            }
        }
        for (let index = 0; index < this.textureView_array.length; index++) {
            if (this.textureView_array[index] != null) {
                this.textureView_array[index] = null;
            }
        }
    }

    BindTexture(textureIDs: Array<number>, units: Array<number>): void {
        if (textureIDs.length !== units.length) {
            console.log("ERROR::TEXTURE_MANAGER::TEXTURE_ID_AND_UNITS_NOT_EQUAL!")
            return;
        }

        for (let i = 0; i < textureIDs.length; i++) {
            this.texture_array[textureIDs[i]]?.texture.Bind(this.rc!, units[i]);
        }
    }

    GetTexture(tID: number) {
        if (this.texture_array[tID] === null) {
            console.log("ERROR::TEXTURE_MANAGER::TEXTUR_CANNOT_FOUND!")
            return null;
        }
        return this.texture_array[tID];
    }

    GetTextureView(viewID: number) {
        if (this.textureView_array[viewID] === null) {
            console.log("ERROR::TEXTURE_MANAGER::TEXTUREVIEW_CANNOT_FOUND!")
            return null;
        }
        return this.textureView_array[viewID];
    }

    CreateTextureData(info: TextureDataInfo) {
        return TextureData.Create(this.rc!, info, this);
    }

    CreateTextureView(info: TextureViewInfo) {
        if (info.textureDataInfo) {
            info.texture = this.CreateTextureData(info.textureDataInfo);
        }

        return TextureView.Create(info);
    }

    async FillTextureDataByImage(tID: number, level: number, url: string, width: number, height: number) {
        await this.textureView_array[this.GetTexture(tID)!.viewID]!.texture!.FillByImage(this.rc!, level, url, width, height);
    }

    UpdateDataBySource(tID: number, level: number, xoffset: number, yoffset: number, width: number, height: number, data: ArrayBufferView) {
        this.textureView_array[this.GetTexture(tID)!.viewID]!.texture!.UpdateByData(this.rc!, level, xoffset, yoffset, width, height, data);
    }

    UpdateDataByBuffer(tID: number, level: number, xoffset: number, yoffset: number, width: number, height: number) {
        this.textureView_array[this.GetTexture(tID)!.viewID]!.texture!.UpdateByBuffer(this.rc!, level, xoffset, yoffset, width, height);
    }

    Lock() {
        this.lockCount += 1;
    }

    Unlock() {
        this.lockCount -= 1;
    }

    IsBusy() {
        return this.lockCount;
    }

    UpdateDataByImage(tID: number, url: string, level: number) {
        this.textureView_array[this.GetTexture(tID)!.viewID]!.texture!.UpdateByImage(this.rc!, level, url);
    }
}