import dt = require("./data-types");
import style = require("./clustered-plot-style");
import order = require("./axis-order");
import SVG = require("./svg-extensions");
import $ = require("jquery");
import _ = require("lodash");
import rearrange = require("array-rearrange");
import utils = require("./utils");
import THREE = require("three");
import Hermy = require("./hermite-curve");
import Freeze = require("./freezable");
import geomTypes = require("./geometry-types");
import glTypes = require("./webgl-types");
import textureMax = require("./texture-max");
import { ClusterAlgorithm } from "./clustering";
//import DR = require("./debug-renderer");


const emitRLines = false;



export enum ReadingDirection { LTR = "LTR", RTL = "RTL" }
export enum Connections { None = "None", All = "All", Used = "Used" }
export enum LineMatching { VerticalOrder = "VerticalOrder", LabelOrder = "LabelOrder", All = "All" }
export enum FuzzyDisplay { None = "None", Color = "Color" }
export enum DensityMap { Linear = 0, Logarithm = 1, LinLogistic = 2, LogLogistic = 3 }
export enum ClusterOrderMethod { None = 0, Mean = 1, Median = 2, Crossings = 3 }

export interface PlotSettings {
    data: dt.Data;

    styling: style.PlotStyle;
    readonly margin: geomTypes.IMargin;
    readonly dimSize: geomTypes.IArea;
    dimSizeWidth: number;
    dimSizeHeight: number;
    readingDirection: ReadingDirection;
    labelSize: number;
    clusterLabelSize: number;
    clusterLabelWidth: number;
    maxTickLabelSize: number;
    dimLabelOnBottom: boolean;
    shrinkFactor: number;
    spaceFactor: number;

    displayFuzzyness: FuzzyDisplay;
    readonly showFuzzyness: boolean;
    invertFuzzyLayerOrder: boolean;

    showOnlyUsedConnections: Connections;

    lineMatching: LineMatching; 

    preserveAngles: boolean;
    fanoutLines: boolean;
    crossCurves: boolean;
    curveLinear: number;
    curveControl: number;
    curveControlVariance: number;
    maxDashCount: number;

    nameDimension: string;

    superSampling: number;
    lineThickness: number;
    densityMap: DensityMap;
    minSourceDensity: number;
    maxSourceDensity: number;
    minTargetDensity: number;
    maxTargetDensity: number;
    readonly densitySlope: number;

    optimizeDimOrder: boolean;
    overrideOptimalDimOrder: string[];
    optimizeClusterOrder: ClusterOrderMethod;
    overrideOptimalClusterOrder: number[][];
    maxDimCount: number;
}


// #region Internal Types

interface WeightedPoint extends geomTypes.IPoint { weight: number; normalizedWeight: number; }
class LineConnection {
    constructor(
        public readonly weight: number,
        public readonly left: WeightedPoint,
        public readonly leftAxisShape: SVG.Shape,
        public readonly leftRegularPcpPoint: geomTypes.ArrayPoint,
        public readonly right: WeightedPoint,
        public readonly rightAxisShape: SVG.Shape,
        public readonly rightRegularPcpPoint: geomTypes.ArrayPoint) { }
}
type LineRenderer = (line: LineConnection, relativeRowIndex: number, tooltip?: string) => void;


class Weighted<T> {
    constructor(public readonly value: T, public readonly weight: number) { }
}
class WeightedShape extends Weighted<SVG.Shape> {
    constructor(value: SVG.Shape, weight: number) {
        super(value, weight);
    }
}
interface ClusterContainingPoint { cluster: dt.Cluster; classification: dt.Classification; }

type weightSelector = (left: WeightedPoint, right: WeightedPoint) => number;
type binSelector = (weight: number) => number;

class AxisArrangement {
    public readonly singleHeight: number = 0;
    public readonly spaceBetween: number = 0;
    public readonly totalHeight: number = 0;
    public readonly axisScale: number = 1;
    public readonly spaceScale: number = 1;

    constructor(
        public readonly dimName: string,
        public readonly clusterCount: number,
        public readonly regularHeight: number,
        public readonly shrinkFactor: number = 0.8,
        public readonly spaceFactor = 0.1) {
        // Find out how many axes we need to draw
        const axisCount = clusterCount || 0;
        if (axisCount < 1)
            throw "Can't generate an arrangement for less than 1 axis.";

        // only a single axis. pfff.. easy!
        if (axisCount <= 1) {
            this.singleHeight = regularHeight;
            this.totalHeight = regularHeight;
            return;
        }

        // multiple axes
        // measure their display size
        this.axisScale = AxisArrangement.rootScaling(axisCount, shrinkFactor);
        this.totalHeight = regularHeight * this.axisScale * axisCount;
        this.spaceScale = AxisArrangement.rootScaling(axisCount - 1, shrinkFactor);
        this.spaceBetween = regularHeight * spaceFactor * this.spaceScale;
        this.singleHeight = (this.totalHeight - this.spaceBetween * (axisCount - 1)) / axisCount;
    }

    private static rootScaling(count: number, shrinkRate: number): number {
        return Math.pow(1.0 / count, shrinkRate)
    }
}

class ColorShaderUniforms {
    public readonly superSampling = new THREE.Uniform(0.0) as glTypes.IUniform<number>;
    public readonly disableDensity = new THREE.Uniform(false) as glTypes.IUniform<boolean>;
    public readonly densityField = new THREE.Uniform(null) as glTypes.IUniform<THREE.Texture>;
    public readonly maxDensity = new THREE.Uniform(1.0) as glTypes.IUniform<number>;
    public readonly minAlpha = new THREE.Uniform(0.0) as glTypes.IUniform<number>;
    public readonly maxAlpha = new THREE.Uniform(0.0) as glTypes.IUniform<number>;
    public readonly centerSourceAlpha = new THREE.Uniform(0.0) as glTypes.IUniform<number>;
    public readonly alphaSlope = new THREE.Uniform(0.0) as glTypes.IUniform<number>;
    public readonly lineColor = new THREE.Uniform(null) as glTypes.IUniform<THREE.Vector4>;
    public readonly densityMap = new THREE.Uniform(DensityMap.LogLogistic) as glTypes.IUniform<DensityMap>;
};

interface AxisShape { shape: SVG.Shape, box: SVG.RBox }

// #endregion Internal Types


export class ClusteredPCP implements PlotSettings, Freeze.Freezable {
    private static sortByProperty(property: string) {
        return function (a, b) {
            return (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        }
    }
    private static filterUnique(value, index, self) {
        return self.indexOf(value) === index;
    }



    private static pointsToString(points: geomTypes.IPoint[]) {
        if (points === undefined || points === null || points.length < 1)
            return "";

        var result = points[0].x + "," + points[0].y;
        for (var i = 1; i < points.length; i++) {
            result += " " + points[i].x + "," + points[i].y;
        }

        return result;
    }



    private readonly externalContainer: HTMLElement;
    private readonly mainContainer: HTMLDivElement;
    private readonly svgContainer: HTMLDivElement;
    private readonly glContainer: HTMLDivElement;
    private readonly exportContainer: HTMLDivElement;

    private readonly svgDoc: SVG.Doc;
    private vizContent: SVG.G;
    private contentSize: SVG.RBox;
    private background: SVG.Rect;

    private readonly glRenderRect: geomTypes.IRect = { x: 0, y: 0, width: 0.0, height: 0.0 };
    private readonly renderer: THREE.WebGLRenderer;
    private lineGeometries: THREE.Geometry[][];
    private lineMaterials: THREE.LineBasicMaterial[][];
    private lines: THREE.LineSegments[][];
    private densityScenes: THREE.Scene[];
    private densityRenderTargets: THREE.WebGLRenderTarget[];
    private screenPlane: THREE.PlaneBufferGeometry;
    private colorUniforms: ColorShaderUniforms[];
    private colorMaterials: THREE.ShaderMaterial[];
    private colorObjects: THREE.Mesh[];
    private screenScene: THREE.Scene;
    private screenMaterial: THREE.MeshBasicMaterial;
    private camera: THREE.Camera;

    private readonly _axisByCluster = new Map<dt.Cluster, AxisShape>();
    private readonly _connectionsByAxes = new Map<SVG.Shape, Map<SVG.Shape, LineConnection>>();


    constructor(
        private readonly containerId: string)
    {
        // get the external container into which we generate the DOM content
        this.externalContainer = document.getElementById(containerId);
        if (_.isNil(this.externalContainer)) {
            debugger;
            throw `ClusteredPCP needs a DOM container to render images but could not find one with the provided ID of '${containerId}'.`;
        }

        // create an invisible container for exports
        this.exportContainer = document.createElement("div");
        this.exportContainer.style.display = "none";
        this.externalContainer.appendChild(this.exportContainer);

        // create a container for relative placement
        this.mainContainer = document.createElement("div");
        this.mainContainer.style.position = "relative";
        this.mainContainer.style.display = "block";
        this.externalContainer.appendChild(this.mainContainer);

        // create a container for WebGL content
        this.glContainer = document.createElement("div");
        this.glContainer.style.position = "absolute";
        this.glContainer.style.display = "block";
        this.mainContainer.appendChild(this.glContainer);

        // create a container for SVG content
        this.svgContainer = document.createElement("div");
        this.svgContainer.style.position = "relative";
        this.svgContainer.style.display = "block";
        this.mainContainer.appendChild(this.svgContainer);

        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            precision: "highp",
            preserveDrawingBuffer: true
        } as THREE.WebGLRendererParameters);
        this.renderer.setClearColor(0x000000, 0);
        this.glContainer.appendChild(this.renderer.domElement);

