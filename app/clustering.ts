import fuzzy = require("fuzzy-dbscan");
import _ = require("lodash");
import utils = require("./utils");
import dt = require("./data-types");
import events = require("./liteEvent");


export const enum Category {
    None = "",
    Core = "CORE",
    Border = "BORDER",
    Noise = "NOISE",
}
export import Assignment = fuzzy.Assignment;
import { IDataRow } from "./data-types";
export type Cluster = Array<fuzzy.Assignment>;
export type ClusteringResult = Array<Cluster>;

export interface IClusterSettings {
    enabled: boolean;
    epsMin: number;
    epsMax: number;
    mPtsMin: number;
    mPtsMax: number;
}

export class ClusterSettings implements IClusterSettings {
    private readonly onChanged = new events.LiteEvent<ClusterSettings>();
    public get Changed(): events.ILiteEvent<ClusterSettings> { return this.onChanged; }

    private _enabled: boolean = true;
    public get enabled(): boolean {
        return this._enabled;
    }
    public set enabled(value: boolean) {
        if (this._enabled === value)
            return;

        this._enabled = value;
        this.onChanged.trigger(this);
    }

    private _epsMin: number = 0.1;
    public get epsMin(): number {
        return this._epsMin;
    }
    public set epsMin(value: number) {
        if (this._epsMin === value)
            return;

        this._epsMin = value;
        this.onChanged.trigger(this);
    }

    private _epsMax: number = 0.5;
    public get epsMax(): number {
        return this._epsMax;
    }
    public set epsMax(value: number) {
        if (this._epsMax === value)
            return;

        this._epsMax = value;
        this.onChanged.trigger(this);
    }

    private _mPtsMin: number = 5;
    public get mPtsMin(): number {
        return this._mPtsMin;
    }
    public set mPtsMin(value: number) {
        if (this._mPtsMin === value)
            return;

        this._mPtsMin = value;
        this.onChanged.trigger(this);
    }

    private _mPtsMax: number = 10;
    public get mPtsMax(): number {
        return this._mPtsMax;
    }
    public set mPtsMax(value: number) {
        if (this._mPtsMax === value)
            return;

        this._mPtsMax = value;
        this.onChanged.trigger(this);
    }
}

type ClusterData = { [key: string]: string };
class OrderedDimension {
    public name: string;
    public index: number;

    constructor(name: string, index: number) {
        this.name = name;
        this.index = index;
    }
}
export interface PrecomputedClusterInfo {
    clusterName: string;
    clusterMethod: string;
}
export class ClusterDimension extends OrderedDimension implements PrecomputedClusterInfo {
    public readonly clusterName: string;
    public readonly clusterMethod: string;
    public readonly hasHardClusters: boolean;

    constructor(dim: OrderedDimension) {
        super(dim.name, dim.index);

        const parsed = ClusterDimension.parseColumnTitle(dim.name);
        this.clusterName = parsed.clusterName;
        this.clusterMethod = parsed.clusterMethod;
        this.hasHardClusters = (parsed.clusterName === undefined);
    }

    public static parseColumnTitle(columnTitle: string): Partial<PrecomputedClusterInfo> {
        let info: Partial<PrecomputedClusterInfo> = {}

        if (_.isNil(columnTitle) || !_.isString(columnTitle) || columnTitle.length < 1)
            return info;

        let values = columnTitle.split("!");
        if (values.length < 3)
            return info;

        // hard clusters
        if (values.length === 3) {
            info.clusterMethod = values[2];
        }
        // soft clusters
        else if (values.length >= 4) {
            info.clusterName = values[2];
            info.clusterMethod = values[3];
        }

        return info;
    }

    public static isClusterDimension(columnTitle: string): boolean {
        return columnTitle.startsWith(ClusterDimension.PrecomputedClusterPrefix);
    }
}
export namespace ClusterDimension {
    export const PrecomputedClusterPrefix = "!clusters!";
}

export class ClusterAlgorithm {

    private readonly _settings = new ClusterSettings();
    public get settings() { return this._settings; }
    public set settings(settings: ClusterSettings) { this.settings = settings; }


