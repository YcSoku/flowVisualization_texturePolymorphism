export class Shader {
    name: string;
    gl: WebGL2RenderingContext|null = null;
    shaderProgram: WebGLProgram | null;

    constructor(gl: WebGL2RenderingContext, name: string, shaderSources: Array<string>, transformFeedbackVaryings?: Array<string>) {
        this.name = name || "";
        this.gl = gl;

        // Create shader program
        const program = gl.createProgram();
        if (!program) {
            console.log("ERROR::Shader program cannot be created!");
            this.shaderProgram = null;
            return;
        }

        // Create and attach shader module to program
        [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].forEach((type, ndx) => {
            const shader = this.createShader(type, shaderSources[ndx]);
            if (!shader) return;
            gl.attachShader(program, shader);
        });

        // Set transform feedback if exists
        if (transformFeedbackVaryings && (transformFeedbackVaryings!).length != 0) {
            gl.transformFeedbackVaryings(
                program, 
                transformFeedbackVaryings!,
                gl.SEPARATE_ATTRIBS
            );
        }

        // Link program
        gl.linkProgram(program);

        // Check if program is built sucessfully
        if (gl.getProgramParameter(program, gl.LINK_STATUS)) {

            this.shaderProgram = program;
        }
        else {
            console.log(gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            this.shaderProgram = null;
        }
        
    }

    createShader(type: number, source: string): WebGLShader | null {
        const shader = this.gl!.createShader(type);
        if (!shader) return null;

        this.gl!.shaderSource(shader, source);
        this.gl!.compileShader(shader);

        if (this.gl!.getShaderParameter(shader, this.gl!.COMPILE_STATUS))
            return shader;
    
        console.log(this.gl!.getShaderInfoLog(shader));
        this.gl!.deleteShader(shader);
        return null;
    }

    use() {
        this.gl!.useProgram(this.shaderProgram);
    }

    setVertexBufferPointer(layout: number, size: number, type: number, normalize: boolean, stride: number, offset: number) {
        this.gl!.enableVertexAttribArray(layout);
        this.gl!.vertexAttribPointer(layout, size, type, normalize, stride, offset);
    }

    setVertexBufferPointer_Instancing(layout: number, size: number, type: number, normalize: boolean, stride: number, offset: number, divisor=1) {
        this.gl!.enableVertexAttribArray(layout);
        this.gl!.vertexAttribPointer(layout, size, type, normalize, stride, offset);
        this.gl!.vertexAttribDivisor(layout, divisor);
    }

    breakVertexBufferLink(layout: number) {
        this.gl!.disableVertexAttribArray(layout);
    }

    setFloat(name: string, value: number) {
        const uniformLocation = this.gl!.getUniformLocation(this.shaderProgram!, name);
        this.gl!.uniform1f(uniformLocation, value);
    }

    setInt(name: string, value: number) {
        const uniformLocation = this.gl!.getUniformLocation(this.shaderProgram!, name);
        this.gl!.uniform1i(uniformLocation, value);
    }

    setVec1i(name: string, vector: Array<number>) {
        const uniformLocation = this.gl!.getUniformLocation(this.shaderProgram!, name);
        this.gl!.uniform1iv(uniformLocation, vector)
    }

    setFloat2(name: string, value1: number, value2: number) {
        const uniformLocation = this.gl!.getUniformLocation(this.shaderProgram!, name);
        this.gl!.uniform2f(uniformLocation, value1, value2);
    }

    setFloat3(name: string, value1: number, value2: number, value3: number) {
        const uniformLocation = this.gl!.getUniformLocation(this.shaderProgram!, name);
        this.gl!.uniform3f(uniformLocation, value1, value2, value3);
    }

    setFloat4(name: string, value1: number, value2: number, value3: number, value4: number) {
        const uniformLocation = this.gl!.getUniformLocation(this.shaderProgram!, name);
        this.gl!.uniform4f(uniformLocation, value1, value2, value3, value4);
    }


    setVec4(name: string, vector: Array<number>) {
        const uniformLocation = this.gl!.getUniformLocation(this.shaderProgram!, name);
        this.gl!.uniform4fv(uniformLocation, vector);
    }

    setMat4(name: string, matrix: number[] | Float32Array) {
        const uniformLocation = this.gl!.getUniformLocation(this.shaderProgram!, name);
        this.gl!.uniformMatrix4fv(uniformLocation, false, matrix);
    }

    setUniformBlock(name: string, blockIndex: number) {
        const uniformLocation = this.gl!.getUniformBlockIndex(this.shaderProgram!, name);
        this.gl!.uniformBlockBinding(this.shaderProgram!, uniformLocation, blockIndex);
    }

    delete() {
        this.gl!.deleteProgram(this.shaderProgram);
        this.gl = null;
    }
}