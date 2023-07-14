import type { FlowFieldManager } from './flowfield';
import { CustomLayer } from './customLayer';
import { GUI } from 'dat.gui'
import type { Map } from 'mapbox-gl';
import { textureManager } from '../geoScratch/core/managers';
import { Shader } from '../geoScratch/platform/WebGL2/shader/shader';
import type { TextureViewInfo } from '../geoScratch/platform/WebGL2/texture/textureView';
import { ScratchDataFormat } from '../geoScratch/platform/dataFormat';
import axios from 'axios';

const stf = ScratchDataFormat;
const stm = textureManager;

function renderContextSetting (gl: WebGL2RenderingContext) {
    const available_extensions = gl.getSupportedExtensions()!;
    for (const extension of available_extensions)
    {
        gl.getExtension(extension);
    }
    textureManager.SetContext(gl);

}

async function loadShader_url(gl: WebGL2RenderingContext, name: string, vertexUrl: string, fragmentUrl: string, transformFeedbackVaryings?: Array<string>) : Promise<Shader>{

    const vertexSource = await axios.get(vertexUrl)
    .then((response) => {
        return response.data;
    })
    .catch((error) => {
        console.log("ERROR::SHADER_NOT_LOAD_BY_URL", error.toJSON());
    });
    const fragmentSource = await axios.get(fragmentUrl)
    .then((response) => {
        return response.data;
    })
    .catch((error) => {
        console.log("ERROR::SHADER_NOT_LOAD_BY_URL", error.toJSON());
    });

    return new Shader(gl, name, [vertexSource, fragmentSource], transformFeedbackVaryings);
}

function makeBufferBySize(gl: WebGL2RenderingContext, target: number, dataSize: number, usage: number): WebGLBuffer | null {

    const vbo = gl.createBuffer();
    if (vbo == null) {
        console.log("ERROR::Vertex Buffer cannot be created!");
        return vbo;
    }

    gl.bindBuffer(target, vbo);
    gl.bufferData(target, dataSize, usage);
    gl.bindBuffer(target, null);
    return vbo;
}

interface TextureOffset {

    offsetX: number;
    offsetY: number;
}

class FlowLayer extends CustomLayer {
    public map: mapboxgl.Map | null = null;
    public ready = false;
    public useWorker = false;


    private renderVAO: WebGLVertexArrayObject = 0;
    private trajectoryIndexBuffer: WebGLBuffer = 0;
    private UBO: WebGLBuffer = 0;

    private trajectoryShader: Shader | null = null;
    private pointShader: Shader | null = null;
    private poolShader: Shader | null = null;

    private uboMapBuffer: Float32Array;
    private particleMapBuffer : Float32Array | null = null;

    private maxBlockSize: number = 0;
    private maxBlockColumn: number = 0;
    private flowBoundary: Array<number> = [];
    private textureOffsetArray: Array<TextureOffset>;

    // Render variable
    private segmentPrepare = -1;
    private beginBlock = 0.0;
    private aliveLineNum = 0.0;
    private segmentNum = 0.0;
    private projTextureInfo = 0.0;
    private trajectoryPool = 0;
    private rc: WebGL2RenderingContext|null = null;

    public workerOK = false;
    public workerParserOK = false;
    public updateWorkerSetting = true;
    public updateProgress = false;


    constructor(
        id: string, renderingMode: '2d' | '3d',
        public ffManager: FlowFieldManager
    ) {
        super(id, renderingMode);

        this.maxBlockSize = 0.0;
        this.maxBlockColumn = 0.0;
        this.textureOffsetArray = [];
        this.flowBoundary = [];
        this.uboMapBuffer = new Float32Array(12);
    }