    /**
     * Gets a function that can calculate the euclidian distance between points in 2D.
     * @param dim1 The name of the property that holds the value for the first dimension.
     * @param dim2 The name of the property that holds the value for the second dimension.
     */
    private static Distance2<T>(dim1: keyof T, dim2: keyof T): (a: T, b: T) => number {
        return (a: T, b: T) => {
            return Math.sqrt(
                Math.pow((b[dim1] as any) - (a[dim1] as any), 2)
                +
                Math.pow((b[dim2] as any) - (a[dim2] as any), 2)
            );
        }
    }
    private static Distance3<T>(dim1: keyof T, dim2: keyof T, dim3: keyof T): (a: T, b: T) => number {
        return (a: T, b: T) => {
            return Math.sqrt(
                Math.pow((b[dim1] as any) - (a[dim1] as any), 2)
                +
                Math.pow((b[dim2] as any) - (a[dim2] as any), 2)
                +
                Math.pow((b[dim3] as any) - (a[dim3] as any), 2)
            );
        }
    }


    public getRenderData = (data: dt.IDataRow[], forceAutoClustering: boolean): dt.Data => {
        // handle pre-computed clusters (if there are any)
        // if clustering is disabled, we need to clean up the data (just as with auto-clustering)
        let renderData = ClusterAlgorithm.extractAllClusters2(data, forceAutoClustering || !this._settings.enabled);

        // no pre-computed clusters => let's detect them ourselves!
        if (_.isNil(renderData)) {
            // create a wrapper to combine data with clusters
            renderData = new dt.Data(data);
            // compute and add clusters
            this.computeAllClusters2(renderData);
        }

        return renderData;
    }


    /**
     * Creates render data from parsed data with pre-computed clusters.
     * Discards included cluster info if auto-clustering is forced.
     */
    public static extractAllClusters2(data: dt.IDataRow[], forceAutoClustering: boolean): dt.Data {
        // get the names of all string or number dimensions
        const allDims = utils.ArrayHelper.getPlottableDimensions(data);

        // check to see whether the data is already pre-clustered
        let preClustered = false;
        for (let field of allDims) {
            if (ClusterDimension.isClusterDimension(field)) {
                preClustered = true;
                break;
            }
        }

        // not preclustered => nothing to do here
        if (!preClustered)
            return undefined;

        // separate the dimensions that contain actual data and the ones with cluster info
        const indexedDims = allDims.map((f, i) => new OrderedDimension(f, i));
        const clusterDims = indexedDims
            .filter(f => ClusterDimension.isClusterDimension(f.name))
            .map(d => new ClusterDimension(d));
        const valueDims = indexedDims
            .filter(f => !ClusterDimension.isClusterDimension(f.name));

        // separate actual data values and cluster info
        const clusterData = new Array<ClusterData>(data.length);
        for (let i = 0; i < clusterData.length; i++)
            clusterData[i] = {};
        for (let dim of clusterDims) {
            for (let i = 0; i < clusterData.length; i++) {
                // copy pre-computed cluster data
                clusterData[i][dim.name] = data[i][dim.name];
                // remove original
                delete data[i][dim.name];
            }
        }

        // are we supposed to do our own dim ordering?
        // => only works when we have the clusters between all pairs of dims
        // => we don't have all of them (only pre-computed ones)
        // => let's disregard pre-cluster info and return without creating cluster objects
        // => auto-clustering kicks in and won't be disturbed by the pesky extra dims
        if (forceAutoClustering)
            return undefined;

        // get render data from pre-computed clusters
        return this.renderDataFromPrecomputedClusters(data, valueDims, clusterData, clusterDims);
    }


