// Data Size Constraints
export interface FlowFieldConstraints {
    MAX_TEXTURE_SIZE: number;
    MAX_STREAMLINE_NUM: number;
    MAX_SEGMENT_NUM: number;
    MAX_DORP_RATE: number;
    MAX_DORP_RATE_BUMP: number;

    [name: string]: number;
}
export class FlowFieldController {
    lineNum: number;
    segmentNum: number;
    fullLife: number;
    progressRate: number;
    speedFactor: number;
    dropRate: number;
    dropRateBump: number;
    fillWidth: number;
    aaWidth: number;
    colorScheme: number;
    isSteady: boolean;
    content: string;
    primitive: string;
    platform: string;

    constraints: FlowFieldConstraints;
    
    constructor(constraints?: FlowFieldConstraints) {
        this.lineNum = 65536 * 4;
        this.segmentNum = 16;
        this.fullLife = this.segmentNum * 10;
        this.progressRate = 0.0;
        this.speedFactor = 2.0;
        this.dropRate = 0.003;
        this.dropRateBump = 0.001;
        this.fillWidth = 1.0;
        this.aaWidth = 1.0;
        this.colorScheme = 0;
        this.isSteady = false;
        this.content = "none";
        this.primitive = "trajectory"
        this.platform = "none";

        this["lineNum"] = this.lineNum;

        if (constraints) {
            this.constraints = constraints;
        } else {
            this.constraints = {
                MAX_TEXTURE_SIZE: 0.0,
                MAX_STREAMLINE_NUM: 0.0,
                MAX_SEGMENT_NUM: 0.0,
                MAX_DORP_RATE: 0.0,
                MAX_DORP_RATE_BUMP: 0.0
            }
        }
    }

    Create(constraints: FlowFieldConstraints) {
        return new FlowFieldController(constraints);
    }
}