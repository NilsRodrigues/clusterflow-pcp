import SVG = require("./svg-extensions");
import THREE = require("three");
import $ = require("jquery");
import _ = require("lodash");


export const enum StyleClasses {
    Normal = "normal",
    Hover = "hover",
    Active = "active",
    Selected = "selected",

    Dimension = "dimension",
    Axis = "axis",
    Noise = "noise",
    Cluster = "cluster",
    Tick = "tick",
    Label = "label",

    Connector = "connector",

    DataRow = "datarow",
}

export type Byte =
        0 |   1 |   2 |   3 |   4 |   5 |   6 |   7 |   8 |   9
    |  10 |  11 |  12 |  13 |  14 |  15 |  16 |  17 |  18 |  19
    |  20 |  21 |  22 |  23 |  24 |  25 |  26 |  27 |  28 |  29
    |  30 |  31 |  32 |  33 |  34 |  35 |  36 |  37 |  38 |  39
    |  40 |  41 |  42 |  43 |  44 |  45 |  46 |  47 |  48 |  49
    |  50 |  51 |  52 |  53 |  54 |  55 |  56 |  57 |  58 |  59
    |  60 |  61 |  62 |  63 |  64 |  65 |  66 |  67 |  68 |  69
    |  70 |  71 |  72 |  73 |  74 |  75 |  76 |  77 |  78 |  79
    |  80 |  81 |  82 |  83 |  84 |  85 |  86 |  87 |  88 |  89
    |  90 |  91 |  92 |  93 |  94 |  95 |  96 |  97 |  98 |  99
    | 100 | 101 | 102 | 103 | 104 | 105 | 106 | 107 | 108 | 109
    | 110 | 111 | 112 | 113 | 114 | 115 | 116 | 117 | 118 | 119
    | 120 | 121 | 122 | 123 | 124 | 125 | 126 | 127 | 128 | 129
    | 130 | 131 | 132 | 133 | 134 | 135 | 136 | 137 | 138 | 139
    | 140 | 141 | 142 | 143 | 144 | 145 | 146 | 147 | 148 | 149
    | 150 | 151 | 152 | 153 | 154 | 155 | 156 | 157 | 158 | 159
    | 160 | 161 | 162 | 163 | 164 | 165 | 166 | 167 | 168 | 169
    | 170 | 171 | 172 | 173 | 174 | 175 | 176 | 177 | 178 | 179
    | 180 | 181 | 182 | 183 | 184 | 185 | 186 | 187 | 188 | 189
    | 190 | 191 | 192 | 193 | 194 | 195 | 196 | 197 | 198 | 199
    | 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 209
    | 210 | 211 | 212 | 213 | 214 | 215 | 216 | 217 | 218 | 219
    | 220 | 221 | 222 | 223 | 224 | 225 | 226 | 227 | 228 | 229
    | 230 | 231 | 232 | 233 | 234 | 235 | 236 | 237 | 238 | 239
    | 240 | 241 | 242 | 243 | 244 | 245 | 246 | 247 | 248 | 249
    | 250 | 251 | 252 | 253 | 254 | 255;
export namespace Byte {
    export const Max: Byte = 255;
}
export interface Color {
    r: Byte;
    g: Byte;
    b: Byte;
    a: Byte;
}
export class Color implements Color {
    constructor(
        public r: Byte = 0,
        public g: Byte = 0,
        public b: Byte = 0,
        public a: Byte = Byte.Max) { }
}

export interface GradientStop {
    offset: number;
    color: Color;
}

/*
 * Draws a gradient on a canvas in order to later read it's color at various positions.
 * Adapted from K3N's answer https://stackoverflow.com/a/23277466
 * on https://stackoverflow.com/questions/23276926/how-to-get-color-of-svg-lineargradient-at-specific-position
 */
export class LinearGradient {
    private readonly _canvas: HTMLCanvasElement;
    private readonly _context: CanvasRenderingContext2D;

    public readonly cachedColors: Color[];
    public readonly cachedGlColors: THREE.Vector4[];
    public readonly cachedCssColors3: string[];
    public readonly cachedCssColors4: string[];

