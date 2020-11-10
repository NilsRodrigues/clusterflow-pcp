import _ = require("lodash");
import THREE = require("three");
import geomTypes = require("./geometry-types");
import glTypes = require("./webgl-types");
//import DR = require("./debug-renderer");


// #region Internal Types

class MaxShaderUniforms {
    public readonly inputDensityField = new THREE.Uniform(null) as glTypes.IUniform<THREE.Texture>;
    public readonly inputResolution = new THREE.Uniform(new THREE.Vector2()) as glTypes.IUniform<THREE.Vector2>;
};

// #endregion Internal Types


export class TextureMax {
    private static readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    private static readonly rectangle = new THREE.PlaneBufferGeometry(1, 1);

    public static rgbChannels(value: any, index: number): boolean {
        return index % 4 < 3;
    }
    public static rChannel(value: any, index: number): boolean {
        return index % 4 === 0;
    }
    public static gChannel(value: any, index: number): boolean {
        return index % 4 === 1;
    }
    public static bChannel(value: any, index: number): boolean {
        return index % 4 === 2;
    }
    public static alphaChannel(value: any, index: number): boolean {
        return index % 4 === 3;
    }

    /**
     * Renders the input texture with increasingly smaller resolution to get the maximum value.
     */
    public static getMaxFromRenderTarget(renderer: THREE.WebGLRenderer, sourceTexture: THREE.WebGLRenderTarget, channelSelector?: (value: any, index: number) => boolean = undefined): number {
        // get the size of the current input as start value
        let level = 0;
        const outputSize = {
            width: sourceTexture.width,
            height: sourceTexture.height
        } as geomTypes.IArea;

        // define function to calculate the next output size
        function updateOutputSize() {
            level++;
            outputSize.width = Math.ceil(outputSize.width / TextureMax.ScaleBoxSize);
            outputSize.height = Math.ceil(outputSize.height / TextureMax.ScaleBoxSize);
        }

        // create a smaller render target for the scale down
        let inputTexture = sourceTexture;
        let outputTexture = inputTexture.clone();
        outputTexture.texture.wrapS = THREE.ClampToEdgeWrapping;
        outputTexture.texture.wrapT = THREE.ClampToEdgeWrapping;
        outputTexture.texture.generateMipmaps = false;
        outputTexture.texture.magFilter = THREE.NearestFilter;
        outputTexture.texture.minFilter = THREE.NearestFilter;
        //inputTexture.depthBuffer = false;
        //inputTexture.stencilBuffer = false;

        // create a scene where we just render the input texture to a smaller render target
        const scene = new THREE.Scene();
        const uniforms = new MaxShaderUniforms();
        {
            const material = new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: document.getElementById('vertexshader').textContent,
                fragmentShader: document.getElementById('fragmentshader_max4').textContent,
                side: THREE.DoubleSide,
                depthTest: false,
                transparent: true,
                precision: "highp",
                blending: THREE.NoBlending,
            });
            const mesh = new THREE.Mesh(TextureMax.rectangle, material);
            mesh.position.x = 0.5;
            mesh.position.y = 0.5;
            mesh.position.z = 0;

            scene.add(mesh);
        }

        // repeat until the resulting texture is 1x1 pixels
        do {
            // update the size for the next pass
            updateOutputSize();
            outputTexture.setSize(outputSize.width, outputSize.height);

            // render the input to the output texture
            uniforms.inputDensityField.value = inputTexture.texture;
            uniforms.inputResolution.value.x = inputTexture.width;
            uniforms.inputResolution.value.y = inputTexture.height;
            renderer.render(scene, TextureMax.camera, outputTexture);

            // debug output of shrunken texture
            //const pixels = new Float32Array(4 * outputTexture.width * outputTexture.height); // rgba * width  * height
            //renderer.readRenderTargetPixels(outputTexture, 0, 0, outputTexture.width, outputTexture.height, pixels);
            //DR.drawRGBAFloatArrayImage(pixels, outputTexture.width, outputTexture.height, `max-level ${level}`);

            // swap input and output
            if (inputTexture === sourceTexture) // do not change the size of the original source texture
                inputTexture = outputTexture.clone();
            const tmp = inputTexture;
            inputTexture = outputTexture;
            outputTexture = tmp;
        } while (outputSize.width > 1 && outputSize.height > 1);

        // read the max value from the texture ("input" because it was swapped in the loop)
        let pixels = new Float32Array(4 * inputTexture.width * inputTexture.height); // rgba * width  * height
        renderer.readRenderTargetPixels(inputTexture, 0, 0, inputTexture.width, inputTexture.height, pixels);

        // filter the channels
        if (!_.isNil(channelSelector))
            pixels = pixels.filter(channelSelector);

        //console.log(pixels, outputSize);
        const max = _.max(pixels);
        return max;
    }
}

export namespace TextureMax {
    export const ScaleBoxSize = 4;
}
