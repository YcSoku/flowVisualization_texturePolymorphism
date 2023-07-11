#version 300 es
precision highp float;

in struct Stream_line_setting 
{
    float edgeParam;
    float alphaDegree;
    float velocity; // a percentage
} sls;

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
uniform float fillWidth;
uniform float aaWidth;

out vec4 fragColor;

int rampColors0[8] = int[](
    0x3288bd,
    0x66c2a5,
    0xabdda4,
    0xe6f598,
    0xfee08b,
    0xfdae61,
    0xf46d43,
    0xd53e4f
);

int rampColors1[8] = int[](
    0x8c510a,
    0xbf812d,
    0xdfc27d,
    0xf6e8c3,
    0xc7eae5,
    0x80cdc1,
    0x35978f,
    0x01665e
);
int rampColors2[8] = int[](
    0x8dd3c7,
    0xffffb3,
    0xbebada,
    0xfb8072,
    0x80b1d3,
    0xfdb462,
    0xb3de69,
    0xfccde5
);

int[8] rampColors()
{
    if (colorScheme == 0.0)
        return rampColors0;
    if (colorScheme == 1.0)
        return rampColors1;
    if (colorScheme == 2.0)
        return rampColors2;
} 

vec3 colorFromInt(int color)
{
    float b = float(color & 0xFF) / 255.0;
    float g = float((color >> 8) & 0xFF) / 255.0;
    float r = float((color >> 16) & 0xFF) / 255.0;

    return vec3(r, g, b);
}

vec3 velocityColor(float speed)
{
    float bottomIndex = floor(speed * 10.0);
    float topIndex = mix(bottomIndex + 1.0, 7.0, step(6.0, bottomIndex));
    float interval = mix(1.0, 4.0, step(6.0, bottomIndex));

    vec3 slowColor = colorFromInt(rampColors()[int(bottomIndex)]);
    vec3 fastColor = colorFromInt(rampColors()[int(topIndex)]);

    return mix(slowColor, fastColor, (speed * 10.0 - float(bottomIndex)) / interval);
}

float getAlpha(float param)
{
    if (aaWidth == 0.0) return 1.0;
    float alpha = 1.0 - sin(clamp((param * (0.5 * fillWidth + aaWidth) - 0.5 * fillWidth) / aaWidth, 0.0, 1.0) * 2.0 / 3.141592653);
    return alpha;
}

void main() 
{
    float alpha = getAlpha(abs(sls.edgeParam));

    // vec3 color = mix(colorFromInt(rampColors[int(sls.velocity * 7.0)]), colorFromInt(rampColors[int(sls.velocity * 7.0 + 0.5)]), fract(sls.velocity * 7.0));
    vec3 color = velocityColor(sls.velocity);
    // color = mix(vec3(0.7), color, alpha);
    fragColor = vec4(color, 1.0) * alpha * sls.alphaDegree;
    // fragColor = vec4(color, 1.0) * alpha;
}