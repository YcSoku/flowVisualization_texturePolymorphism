import axios from 'axios';

onmessage = async function(e) {
    switch (e.data[0]) {
        case 0:
            const that = this;
            axios.get(e.data[1], {responseType: "blob"})
            .then((response) => {
                createImageBitmap(response.data, {imageOrientation: e.data[2], premultiplyAlpha: "none", colorSpaceConversion: "default"})
                .then((imageBitmap) => {
                    const bitmap = imageBitmap as ImageBitmap;
                    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
                    const gl = canvas.getContext("webgl2")! as WebGL2RenderingContext;
                    const pixelData = new Uint8Array(bitmap.width * bitmap.height * 4);
    
                    // Create texture
                    const oTexture = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, oTexture);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bitmap.width, bitmap.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    
                    // Create framebuffer
                    const FBO = gl.createFramebuffer();
                    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO);
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, oTexture, 0);
    
                    // Read pixels
                    gl.readPixels(0, 0, bitmap.width, bitmap.height, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);
    
                    // Release objects
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                    gl.deleteFramebuffer(FBO);
                    gl.deleteTexture(oTexture);
                    gl.finish();
                    
                    // Post message
                    that.postMessage(pixelData.buffer);
                });
            })
            .catch((error) => {
                console.log("ERROR::TEXTURE_NOT_LOAD_BY_URL", error.toJSON());
            });
            break;
    
        case 1:

            this.close();
            break;
    }
}