    constructor(
        colorStops: GradientStop[],
        public readonly resolution: number = 100,
        background: Color = new Color(Byte.Max, Byte.Max, Byte.Max, Byte.Max)) {

        // create canvas element
        this._canvas = document.createElement("canvas");
        this._canvas.width = resolution;
        this._canvas.height = 1;
        // get context
        this._context = this._canvas.getContext("2d");
        this._context.imageSmoothingEnabled = false;

        // sort the gradient stops
        colorStops = _.sortBy(colorStops, s => s.offset);

        // read the color values and save them to arrays
        this.cachedColors = new Array<Color>(resolution);
        this.cachedGlColors = new Array<THREE.Vector4>(resolution);
        this.cachedCssColors3 = new Array<string>(resolution);
        this.cachedCssColors4 = new Array<string>(resolution);
        for (let i = 0; i < resolution; i++) {
            const color = LinearGradient._getAt(colorStops, i / (resolution - 1));
            this.cachedColors[i] = color;
            this.cachedGlColors[i] = LinearGradient._asVector(color);
            this.cachedCssColors3[i] = LinearGradient._as3String(color);
            this.cachedCssColors4[i] = LinearGradient._as4String(color);
        }

        // TODO: write the colors to the canvas
        this._context.fillStyle = LinearGradient._as4String(background);
        this._context.clearRect(0, 0, resolution, 1);
        this._context.globalCompositeOperation = "source-over";
        for (let i = 0; i < resolution; i++) {
            this._context.fillStyle = this.cachedCssColors4[i];
            this._context.fillRect(i, 0, 1, 1);
        }
    }

    public get canvas() { return this._canvas; }


    /**
     * Reads the color data at the specified pixel position
     */
    private _getAtAbsolute = (absolutePosition: number): Color => {
        return this.cachedColors[absolutePosition];
    }
    /**
     * Reads the color data at the specified relative position
     */
    private _getAtRelative = (relativePosition: number): Color => {
        const absolutePosition = this.getBinAt(relativePosition);
        return this._getAtAbsolute(absolutePosition);
    }


    private static _getAt(sortedStops: GradientStop[], offset: number): Color {
        // no stops => no color
        if (_.isNil(sortedStops) || sortedStops.length === 0)
            return undefined;
        // single stop => single color
        if (sortedStops.length === 1)
            return sortedStops[0].color;

        // clamp offset
        offset = Math.max(offset, sortedStops[0].offset);
        offset = Math.min(offset, _.last(sortedStops).offset);

        // find stops that are nearest neighbors of offset
        const right = _.find(sortedStops, s => s.offset >= offset);
        const left = _.findLast(sortedStops, s => s.offset <= offset);

        // only one or no color is known => return the known one or undefined
        if (left === undefined) {
            if (right === undefined)
                return undefined;
            else
                return right.color;
        }
        else if (right === undefined) {
            return left.color;
        }

        // both stops at the same location => return the right one
        if (left.offset === right.offset)
            return right.color;

        // linear interpolation
        const leftWeight = 1 - ((offset - left.offset) / (right.offset - left.offset));
        const rightWeight = 1 - ((right.offset - offset) / (right.offset - left.offset));
        return new Color(
            Math.round(left.color.r * leftWeight + right.color.r * rightWeight) as Byte,
            Math.round(left.color.g * leftWeight + right.color.g * rightWeight) as Byte,
            Math.round(left.color.b * leftWeight + right.color.b * rightWeight) as Byte,
            Math.round(left.color.a * leftWeight + right.color.a * rightWeight) as Byte);
    }

    private static _asArray(color: Color): Uint8ClampedArray {
        const array = new Uint8ClampedArray(4);
        array[0] = color.r;
        array[1] = color.g;
        array[2] = color.b;
        array[3] = color.a;
        return array;
    }
    /**
     * Transforms a pixel color to a CSS color string without alpha channel.
     */
    private static _as3String(color: Color) {
        return `rgb(${color.r},${color.g},${color.b})`;
    }
    /**
     * Transforms a pixel color to a CSS color string with alpha channel.
     */
    private static _as4String(color: Color) {
        return `rgba(${color.r},${color.g},${color.b},${color.a / Byte.Max})`;
    }
    /**
     * Transforms a pixel color to a THREEjs color vector.
     */
    private static _asVector(color: Color) {
        return new THREE.Vector4(
            color.r / Byte.Max,
            color.g / Byte.Max,
            color.b / Byte.Max,
            color.a / Byte.Max);
    }


