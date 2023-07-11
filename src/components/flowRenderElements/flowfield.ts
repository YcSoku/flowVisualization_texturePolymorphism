import axios from 'axios';
import Worker from "../geoScratch/function/framework/component/simulateParticle.worker?worker";
import { FlowFieldController, type FlowFieldConstraints } from '../geoScratch/function/framework/component/flowfieldController';
import { GUI } from 'dat.gui';
import { FlowLayer } from '@/components/flowRenderElements/flowLayer';
import { GetMap } from '@/components/flowRenderElements/customLayer';
import * as Cesium from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";
import { FlowFieldPrimitive } from '@/components/flowRenderElements/flowPrimitive';

// The URL on your server where CesiumJS's static files are hosted.
(window as unknown as any).CESIUM_BASE_URL = '/Cesium/';
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiMDI3MWQ0ZS1jYWEzLTQ3NDAtYjFjNS1jN2E3MTQ0NjExY2QiLCJpZCI6MTI5MTI0LCJpYXQiOjE2NzkwMjE4MzJ9.rDh09EkzwIQCcU2xy3AWuWz89xpadqI5Bb52pzAoTYg';

class DescriptionParser {
    private url = "";

    public flowFieldResourceArray: Array<string> = [];
    public seedingResourceArray: Array<string> = [];
    public transform2DResource = "";
    public transform3DResource = "";
    public maxDropRate = 0.0;
    public maxDropRateBump = 0.0;
    public maxSegmentNum = 0.0;
    public maxTrajectoryNum = 0.0;
    public maxTextureSize = 0.0;
    public extent = [0.0, 0.0, 0.0, 0.0];
    public flowBoundary = [0.0, 0.0, 0.0, 0.0];
    public flowFieldTextureSize = [0.0, 0.0];
    public seedingTextureSize = [0.0, 0.0];
    public transformTextureSize = [0.0, 0.0];

    constructor(descriptionUrl: string) {
        this.url = descriptionUrl;
    }

    async Parsing() {

        await axios.get(this.url)
        .then(async (response) => {
            this.flowBoundary[0] = response.data["flow_boundary"]["u_min"];
            this.flowBoundary[1] = response.data["flow_boundary"]["v_min"];
            this.flowBoundary[2] = response.data["flow_boundary"]["u_max"];
            this.flowBoundary[3] = response.data["flow_boundary"]["v_max"];

            this.maxTextureSize = response.data["constraints"]["max_texture_size"],
            this.maxTrajectoryNum = response.data["constraints"]["max_streamline_num"],
            this.maxSegmentNum = response.data["constraints"]["max_segment_num"],
            this.maxDropRate = response.data["constraints"]["max_drop_rate"],
            this.maxDropRateBump = response.data["constraints"]["max_drop_rate_bump"]

            this.extent[0] = response.data["extent"][0];
            this.extent[1] = response.data["extent"][1];
            this.extent[2] = response.data["extent"][2];
            this.extent[3] = response.data["extent"][3];

            for (const url of response.data["flow_fields"]) {
                this.flowFieldResourceArray.push(url);
            }
            this.flowFieldTextureSize[0] = response.data["texture_size"]["flow_field"][0];
            this.flowFieldTextureSize[1] = response.data["texture_size"]["flow_field"][1];

            for (const url of response.data["area_masks"]) {
                this.seedingResourceArray.push(url);
            }
            this.seedingTextureSize[0] = response.data["texture_size"]["area_mask"][0];
            this.seedingTextureSize[1] = response.data["texture_size"]["area_mask"][1];

            this.transform2DResource = response.data["projection"]["2D"];
            this.transform3DResource = response.data["projection"]["3D"];
            this.transformTextureSize[0] = response.data["texture_size"]["projection"][0];
            this.transformTextureSize[1] = response.data["texture_size"]["projection"][1];

        });
    }

}

export class FlowFieldManager {

    public parser: DescriptionParser;

    public aliveWorker: Worker;
    public zoomRate = 1.0;
    public workerOK = false;
    public workerParserOK = false;
    public _updateWorkerSetting = true;
    public _updateProgress = false;
    public controller: FlowFieldController | null;

    public effectElement: any;
    public platform: any;

    public stats: any;
    private platformIndex = 0;
    public isSuspended = false;

