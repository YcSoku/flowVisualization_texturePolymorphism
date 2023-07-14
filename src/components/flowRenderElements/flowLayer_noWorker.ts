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

// Create random positions
const rand = (min: number, max?: number) => {

    if (!max) {
        max = min;
        min = 0;
    }
    return Math.random() * (max - min) + min;
};

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

function makeBufferBySource(gl: WebGL2RenderingContext, target: number, srcData: ArrayBuffer, usage: number): WebGLBuffer | null {

    const vbo = gl.createBuffer();
    if (vbo == null) {
        console.log("ERROR::Vertex Buffer cannot be created!");
        return vbo;
    }

    gl.bindBuffer(target, vbo);
    gl.bufferData(target, srcData, usage);
    gl.bindBuffer(target, null);
    return vbo;
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

class FlowLayer_Direct extends CustomLayer {
    public map: mapboxgl.Map | null = null;
    public ready = false;
    public useWorker = false;

    // Member for simulation
    private simulationVAO: WebGLVertexArrayObject = 0;
    private simulationVAO2: WebGLVertexArrayObject = 0;
    private XFBO: WebGLTransformFeedback = 0;
    private XFBO2: WebGLTransformFeedback = 0;
    private sVAO: WebGLVertexArrayObject = 0;
    private xfBO: WebGLTransformFeedback = 0;

    private simulationBuffer: WebGLBuffer = 0;
    private xfSimulationBuffer: WebGLBuffer = 0;
    private lifeBuffer: WebGLBuffer = 0;
    private xfLifeBuffer: WebGLBuffer = 0;
    private unPackBuffer: WebGLBuffer = 0;
    private UBO: WebGLBuffer = 0;

    private updateShader: Shader | null = null;

    private maxBlockSize = 0.0;
    private _timeCount = 0.0;
    private timeLast = 10.0;
    private phaseCount = 0.0;
    private flowFieldTextureSize = [0.0, 0.0];
    private flowFieldResourceArray: Array<string> = [];
    private flowFieldTextureInfo: Array<number> = []; 
    private seedingTextureSize = [0.0, 0.0];
    private seedingResourceArray: Array<string> = [];
    private seedingTextureInfo: Array<number> = [];

    private flowfieldTextureArray = [0.0, 0.0, 0.0];
    private seedingTextureArray = [0.0, 0.0, 0.0];

    private uboMapBuffer: Float32Array;
    private flowBoundary: Array<number>;
    private textureArraySize = 0;
    

    public beginBlock = -1.0;
    public trajectoryNum = 262144;
    public segmentNum = 16;
    public maxSegmentNum = 0;
    public maxTrajectoryNum = this.trajectoryNum;
    public _progressRate = 0.0;
    public speedFactor = 2.0;
    public dropRate = 0.003;
    public dropRateBump = 0.001;
    public fillWidth = 1.0;
    public aaWidth = 1.0;
    public isUnsteady = true;
    public isSuspended = false
    public particleMapBuffer: Float32Array | null = null;

    // Member for rendering
    private renderVAO: WebGLVertexArrayObject = 0;
    private renderVAO2: WebGLVertexArrayObject = 0;
    private rVAO: WebGLVertexArrayObject = 0;

    private trajectoryShader: Shader | null = null;
    private pointShader: Shader | null = null;
    private poolShader: Shader | null = null;

    private maxBlockColumn: number = 0;
    private textureOffsetArray: Array<TextureOffset>;

    private projTextureInfo = 0.0;
    private trajectoryPool = 0;

    public segmentPrepare = 0;


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

        const f32TextureViewInfo: TextureViewInfo = {
            textureDataInfo: {
                target: gl.TEXTURE_2D, 
                flip: true,
                format: stf.R32G32_SFLOAT},
            viewType: gl.TEXTURE_2D,
            format: stf.R32G32_SFLOAT
        };
        const textureViewInfo: TextureViewInfo = {
            textureDataInfo: {
                target: gl.TEXTURE_2D, 
                flip: true,
                format: stf.R8G8B8A8_UBYTE},
            viewType: gl.TEXTURE_2D,
            format: stf.R8G8B8A8_UBYTE
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
        this.maxTrajectoryNum = this.ffManager.parser.maxTrajectoryNum;
        this.segmentNum = this.ffManager.parser.maxSegmentNum;
        this.maxSegmentNum = this.ffManager.parser.maxSegmentNum;
        this.segmentPrepare = this.ffManager.parser.maxSegmentNum;
        this.maxBlockSize = Math.ceil(Math.sqrt(this.maxTrajectoryNum));
        this.flowFieldTextureSize = this.ffManager.parser.flowFieldTextureSize;
        this.seedingTextureSize = this.ffManager.parser.seedingTextureSize;

        // Set uniform buffer object data (something will not change)
        this.uboMapBuffer[8] = this.flowBoundary[0];
        this.uboMapBuffer[9] = this.flowBoundary[1];
        this.uboMapBuffer[10] = this.flowBoundary[2];
        this.uboMapBuffer[11] = this.flowBoundary[3];

        // Arrays of resource urls
        this.flowFieldResourceArray = this.ffManager.parser.flowFieldResourceArray;
        this.seedingResourceArray = this.ffManager.parser.seedingResourceArray;

        this.phaseCount = this.flowFieldResourceArray.length; // the last one is a phase from the end to the head
        this.timeLast = this.phaseCount * 150; // 150 frame per timePoint
        this.textureArraySize = 3;
        for (let i = 0; i < this.textureArraySize; i++) {
            
            // Load textures of flow fields
            const fID = stm.SetTexture(stm.AddTextureView(f32TextureViewInfo), lSampler);
            this.flowfieldTextureArray[i] = fID;
            await stm.FillTextureDataByImage(fID, 0, this.flowFieldResourceArray[i], this.flowFieldTextureSize[0], this.flowFieldTextureSize[1]);

            // Load textures of seeding masks
            const sID = stm.SetTexture(stm.AddTextureView(textureViewInfo), nSampler);
            this.seedingTextureArray[i] = sID;
            await stm.FillTextureDataByImage(sID, 0, this.seedingResourceArray[i], this.seedingTextureSize[0], this.seedingTextureSize[1]);
        }

        // Load texture of transform
        const tID = stm.SetTexture(stm.AddTextureView(f32TextureViewInfo), lSampler);
        await stm.FillTextureDataByImage(tID, 0, this.ffManager.parser.transform2DResource, this.ffManager.parser.transformTextureSize[0], this.ffManager.parser.transformTextureSize[1]);
        this.projTextureInfo = tID;

        // Set data of particle block used to fill simulation buffer and particle pool texture
        this.particleMapBuffer = new Float32Array(this.maxBlockSize * this.maxBlockSize * 3).fill(0);
        for (let i = 0; i < this.maxTrajectoryNum; i++) {
            this.particleMapBuffer[i * 3 + 0] = rand(0, 1.0);
            this.particleMapBuffer[i * 3 + 1] = rand(0, 1.0);
            this.particleMapBuffer[i * 3 + 2] = 0.0;
        }

        // Set life for particles
        const particleCountdownArray = new Float32Array(this.maxTrajectoryNum);
        for (let i = 0; i < this.maxTrajectoryNum; i++) {
            particleCountdownArray[i] = this.maxSegmentNum * 9.0;
        }

        // Set Buffer used to simulation
        this.simulationBuffer = makeBufferBySource(gl, gl.ARRAY_BUFFER, this.particleMapBuffer, gl.DYNAMIC_DRAW)!;
        this.xfSimulationBuffer = makeBufferBySource(gl, gl.ARRAY_BUFFER, this.particleMapBuffer, gl.DYNAMIC_DRAW)!;
        this.lifeBuffer = makeBufferBySource(gl, gl.ARRAY_BUFFER, particleCountdownArray, gl.DYNAMIC_DRAW)!;
        this.xfLifeBuffer = makeBufferBySource(gl, gl.ARRAY_BUFFER, particleCountdownArray, gl.DYNAMIC_DRAW)!;

        // Make uniform buffer object
        this.UBO = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.UBO);
        gl.bufferData(gl.ARRAY_BUFFER, 48, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Set Vertex Array Object
        this.simulationVAO = gl.createVertexArray()!;
        gl.bindVertexArray(this.simulationVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.simulationBuffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 3 * 4, 0);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lifeBuffer);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 1 * 4, 0);
        gl.enableVertexAttribArray(1);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        this.simulationVAO2 = gl.createVertexArray()!;
        gl.bindVertexArray(this.simulationVAO2);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.xfSimulationBuffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 3 * 4, 0);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.xfLifeBuffer);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 1 * 4, 0);
        gl.enableVertexAttribArray(1);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        this.renderVAO = gl.createVertexArray()!;
        gl.bindVertexArray(this.renderVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lifeBuffer);
        gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 1 * 4, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        this.renderVAO2 = gl.createVertexArray()!;
        gl.bindVertexArray(this.renderVAO2);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.xfLifeBuffer);
        gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 1 * 4, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Set Transform Feedback Object
        this.XFBO = gl.createTransformFeedback()!;
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.XFBO);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, this.xfSimulationBuffer);
        gl.bindBufferRange(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.xfSimulationBuffer, 0, this.maxBlockSize * this.maxBlockSize * 12);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, this.xfLifeBuffer);
        gl.bindBufferRange(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this.xfLifeBuffer, 0, this.maxBlockSize * this.maxBlockSize * 4);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);

        this.XFBO2 = gl.createTransformFeedback()!;
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.XFBO2);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, this.simulationBuffer);
        gl.bindBufferRange(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.simulationBuffer, 0, this.maxBlockSize * this.maxBlockSize * 12);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, this.lifeBuffer);
        gl.bindBufferRange(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this.lifeBuffer, 0, this.maxBlockSize * this.maxBlockSize * 4);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);

        // Prepare descriptive variables
        const MAX_TEXTURE_SIZE = this.ffManager.controller!.constraints["MAX_TEXTURE_SIZE"];
        const MAX_STREAMLINE_NUM = this.ffManager.controller!.constraints["MAX_STREAMLINE_NUM"];
        const MAX_SEGMENT_NUM = this.ffManager.controller!.constraints["MAX_SEGMENT_NUM"];

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

        // Make uniform buffer object
        this.UBO = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.UBO);
        gl.bufferData(gl.ARRAY_BUFFER, 48, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // Set particle pool
        const tv = stm.AddTextureView({
            textureDataInfo: {
                target: gl.TEXTURE_2D, 
                flip: false,
                width: MAX_TEXTURE_SIZE,
                height: MAX_TEXTURE_SIZE,
                format: stf.R32G32B32_SFLOAT
            },
            viewType: gl.TEXTURE_2D,
            format: stf.R32G32B32_SFLOAT
        });
        this.trajectoryPool = stm.SetTexture(tv, nSampler);

        for (let i = 0; i < MAX_SEGMENT_NUM; i++) {
            stm.UpdateDataBySource(this.trajectoryPool, 0, this.textureOffsetArray[i].offsetX, this.textureOffsetArray[i].offsetY, this.maxBlockSize, this.maxBlockSize, this.particleMapBuffer);
        }

        // Build Shaders
        this.updateShader = await loadShader_url(gl, "update", "https://ycsoku.github.io/FFV_Database/shaders/update.vert", "https://ycsoku.github.io/FFV_Database/shaders/update.frag", ['newInfo', 'aliveTime'])!;
        this.trajectoryShader = await loadShader_url(gl, "draw", "https://ycsoku.github.io/FFV_Database/shaders/trajectory.noCulling.vert", "https://ycsoku.github.io/FFV_Database/shaders/trajectory.noCulling.frag");
        this.pointShader = await loadShader_url(gl, "draw", "https://ycsoku.github.io/FFV_Database/shaders/point.noCulling.vert", "https://ycsoku.github.io/FFV_Database/shaders/point.noCulling.frag");
        this.poolShader = await loadShader_url(gl, "textureDebug", "https://ycsoku.github.io/FFV_Database/shaders/showPool.vert", "https://ycsoku.github.io/FFV_Database/shaders/showPool.frag");

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
        gl.bindVertexArray(null);

        this.ffManager.isSuspended = false;
        this.ffManager.aliveWorker.postMessage([4, false]);
        this.ffManager.aliveWorker.postMessage([1]);

        return true;
    }

    GPUMemoryUpdate(beginBlock: number, trajectoryBlock: Float32Array, aliveLineNum: number, trajectoryBuffer: Float32Array) {

    }

    bindUBO(gl: WebGL2RenderingContext, bindingPointIndex: number) {

        gl.bindBuffer(gl.UNIFORM_BUFFER, this.UBO);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.uboMapBuffer);
        gl.bindBufferRange(gl.UNIFORM_BUFFER, bindingPointIndex, this.UBO, 0, this.uboMapBuffer.length * 4.0);
    } 
    
    resourceLoad(texturePoint: number, timePoint: number) {
        // console.log(timePoint % this.flowFieldResourceArray.length)
        stm.UpdateDataByImage(this.flowfieldTextureArray[texturePoint], this.flowFieldResourceArray[timePoint], 0);
        stm.UpdateDataByImage(this.seedingTextureArray[texturePoint], this.seedingResourceArray[timePoint], 0);
    }

    set timeCount(value: number) {
        this._timeCount = value % this.timeLast;
    }

    get timeCount() {
        return this._timeCount;
    }

    set progressRate(value: number) {

        const lastPhase = Math.floor(this._progressRate * this.phaseCount);
        const currentPhase =  Math.floor(value * this.phaseCount) % this.phaseCount;
        const nextPhase = (currentPhase + 2) % this.phaseCount;

        this._progressRate = value;

        this.flowFieldTextureInfo = this.getFieldTextures();
        this.seedingTextureInfo = this.getMaskTextures();
        this.uboMapBuffer[0] = this.getProgressBetweenTexture();
        
        // Update texture for next nextPhase
        if (currentPhase != lastPhase) {
            this.resourceLoad(nextPhase % this.textureArraySize, nextPhase);
        }

    }

    get progressRate() {
        return this._progressRate;
    }

    getFieldTextures() {

        const currentPhase = Math.floor(this.progressRate * this.phaseCount);
        const nextPhase = (currentPhase + 1) % this.phaseCount;
        return [this.flowfieldTextureArray[currentPhase % this.textureArraySize], this.flowfieldTextureArray[nextPhase % this.textureArraySize]];
    }

    getMaskTextures() {

        const currentPhase = Math.floor(this.progressRate * this.phaseCount);
        const nextPhase = (currentPhase + 1) % this.phaseCount;
        return [this.seedingTextureArray[currentPhase % this.textureArraySize], this.seedingTextureArray[nextPhase % this.textureArraySize]];
    }

    getProgressBetweenTexture() {

        const progress = this.progressRate * this.phaseCount;
        return progress - Math.floor(progress);
    }

    async swap() {

        if (this.beginBlock % 2 == 0)
        {
            this.sVAO = this.simulationVAO;
            this.rVAO = this.renderVAO;
            this.xfBO = this.XFBO;
            this.unPackBuffer = this.simulationBuffer;
        } else {
            this.sVAO = this.simulationVAO2;
            this.rVAO = this.renderVAO2;
            this.xfBO = this.XFBO2;
            this.unPackBuffer = this.xfSimulationBuffer;
        }
    }

    tickLogicCount() {

        this.trajectoryNum = this.ffManager.controller!.lineNum;
        this.segmentNum = this.ffManager.controller!.segmentNum;
        this.isUnsteady = this.ffManager.controller!.isUnsteady;
        this.dropRate = this.ffManager.controller!.dropRate;
        this.dropRateBump = this.ffManager.controller!.dropRateBump;
        this.speedFactor = this.ffManager.controller!.speedFactor;

        this.beginBlock = (this.beginBlock + 1) % this.ffManager.controller!.constraints["MAX_SEGMENT_NUM"];
        this.swap();

        if (this.isUnsteady && (!stm.IsBusy())) {
            this.progressRate = this.timeCount / this.timeLast;
            this.timeCount = this.timeCount + 1;

        }

        this.uboMapBuffer[1] = this.maxSegmentNum;
        this.uboMapBuffer[2] = this.maxSegmentNum * 10;
        this.uboMapBuffer[3] = this.dropRate;
        this.uboMapBuffer[4] = this.dropRateBump;
        this.uboMapBuffer[5] = this.speedFactor * 0.01 * 100;
        this.uboMapBuffer[6] = this.ffManager.controller!.colorScheme;
    }

    tickRender(gl: WebGL2RenderingContext, u_matrix: number[]) {

        this.bindUBO(gl, 0);

        // Pass 1: Simulation
        gl.bindVertexArray(this.sVAO);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.xfBO);
        stm.BindTexture([this.flowFieldTextureInfo[0], this.flowFieldTextureInfo[1], this.seedingTextureInfo[0], this.seedingTextureInfo[1]], [0, 1, 2, 3]);

        this.updateShader!.use();
        this.updateShader!.setVec1i("flowField", [0, 1]);
        this.updateShader!.setVec1i("mask", [2, 3]);
        this.updateShader!.setFloat("randomSeed", Math.random());
        this.updateShader!.setUniformBlock("FlowFieldUniforms", 0);

        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, this.trajectoryNum);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);

        gl.bindVertexArray(null);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

        // Pass 2: Update particle pool
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, this.unPackBuffer);
        stm.UpdateDataByBuffer(this.trajectoryPool, 0, this.textureOffsetArray[this.beginBlock].offsetX, this.textureOffsetArray[this.beginBlock].offsetY, this.maxBlockSize, this.maxBlockSize);
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
        gl.finish();

        // Preparing for right results
        if (this.segmentPrepare > 0) {
            this.segmentPrepare --;
            return;
        }

        // Pass 3: Rendering by trajectorires or points
        gl.bindVertexArray(this.rVAO);
        stm.BindTexture([this.trajectoryPool, this.projTextureInfo], [0, 1]);

        gl.disable(gl.DEPTH_TEST);
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
            this.trajectoryShader!.setFloat("currentSegmentNum", this.segmentNum);
            this.trajectoryShader!.setFloat("fillWidth", this.ffManager.controller!.fillWidth);
            this.trajectoryShader!.setFloat("aaWidth", this.ffManager.controller!.aaWidth);
            this.trajectoryShader!.setFloat2("viewport", gl.canvas.width, gl.canvas.height);
            this.trajectoryShader!.setMat4("u_matrix", u_matrix);
            this.trajectoryShader!.setUniformBlock("FlowFieldUniforms", 0);

            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (this.segmentNum - 1) * 2, this.trajectoryNum);
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

            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.trajectoryNum);
        }

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
        if(!this.ready) {
            console.log("manager not ready !");
            this.map?.triggerRepaint();
            return;
        }

        // rendering
        this.tickLogicCount();
        this.tickRender(gl, u_matrix);
        this.map?.triggerRepaint();

        if (this.ffManager.debug) {
            this.ffManager.stats.update();
            this.debug(gl);
        }
    }

    onRemove(map: Map, gl: WebGL2RenderingContext): void {
        gl.deleteVertexArray(this.renderVAO);
        gl.deleteBuffer(this.UBO);
        stm.Empty();
        this.poolShader!.delete();
        this.pointShader!.delete();
        this.trajectoryShader!.delete();
    }
}


export {
    FlowLayer_Direct
}