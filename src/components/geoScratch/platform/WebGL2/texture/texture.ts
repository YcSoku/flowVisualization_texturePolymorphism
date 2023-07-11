import type { TextureView } from './textureView';
import type { Sampler } from './sampler';

export interface TextureInfo {

    textureView: TextureView,
    sampler: Sampler
}

export class Texture implements TextureInfo {
    
    textureView: TextureView;
    sampler: Sampler;

    constructor(info: TextureInfo) {
        this.textureView = info.textureView;
        this.sampler = info.sampler;
    }

    static Create(info: TextureInfo) {
        return new Texture(info);
    }

    Bind(rc: WebGL2RenderingContext, unit: number) {
        this.textureView.Bind(rc, unit);
        this.sampler.Bind(rc, unit);
    }

    Delete(rc: WebGL2RenderingContext) {
        this.textureView.Delete(rc);
        this.sampler.Delete(rc);
    }
}