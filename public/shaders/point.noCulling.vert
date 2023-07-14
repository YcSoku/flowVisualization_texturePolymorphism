#version 300 es
precision highp float;

layout (location = 0) in float isAlive;

layout (std140) uniform FlowFieldUniforms
{
    float progress;
    float segmentNum;
    float fullLife;
    float dropRate;
    float dropRateBump;
    float speedFactor;
    float colorScheme;
    vec4 flowBoundary;
};

uniform sampler2D particlePool;
uniform sampler2D projectionTexture;
uniform int blockNum;
uniform int beginBlock;
uniform int blockSize;
uniform float currentSegmentNum;
uniform float fillWidth;
uniform float aaWidth;
uniform vec2 viewport;
uniform mat4 u_matrix;

out struct Stream_line_setting 
{
    float edgeParam;
    float alphaDegree;
    float velocity; // a percentage
    float isDiscarded;
    vec2 uv;
} sls;

vec2 box[4] = vec2[](
    vec2(0.0, 0.0),
    vec2(0.0, 1.0),
    vec2(1.0, 0.0),
    vec2(1.0, 1.0)
);

vec2 uvs[4] = vec2[](
    vec2(-1.0, -1.0),
    vec2(-1.0, 1.0),
    vec2(1.0, -1.0),
    vec2(1.0, 1.0)
);

vec4 ReCoordinate(vec2 pos) {

    vec3 geoPos;
    // geoPos.x = extent.x + (extent.z - extent.x) * pos.x;
    // geoPos.y = texture(projectionTexture, pos).y;
    geoPos = texture(projectionTexture, pos).xyz;
    vec4 res = u_matrix * vec4(geoPos, 1.0);
    // res = vec4(1.0 * (pos * 2.0 - 1.0), 0.0, 1.0);
    // res = vec4(10.0 * (pos * 2.0 - 1.0) - 4.0, 0.0, 1.0);
    return res;
}

ivec2 get_uv(int vertexIndex)
{
    // calculate the blockIndex of the current vertx
    int blockIndex = (beginBlock - vertexIndex + blockNum) % blockNum;

    // calculate original uv of the block
    int textureWidth = textureSize(particlePool, 0).x;
    int columnNum = textureWidth / blockSize;
    ivec2 blockUV = ivec2(blockIndex % columnNum, blockIndex / columnNum) * blockSize;

    // calculate uv of the current vertex
    ivec2 vertexUV = blockUV + ivec2(gl_InstanceID % blockSize, gl_InstanceID / blockSize);

    return vertexUV;
}

vec4 transfer_to_clip_space(vec2 pos)
{
    return ReCoordinate(pos);
}

vec4 get_clip_position(ivec2 uv)
{
    return transfer_to_clip_space(texelFetch(particlePool, uv, 0).rg);
}

vec2 get_vector(vec2 beginVertex, vec2 endVertex)
{
    return normalize(endVertex - beginVertex);
}

void main()
{
    // get screen positions from particle pool
    int currentVertex = 0;
    ivec2 c_uv = get_uv(currentVertex);
    vec4 cv_pos_CS = get_clip_position(c_uv);
    vec2 cv_pos_SS = cv_pos_CS.xy / cv_pos_CS.w;

    // calculate the screen offset
    float speedRate = texelFetch(particlePool, c_uv, 0).b;
    float r = (fillWidth + aaWidth * 2.0);// * mix(2.0, 1.0, clamp(pow(speedRate * 10.0, 3.0), 0.0, 1.0));
    float screenOffset = r / 2.0;

    // translate current vertex position
    vec2 v_offset = screenOffset * box[gl_VertexID];
    vec2 vertexPos_SS = cv_pos_SS + v_offset / viewport;

    //////////////
    // calculate vertex position in screen coordinates
    vec2 vertexPos_CS = vertexPos_SS * cv_pos_CS.w;
    gl_Position = vec4(vertexPos_CS, 0.0, cv_pos_CS.w);

    // prepare for anti-aliasing

    float segmentRate = float(currentVertex) / currentSegmentNum;
    sls.alphaDegree = 1.0 - segmentRate;

    sls.velocity = speedRate;
    sls.uv = uvs[gl_VertexID];
    sls.isDiscarded = isAlive;
}