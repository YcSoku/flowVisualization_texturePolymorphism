export interface SamplerInfo {
    magFilter: number,
    minFilter: number,
    addressModeU: number,
    addressModeV: number,
    addressModeW?: number
}

export class Sampler implements SamplerInfo {
    magFilter: number;
    minFilter: number;
    addressModeU: number;
    addressModeV: number;
    addressModeW?: number;

    ID: WebGLSampler = 0;

    constructor(info: SamplerInfo) {
        this.magFilter = info.magFilter;
        this.minFilter = info.minFilter;
        this.addressModeU = info.addressModeU;
        this.addressModeV = info.addressModeV;
        this.addressModeW = info.addressModeW;
    }

    static Create(rc: WebGL2RenderingContext, info: SamplerInfo) {
        let sampler =  new Sampler(info);

        sampler.ID = rc.createSampler()!;
        rc.samplerParameteri(sampler.ID, rc.TEXTURE_MAG_FILTER, sampler.magFilter);
        rc.samplerParameteri(sampler.ID, rc.TEXTURE_MIN_FILTER, sampler.minFilter);
        rc.samplerParameteri(sampler.ID, rc.TEXTURE_WRAP_S, sampler.addressModeU);
        rc.samplerParameteri(sampler.ID, rc.TEXTURE_WRAP_T, sampler.addressModeV);
        if (sampler.addressModeW)
            rc.samplerParameteri(sampler.ID, rc.TEXTURE_WRAP_R, sampler.addressModeW);

        return sampler;
    }

    Bind(rc: WebGL2RenderingContext, unit: number) {
        rc.bindSampler(unit, this.ID);
    }

    Delete(rc: WebGL2RenderingContext) {
        rc.deleteSampler(this.ID);
    }
}