    public debug = false;

    constructor(descriptionUrl: string, stats?: any) {

        this.parser = new DescriptionParser(descriptionUrl);
        this.controller = null;

        this.stats = stats ? stats : null;
        this.aliveWorker = new Worker();
    }

    set updateWorkerSetting(value: boolean) {

        if (value) {
            this.aliveWorker.postMessage([2, this.controller!]);
            this._updateWorkerSetting = false;
        }
    }

    set updateProgress(value: boolean) {

        if (value) {
            this.aliveWorker.postMessage([3, this.controller!.progressRate]);
            this._updateProgress = false;
        }
    }

    static async Create(descriptionUrl: string, stats?: any) {

        const ffManager = new FlowFieldManager(descriptionUrl, stats);
        await ffManager.parser.Parsing();

        // Get constraints
        const constraints: FlowFieldConstraints = {
            MAX_TEXTURE_SIZE: ffManager.parser.maxTextureSize,
            MAX_STREAMLINE_NUM: ffManager.parser.maxTrajectoryNum,
            MAX_SEGMENT_NUM: ffManager.parser.maxSegmentNum,
            MAX_DORP_RATE: ffManager.parser.maxDropRate,
            MAX_DORP_RATE_BUMP: ffManager.parser.maxDropRateBump
        }
        ffManager.controller = new FlowFieldController(constraints)!;

        // Set UI
        ffManager.UIControllerSetting();

        // Activate worker
        ffManager.aliveWorker.postMessage([-1, ffManager.parser]);
        ffManager.aliveWorker.postMessage([0]);
        ffManager.aliveWorker.onmessage = function(e) {
            switch (e.data[0]) {
                case -1:
                    ffManager.workerParserOK = true;
                    break;
                case 0:
                    ffManager.workerOK = true;
                    break;
                case 1:
                    if (ffManager.isSuspended) return;
                    ffManager.effectElement.GPUMemoryUpdate(e.data[1], e.data[2], e.data[3], e.data[4]);
                    ffManager.effectElement.needSimulate = true;
                    break;
            }
        }

        return ffManager;
    }

    UIControllerSetting() {

        const ffController = this.controller! as any;
        
        const MAX_TEXTURE_SIZE = ffController.constraints["MAX_TEXTURE_SIZE"];
        const MAX_STREAMLINE_NUM = ffController.constraints["MAX_STREAMLINE_NUM"];
        const MAX_SEGMENT_NUM = ffController.constraints["MAX_SEGMENT_NUM"];
        const MAX_DORP_RATE = ffController.constraints["MAX_DORP_RATE"];
        const MAX_DORP_RATE_BUMP = ffController.constraints["MAX_DORP_RATE_BUMP"];

        // Initialize the GUI
        const gui = new GUI;
        const ffFolder = gui.addFolder('Flow Fields');
        ffFolder.add(ffController, 'isSteady', false).onChange(()=>{this.updateWorkerSetting = true});
        ffFolder.add(ffController, 'progressRate', 0.0, 1.0, 0.001).onChange(()=>{this.updateProgress = true});
        ffFolder.add(ffController, 'speedFactor', 0.0, 10.0, 0.001).onChange(()=>{this.updateWorkerSetting = true});
        ffFolder.add(ffController, 'dropRate', 0.0, MAX_DORP_RATE, 0.001).onChange(()=>{this.updateWorkerSetting = true});
        ffFolder.add(ffController, 'dropRateBump', 0.0, MAX_DORP_RATE_BUMP, 0.001).onChange(()=>{this.updateWorkerSetting = true});
        ffFolder.open();
        const slFolder = gui.addFolder('Trajectory');
        slFolder.add(ffController, 'lineNum', 1, MAX_STREAMLINE_NUM, 1.0).onChange(()=>{this.updateWorkerSetting = true});
        slFolder.add(ffController, 'segmentNum', 1, MAX_SEGMENT_NUM, 1.0).onChange(()=>{this.updateWorkerSetting = true});
        slFolder.add(ffController, 'fillWidth', 0.0, 30.0, 0.001).onChange(()=>{this.updateWorkerSetting = true});
        slFolder.add(ffController, 'aaWidth', 0.0, 30.0, 0.001).onChange(()=>{this.updateWorkerSetting = true});
        slFolder.open();
        const contentFolder = gui.addFolder('Rendering content');
        // contentFolder.add(ffController, 'content', ["none", "particle pool"]).onChange(()=>{this.updateWorkerSetting = true});
        contentFolder.add(ffController, 'colorScheme', [0, 1, 2]).onChange(()=>{this.updateWorkerSetting = true});
        contentFolder.add(ffController, 'primitive', ["trajectory", "point"]).onChange(()=>{this.updateWorkerSetting = true});
        contentFolder.open();
        const platformFolder = gui.addFolder("Platform");
        platformFolder.add(ffController, 'platform', ["none", "mapbox", "cesium"]).onChange(()=>{
            switch (this.controller!.platform) {
                case "none":
                    this.aliveWorker.postMessage([4, true]);
                    this.isSuspended = true;
                    if (this.platformIndex == 1)
                        this.DestroyMap();
                    else if (this.platformIndex == 2)
                        this.DestroyGlobe();
                    this.platformIndex = 0;
                    break;

                case "mapbox":
                    this.aliveWorker.postMessage([4, true]);
                    this.isSuspended = true;
                    if (this.platformIndex == 2)
                        this.DestroyGlobe();
                    this.platformIndex = 1;
                    this.InitMap();
                    break;

                case "cesium":
                    this.aliveWorker.postMessage([4, true]);
                    this.isSuspended = true;
                    if (this.platformIndex == 1)
                        this.DestroyMap();
                    this.platformIndex = 2;
                    this.InitGlobe();
                    break;
            }
        });
        platformFolder.open();
        
    }