    async Prepare(gl: WebGL2RenderingContext) {

        this.rc = gl;

        // Determine worker status
        if (!this.ffManager.workerOK) {
            console.log("ERROR::ALIVE_WORKER_IS_NOT_PREPARED");
            return false;
        }

        const f32TextureViewInfo: TextureViewInfo = {
            textureDataInfo: {
                target: gl.TEXTURE_2D, 
                flip: true,
                format: stf.R32G32_SFLOAT},
            viewType: gl.TEXTURE_2D,
            format: stf.R32G32_SFLOAT
        };
        const nSampler = stm.AddSampler({
            magFilter: gl.NEAREST,
            minFilter: gl.NEAREST,
            addressModeU: gl.CLAMP_TO_EDGE,
            addressModeV: gl.CLAMP_TO_EDGE
        });
        const lSampler = stm.AddSampler({
            magFilter: gl.LINEAR,
            minFilter: gl.LINEAR,
            addressModeU: gl.CLAMP_TO_EDGE,
            addressModeV: gl.CLAMP_TO_EDGE
        });

        // Get boundaries of flow speed
        this.flowBoundary = this.ffManager.parser.flowBoundary;

        // Set uniform buffer object data (something will not change)
        this.uboMapBuffer[8] = this.flowBoundary[0];
        this.uboMapBuffer[9] = this.flowBoundary[1];
        this.uboMapBuffer[10] = this.flowBoundary[2];
        this.uboMapBuffer[11] = this.flowBoundary[3];

        // Load texture of transform
        const tID = stm.SetTexture(stm.AddTextureView(f32TextureViewInfo), lSampler);
        await stm.FillTextureDataByImage(tID, 0, this.ffManager.parser.transform2DResource, this.ffManager.parser.transformTextureSize[0], this.ffManager.parser.transformTextureSize[1]);
        this.projTextureInfo = tID;

        // Prepare descriptive variables
        const MAX_TEXTURE_SIZE = this.ffManager.controller!.constraints["MAX_TEXTURE_SIZE"];
        const MAX_STREAMLINE_NUM = this.ffManager.controller!.constraints["MAX_STREAMLINE_NUM"];
        const MAX_SEGMENT_NUM = this.ffManager.controller!.constraints["MAX_SEGMENT_NUM"];

        this.aliveLineNum = 0;

        this.maxBlockSize = Math.ceil(Math.sqrt(MAX_STREAMLINE_NUM))
        this.maxBlockColumn =  Math.floor(MAX_TEXTURE_SIZE / this.maxBlockSize);
        for (let i = 0; i < MAX_SEGMENT_NUM; i++) {
            const offset: TextureOffset = {
                offsetX: (i % this.maxBlockColumn) * this.maxBlockSize,
                offsetY: Math.floor(i / this.maxBlockColumn) * this.maxBlockSize
            };

            this.textureOffsetArray.push(offset);
        }

        // Set data of particle block used to fill simulation buffer and particle pool texture
        this.particleMapBuffer = new Float32Array(this.maxBlockSize * this.maxBlockSize * 3).fill(0);

        // Set buffer used for visual effects
        this.trajectoryIndexBuffer = makeBufferBySize(gl, gl.ARRAY_BUFFER, MAX_STREAMLINE_NUM * 4, gl.DYNAMIC_DRAW)!;

        // Make uniform buffer object
        this.UBO = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.UBO);
        gl.bufferData(gl.ARRAY_BUFFER, 48, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Set particle pool
        const tv = stm.AddTextureView({
            textureDataInfo: {target: gl.TEXTURE_2D, 
                flip: false,
                width: MAX_TEXTURE_SIZE,
                height: MAX_TEXTURE_SIZE,
                format: stf.R32G32B32_SFLOAT},
            viewType: gl.TEXTURE_2D,
            format: stf.R32G32B32_SFLOAT
        });
        this.trajectoryPool = stm.SetTexture(tv, nSampler);

        for (let i = 0; i < MAX_SEGMENT_NUM; i++) {
            stm.UpdateDataBySource(this.trajectoryPool, 0, this.textureOffsetArray[i].offsetX, this.textureOffsetArray[i].offsetY, this.maxBlockSize, this.maxBlockSize, this.particleMapBuffer);
        }

        // Set Vertex Array Object
        this.renderVAO = gl.createVertexArray()!;
        gl.bindVertexArray(this.renderVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.trajectoryIndexBuffer);
        gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 1 * 4, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Build Shaders
        this.trajectoryShader = await loadShader_url(gl, "draw", "https://ycsoku.github.io/FFV_Database/shaders/ribbonParticle.trajectory.vert", "https://ycsoku.github.io/FFV_Database/shaders/ribbonParticle.trajectory.frag");
        this.pointShader = await loadShader_url(gl, "draw", "https://ycsoku.github.io/FFV_Database/shaders/ribbonParticle.point.vert", "https://ycsoku.github.io/FFV_Database/shaders/ribbonParticle.point.frag");
        this.poolShader = await loadShader_url(gl, "textureDebug", "https://ycsoku.github.io/FFV_Database/shaders/showPool.vert", "https://ycsoku.github.io/FFV_Database/shaders/showPool.frag");

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
        gl.bindVertexArray(null);

        this.segmentPrepare = MAX_SEGMENT_NUM;

        this.ffManager.isSuspended = false;
        this.ffManager.aliveWorker.postMessage([4, false]);
        this.ffManager.aliveWorker.postMessage([1]);

        return true;
    }

    GPUMemoryUpdate(beginBlock: number, trajectoryBlock: Float32Array, aliveLineNum: number, trajectoryBuffer: Float32Array) {
        this.beginBlock = beginBlock;
        this.aliveLineNum = aliveLineNum;

        stm.UpdateDataBySource(this.trajectoryPool, 0, this.textureOffsetArray[this.beginBlock].offsetX, this.textureOffsetArray[this.beginBlock].offsetY, this.maxBlockSize, this.maxBlockSize, trajectoryBlock);

        this.rc!.bindBuffer(this.rc!.ARRAY_BUFFER, this.trajectoryIndexBuffer);
        this.rc!.bufferSubData(this.rc!.ARRAY_BUFFER, 0, trajectoryBuffer);
        this.rc!.bindBuffer(this.rc!.ARRAY_BUFFER, null);
        this.segmentPrepare -= 1;

        this.map?.triggerRepaint();
    }