    public getBinAt = (relativePosition: number): number => {
        // calculate position
        let bin = Math.round(relativePosition * (this.resolution - 1));

        // clamp
        if (bin < 0)
            bin = 0;
        else if (bin >= this.resolution)
            bin = this.resolution - 1;

        return bin;
    }
    public getStringAt = (relativePosition: number): string => {
        // read the color data
        const color = this._getAtRelative(relativePosition);
        // transform to string
        return LinearGradient._as4String(color);
    };
    public getVectorAt = (relativePosition: number): THREE.Vector4 => {
        // read the color data
        const color = this._getAtRelative(relativePosition);
        // transform to string
        return LinearGradient._asVector(color);
    };
    public setStrokeAt = (relativePosition: number, element: SVG.Element): void => {
        // read the color data
        const color = this._getAtRelative(relativePosition);
        // set stroke properties
        element.attr({
            stroke: LinearGradient._as3String(color),
            "stroke-opacity": `${color.a / Byte.Max}`
        } as SVG.attrs);
    };
    public setFillAt = (relativePosition: number, element: SVG.Element): void => {
        // read the color data
        const color = this._getAtRelative(relativePosition);
        // set fill properties
        element.attr({
            fill: LinearGradient._as3String(color),
            "fill-opacity": `${color.a / Byte.Max}`
        } as SVG.attrs);
    };
}


export class PlotStyle {
    private readonly _styleSheetElement: HTMLStyleElement;
    private _styleSheetContent: string = undefined;

    constructor(private _styleSheet: string, private _fuzzyGradient: LinearGradient) {
        this._styleSheetElement = document.createElement("style");
        this._styleSheetElement.type = "text/css";
    }

    public get styleSheet(): string { return this._styleSheet; }
    public get fuzzyGradient(): LinearGradient { return this._fuzzyGradient; }


    private embeddStyleSheetContent = async (): Promise<void> => {
        if (this._styleSheetContent === undefined)
            this._styleSheetContent = await $.get(this.styleSheet);
        this._styleSheetElement.innerHTML = this._styleSheetContent;
    }
    public embeddStyleSheet = (svgDoc: SVG.Doc): void => {
        svgDoc.add({ node: this._styleSheetElement as HTMLElement } as SVG.Element);
        this.embeddStyleSheetContent();
    }
}

export class PlotStyles {
    public static readonly Bright = new PlotStyle(
        "cpcp_bright.css",
        new LinearGradient(
            [
                { offset: 0, color: new Color(0x33, 0x88, 0xFF, 0xAA) },
                { offset: 0.5, color: new Color(0x22, 0x44, 0xCC, 0xCC) },
                { offset: 1, color: new Color(0x00, 0x00, 0x00, 0xFF) }
            ],
            3)
    );
    public static readonly BrightBold = new PlotStyle(
        "cpcp_bright_bold.css", PlotStyles.Bright.fuzzyGradient
    );
    public static readonly MonoChrome = new PlotStyle(
        PlotStyles.Bright.styleSheet,
        new LinearGradient(
            [
                { offset: 1, color: new Color(0x00, 0x00, 0x00) }
            ],
            1)
    );
    public static readonly Categorical = new PlotStyle(
        PlotStyles.Bright.styleSheet,
        new LinearGradient(
            [
                { offset: 0, color: new Color(0x55, 0xCC, 0x88, 0xFF) },
                { offset: 0.5, color: new Color(0x22, 0x44, 0xCC, 0xCC) },
                //{ offset: 0.5, color: new Color(0x22, 0x44, 0xCC, 0xFF) },
                { offset: 1, color: new Color(0x00, 0x00, 0x00, 0xFF) }
            ],
            3)
    );
    public static readonly Dark = new PlotStyle(
        "cpcp_dark.css",
        new LinearGradient(
            [
                { offset: 0, color: new Color(0x99, 0xBB, 0xFF) },
                { offset: 1, color: new Color(0xFF, 0xFF, 0xFF) }
            ],
            3)
    );
    public static readonly Teaser = new PlotStyle(
        "cpcp_teaser.css",
        new LinearGradient(
            [
                { offset: 0.0, color: new Color(0x00, 0x00, 0x00) },
                { offset: 0.4, color: new Color(0x00, 0x00, 0x00) },
                { offset: 0.4, color: new Color(0xFF, 0x00, 0x44) },
                { offset: 0.7, color: new Color(0xFF, 0x00, 0x44) },
                { offset: 0.7, color: new Color(0x22, 0xAA, 0xFF) },
                { offset: 1.0, color: new Color(0x22, 0xAA, 0xFF) },
            ],
            3)
    );
}