    public static renderDataFromPrecomputedClusters(valueData: dt.IDataRow[], valueDims: OrderedDimension[], clusterData: ClusterData[], clusterDims: ClusterDimension[]): dt.Data {
        // create a wrapper that combines clusters and data
        const renderData = new dt.Data(valueData);

        // get all precomputed clusters
        for (const clusterDim of clusterDims) {
            const leftDim = _.findLast(valueDims, vd => vd.index < clusterDim.index);
            const rightDim = valueDims.find(vd => vd.index > clusterDim.index);

            // we might have more than a single cluster assignment for each row
            // => meaning fuzzy clustering, which means multiple!cluster!~columns between data columns
            // => we need to handle all those columns involved between one pair of data dimension in a single go
            // => find out what columns are involved!
            
            // if we are not the first column, then we have already been dealt with.
            if (clusterDim.index > (leftDim.index + 1))
                continue;
            // we are the first column that belongs to the clustering. now find all the others so we can start working with the pre-computed clusters
            const involvedDims = clusterDims.filter(col => col.index > leftDim.index && col.index < rightDim.index);

            // get a list of all defined clusters
            let clusterIds = new Array<string>();
            // hard clustering with cluster names as values within data rows
            if (clusterDim.hasHardClusters)
                clusterIds = clusterData.map(row => row[clusterDim.name].toString());
            // soft clustering with cluster names as part of column headers
            else
                clusterIds = involvedDims.map(d => d.clusterName);

            // we only want unique names that are not empty
            clusterIds = _.uniq(clusterIds).filter(id => !_.isEmpty(id));

            // create a cluster for rows without any cluster assignement (noise)
            const noiseClusterId = dt.ClusterType.Noise.toLowerCase();
            const noiseCluster = new dt.Cluster();
            noiseCluster.predefinedClusterMethod = clusterDim.clusterMethod;
            noiseCluster.leftDim = leftDim.name;
            noiseCluster.rightDim = rightDim.name;
            noiseCluster.type = dt.ClusterType.Noise;
            noiseCluster.name = noiseCluster.getDefaultName(noiseClusterId);
            noiseCluster.classification = new Map<dt.INormalizedDataRow, dt.Classification>();

            // create objects for those defined clusters
            let precomputedHasNoise = false;
            const clusters = new Map<string, dt.Cluster>();
            for (const clusterId of clusterIds) {
                // check if we are dealing with a noise cluster
                if (clusterId === noiseClusterId) {
                    // yes => use existing noise cluster
                    clusters.set(clusterId, noiseCluster);
                }
                else {
                    // no => create a new regular cluster
                    const newCluster = new dt.Cluster();
                    newCluster.predefinedClusterMethod = clusterDim.clusterMethod;
                    newCluster.leftDim = leftDim.name;
                    newCluster.rightDim = rightDim.name;
                    newCluster.type = dt.ClusterType.Regular;
                    newCluster.name = newCluster.getDefaultName(clusterId);
                    newCluster.classification = new Map<dt.INormalizedDataRow, dt.Classification>();

                    clusters.set(clusterId, newCluster);
                }
            }

            // add the data rows to the actual cluster objects
            for (let i = 0; i < clusterData.length; i++) {
                let rowIsNotClustered = true;

                // find the assignemnt in each cluster
                for (const dim of involvedDims) {
                    const value = clusterData[i][dim.name];
                    if (_.isEmpty(value))
                        continue;

                    rowIsNotClustered = false;

                    // depending on title: treat value as label or as cluster name
                    if (dim.clusterName === undefined) {
                        const cluster = clusters.get(value.toString());
                        cluster.classification.set(
                            renderData.normalizedRows[i],
                            { category: Category.Core, label: 1 } as dt.Classification
                        );
                    }
                    else {
                        const cluster = clusters.get(dim.clusterName);
                        const weight = Number.parseFloat(value);
                        cluster.classification.set(
                            renderData.normalizedRows[i],
                            { category: Category.Core, label: weight } as dt.Classification
                        );
                    }
                }

                // if the row does not belong to any explicit cluster, we add it to the noise cluster
                if (rowIsNotClustered) {
                    noiseCluster.classification.set(
                        renderData.normalizedRows[i],
                        {category: Category.Noise, label: 1} as dt.Classification
                    )
                }
            }

            // if our custom noise cluster has data, we need to treat it as if it was explicitly mentioned in the pre-clustered data that we are loading
            if (noiseCluster.classification.size > 0 && !clusters.has(noiseClusterId))
                clusters.set(noiseClusterId, noiseCluster)

            // add all existing clusters to the render data
            for (const cluster of clusters.values()) {
                // add in original direction
                utils.MapHelper.append(renderData.clusters, cluster, cluster.leftDim, cluster.rightDim);

                // flip direction
                const flipped = dt.Cluster.flip(cluster);
                utils.MapHelper.append(renderData.clusters, flipped, flipped.leftDim, flipped.rightDim);
            }
        }

        // add dummy clusters for the first and last dimension (for reading direction LTR and RTL)
        let firstDummy = new dt.Cluster();
        firstDummy.leftDim = firstDummy.rightDim = valueDims[0].name;
        firstDummy.type = dt.ClusterType.Dummy;
        firstDummy.classification = renderData.normalizedDummyClassification;
        firstDummy.name = firstDummy.getDefaultName();
        utils.MapHelper.append(renderData.clusters, firstDummy, firstDummy.leftDim, firstDummy.rightDim);

        let lastDummy = new dt.Cluster();
        lastDummy.leftDim = lastDummy.rightDim = _.last(valueDims).name;
        lastDummy.type = dt.ClusterType.Dummy;
        lastDummy.classification = renderData.normalizedDummyClassification;
        lastDummy.name = lastDummy.getDefaultName();
        utils.MapHelper.append(renderData.clusters, lastDummy, lastDummy.leftDim, lastDummy.rightDim);

        return renderData;
    }