    ExportAsLayer() {
        this.effectElement = new FlowLayer("flow", "2d", this);
        return this.effectElement;
    }

    ExportAsPrimitive(scene: any) {
        this.effectElement = new FlowFieldPrimitive(this);
        this.effectElement.scene = scene;
        return this.effectElement;
    }

    InitMap() {
        // Initialize map
        this.platform = GetMap(
            "pk.eyJ1IjoieWNzb2t1IiwiYSI6ImNrenozdWdodDAza3EzY3BtdHh4cm5pangifQ.ZigfygDi2bK4HXY1pWh-wg",
            {
                container: "playground",
                style: "mapbox://styles/ycsoku/cldjl0d2m000501qlpmmex490", // style URL
                center: [120.980697, 31.684162], // starting position [lng, lat]
                zoom: 9,
                antialias: true,
                useWebGL2: true,
                projection: "mercator",
                attributionControl: false
            }
        );

        this.platform.on("load", () => {
            this.platform.addLayer(this.ExportAsLayer());
        });
    }

    DestroyMap() {
        
        if (this.platform.getLayer("flow")) this.platform.removeLayer("flow");
        this.platform.remove();
        this.platform = null;
    }

    InitGlobe() {

        // Initialize the Cesium Viewer in the HTML element with the "cesiumContainer" ID.
        this.platform = new Cesium.Viewer('playground', {
            msaaSamples: 2,
            requestRenderMode : true,
            maximumRenderTimeChange : Infinity,
            // terrainProvider: Cesium.createWorldTerrain(),
            });

        this.platform.scene.primitives.add(this.ExportAsPrimitive(this.platform.scene));
        if (this.debug)
            this.platform.scene.debugShowFramesPerSecond = true;
        
        var iframe = document.getElementsByClassName("cesium-infoBox-iframe")[0];
        iframe.setAttribute("sandbox", "allow-same-origin allow-scripts allow-popups allow-forms");
        iframe.setAttribute("src", ""); //必须设置src为空 否则不会生效。  

        // Set globe
        // viewer.scene.globe.show = false; 
        this.platform.scene.globe.depthTestAgainstTerrain = true;
        

        // Set the camera to bt the given longitude, latitude, and height.
        this.platform.camera.setView({
            destination : Cesium.Cartesian3.fromDegrees(120.980697, 31.684162, 400000),
            orientation : {
                    heading : Cesium.Math.toRadians(0.0),
                    pitch : Cesium.Math.toRadians(-90.0),
                }
        });
    }

    DestroyGlobe() {
        this.platform.entities.removeAll();
        this.platform.destroy();
    }
}

export { FlowFieldController };
