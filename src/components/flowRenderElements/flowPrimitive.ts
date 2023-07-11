import * as Cesium from 'cesium';
import { ScratchDataFormat } from '../geoScratch/platform/dataFormat';
import { textureManager } from '../geoScratch/core/managers';
import axios from 'axios';
import { FlowFieldController, type FlowFieldConstraints } from '../geoScratch/function/framework/component/flowfieldController';
import pixelWorker from "../geoScratch/platform/WebGL2/texture/readPixels.worker?worker";
import type { FlowFieldManager } from './flowfield';

const stf = ScratchDataFormat;
const stm = textureManager;

async function loadShader_url(context: any, vertexUrl: string, fragmentUrl: string) {

    const vertexSource = await axios.get(vertexUrl)
    .then((response) => {
        return response.data;
    });
    const fragmentSource = await axios.get(fragmentUrl)
    .then((response) => {
        return response.data;
    });

    return (Cesium as any).ShaderProgram.fromCache({
                                                    context: context,
                                                    vertexShaderSource: vertexSource,
                                                    fragmentShaderSource: fragmentSource,
                                                    attributeLocations: {"isAlive": 1}
                                                });
}
interface TextureOffset {

    offsetX: number;
    offsetY: number;
}

export class FlowFieldPrimitive {

    private uboMapBuffer: Float32Array;

    private maxBlockSize: number;
    private maxBlockColumn: number;
    private flowBoundary: Array<number>;
    private textureOffsetArray: Array<TextureOffset>;
    private ready = false;

    // Render variable
    private beginBlock = 0.0;
    private aliveLineNum = 0.0;
    private segmentNum = 0.0;

    /////
    public scene: any;
    private context: any;
    private preparing = false;
    private trajectoryPool: any;
    private transformTexture: any;
    private trajectoryShader: any;
    private pointShader: any;
    private drawCommand: any;
    private trajectoryIndexBuffer: any;
    private renderVAO: any;
    private uniformMap: any;
    private renderState: any;

    public zoomRate = 1.0;
    public workerPreparing = false;
    public updateWorkerSetting = true;
    public segmentPrepare = 0;
    public isSuspended = false;

constructor(public ffManager: FlowFieldManager, scene?: any) {

        this.scene = scene;
        
        this.maxBlockSize = 0.0;
        this.maxBlockColumn = 0.0;
        this.textureOffsetArray = [];
        this.flowBoundary = [];
        this.uboMapBuffer = new Float32Array(12);
    }

    async LoadTransformTexture(url: string, width: number, height: number) {

        const that = this;
        const worker = new pixelWorker();

        await axios.get(url, {responseType: "blob"})
        .then(async (response) => {

            worker.postMessage([response.data, "flipY"]);
            worker.onmessage = function(e) {

                that.transformTexture = new (Cesium as any).Texture({
                    context: that.context,
                    width: width,
                    height: height,
                    source: {
                        width: width,
                        height: height,
                        arrayBufferView: new Float32Array(e.data)
                    },
                    pixelFormat: (Cesium.PixelFormat as any).RGB,
                    pixelDatatype: Cesium.PixelDatatype.FLOAT,
                    flipY: false,
                    sampler: new (Cesium as any).Sampler({
                        minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
                        magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR
                    })
                });
                that.preparing = false;
                worker.terminate();
            }
        });
    }