    public static getTypeForDataParsing(column: number | string): boolean {
        // numeric column index
        // => no header in the file
        // => no way of telling if we are dealing with pre-clustered data
        // => just rely on papa parse's type handling
        if (_.isNumber(column))
            return true;

        // string as column name
        // => might be pre-computed
        // => if it is a regular field => say papa parse should handle the type
        // => if it is a pre-computed field => we will handle the parsing from string
        if (_.isString(column))
            return ClusterDimension.isClusterDimension(column);

        // weird way of specifying a column
        // => lets let papa parse handle the typing
        return true;
    }

    public static randomLabel() {
        //let input = Math.random(); // 0..1

        // use logistic function to make certain label more probable
        //return 1 / (1.0 + Math.pow(Math.E, -37 * (input - 0.15)));

        return 1;//Math.min(1, input * 30);

        // use logistic function to make certain label more probable
        //return Math.pow(input, 0.1);
    }


    public computeAllClusters2 = (data: dt.Data): void => {
        let dims = data.info.dimNames;

        // get all clusters between all dimensions (fill up the map that we created earlier on)
        for (var leftIndex = 0; leftIndex < dims.length; leftIndex++) {
            const leftDim = dims[leftIndex];

            for (var rightIndex = leftIndex; rightIndex < dims.length; rightIndex++) {
                const rightDim = dims[rightIndex];

                // if its the same dimension => dummy clusters
                if (rightDim === leftDim) {
                    // create a dummy cluster
                    const dummy = new dt.Cluster();
                    dummy.leftDim = leftDim;
                    dummy.rightDim = rightDim;
                    dummy.type = dt.ClusterType.Dummy;
                    dummy.classification = data.normalizedDummyClassification;
                    dummy.name = dummy.getDefaultName();

                    // add to existing clusters
                    utils.MapHelper.append(data.clusters, dummy, leftDim, rightDim);
                    if (rightDim !== leftDim)
                        utils.MapHelper.append(data.clusters, dt.Cluster.flip(dummy), rightDim, leftDim);
                }
                // do the actual clustering between number dimensions
                else {
                    // get clusters between dimensions
                    const clusters = this.computeClusters2(data.normalizedRows, leftDim, rightDim);
                    //console.log(clusters);
                    // add clusters in the direction they were computed
                    for (let cluster of clusters) {
                        utils.MapHelper.append(data.clusters, cluster, cluster.leftDim, cluster.rightDim);
                    }

                    // flip direction
                    const flippedClusters = clusters.map(dt.Cluster.flip);
                    for (let cluster of flippedClusters) {
                        utils.MapHelper.append(data.clusters, cluster, cluster.leftDim, cluster.rightDim);
                    }
                }

            }
        }
    }


    public computeClusters2 = <T>(data: any[], dim1: keyof T & string, dim2: keyof T & string): dt.Cluster[] => {
        const rawClusters = this.computeRawClusters2(data, dim1, dim2);
        //console.log(rawClusters);
        return ClusterAlgorithm.convertToDtClusters2(data, dim1, dim2, rawClusters);
    }
    public computeClusters3 = <T>(data: any[], dim1: keyof T & string, dim2: keyof T & string, dim3: keyof T & string): dt.Cluster[] => {
        const rawClusters = this.computeRawClusters3(data, dim1, dim2, dim3);
        //console.log(rawClusters);
        return ClusterAlgorithm.convertToDtClusters3(data, dim1, dim2, dim3, rawClusters);
    }


