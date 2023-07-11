import { ScratchDataFormat, type DataFormats } from "../../dataFormat";

const tf = ScratchDataFormat;
export var Scratch_GL_Data_Formats: DataFormats = {};

Scratch_GL_Data_Formats[tf.R8G8B8A8_UBYTE] = {
    internalFormat: WebGL2RenderingContext.RGBA8,
    format: WebGL2RenderingContext.RGBA,
    type: WebGL2RenderingContext.UNSIGNED_BYTE,
    components: 4,
    dataType: "Integer",
    size: 1
}
Scratch_GL_Data_Formats[tf.R32_SFLOAT] = {
    internalFormat: WebGL2RenderingContext.R32F,
    format: WebGL2RenderingContext.RED,
    type: WebGL2RenderingContext.FLOAT,
    components: 1,
    dataType: "Float_Point",
    size: 4
}
Scratch_GL_Data_Formats[tf.R32G32_SFLOAT] = {
    internalFormat: WebGL2RenderingContext.RG32F,
    format: WebGL2RenderingContext.RG,
    type: WebGL2RenderingContext.FLOAT,
    components: 2,
    dataType: "Float_Point",
    size: 4
}
Scratch_GL_Data_Formats[tf.R32G32B32_SFLOAT] = {
    internalFormat: WebGL2RenderingContext.RGB32F,
    format: WebGL2RenderingContext.RGB,
    type: WebGL2RenderingContext.FLOAT,
    components: 3,
    dataType: "Float_Point",
    size: 4
}
Scratch_GL_Data_Formats[tf.R32G32B32A32_SFLOAT] = {
    internalFormat: WebGL2RenderingContext.RGBA32F,
    format: WebGL2RenderingContext.RGBA,
    type: WebGL2RenderingContext.FLOAT,
    components: 4,
    dataType: "Float_Point",
    size: 4
}