        this.svgDoc = SVG(this.svgContainer);
        this._styling.embeddStyleSheet(this.svgDoc);

        // listen to changed margins and dimension sizes
        this._margin.Changed.on(this.updatePlot);
        this._dimSize.Changed.on(this.updatePlot);
    }


    // #region Properties

    private _data: dt.Data = null;
    get data(): dt.Data {
        return this._data;
    }
    set data(value: dt.Data) {
        if (this._data === value)
            return;
        this._data = value;
        this._renderDimensions = null;
        this._renderClusters = null;
        this.updatePlot();
    }

    private _styling = style.PlotStyles.Bright;
    public get styling() { return this._styling; }
    public set styling(value: style.PlotStyle) {
        if (this._styling === value)
            return;
        this._styling = value;
        this.updatePlot();
    }


    //private readonly _margin: IMargin = { left: 50, top: 10, right: 50, bottom: 10 };
    private readonly _margin = new geomTypes.Margin();
    get margin(): geomTypes.IMargin {
        return this._margin;
    }
    get marginLeft(): number {
        return this._margin.left;
    }
    set marginLeft(value: number) {
        this._margin.left = value;
    }
    get marginTop(): number {
        return this._margin.top;
    }
    set marginTop(value: number) {
        this._margin.top = value;
    }
    get marginRight(): number {
        return this._margin.right;
    }
    set marginRight(value: number) {
        this._margin.right = value;
    }
    get marginBottom(): number {
        return this._margin.bottom;
    }
    set marginBottom(value: number) {
        this._margin.bottom = value;
    }

    private readonly _dimSize = new geomTypes.Area(150, 300);
    get dimSize(): geomTypes.IArea {
        return this._dimSize;
    }
    get dimSizeWidth(): number {
        return this._dimSize.width;
    }
    set dimSizeWidth(value: number) {
        this._dimSize.width = value;
    }
    get dimSizeHeight(): number {
        return this._dimSize.height;
    }
    set dimSizeHeight(value: number) {
        this._dimSize.height = value;
    }

    private static leftWeight(leftPoint: WeightedPoint, rightPoint: WeightedPoint): number { return leftPoint.weight; }
    private static rightWeight(leftPoint: WeightedPoint, rightPoint: WeightedPoint): number { return rightPoint.weight; }
    private currentWeightSelector: weightSelector = ClusteredPCP.rightWeight;
    private _readingDirection = ReadingDirection.LTR;
    get readingDirection(): ReadingDirection {
        return this._readingDirection;
    }
    set readingDirection(value: ReadingDirection) {
        if (this._readingDirection === value)
            return;

        // use the new value
        this._readingDirection = value;

        // choose the correct weight selector.
        // [the label (weight) of only one point will be encoded in the line between two of them.
        //  this selector is the one that will choose which point's value is to be encoded.]
        if (value === ReadingDirection.LTR)
            this.currentWeightSelector = ClusteredPCP.rightWeight;
        else
            this.currentWeightSelector = ClusteredPCP.leftWeight;

        // update the dimensions and clusters
        this._renderDimensions = null;
        this._renderClusters = null;

        // update the plot
        this.updatePlot();
    }

    private _labelSize: number = 18;
    get labelSize(): number {
        return this._labelSize;
    }
    set labelSize(value: number) {
        if (this._labelSize === value)
            return;
        this._labelSize = value;
        this.updatePlot();
    }

    private _clusterLabelSize: number = 0.7;
    get clusterLabelSize(): number {
        return this._clusterLabelSize;
    }
    set clusterLabelSize(value: number) {
        if (this._clusterLabelSize === value)
            return;
        this._clusterLabelSize = value;
        this.updatePlot();
    }

    private _clusterLabelWidth: number = 1;
    get clusterLabelWidth(): number {
        return this._clusterLabelWidth;
    }
    set clusterLabelWidth(value: number) {
        if (this._clusterLabelWidth === value)
            return;
        this._clusterLabelWidth = value;
        this.updatePlot();
    }

    private _maxTickLabelSize: number = 0.7;
    get maxTickLabelSize(): number {
        return this._maxTickLabelSize;
    }
    set maxTickLabelSize(value: number) {
        if (this._maxTickLabelSize === value)
            return;
        this._maxTickLabelSize = value;
        this.updatePlot();
    }

    private _dimLabelOnBottom: boolean = false;
    get dimLabelOnBottom(): boolean {
        return this._dimLabelOnBottom;
    }
    set dimLabelOnBottom(value: boolean) {
        if (this._dimLabelOnBottom === value)
            return;
        this._dimLabelOnBottom = value;
        this.updatePlot();
    }

    private _shrinkFactor: number = 0.8;
    get shrinkFactor(): number {
        return this._shrinkFactor;
    }
    set shrinkFactor(value: number) {
        if (this._shrinkFactor === value)
            return;
        this._shrinkFactor = value;
        this.updatePlot();
    }

    private _spaceFactor: number = 0.1;
    get spaceFactor(): number {
        return this._spaceFactor;
    }
    set spaceFactor(value: number) {
        if (this._spaceFactor === value)
            return;
        this._spaceFactor = value;
        this.updatePlot();
    }

    private readonly maxBin = (weight: number): number => { return this._styling.fuzzyGradient.resolution - 1; }
    private readonly binByWeight = (weight: number): number => { return this._styling.fuzzyGradient.getBinAt(weight); }
    private currentBinSelector: binSelector = this.binByWeight;
    private _displayFuzzyness: FuzzyDisplay = FuzzyDisplay.Color;
    get displayFuzzyness(): FuzzyDisplay { return this._displayFuzzyness; }
    set displayFuzzyness(value: FuzzyDisplay) {
        if (this._displayFuzzyness === value)
            return;
        this._displayFuzzyness = value;

        // udpate the bin selector
        if (this.showFuzzyness)
            this.currentBinSelector = this.binByWeight;
        else
            this.currentBinSelector = this.maxBin;

        // update the plot
        this.updatePlot();
    }
    get showFuzzyness() { return this._displayFuzzyness === FuzzyDisplay.Color; }

    private _invertFuzzyLayerOrder = false;
    get invertFuzzyLayerOrder() { return this._invertFuzzyLayerOrder; }
    set invertFuzzyLayerOrder(value: boolean) {
        if (this._invertFuzzyLayerOrder === value)
            return;
        this._invertFuzzyLayerOrder = value;

        // update the plot
        this.updatePlot();
    }

    private _showOnlyUsedConnections: Connections = Connections.None;
    get showOnlyUsedConnections(): Connections { return this._showOnlyUsedConnections; }
    set showOnlyUsedConnections(value: Connections) {
        if (this._showOnlyUsedConnections === value)
            return;
        this._showOnlyUsedConnections = value;
        this.updatePlot();
    }

    private _lineMatching: LineMatching = LineMatching.All;
    get lineMatching(): LineMatching { return this._lineMatching; }
    set lineMatching(value: LineMatching) {
        if (this._lineMatching === value)
            return;
        this._lineMatching = value;
        this.updatePlot();
    }

    private _preserveAngles: boolean = true;
    get preserveAngles(): boolean { return this._preserveAngles; }
    set preserveAngles(value: boolean) {
        if (this._preserveAngles === value)
            return;
        this._preserveAngles = value;
        this.updatePlot();
    }

    private _fanoutLines: boolean = true;
    get fanoutLines(): boolean { return this._fanoutLines; }
    set fanoutLines(value: boolean) {
        if (this._fanoutLines === value)
            return;
        this._fanoutLines = value;
        this.updatePlot();
    }

    private _crossCurves: boolean = false;
    get crossCurves(): boolean { return this._crossCurves; }
    set crossCurves(value: boolean) {
        if (this._crossCurves === value)
            return;
        this._crossCurves = value;
        this.updatePlot();
    }

    private _curveLinear: number = 0.1;
    get curveLinear(): number {
        return this._curveLinear;
    }
    set curveLinear(value: number) {
        if (this._curveLinear === value)
            return;
        this._curveLinear = value;
        this.updatePlot();
    }

    private _curveControl: number = 1;
    get curveControl(): number {
        return this._curveControl;
    }
    set curveControl(value: number) {
        if (this._curveControl === value)
            return;
        this._curveControl = value;
        this.updatePlot();
    }

    private _curveControlVariance: number = 0.5;
    get curveControlVariance(): number {
        return this._curveControlVariance;
    }
    set curveControlVariance(value: number) {
        if (this._curveControlVariance === value)
            return;
        this._curveControlVariance = value;
        this.updatePlot();
    }

    private _maxDashCount = 5;
    get maxDashCount(): number {
        return this._maxDashCount;
    }
    set maxDashCount(value: number) {
        if (this._maxDashCount === value)
            return;
        this._maxDashCount = value;
        this.updatePlot();
    }

    private _nameDimension: string = "name";
    get nameDimension(): string { return this._nameDimension; }
    set nameDimension(value: string) {
        if (this._nameDimension === value)
            return;
        this._nameDimension = value;
        this.updatePlot();
    }

    private _superSampling: number = 2.0;
    get superSampling(): number { return this._superSampling; }
    set superSampling(value: number) {
        if (this._superSampling === value)
            return;
        this._superSampling = value;
        this._isLineThicknessObsolete = true;
        this.updateRender();
    }

    private _isLineThicknessObsolete: boolean = false;
    private _lineThickness: number = 1.0;
    get lineThickness(): number { return this._lineThickness; }
    set lineThickness(value: number) {
        if (this._lineThickness === value)
            return;
        this._lineThickness = value;
        this._isLineThicknessObsolete = true;
        this.updateRender();
    }

    private _densityMap = DensityMap.LogLogistic;
    get densityMap(): DensityMap {
        return this._densityMap;
    }
    set densityMap(value: DensityMap) {
        if (this._densityMap === value)
            return;
        this._densityMap = value;
        this.updateRender();
    }
    
    private _minSourceDensity: number = 0.0;
    get minSourceDensity(): number { return this._minSourceDensity; }
    set minSourceDensity(value: number) {
        if (this._minSourceDensity === value)
            return;
        this._minSourceDensity = value;
        this._isDensitySlopeOutdated = true;
        this.updateRender();
    }

    private _maxSourceDensity: number = 1.0;
    get maxSourceDensity(): number { return this._maxSourceDensity; }
    set maxSourceDensity(value: number) {
        if (this._maxSourceDensity === value)
            return;
        this._maxSourceDensity = value;
        this._isDensitySlopeOutdated = true;
        this.updateRender();
    }

    private _minTargetDensity: number = 0.1;
    get minTargetDensity(): number { return this._minTargetDensity; }
    set minTargetDensity(value: number) {
        if (this._minTargetDensity === value)
            return;
        this._minTargetDensity = value;
        this._isDensitySlopeOutdated = true;
        this.updateRender();
    }

    private _maxTargetDensity: number = 1.0;
    get maxTargetDensity(): number { return this._maxTargetDensity; }
    set maxTargetDensity(value: number) {
        if (this._maxTargetDensity === value)
            return;
        this._maxTargetDensity = value;
        this._isDensitySlopeOutdated = true;
        this.updateRender();
    }


    private _isDensitySlopeOutdated = true;
    private _densitySlope: number = 0;
    get densitySlope(): number {
        if (this._isDensitySlopeOutdated)
            this.updateDensitySlope();
        return this._densitySlope;
    }

    private static readonly _DensityEpsilon = 1 / 255;
    /**
     * Fits the slope of the logistic function used for density mapping to the user given constraints.
     */
    private updateDensitySlope = (): void => {
        // - ln((maxY - minY - eps) / eps)
        // -------------------------------
        //     minX - (minX + maxX) / 2
        this._densitySlope =
            - Math.log((this._maxTargetDensity - this._minTargetDensity - ClusteredPCP._DensityEpsilon) / ClusteredPCP._DensityEpsilon)
            / (this._minSourceDensity - (this._minSourceDensity + this._maxSourceDensity) / 2.0)
    }


    private _maxDimCount: number = 0;
    public get maxDimCount(): number { return this._maxDimCount; }
    public set maxDimCount(value: number) {
        if (this._maxDimCount === value)
            return;

        this._maxDimCount = value;
        this.updateRenderDimensions();
    }

    private _optimizeDimOrder: boolean = true;
    public get optimizeDimOrder(): boolean { return this._optimizeDimOrder; }
    public set optimizeDimOrder(value: boolean) {
        if (this._optimizeDimOrder === value)
            return;

        this._optimizeDimOrder = value;
        this.updateRenderDimensions();
    }

    public _overrideOptimalDimOrder: string[] = null;
    public get overrideOptimalDimOrder(): string[] { return this._overrideOptimalDimOrder; }
    public set overrideOptimalDimOrder(value: string[]) {
        if (this._overrideOptimalDimOrder === value)
            return;

        this._overrideOptimalDimOrder = value;
        this.updateRenderDimensions();
    }

    private _optimizeClusterOrder: ClusterOrderMethod = ClusterOrderMethod.None;
    public get optimizeClusterOrder(): ClusterOrderMethod { return this._optimizeClusterOrder; }
    public set optimizeClusterOrder(value: ClusterOrderMethod) {
        if (this._optimizeClusterOrder === value)
            return;

        this._optimizeClusterOrder = value;
        this.updateRenderDimensions();
    }

    public _overrideOptimalClusterOrder: number[][] = null;
    public get overrideOptimalClusterOrder(): number[][] { return this._overrideOptimalClusterOrder; }
    public set overrideOptimalClusterOrder(value: number[][]) {
        if (this._overrideOptimalClusterOrder === value)
            return;

        this._overrideOptimalClusterOrder = value;
        this.updateRenderDimensions();
    }

    private _renderDimensions: string[] = null;
    private get renderDimensions() {
        if (this._renderDimensions === null)
            this.updateRenderDimensions();
        return this._renderDimensions;
    }
    private updateRenderDimensions = (): void => {
        // check whether we are frozen
        if (!this.updateRenderDimensionsFreezer.canResume())
            return;

        // No data => do dims to show
        if (_.isNil(this._data)) {
            this._renderDimensions = [];
            return;
        }

        // initialize with the data's natural order
        let dims = this._data.info.dimNames;

        // use an optimized dim order
        if (this._optimizeDimOrder) {
            if (_.isNil(this.overrideOptimalDimOrder)) {
                // calculate optimal order
                const timer = "Axis Ordering";
                console.time(timer);
                dims = new order.AxisOrder(this._data).dimOrder;
                console.timeEnd(timer);

                // calculate optimum in LTR, invert if we are to show the connections right to left
                if (this._readingDirection === ReadingDirection.RTL)
                    dims = dims.reverse();
            }
            // use static external override as optimal order
            else {
                dims = this.overrideOptimalDimOrder;
            }
        }

        // limit number of dimensions
        if (this._maxDimCount > 0 && dims.length > this._maxDimCount)
            dims.length = this._maxDimCount;

        this._renderDimensions = dims;
    }

    private _renderClusters: dt.Cluster[][] = null;
    private get renderClusters(): dt.Cluster[][] {
        if (this._renderClusters === null)
            this.updateRenderClusters();
        return this._renderClusters;
    }
    private updateRenderClusters = (): void => {
        // check whether we are frozen
        if (!this.updateRenderClustersFreezer.canResume())
            return;

        // get dim order to know what clusters to show
        const dims = this.renderDimensions;

        // no dimensions => no clusters to show
        if (dims.length < 1) {
            this._renderClusters = [];
            return;
        }

        // get all clusters (no specific order)
        const getAllRenderClusters = (): dt.Cluster[][] => {
            let allRenderClusters = new Array<dt.Cluster[]>(dims.length);
            if (this._readingDirection === ReadingDirection.LTR) {
                allRenderClusters[0] = utils.MapHelper.get(this._data.clusters, dims[0], dims[0]);
                for (let i = 1; i < dims.length; i++)
                    allRenderClusters[i] = utils.MapHelper.get(this._data.clusters, dims[i - 1], dims[i]);
            }
            else {
                const last = dims.length - 1;
                allRenderClusters[last] = utils.MapHelper.get(this._data.clusters, dims[last], dims[last]);
                for (let i = 0; i < dims.length - 1; i++)
                    allRenderClusters[i] = utils.MapHelper.get(this._data.clusters, dims[i], dims[i + 1]);
            }
            return allRenderClusters;
        }

        // optmize cluster order
        let renderClusters: dt.Cluster[][];
        let overrideOrder = this._overrideOptimalClusterOrder;
        // no optimization at all
        if (this._optimizeClusterOrder === ClusterOrderMethod.None) {
            renderClusters = getAllRenderClusters();
        }
        // custom order through override
        else if (!_.isNil(overrideOrder)) {
            renderClusters = getAllRenderClusters();
            for (let dim = 0; dim < dims.length && dim < overrideOrder.length; dim++) {
                try {
                    rearrange(renderClusters[dim], overrideOrder[dim])
                }
                catch (error) {
                    console.error(error);
                    console.error("Can't override cluster order. Check provided indices.");
                    renderClusters = [];
                    break;
                }
            }
        }
        // optimization algorithm
        else {
            switch (this._optimizeClusterOrder) {
                // by number of crossings
                case ClusterOrderMethod.Crossings:
                    const timer = "Cluster Ordering";
                    console.time(timer);
                    const clusterSort = new order.ClusterOrder(this._data, dims);
                    renderClusters = clusterSort.clusterOrder;
                    console.timeEnd(timer);
                    break;
                // sort by mean value
                case ClusterOrderMethod.Mean:
                    renderClusters = getAllRenderClusters();
                    for (let i = 0; i < renderClusters.length; i++) {
                        if (renderClusters[i].length === 0)
                            continue;

                        renderClusters[i] = _.sortBy(
                            renderClusters[i],
                            cluster => _.meanBy(
                                [...cluster.classification.keys()],
                                row => row[dims[i]]
                            )
                        );

                        // we need to start with the highest value
                        renderClusters[i].reverse();
                    }
                    break;
                // sort by median value
                case ClusterOrderMethod.Median:
                    renderClusters = getAllRenderClusters();
                    for (let i = 0; i < renderClusters.length; i++) {
                        if (renderClusters[i].length === 0)
                            continue;

                        renderClusters[i] = _.sortBy(
                            renderClusters[i],
                            c => utils.MathHelper.medianOfSorted(
                                [...c.classification.keys()].map(r => r[dims[i]]).sort()
                            )
                        );

                        // we need to start with the highest value
                        renderClusters[i].reverse();
                    }
                    break;
                default:
                    renderClusters = getAllRenderClusters();
            }
        }

        this._renderClusters = renderClusters;
    }

    //#endregion Properties


    private clear = (): void => {
        this.densityScenes = null;
        this.screenScene = null;
        this.densityRenderTargets = null;

        this.svgDoc.clear();
        this._styling.embeddStyleSheet(this.svgDoc);
        this._axisByCluster.clear();
        this._connectionsByAxes.clear();
    }

    public updatePlot = (): void => {
        if (!this.updatePlotFreezer.canResume())
            return;

        // remove the current content of the svg picture
        this.clear();

        // Don't draw anything if there is no data
        const data = this.data;
        if (_.isNil(data) || _.isNil(data.rows))
            return;

        // SVG background
        this.background = this.svgDoc.rect();
        this.background.attr({
            stroke: "none",
            fill: "none"
        } as SVG.attrs);
        
        // Where the picture itself will be contained
        this.vizContent = this.svgDoc.group();

        // get the clusters that will be rendered (contains dummies)
        //this.updateRenderClusters();

        // Draw Axes
        const axes = this.drawAxes();

        this.contentSize = this.vizContent.rbox();

        // debug
        if (emitRLines) {
            this.rlines = `newline <- function (num) {
            plot(0,0,type="n",axes=T,ann=F,xlim = c(${this.contentSize.x}, ${this.contentSize.x2}),ylim = c(${this.contentSize.y}, ${this.contentSize.y2}))
            box()
            title(num)
    }
    `;
        }

        // Draw Data Points
        this.initGl();
        this.addDataRows();

        if (emitRLines) {
            console.log(this.rlines);
        }

        // Draw axis connectors
        const connectors = this.drawClusterConnectors();

        // Move the connectors (had to render lines beforehand to know what connectors would be necessary)
        connectors.back();

        // Move the axes to the front (had to render before lines to know their locations)
        axes.front();

        this.vizContent.translate(this._margin.left, this._margin.top);
        


        // find out how much space we need and adjust the picture size
        this.svgDoc.size(
            this.contentSize.width + this._margin.left + this._margin.right,
            this.contentSize.height + this._margin.top + this._margin.bottom);
        this.background.width(this.svgDoc.width());
        this.background.height(this.svgDoc.height());

        this.updateRender();
    }

    private getExportableSvg = (): string => {
        // clone the current SVG image
        const svgClone = this.svgDoc.clone(this.exportContainer) as SVG.Doc;

        // copy the webgl content into a PNG image
        // find container for image (corresponds to this.vizContent)
        const imageUrl = this.renderer.domElement.toDataURL("image/png");
        const imageCloneContainer = _.find(svgClone.children(), c => c instanceof SVG.G) as SVG.G;
        const imageClone = imageCloneContainer.image(imageUrl, this.contentSize.width, this.contentSize.height);
        imageClone.backward(); // move behind the axes

        // apply the background color
        const backgroundStyle = window.getComputedStyle(this.externalContainer);
        const backgroundClone = _.find(svgClone.children(), c => c instanceof SVG.Rect) as SVG.Rect;
        backgroundClone.fill(backgroundStyle["background-color"]);

        // apply label css
        const copyAttribute = function (element: SVG.Element, style: CSSStyleDeclaration, attribute: string) {
            // don't override existing stroke
            if (element.attr(attribute) === undefined) {
                // get the css value
                let css = style[attribute];
                if (css !== "none") {
                    // set the css transform in svg
                    element.attr(attribute, css);
                }
            }
        }
        SVG.select("text", svgClone.node).each((index: number, members: SVG.Element[]) => {
            const label = members[index];
            const labelStyle = window.getComputedStyle(label.node);

            // copy transform from css to svg attribute
            copyAttribute(label, labelStyle, "transform");
        });

        let picture = svgClone.svg();
        svgClone.clear();
        utils.DOMHelper.clearRemove(this.exportContainer);
        return picture;
    };
    public exportSvg = (...appendComments: any[]): void => {
        // get the svg
        let picture = this.getExportableSvg();

        // prepend xml declaration
        if (!picture.startsWith("<?xml"))
            picture = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + picture;

        // append comments
        let comments = "";
        for (let arg of appendComments) {
            comments += `<!--${JSON.stringify(arg)}-->\n`
        }
        if (comments.length > 0)
            picture += comments;

        // store the clone
        utils.FileHelper.saveSvg(picture, this.data.name || "clustered-pcp");
    }


    private initGl = (): void => {
        // Get the resolution with which to show uncertainty
        const resolution = this.styling.fuzzyGradient.resolution;

        // Reserve space for the different scenes, geometries, materials, ...
        // Structure: create separate sets for each uncertainty bin
        this.lineGeometries = new Array<THREE.Geometry[]>(resolution);
        this.lineMaterials = new Array<THREE.LineBasicMaterial[]>(resolution);
        this.lines = new Array<THREE.LineSegments[]>(resolution);
        this.densityScenes = new Array<THREE.Scene>(resolution);

        // Instantiate them
        for (let i = 0; i < resolution; i++) {
            this.lineGeometries[i] = [];
            this.lineMaterials[i] = [];
            this.lines[i] = [];
            this.densityScenes[i] = new THREE.Scene();
        }
    }

    private maxY: number = 0;
    private rlines: string = "";
    private addLineToScene = (bin: number, polyline: THREE.Vector3[], opacity: number, thickness: number = 1): void => {
        const geometry = new THREE.Geometry();
        geometry.vertices.push(...polyline);

        const color = new THREE.Color(opacity, opacity, opacity);

        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            blending: THREE.AdditiveBlending,
            linewidth: thickness * this._lineThickness * this._superSampling,
            depthTest: false,
        } as THREE.LineBasicMaterialParameters);
        material.cfpcp_thicknessMultiplier = thickness;

        //const line = new THREE.LineSegments(geometry, material);
        const line = new THREE.Line(geometry, material);//.LineSegments(geometry, material);


        this.lineGeometries[bin].push(geometry);
        this.lineMaterials[bin].push(material);
        this.lines[bin].push(line);
        this.densityScenes[bin].add(line);

        // debug
        if (emitRLines) {
            const currentMinY = _.min(polyline.map((point) => point.y));
            //const currentMaxY = _.max();
            //if (currentMaxY > this.maxY)
            //    this.maxY = currentMaxY;
            let lineCount = _.sum(this.lines.map(l => l.length));
            let currentLine = `lines(x=c(${polyline.map(p => p.x).join(',')}),y=c(${polyline.map(p => p.y).join(',')}))\r\n`;
            if ((lineCount - 1) % 100 == 0)
                currentLine = `newline(${lineCount - 1});` + currentLine;
            this.rlines += currentLine;
        }
    }

    private updateRender = (): void => {
        if (_.isNil(this.contentSize) || !(this.contentSize.x > 0) || !(this.contentSize.y > 0))
            return;

        if (!this.updateRenderFreezer.canResume())
            return;

        const fuzzyResolution = this.styling.fuzzyGradient.resolution;

        // setup (with supersampling)
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // set content size
        this.glRenderRect.x = this.contentSize.x;
        this.glRenderRect.y = this.contentSize.y;
        this.glRenderRect.width = Math.round(this.contentSize.width * this._superSampling);
        this.glRenderRect.height = Math.round(this.contentSize.height * this._superSampling);

        // Update the line thickness if super sampling changed
        if (this._isLineThicknessObsolete) {
            for (let i = 0; i < fuzzyResolution; i++) {
                for (let material of this.lineMaterials[i])
                    material.linewidth = material.cfpcp_thicknessMultiplier * this._lineThickness * this._superSampling;
            }
            this._isLineThicknessObsolete = false;
        }

        // set render size
        this.renderer.setSize(this.glRenderRect.width, this.glRenderRect.height);
        this.renderer.domElement.style.width = `${this.contentSize.width}px`;
        this.renderer.domElement.style.height = `${this.contentSize.height}px`;
        for (let i = 0; i < fuzzyResolution; i++)
            this.densityScenes[i].scale.x = this.densityScenes[i].scale.y = this._superSampling;

        // position camera
        this.camera = new THREE.OrthographicCamera(
            0,
            this.glRenderRect.width,
            this.glRenderRect.height,
            0,
            -10,
            10);
        
        // create render targets for each fuzziness value (one for density, one for color)
        this.densityRenderTargets = new Array<THREE.WebGLRenderTarget>(fuzzyResolution);
        for (let i = 0; i < fuzzyResolution; i++) {
            this.densityRenderTargets[i] = new THREE.WebGLRenderTarget(
                this.glRenderRect.width,
                this.glRenderRect.height,
                { type: THREE.FloatType } as THREE.WebGLRenderTargetOptions
            );
            this.densityRenderTargets[i].texture.generateMipmaps = false;
            this.densityRenderTargets[i].texture.magFilter = THREE.NearestFilter;
            this.densityRenderTargets[i].texture.minFilter = THREE.NearestFilter;
        }

        // create image buffer (used to merge all color textures)
        this.screenScene = new THREE.Scene();
        // create plane with the size of the image (used to render different textures into the final image)
        this.screenPlane = new THREE.PlaneBufferGeometry(this.glRenderRect.width, this.glRenderRect.height);

        // create the shader material that is used to map density to color
        this.colorUniforms = new Array<ColorShaderUniforms>(fuzzyResolution);
        this.colorMaterials = new Array<THREE.ShaderMaterial>(fuzzyResolution);
        this.colorObjects = new Array<THREE.Mesh>(fuzzyResolution);
        for (let i = 0; i < fuzzyResolution; i++) {
            const uniforms = new ColorShaderUniforms();
            uniforms.superSampling.value = this._superSampling;
            uniforms.disableDensity.value = (this.styling === style.PlotStyles.Teaser && i > 0);
            uniforms.densityMap.value = this._densityMap;
            uniforms.maxDensity.value = 1.0;
            uniforms.minAlpha.value = this._minTargetDensity;
            uniforms.maxAlpha.value = this._maxTargetDensity;
            uniforms.centerSourceAlpha.value = (this._minSourceDensity + this._maxSourceDensity) / 2.0;
            uniforms.alphaSlope.value = this.densitySlope;
            uniforms.lineColor.value = this._styling.fuzzyGradient.cachedGlColors[i];
            this.colorUniforms[i] = uniforms;

            const material = new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: document.getElementById('vertexshader').textContent,
                fragmentShader: document.getElementById('fragmentshader').textContent,
                side: THREE.DoubleSide,
                depthTest: false,
                transparent: true

            });
            this.colorMaterials[i] = material;

            const colorObject = new THREE.Mesh(this.screenPlane, material);
            colorObject.position.x = this.glRenderRect.width / 2;
            colorObject.position.y = this.glRenderRect.height / 2;
            if (this.invertFuzzyLayerOrder)
                colorObject.position.z = 0 + i / fuzzyResolution;
            else
                colorObject.position.z = 1 - i / fuzzyResolution;
            this.colorObjects[i] = colorObject;

            //if (i === 2) // used to just show a single fuzziness value
            this.screenScene.add(colorObject);
        }

        // setup is ready. render as soon as it's convenient.
        window.requestAnimationFrame(this.render);
    }

    private render = (): void => {
        //DR.clear();

        // render density
        let maxDensity = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < this.densityScenes.length; i++) {
            const lineScene = this.densityScenes[i];
            const densityRenderTarget = this.densityRenderTargets[i];

            this.renderer.render(lineScene, this.camera, densityRenderTarget);

            // find maximum density
            //const pixels = new Float32Array(4 * densityRenderTarget.width * densityRenderTarget.height); // rgba * width  * height
            //this.renderer.readRenderTargetPixels(densityRenderTarget, 0, 0, densityRenderTarget.width, densityRenderTarget.height, pixels);
            //const valuePixels = pixels.filter((value, index) => index % 4 === 0); // use only the RED pixel // alpha counts number of lines
            //const max = _.max(valuePixels);
            //if (max > maxDensity)
            //    maxDensity = max;

            // debug
            //DR.drawRGBAFloatArrayImage(pixels, densityRenderTarget.width, densityRenderTarget.height, `original from bin ${i}`);

            // find maximum with shader
            // use only the RED pixel // alpha counts number of lines
            let maxShader = textureMax.TextureMax.getMaxFromRenderTarget(this.renderer, densityRenderTarget, textureMax.TextureMax.rChannel);
            if (maxShader > maxDensity)
                maxDensity = maxShader;
        }

        // link the materials of the color objects to the density fields
        for (let i = 0; i < this.densityRenderTargets.length; i++) {
            this.colorUniforms[i].densityField.value = this.densityRenderTargets[i].texture;
            this.colorUniforms[i].maxDensity.value = maxDensity;
        }

        // render all density fields onto the merged image
        this.renderer.render(this.screenScene, this.camera);

        // create an image element from the result
        //let imageUrl = this.renderer.domElement.toDataURL();
        //this.lineImage.load(imageUrl);
    }


    private __lineCount = 0;
    private addDataRows = (): void => {
        this.__lineCount = 0;
        // draw each row
        for (let i = 0; i < this._data.rows.length; i++) {
            this.addDataRow(i);
        }
        console.log("LineMatching." + this.lineMatching + ": " + this.__lineCount);
    }

    private addDataRow = (rowIndex: number): void => {
        const relativeRowIndex = (rowIndex <= 0) ? 0 : rowIndex / (this._data.rows.length - 1);
        const row = this._data.rows[rowIndex];
        const rowName = row[this.nameDimension];
        const normalizedRow = this._data.normalizedRows[rowIndex];
        const dimNames = this.renderDimensions;
        const clusters = this.renderClusters;

        // Get the points through which the polyline would go in a regular PCP
        const regularPoints = new Array<geomTypes.ArrayPoint>(dimNames.length);
        for (let d = 0; d < dimNames.length; d++) {
            regularPoints[d] = [
                    /*x*/ d * this._dimSize.width,
                    /*y*/ this._dimSize.height * normalizedRow[dimNames[d]]
            ];
        }

        // Get the points through which the polyline will go in a clustered PCP
        let clusteredPointsByDim = new Array<WeightedPoint[]>(dimNames.length);
        let axisShapesByDim = new Array<WeightedShape[]>(dimNames.length);
        // loop over every dimension
        for (let d = 0; d < dimNames.length; d++) {

            // find out which clusters contain the current row (only for this dimension)
            let containingClusters = clusters[d]
                .map(c => { return { cluster: c, classification: c.classification.get(normalizedRow) } as ClusterContainingPoint; })
                .filter(cc => cc.classification);

            // do not show fuzzyness => choose only one of those clusters that contain the point
            if (!this.showFuzzyness) {
                const selectedCluster = _.maxBy(containingClusters, cc => cc.classification.label) as ClusterContainingPoint;
                containingClusters = [selectedCluster];
            }

            // calculate the sum of all weights for this point in this dimension
            const totalWeight = _.sumBy(containingClusters, (c) => c.classification.label);

            // calculate the points on the axes, where this data row passes through
            clusteredPointsByDim[d] = new Array<WeightedPoint>(containingClusters.length);
            axisShapesByDim[d] = new Array<WeightedShape>(containingClusters.length);
            for (let c = 0; c < containingClusters.length; c++) {
                // get the weight of this point in the current cluster
                const weight = containingClusters[c].classification.label;

                // get info on the axis that is used for this cluster
                const axis = this._axisByCluster.get(containingClusters[c].cluster);

                // calculate the points through which the line will go
                clusteredPointsByDim[d][c] = {
                    x: axis.box.cx,
                    y: this.contentSize.height - axis.box.y2 + axis.box.height * normalizedRow[dimNames[d]],
                    weight: weight,
                    normalizedWeight: weight / totalWeight,
                };
                axisShapesByDim[d][c] = new WeightedShape(axis.shape, weight);
            }
        }


        // connect the points between dimensions.
        // problem: how to choose which points to connect when both dimensions have multiple clusters?
        const lines = new Array<LineConnection>();
        switch (this.lineMatching) {
            // LabelOrder: sort labels by weight => connect them by order. start with the most important ones.
            case LineMatching.LabelOrder:
                clusteredPointsByDim = clusteredPointsByDim.map(pointsInDim => _.sortBy(pointsInDim, point => point.weight));
                axisShapesByDim = axisShapesByDim.map(shapesInDim => _.sortBy(shapesInDim, shape => shape.weight));

            // VerticalOrder: match by vertical order. start at the top, work towards the bottom.
            default:
            case LineMatching.VerticalOrder:
                for (let d = 1; d < dimNames.length; d++) {
                    const leftDim = dimNames[d - 1];
                    const rightDim = dimNames[d];

                    // position of points if this were a regular PCP
                    const leftRegular = regularPoints[d - 1];
                    const rightRegular = regularPoints[d];

                    // points in clusters to the left
                    const left = clusteredPointsByDim[d - 1];
                    const leftAxes = axisShapesByDim[d - 1];
                    // points in clusters to the right
                    const right = clusteredPointsByDim[d];
                    const rightAxes = axisShapesByDim[d];

                    // match points of neighboring dimensions and call the line-creating functions to connect them
                    // connect the first <lastCommonIndex> cluster pairs with each other
                    const lastCommonIndex = Math.min(left.length, right.length) - 1;
                    for (let c = 0; c <= lastCommonIndex; c++) {
                        lines.push(new LineConnection(1, left[c], leftAxes[c].value, leftRegular, right[c], rightAxes[c].value, rightRegular));
                    }
                    // left side has more clusters
                    if (left.length > right.length) {
                        for (let c = right.length; c < left.length; c++) {
                            lines.push(new LineConnection(1, left[c], leftAxes[c].value, leftRegular, right[lastCommonIndex], rightAxes[lastCommonIndex].value, rightRegular));
                        }
                    }
                    // right side has more clusters
                    else {
                        for (let c = left.length; c < right.length; c++) {
                            lines.push(new LineConnection(1, left[lastCommonIndex], leftAxes[lastCommonIndex].value, leftRegular, right[c], rightAxes[c].value, rightRegular));
                        }
                    }
                }
                break;

            case LineMatching.All:
                // connect all clusters with all other clusters
                for (let d = 1; d < dimNames.length; d++) {
                    const leftDim = dimNames[d - 1];
                    const rightDim = dimNames[d];

                    // position of points if this were a regular PCP
                    const leftRegular = regularPoints[d - 1];
                    const rightRegular = regularPoints[d];

                    // points in clusters to the left
                    const left = clusteredPointsByDim[d - 1];
                    const leftAxes = axisShapesByDim[d - 1];
                    // points in clusters to the right
                    const right = clusteredPointsByDim[d];
                    const rightAxes = axisShapesByDim[d];

                    // connect every clusters on the left with every cluster on the right
                    for (let l = 0; l < left.length; l++) {
                        for (let r = 0; r < right.length; r++)
                            lines.push(new LineConnection(left[l].normalizedWeight * right[r].normalizedWeight, left[l], leftAxes[l].value, leftRegular, right[r], rightAxes[r].value, rightRegular));
                    }
                }
                break;
        }
        this.__lineCount += lines.length;


        // choose how to draw the lines
        const addLine = this._preserveAngles ? this.drawHermiteCurve : this.drawStraightLine;

        // call the line-drawing functions to actually draw the lines that will represent this multivariate point
        for (const line of lines) {
            addLine(line, relativeRowIndex, rowName);
            utils.MapHelper.append(this._connectionsByAxes, line, line.leftAxisShape, line.rightAxisShape);
        }
    }


    /**
     * Adds a straight line between two points on axes.
     */
    private drawStraightLine: LineRenderer = (line, relativeRowIndex, tooltip = undefined): void => {
        const bin = this.currentBinSelector(this.currentWeightSelector(line.left, line.right));
        this.addLineToScene(
            bin,
            [
                new THREE.Vector3(line.left.x, line.left.y, 0),
                new THREE.Vector3(line.right.x, line.right.y, 0)
            ],
            line.weight);
    }

    /**
     * Adds partial straight partial links between two points on axes.
     * The partial links go in the same direction that they would have gone in a traditional non - clustered PCP.
     * The endpoints of the partial links are then connected by a bezier curve.
     * The individual curve parameters can then vary to spread overlayed lines in the vertical direction.
     */
    private readonly drawHermiteCurve: LineRenderer = (line, relativeRowIndex, tooltip = undefined): void => {
//        relativeRowIndex = Math.random();

        let regularVector: geomTypes.IPoint = {
            x: (line.rightRegularPcpPoint[0] - line.leftRegularPcpPoint[0]),
            y: (line.rightRegularPcpPoint[1] - line.leftRegularPcpPoint[1])
        };

        // linear angle preserving parts
        const leftLineEnd: geomTypes.IPoint = {
            x: line.left.x + regularVector.x * this._curveLinear,
            y: line.left.y + regularVector.y * this._curveLinear
        };
        const rightLineEnd: geomTypes.IPoint = {
            x: line.right.x - regularVector.x * this._curveLinear,
            y: line.right.y - regularVector.y * this._curveLinear
        };

        let crossVector: THREE.Vector3;
        let fanVector: THREE.Vector3;
        if (this._fanoutLines) {
            crossVector = fanVector = new THREE.Vector3(
                regularVector.x * (this._curveControl + this._curveControlVariance * (relativeRowIndex - 0.5)),
                regularVector.y * (this._curveControl + this._curveControlVariance * (relativeRowIndex - 0.5)),
                0
            );
            if (!this._crossCurves) {
                fanVector = new THREE.Vector3(
                    regularVector.x * (this._curveControl - this._curveControlVariance * (relativeRowIndex - 0.5)),
                    regularVector.y * (this._curveControl - this._curveControlVariance * (relativeRowIndex - 0.5)),
                    0
                );
            }
        } else {
            crossVector = fanVector = new THREE.Vector3(
                regularVector.x * this._curveControl,
                regularVector.y * this._curveControl,
                0
            );
        }

        let curve = new Hermy.HermiteCurve3(
            new THREE.Vector3(leftLineEnd.x, leftLineEnd.y, 0),
            crossVector,
            new THREE.Vector3(rightLineEnd.x, rightLineEnd.y, 0),
            fanVector
        );

        let curvePoints = curve.getPoints(50);

        curvePoints = [
            new THREE.Vector3(line.left.x, line.left.y, 0),
            ...curvePoints,
            new THREE.Vector3(line.right.x, line.right.y, 0)
        ];

        const bin = this.currentBinSelector(this.currentWeightSelector(line.left, line.right));
        if (this.styling === style.PlotStyles.Teaser && bin > 0)
            this.addLineToScene(bin, curvePoints, line.weight, 7);
        else
            this.addLineToScene(bin, curvePoints, line.weight);
    }



    private drawAxes = (): SVG.G => {
        const axesGroup = this.vizContent.group();
        axesGroup.addClass(style.StyleClasses.Axis);

        const dimensions = this.renderDimensions;
        const renderedAxes = new Array<SVG.G>(dimensions.length);
        const clusters = this.renderClusters;

        for (var i = 0; i < dimensions.length; i++) {
            renderedAxes[i] = this.drawAxis(
                axesGroup,
                this._dimSize.width * i,
                dimensions[i],
                i,
                clusters[i]);
        }

        // move everything down and left so
        // the highest axis is at the top and the first name starts at 0
        let bbox = axesGroup.rbox(this.vizContent);
        axesGroup.translate(-bbox.x, -bbox.y);

        // get the final bounding boxes of each axis
        for (let axis of this._axisByCluster.values()) {
            axis.box = axis.shape.rbox(this.vizContent);
        }

        return axesGroup;
    }

    private drawAxis = (parent: SVG.G, offsetX: number, dim: string, dimIndex: number, clusters: dt.Cluster[]): SVG.G => {
        // how many copies do we need to generate?
        const numberOfCopies = Math.max(clusters.length, 1);

        // arrange the copies vertically
        const arrangement = new AxisArrangement(dim, clusters.length, this._dimSize.height, this._shrinkFactor, this._spaceFactor);

        // create a group for the current axes
        const group = parent.group();
        group.addClass(style.StyleClasses.Axis);

        // add a label for the dimension
        const dimLabel = group.plain(dim)
            .addClass(style.StyleClasses.Dimension)
            .addClass(style.StyleClasses.Label);
        dimLabel.attr({
            x: 0,
            "text-anchor": SVG.TextAnchors.Middle,
            "font-size": this._labelSize
        } as SVG.attrs);
        if (this._dimLabelOnBottom) {
            dimLabel.attr({
                y: arrangement.totalHeight + this._labelSize * ClusteredPCP.LabelDistance, // move the dim label below the axes
                "dominant-baseline": "text-before-edge"
            } as SVG.attrs);
        }
        else {
            dimLabel.attr({
                y: -this._labelSize * ClusteredPCP.LabelDistance, // move the dim label above the axes (they start at 0)
                "dominant-baseline": "text-after-edge"
            } as SVG.attrs);
        }

        // generate the shapes for the axes
        const axesShapes = new Array<SVG.Shape>(numberOfCopies);
        // calculate the size of the tick labels
        let tickLabelSize = this._labelSize * this._maxTickLabelSize;
        if (0 < arrangement.spaceBetween && arrangement.spaceBetween < tickLabelSize)
            tickLabelSize = arrangement.spaceBetween;
        // create a copy of the axis for each cluster
        for (let i = 0; i < numberOfCopies; i++) {
            // create a group for each copy of the axis
            const toolgroup = group.group();
            // add info on whether it is noise or an actual cluster
            switch (clusters[i].type) {
                case dt.ClusterType.Noise:
                    toolgroup.addClass(style.StyleClasses.Noise);
                    break;
                case dt.ClusterType.Regular:
                    toolgroup.addClass(style.StyleClasses.Cluster);
                    break;
            }
            // add tooltip
            toolgroup.title(clusters[i].name);

            // calculate top end of axis line
            const y = i * (arrangement.singleHeight + arrangement.spaceBetween);

            // create group for tick marks and their labels
            // ticks
            const tickGroup = toolgroup.group()
                .addClass(style.StyleClasses.Tick);
            const topTick = tickGroup.line(
                0, y,
                0, y + 1
            );
            const bottomTick = tickGroup.line(
                0, y + arrangement.singleHeight,
                0, y + arrangement.singleHeight - 1
            );
            // tick labels
            const valueRange = this.data.info.valueRangeByName.get(dim);
            tickGroup.plain(valueRange.max.toLocaleString()).attr({
                x: 0,
                y: topTick.bbox().cy,
                "text-anchor": SVG.TextAnchors.End,
                "dominant-baseline": "central",
                "font-size": tickLabelSize,
            } as SVG.attrs);
            tickGroup.plain(valueRange.min.toLocaleString()).attr({
                x: 0,
                y: bottomTick.bbox().cy,
                "text-anchor": SVG.TextAnchors.End,
                "dominant-baseline": "central",
                "font-size": tickLabelSize,
            } as SVG.attrs);

            // actual line that represents the axis copy
            const line = toolgroup.line(
                0, y,
                0, y + arrangement.singleHeight);
            // label the axis shape with a CSS class
            line.addClass(style.StyleClasses.Axis);

            // remember the shapes that we created (for later)
            axesShapes[i] = line;
        }

        // add a label for cluster info
        this.drawClusterInfo(group, arrangement, _.first(clusters));

        // offset the axes to the right location (centered vertically and moved to the right)
        const heightOverflow = group.bbox().height - this._dimSize.height;
        group.translate(offsetX, -(heightOverflow / 2.0));

        // remember what shape represents each cluster
        for (let i = 0; i < numberOfCopies; i++) {
            this._axisByCluster.set(clusters[i], {
                shape: axesShapes[i],
                box: null
            });
        }

        return group;
    }

    /**
     * Adds a label at the bottom, that shows what dimensions whent into clustering.
     **/
    private drawClusterInfo(parent: SVG.G, arrangement: AxisArrangement, cluster: dt.Cluster): void {
        if (cluster.type == dt.ClusterType.Dummy)
            return;

        const clusterInfoSize = this._labelSize * this._clusterLabelSize;
        const maxWidth = this.dimSizeWidth * this._clusterLabelWidth;
        const bottom = parent.bbox().y2;

        //const longText = "king of cluster-flow parallel coordinates";
        //if (!cluster.predefinedClusterMethod) {
        //    this.drawPredefinedClusterInfo(parent, arrangement, longText, clusterInfoSize);
        if (cluster.predefinedClusterMethod) {
            this.drawPredefinedClusterInfo(parent, arrangement, cluster.predefinedClusterMethod, clusterInfoSize, maxWidth);
            return;
        }

        //let leftText = longText;
        let leftText = cluster.leftDim.trim();
        let rightText = cluster.rightDim.trim();

        const clusterLabel = parent.text(() => { });
        clusterLabel.build(true);
        clusterLabel.plain("(");
        const left = clusterLabel.tspan(leftText);
        const center = clusterLabel.tspan(" x ");
        const right = clusterLabel.tspan(rightText);
        clusterLabel.plain(")");
        clusterLabel.build(false);
        clusterLabel.attr({
            x: 0,
            y: bottom + clusterInfoSize * ClusteredPCP.LabelDistance,
            //y: arrangement.totalHeight + clusterInfoSize * ClusteredPCP.LabelDistance,
            "text-anchor": SVG.TextAnchors.Middle,
            "dominant-baseline": "text-before-edge",
            "font-size": clusterInfoSize,
        } as SVG.attrs);

        // ensure the label is narrow enough to fit between dimensions
        const abbreviate = (txt: string, span: SVG.Tspan, multipleWords: boolean): string => {
            txt = txt.slice(0, -1);
            span.node.textContent = txt + (multipleWords ? "…" : ".");
            return txt;
        };
        let leftMultipleWords = false;
        let rightMultipleWords = false;
        for (
            let width = clusterLabel.node.getComputedTextLength();
            width > maxWidth && leftText.length > 1 && rightText.length > 1;
            width = clusterLabel.node.getComputedTextLength()
        ) {
            // shorten the text on the wider side
            let trimmed: string;
            if (left.node.getComputedTextLength() > right.node.getComputedTextLength() && (trimmed = leftText.trimRight()).length > 1) {
                if (!leftMultipleWords && trimmed !== leftText)
                    leftMultipleWords = true;
                leftText = abbreviate(trimmed, left, leftMultipleWords);
            } else {
                trimmed = rightText.trimRight();
                if (!rightMultipleWords && trimmed !== rightText)
                    rightMultipleWords = true;
                rightText = abbreviate(trimmed, right, rightMultipleWords);
            }
        }
    }
    private drawPredefinedClusterInfo(parent: SVG.G, arrangement: AxisArrangement, clusterMethod: string, clusterInfoSize: number, maxWidth: number): void {
        const wrap = function (txt) { return `(${txt})`; }

        clusterMethod = clusterMethod.trim();

        const clusterLabel = parent.plain(wrap(clusterMethod));
        clusterLabel.attr({
            x: 0,
            y: arrangement.totalHeight + clusterInfoSize * ClusteredPCP.LabelDistance,
            "text-anchor": SVG.TextAnchors.Middle,
            "dominant-baseline": "text-before-edge",
            "font-size": clusterInfoSize,
        } as SVG.attrs);

        // check whether the label is too wide
        let multipleWords = false;
        for (
            let width = clusterLabel.node.getComputedTextLength();
            width > maxWidth && clusterMethod.length > 1;
            width = clusterLabel.node.getComputedTextLength()
        ) {
            // remove last character and add dot or ellipsis
            let trimmed = clusterMethod.trimRight();
            if (!multipleWords && trimmed !== clusterMethod)
                multipleWords = true;
            clusterMethod = trimmed.slice(0, -1);
            trimmed += multipleWords ? "…" : ".";
            clusterLabel.plain(wrap(trimmed));
        }
    }

    private static styleAxis(axis: SVG.Shape, cluster: dt.Cluster): void {
        // label the axis shape with a CSS class
        axis.addClass(style.StyleClasses.Axis);

        // give it the noise class, too
        switch (cluster.type) {
            case dt.ClusterType.Noise:
                axis.addClass(style.StyleClasses.Noise);
                break;
            case dt.ClusterType.Regular:
                axis.addClass(style.StyleClasses.Cluster);
                break;
        }
    }

    private getRelatedAxis = (dim: string): void => {
        switch (this.readingDirection) {
            case ReadingDirection.LTR:
                return this._data.info.dimNames[dim]
        }
    }



    private drawClusterConnectors = (): SVG.G => {
        // create a group for collective movement
        const group = this.vizContent.group();
        group.addClass(style.StyleClasses.Connector);

        if (this._showOnlyUsedConnections !== Connections.All && this._showOnlyUsedConnections !== Connections.Used)
            return group;

        // draw a connector between each axis of neighbouring dimensions
        const renderClusters = this.renderClusters;
        let leftAxes = renderClusters[0].map(c => this._axisByCluster.get(c));
        for (let d = 1; d < renderClusters.length; d++) {
            let rightAxes = renderClusters[d].map(c => this._axisByCluster.get(c));

            for (let l = 0; l < leftAxes.length; l++) {
                for (let r = 0; r < rightAxes.length; r++) {
                    // do not draw a connection if there are no lines between the clusters
                    if (this._showOnlyUsedConnections === Connections.Used
                        && utils.MapHelper.get(this._connectionsByAxes, leftAxes[l].shape, rightAxes[r].shape) === undefined)
                        continue;

                    // draw a trapezoid as a connector between the axis shapes
                    const points = [
                        [leftAxes[l].box.x, leftAxes[l].box.y],
                        [leftAxes[l].box.x, leftAxes[l].box.y2],
                        [rightAxes[r].box.x, rightAxes[r].box.y2],
                        [rightAxes[r].box.x, rightAxes[r].box.y]
                    ];

                    const connector = group.polygon(points);
                    connector.addClass(style.StyleClasses.Connector);
                }
            }

            leftAxes = rightAxes;
        }

        return group;
    }



    // #region Freezable

    private readonly updatePlotFreezer = new Freeze.Freezer(this.updatePlot);
    private readonly updateRenderFreezer = new Freeze.Freezer(this.updateRender, this.updatePlotFreezer);
    private readonly updateRenderClustersFreezer = new Freeze.Freezer(this.updateRenderClusters, this.updatePlotFreezer);
    private readonly updateRenderDimensionsFreezer = new Freeze.Freezer(this.updateRenderDimensions, this.updateRenderClustersFreezer);
    public freeze = (): void => {
        this.updateRenderDimensionsFreezer.freeze();
        this.updateRenderClustersFreezer.freeze();
        this.updateRenderFreezer.freeze();
        this.updatePlotFreezer.freeze();
    }
    public unFreeze = (): void => {
        this.updateRenderDimensionsFreezer.unFreeze();
        this.updateRenderClustersFreezer.unFreeze();
        this.updateRenderFreezer.unFreeze();
        this.updatePlotFreezer.unFreeze();
    }

    // #endregion Freezable
}

export namespace ClusteredPCP {
    export const LabelDistance = 0.4;
    export const LineThickness = 1;
}