    private computeRawClusters2 = (data: any[], leftDim: string, rightDim: string): ClusteringResult => {
        // Check if we should actually do some clustering
        if (!this._settings.enabled)
            return ClusterAlgorithm.createNoneCluster(data);

        // Get the first row to inferr type info
        const firstRow = utils.ArrayHelper.firstOrEmpty(data);

        // Only do the clustering if the dimensions are of numeric types.
        if (_.isNumber(firstRow[leftDim]) && _.isNumber(firstRow[rightDim])) {
            const fuzzyDBSCAN = fuzzy();
            fuzzyDBSCAN
                .epsMin(this.settings.epsMin)
                .epsMax(this.settings.epsMax)
                .mPtsMin(this.settings.mPtsMin)
                .mPtsMax(this.settings.mPtsMax)
                .distanceFn(ClusterAlgorithm.Distance2(leftDim, rightDim));
            return fuzzyDBSCAN.cluster(data);
        }
        // Fake a cluster of "none"
        else {
            return ClusterAlgorithm.createNoneCluster(data);
        }
    }

    private computeRawClusters3 = (data: any[], leftDim: string, centerDim: string, rightDim: string): ClusteringResult => {
        // Check if we should actually do some clustering
        if (!this._settings.enabled)
            return ClusterAlgorithm.createNoneCluster(data);

        // Get the first row to inferr type info
        const firstRow = utils.ArrayHelper.firstOrEmpty(data);

        // Only do the clustering if the dimensions are of numeric types.
        if (_.isNumber(firstRow[leftDim]) && _.isNumber(firstRow[centerDim]) && _.isNumber(firstRow[rightDim])) {
            const fuzzyDBSCAN = fuzzy();
            fuzzyDBSCAN
                .epsMin(this.settings.epsMin)
                .epsMax(this.settings.epsMax)
                .mPtsMin(this.settings.mPtsMin)
                .mPtsMax(this.settings.mPtsMax)
                .distanceFn(ClusterAlgorithm.Distance3(leftDim, centerDim, rightDim));
            return fuzzyDBSCAN.cluster(data);
        }
        // Fake a cluster of "none"
        else {
            return ClusterAlgorithm.createNoneCluster(data);
        }
    }



    private static convertToDtClusters2(data: dt.IDataRow[], leftDim: string, rightDim: string, rawClusters: ClusteringResult): dt.Cluster[]  {
        return rawClusters.map((rawCluster, rawIndex) => {
            // Create a map: data row -> classification result
            const classifications = rawCluster.map(c => [
                data[c.index],
                { category: c.category, label: c.label } as dt.Classification]) as [dt.IDataRow, dt.Classification][];

            // find out what type of cluster this is
            let clusterType: dt.ClusterType;
            switch (rawCluster[0].category) {
                case Category.Noise as string:
                    clusterType = dt.ClusterType.Noise;
                    break;
                case Category.None as string:
                    clusterType = dt.ClusterType.Dummy;
                    break;
                default:
                    clusterType = dt.ClusterType.Regular;
                    break;
            }

            // name the cluster
            let clusterName = dt.Cluster.defaultName(leftDim, rightDim, clusterType, rawIndex);

            // create a cluster for the rendering component
            return new dt.Cluster(
                clusterName.toLowerCase(),
                leftDim,
                rightDim,
                clusterType,
                new Map(classifications));
        });
    }

    private static convertToDtClusters3(data: dt.IDataRow[], leftDim: string, centerDim: string, rightDim: string, rawClusters: ClusteringResult): dt.Cluster[] {
        return rawClusters.map((rawCluster, rawIndex) => {
            // Create a map: data row -> classification result
            const classifications = rawCluster.map(c => [
                data[c.index],
                { category: c.category, label: c.label } as dt.Classification]) as [dt.IDataRow, dt.Classification][];

            // find out what type of cluster this is
            let clusterType: dt.ClusterType;
            switch (rawCluster[0].category) {
                case Category.Noise as string:
                    clusterType = dt.ClusterType.Noise;
                    break;
                case Category.None as string:
                    clusterType = dt.ClusterType.Dummy;
                    break;
                default:
                    clusterType = dt.ClusterType.Regular;
                    break;
            }

            // name the cluster
            let clusterName = dt.Cluster.defaultName(`${leftDim}-${rightDim}`, centerDim, clusterType, rawIndex);

            // create a cluster for the rendering component
            return new dt.Cluster(
                clusterName.toLowerCase(),
                `${leftDim}-${rightDim}`,
                centerDim,
                clusterType,
                new Map(classifications));
        });
    }

    private static createNoneCluster(data: any[]): ClusteringResult {
        const points = new Array<fuzzy.Assignment>(data.length);
        for (var i = 0; i < data.length; i++) {
            points[i] = {
                index: i,
                category: Category.None as string,
                label: 1
            } as fuzzy.Assignment;
        }
        return [points];
    }
}