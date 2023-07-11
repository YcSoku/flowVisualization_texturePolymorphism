onmessage = async function(e) {
    createImageBitmap(e.data[0], {imageOrientation: e.data[1], premultiplyAlpha: "none", colorSpaceConversion: "default"})
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
        gl.flush();
        
        // Post message
        this.postMessage(pixelData.buffer);
    });
}