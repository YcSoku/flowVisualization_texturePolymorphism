import { ScratchDataFormat } from '../../../platform/dataFormat';
import type {TextureView, TextureViewInfo} from '../../../platform/WebGL2/texture/textureView';
import { TextureManager } from '../../../core/texture/textureManager';
import axios from 'axios';
import {Shader} from '../../../platform/WebGL2/shader/shader';

let particleSystem: ParticleSystem;
let canvas : OffscreenCanvas;
let gl: WebGL2RenderingContext;
const stf = ScratchDataFormat;
const stm = TextureManager.Create(200, 16, 200);

// Create random positions
const rand = (min: number, max?: number) => {

    if (!max) {
        max = min;
        min = 0;
    }
    return Math.random() * (max - min) + min;
};

async function loadShader_url(gl: WebGL2RenderingContext, name: string, vertexUrl: string, fragmentUrl: string, transformFeedbackVaryings?: Array<string>) : Promise<Shader>{

    const vertexSource = await axios.get(vertexUrl)
    .then((response) => {
        return response.data;
    });
    const fragmentSource = await axios.get(fragmentUrl)
    .then((response) => {
        return response.data;
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

class ParticleSystem {

    private simulationVAO: WebGLVertexArrayObject = 0;
    private simulationVAO2: WebGLVertexArrayObject = 0;
    private XFBO: WebGLTransformFeedback = 0;
    private XFBO2: WebGLTransformFeedback = 0;
    private sVAO: WebGLVertexArrayObject = 0;
    private xfBO: WebGLTransformFeedback = 0;

    private simulationBuffer: WebGLBuffer = 0;
    private lifeBuffer: WebGLBuffer = 0;
    private xfSimulationBuffer: WebGLBuffer = 0;
    private xfLifeBuffer: WebGLBuffer = 0;
    private unPackBuffer: WebGLBuffer = 0;
    private lifeDataBuffer: WebGLBuffer = 0;
    private UBO: WebGLBuffer = 0;

    private updateShader: Shader | null;

    public _jump = false;

    // Render variable
    public beginBlock = -1.0;
    private streamline = 262144;
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
    public isSuspended = false;

    public u_matrix: number[];
    public terminate = false;

    public particleMapBuffer: Float32Array;
    public aliveIndexData: Float32Array;
    public lifeData: Float32Array;

    public aliveLineNum = 0.0;
    public lineNum = 65536 * 4;
    public segmentNum = 16;
    public fullLife = this.segmentNum * 10;
    public maxLineNum = this.lineNum;
    public _progressRate = 0.0;
    public speedFactor = 2.0;
    public dropRate = 0.003;
    public dropRateBump = 0.001;
    public fillWidth = 1.0;
    public aaWidth = 1.0;
    public zoomRate = 1.0;
    public primitive = "trajectory"
    public isSteady = false;

    constructor() {
        this.updateShader = null;

        this.flowBoundary = [];
        this.u_matrix = [];

        this.uboMapBuffer = new Float32Array(12);
        this.lifeData = new Float32Array(0);
        this.aliveIndexData = new Float32Array(0);
        this.particleMapBuffer = new Float32Array(0);
    }

    static Create() {

        const ffManager = new ParticleSystem();
        return ffManager;
    }

    async ResourceFileParsing(parser: any) {

        // Get boundaries of flow speed
        this.flowBoundary = parser.flowBoundary;

        // Set uniform buffer object data (something will not change)
        this.uboMapBuffer[8] = this.flowBoundary[0];
        this.uboMapBuffer[9] = this.flowBoundary[1];
        this.uboMapBuffer[10] = this.flowBoundary[2];
        this.uboMapBuffer[11] = this.flowBoundary[3];
 
        // Prepare descriptive variables
        this.maxLineNum = parser.maxTrajectoryNum;
        this.segmentNum = parser.maxSegmentNum;
        this.maxBlockSize = Math.ceil(Math.sqrt(this.maxLineNum));
        this.flowFieldTextureSize = parser.flowFieldTextureSize;
        this.seedingTextureSize = parser.seedingTextureSize;

        // Load textures of flow fields
        this.flowFieldResourceArray = parser.flowFieldResourceArray;
        this.seedingResourceArray = parser.seedingResourceArray;
    }

    async resourcePrepare() {

    }

    async Prepare() {
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

        this.phaseCount = this.flowFieldResourceArray.length; // the last one is a phase from the end to the head
        this.timeLast = this.phaseCount * 30; // 300 frame per timePoint
        this.textureArraySize = 3;
        for (let i = 0; i < this.textureArraySize; i++) {

            const fID = stm.SetTexture(stm.AddTextureView(f32TextureViewInfo), lSampler);
            this.flowfieldTextureArray[i] = fID;
            await stm.FillTextureDataByImage(fID, 0, this.flowFieldResourceArray[i], this.flowFieldTextureSize[0], this.flowFieldTextureSize[1]);

            // Load textures of seeding masks
            const sID = stm.SetTexture(stm.AddTextureView(textureViewInfo), nSampler);
            this.seedingTextureArray[i] = sID;
            await stm.FillTextureDataByImage(sID, 0, this.seedingResourceArray[i], this.seedingTextureSize[0], this.seedingTextureSize[1]);
        }

        // Set data of particle block used to fill simulation buffer and particle pool texture
        this.particleMapBuffer = new Float32Array(this.maxBlockSize * this.maxBlockSize * 3).fill(0);
        for (let i = 0; i < this.maxLineNum; i++) {
            this.particleMapBuffer[i * 3 + 0] = rand(0, 1.0);
            this.particleMapBuffer[i * 3 + 1] = rand(0, 1.0);
            this.particleMapBuffer[i * 3 + 2] = 0.0;
        }

        // Set life for particles
        const particleCountdownArray = new Float32Array(this.maxLineNum);
        for (let i = 0; i < this.maxLineNum; i++) {
            particleCountdownArray[i] = this.fullLife;
        }

        // Set worker message containers
        this.lifeData = new Float32Array(this.maxLineNum);
        this.aliveIndexData = new Float32Array(this.maxLineNum);

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

        // Build Shaders
        this.updateShader = await loadShader_url(gl, "update", "/shaders/update.vert", "/shaders/update.frag", ['newInfo', 'aliveTime'])!;
    }

    resourceLoad(texturePoint: number, timePoint: number) {
        // console.log(timePoint % this.flowFieldResourceArray.length)
        stm.UpdateDataByImage(this.flowfieldTextureArray[texturePoint], this.flowFieldResourceArray[timePoint], 0);
        stm.UpdateDataByImage(this.seedingTextureArray[texturePoint], this.seedingResourceArray[timePoint], 0);
        gl.finish();
    }

    set timeCount(value: number) {
        this._timeCount = value % this.timeLast;
    }

    get timeCount() {
        return this._timeCount;
    }

    set progressRate(value: number) {
        if (stm.IsBusy()) {
            return;
        }

        const lastPhase = Math.floor(this._progressRate * this.phaseCount);
        const currentPhase =  Math.floor(value * this.phaseCount);
        const nextPhase = (currentPhase + 1) % this.phaseCount;
        this._progressRate = value;
        
        // Update texture for nextPhase
        if (currentPhase != lastPhase) {
            this.resourceLoad((nextPhase + 1) % this.textureArraySize, (nextPhase + 1) % this.phaseCount);
        }
        else {
            if (this.isSteady)
                this.timeCount += 1;
        }
    }

    getFieldTextures(progressRate: number) {

        const currentPhase = Math.floor(progressRate * this.phaseCount);
        return [this.flowfieldTextureArray[currentPhase % this.textureArraySize], this.flowfieldTextureArray[(currentPhase + 1) % this.textureArraySize]];
    }

    getMaskTextures(progressRate: number) {

        const currentPhase = Math.floor(progressRate * this.phaseCount);
        return [this.seedingTextureArray[currentPhase % this.textureArraySize], this.seedingTextureArray[(currentPhase + 1) % this.textureArraySize]];
    }

    getProgressBetweenTexture(progressRate: number) {

        const progress = progressRate * this.phaseCount;
        return progress - Math.floor(progress);
    }

    bindUBO(gl: WebGL2RenderingContext, bindingPointIndex: number) {
        gl.bindBuffer(gl.UNIFORM_BUFFER, this.UBO);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.uboMapBuffer);
        gl.bindBufferRange(gl.UNIFORM_BUFFER, bindingPointIndex, this.UBO, 0, this.uboMapBuffer.length * 4.0);
    }

    async swap() {
        if (this.beginBlock % 2 == 0)
        {
            this.sVAO = this.simulationVAO;
            this.xfBO = this.XFBO;
            this.unPackBuffer = this.simulationBuffer;
            this.lifeDataBuffer = this.lifeBuffer;
        } else {
            this.sVAO = this.simulationVAO2;
            this.xfBO = this.XFBO2;
            this.unPackBuffer = this.xfSimulationBuffer;
            this.lifeDataBuffer = this.xfLifeBuffer;
        }

        this.flowFieldTextureInfo = this.getFieldTextures(this._progressRate);
        this.seedingTextureInfo = this.getMaskTextures(this._progressRate);
    }

    tickLogicCount() {

        this.progressRate = this.timeCount / this.timeLast;
        this.beginBlock = (this.beginBlock + 1) % this.segmentNum;
        this.swap();

        this.uboMapBuffer[0] = this.getProgressBetweenTexture(this._progressRate);
        this.uboMapBuffer[1] = this.segmentNum;
        this.uboMapBuffer[2] = this.segmentNum * 10;
        this.uboMapBuffer[3] = this.dropRate;
        this.uboMapBuffer[4] = this.dropRateBump;
        this.uboMapBuffer[5] = this.speedFactor * 0.01 * 100;
        
        this.streamline = this.lineNum;
    }

    tickRender(deltaTime = 0) {
        
        this.bindUBO(gl, 0);

        // Pass 1 - Operation 1: Simulation
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
        gl.drawArrays(gl.POINTS, 0, this.streamline);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);

        gl.bindVertexArray(null);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

        // Pass 1 - Operation 2: Get simulation data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.unPackBuffer);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, this.particleMapBuffer, 0, this.particleMapBuffer.length);

        // Pass 1 - Operation 3: Get life data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lifeDataBuffer);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, this.lifeData, 0, this.lineNum);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        gl.finish();

        // Pass 1 - Operation 4: Get alive data
        this.aliveLineNum = 0;
        if (this.primitive == "trajectory") {
            for (let i = 0; i < this.lineNum; i++) {
                if (this.lifeData[i] < this.segmentNum * 10) {
                    this.aliveIndexData[this.aliveLineNum] = i;
                    this.aliveLineNum += 1;
                }
            }
        }
        else {
            for (let i = 0; i < this.lineNum; i++) {
                if (this.lifeData[i] < this.segmentNum * 9) {
                    this.aliveIndexData[this.aliveLineNum] = i;
                    this.aliveLineNum += 1;
                }
            }
        }
    }
}

/////////////////////////////
/////////////////////////////
/////////////////////////////
particleSystem = ParticleSystem.Create();
onmessage = async function(e) {
    switch (e.data[0]) {
        case -1:
            await particleSystem.ResourceFileParsing(e.data[1]);
            this.postMessage([-1]);
            break;
        case 0:
            canvas  = new OffscreenCanvas(0, 0);
            gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
            const available_extensions = gl.getSupportedExtensions()!;
            for (const extension of available_extensions)
            {
                gl.getExtension(extension);
            }
            stm.SetContext(gl);
            await particleSystem.Prepare();
            this.postMessage([0]);
            break;
        case 1:
            if (particleSystem.isSuspended) {
                break;
            }
            particleSystem.tickLogicCount();
            particleSystem.tickRender();
            this.postMessage([1, particleSystem.beginBlock, particleSystem.particleMapBuffer, particleSystem.aliveLineNum, particleSystem.aliveIndexData]);
            break;
        case 2:
            particleSystem.lineNum = e.data[1].lineNum;
            particleSystem.fullLife = e.data[1].fullLife;
            particleSystem.speedFactor = e.data[1].speedFactor;
            particleSystem.dropRate = e.data[1].dropRate;
            particleSystem.dropRateBump = e.data[1].dropRateBump;
            particleSystem.fillWidth = e.data[1].fillWidth;
            particleSystem.aaWidth = e.data[1].aaWidth;
            particleSystem.primitive = e.data[1].primitive;
            particleSystem.isSteady = e.data[1].isSteady;
            break;
        case 3:
            particleSystem.progressRate = e.data[1];
            particleSystem._jump = true;
            break;
        case 4:
            particleSystem.isSuspended = e.data[1];
    }

}