    bindUBO(gl: WebGL2RenderingContext, bindingPointIndex: number) {

        gl.bindBuffer(gl.UNIFORM_BUFFER, this.UBO);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.uboMapBuffer);
        gl.bindBufferRange(gl.UNIFORM_BUFFER, bindingPointIndex, this.UBO, 0, this.uboMapBuffer.length * 4.0);
    }

    tickLogicCount() {
        
        this.segmentNum = this.ffManager.controller!.segmentNum;

        this.uboMapBuffer[1] = this.ffManager.controller!.segmentNum;
        this.uboMapBuffer[2] = this.ffManager.controller!.segmentNum * 10;
        this.uboMapBuffer[3] = this.ffManager.controller!.dropRate;
        this.uboMapBuffer[4] = this.ffManager.controller!.dropRateBump;
        this.uboMapBuffer[5] = this.ffManager.controller!.speedFactor * 0.01 * 100;
        this.uboMapBuffer[6] = this.ffManager.controller!.colorScheme;
    }

    tickRender(gl: WebGL2RenderingContext, u_matrix: number[]) {

        // gl.clearColor(0.0, 0.0, 0.0, 1.0);
        // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.bindUBO(gl, 0);

        // Pass 1 - Operation 1: Rendering
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.bindVertexArray(this.renderVAO);
        stm.BindTexture([this.trajectoryPool, this.projTextureInfo], [0, 1]);

        gl.enable(gl.BLEND);
        gl.blendColor(0.0, 0.0, 0.0, 0.0);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        if (this.ffManager.controller!.primitive == 0) {
            this.trajectoryShader!.use();
            this.trajectoryShader!.setInt("particlePool", 0);
            this.trajectoryShader!.setInt("projectionTexture", 1);
            this.trajectoryShader!.setInt("blockNum", this.ffManager.controller!.constraints["MAX_SEGMENT_NUM"]);
            this.trajectoryShader!.setInt("beginBlock", this.beginBlock);
            this.trajectoryShader!.setInt("blockSize", this.maxBlockSize);
            this.trajectoryShader!.setFloat("fillWidth", this.ffManager.controller!.fillWidth);
            this.trajectoryShader!.setFloat("aaWidth", this.ffManager.controller!.aaWidth);
            this.trajectoryShader!.setFloat2("viewport", gl.canvas.width, gl.canvas.height);
            this.trajectoryShader!.setMat4("u_matrix", u_matrix);
            this.trajectoryShader!.setUniformBlock("FlowFieldUniforms", 0);

            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (this.segmentNum - 1) * 2, this.aliveLineNum);
        }
        else {
            this.pointShader!.use();
            this.pointShader!.setInt("particlePool", 0);
            this.pointShader!.setInt("projectionTexture", 1);
            this.pointShader!.setInt("blockNum", this.ffManager.controller!.constraints["MAX_SEGMENT_NUM"]);
            this.pointShader!.setInt("beginBlock", this.beginBlock);
            this.pointShader!.setInt("blockSize", this.maxBlockSize);
            this.pointShader!.setFloat("fillWidth", this.ffManager.controller!.fillWidth);
            this.pointShader!.setFloat("aaWidth", this.ffManager.controller!.aaWidth);
            this.pointShader!.setFloat2("viewport", gl.canvas.width, gl.canvas.height);
            this.pointShader!.setMat4("u_matrix", u_matrix);
            this.pointShader!.setUniformBlock("FlowFieldUniforms", 0);

            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.aliveLineNum);
        }

        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);

        gl.bindVertexArray(null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    debug(gl: WebGL2RenderingContext) {

        // Show particle pool
        if (this.ffManager.controller!.content == "particle pool") {

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            this.poolShader!.use();
            stm.BindTexture([this.trajectoryPool], [0]);
            this.poolShader!.setFloat2("viewport", window.innerWidth, window.innerHeight);
            this.poolShader!.setInt("textureBuffer", 0);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
            gl.disable(gl.BLEND);
        }
    }

    async onAdd(map: Map, gl: WebGL2RenderingContext) {
        console.log("Custom flow field layer is being added...");
        this.map = map;
        this.ffManager.platform = map;

        renderContextSetting(gl);
        this.ready = await this.Prepare(gl);
    }

    render(gl: WebGL2RenderingContext, u_matrix: number[]) {
        if(!this.ready || !this.ffManager.workerOK || this.segmentPrepare >= 0) {
            console.log("manager not ready !");
            return;
        }

        // rendering
        this.tickLogicCount();
        this.tickRender(gl, u_matrix);

        if (this.ffManager.debug) {
            this.ffManager.stats.update();
            // this.debug(gl);
        }
    }

    onRemove(map: Map, gl: WebGL2RenderingContext): void {
        gl.deleteVertexArray(this.renderVAO);
        gl.deleteBuffer(this.UBO);
        gl.deleteBuffer(this.trajectoryIndexBuffer);
        stm.Empty();
        this.poolShader!.delete();
        this.pointShader!.delete();
        this.trajectoryShader!.delete();
    }
}


export {
    FlowLayer
}