    async Prepare(frameState: any) {
        this.preparing = true;
        this.context = frameState.context;
        const that = this;

        // Set worker
        if (!this.ffManager.workerOK)
            this.ffManager.aliveWorker.postMessage([0]);

        // Get boundaries of flow speed
        this.flowBoundary = this.ffManager.parser.flowBoundary;

        // Set uniform buffer object data (something will not change)
        this.uboMapBuffer[8] = this.flowBoundary[0];
        this.uboMapBuffer[9] = this.flowBoundary[1];
        this.uboMapBuffer[10] = this.flowBoundary[2];
        this.uboMapBuffer[11] = this.flowBoundary[3];
        this.segmentNum = this.ffManager.controller!.segmentNum;
        this.aliveLineNum = 0;

        // Load texture of projection
        await this.LoadTransformTexture(this.ffManager.parser.transform3DResource, 1024, 2048);

        // Prepare descriptive variables
        const MAX_TEXTURE_SIZE = this.ffManager.controller!.constraints["MAX_TEXTURE_SIZE"];
        const MAX_STREAMLINE_NUM = this.ffManager.controller!.constraints["MAX_STREAMLINE_NUM"];
        const MAX_SEGMENT_NUM = this.ffManager.controller!.constraints["MAX_SEGMENT_NUM"];

        this.segmentPrepare = MAX_SEGMENT_NUM;
        this.maxBlockSize = Math.ceil(Math.sqrt(MAX_STREAMLINE_NUM))
        this.maxBlockColumn =  Math.floor(MAX_TEXTURE_SIZE / this.maxBlockSize);
        for (let i = 0; i < MAX_SEGMENT_NUM; i++) {
            const offset: TextureOffset = {
                offsetX: (i % this.maxBlockColumn) * this.maxBlockSize,
                offsetY: Math.floor(i / this.maxBlockColumn) * this.maxBlockSize
            };

            this.textureOffsetArray.push(offset);
        }

        // Set buffer used for visual effects
        this.trajectoryIndexBuffer = (Cesium as any).Buffer.createVertexBuffer({
            context: this.context,
            usage: (Cesium as any).BufferUsage.DYNAMIC_DRAW,
            typedArray: new Float32Array(MAX_STREAMLINE_NUM),
        })

        // Set particle pool
        this.trajectoryPool = new (Cesium as any).Texture({
            context: this.context,
            width: MAX_TEXTURE_SIZE,
            height: MAX_TEXTURE_SIZE,
            pixelFormat: Cesium.PixelFormat.RGB,
            pixelDatatype: Cesium.PixelDatatype.FLOAT,
            flipY: false,
            sampler: new (Cesium as any).Sampler({
                                        minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
                                        magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST
                                    })
        });

        // Set Vertex Array Object
        this.renderVAO = new (Cesium as any).VertexArray({
            context: this.context,
            attributes: [{
                index: 1,
                enabled: true,
                vertexBuffer: this.trajectoryIndexBuffer,
                componentsPerAttribute: 1,
                componentDatatype: Cesium.ComponentDatatype.FLOAT,
                normalize: false,
                offseInBytes: 0,
                strideInByes: (Cesium.ComponentDatatype as any).getSizeInBytes(Cesium.ComponentDatatype.FLOAT),
                instanceDivisor: 1
            }]
        })

        // Make uniform map
        this.uniformMap = {
            projectionTexture() {
                return that.transformTexture;
            },
            particlePool() {
                return that.trajectoryPool;
            },
            segmentNum() {
                return that.ffManager.controller!.segmentNum;
            },
            blockNum() {
                return that.ffManager.controller!.constraints["MAX_SEGMENT_NUM"];
            },
            beginBlock() {
                return that.beginBlock;
            },
            blockSize() {
                return that.maxBlockSize;
            },
            fillWidth() {
                return that.ffManager.controller!.fillWidth;
            },
            aaWidth() {
                return that.ffManager.controller!.aaWidth;
            },
            viewport() {
                return new Cesium.Cartesian2(that.context._canvas.width, that.context._canvas.height);
            },
            colorScheme() {
                return that.ffManager.controller!.colorScheme;
            }
        }

        this.trajectoryShader = await loadShader_url(this.context,"/shaders/ribbonParticle_3D.trajectory.vert", "/shaders/ribbonParticle_3D.trajectory.frag");
        this.pointShader = await loadShader_url(this.context,"/shaders/ribbonParticle_3D.point.vert", "/shaders/ribbonParticle_3D.point.frag");

        this.renderState = (Cesium as any).RenderState.fromCache({
            cull: {
                enabled: true,
                face: Cesium.CullFace.BACK
            },
            depthTest: {
                enabled: false
            },

            blending: {
                enabled: true,
                equationRgb: Cesium.BlendEquation.ADD,
                equationAlpha: Cesium.BlendEquation.ADD,
                functionSourceRgb: Cesium.BlendFunction.ONE,
                functionSourceAlpha: Cesium.BlendFunction.ONE,
                functionDestinationRgb: Cesium.BlendFunction.ONE_MINUS_SOURCE_ALPHA,
                functionDestinationAlpha: Cesium.BlendFunction.ONE_MINUS_SOURCE_ALPHA,
            }
        });

        this.ffManager.aliveWorker.postMessage([4, false]);
        this.ffManager.isSuspended = false;

        this.drawCommand = new (Cesium as any).DrawCommand({
            vertexArray: that.renderVAO,
            instanceCount: that.aliveLineNum,
            primitiveType: Cesium.PrimitiveType.TRIANGLE_STRIP,
            uniformMap: that.uniformMap,
            renderState: that.renderState,
            pass: (Cesium as any).Pass.OPAQUE
        });

        this.ffManager.aliveWorker.postMessage([1]);
        return true;
    }

    async update(frameState: any) {
        if (this.preparing)
            return;

        if (!this.drawCommand ) {
            this.ready = await this.Prepare(frameState);
            return;
        }

        if (this.segmentPrepare >= 0) {
            return;
        }

        this.drawCommand.instanceCount = this.aliveLineNum;

        if (this.ffManager.controller?.primitive == "trajectory") {
            this.drawCommand.count = (this.segmentNum - 1) * 2;
            this.drawCommand.shaderProgram = this.trajectoryShader;
        }
        else {
            this.drawCommand.count = 4;
            this.drawCommand.shaderProgram = this.pointShader;
        }
        
        frameState.commandList.push(this.drawCommand);

        if (this.ffManager.debug) {
            this.ffManager.stats.update();
        }
    }

    destroy() {
        this.trajectoryPool.destroy();
        this.transformTexture.destroy();
        this.renderVAO.destroy();
        this.pointShader.destroy();
        this.trajectoryShader.destroy();
    }

    GPUMemoryUpdate(beginBlock: number, trajectoryBlock: Float32Array, aliveLineNum: number, trajectoryBuffer: Float32Array) {

        this.beginBlock = beginBlock;
        this.aliveLineNum = aliveLineNum;

        this.trajectoryPool.copyFrom({
            xOffset: this.textureOffsetArray[this.beginBlock].offsetX,
            yOffset: this.textureOffsetArray[this.beginBlock].offsetY,
            source: {
                width: this.maxBlockSize,
                height: this.maxBlockSize,
                arrayBufferView: trajectoryBlock
            }
        });

        this.trajectoryIndexBuffer.copyFromArrayView(trajectoryBuffer, 0);

        this.ffManager.aliveWorker.postMessage([1]);
        this.scene.requestRender();
        this.segmentPrepare--;
    }
}