import _ = require("lodash");
import utils = require("./utils");


export interface Classification { category: string, label: number };

export const enum ClusterType {
    Regular = "regular",
    Noise = "noise",
    Dummy = "dummy"
}

export class Cluster {
    public predefinedClusterMethod: string;

    constructor();
    constructor(name: string);
    constructor(name: string, leftDim: string, rightDim: string);
    constructor(name: string, leftDim: string, rightDim: string, type: ClusterType, classification: Map<IDataRow, Classification>);
    constructor(
        public name: string = undefined,
        public leftDim: string = null,
        public rightDim: string = null,
        public type: ClusterType = ClusterType.Regular,
        public classification: Map<IDataRow, Classification> = null) {
        if (name === undefined)
            this.name = this.getDefaultName();
    }

    public getDefaultName = (index?: number | any): string => {
        return Cluster.defaultName(this.leftDim, this.rightDim, this.type, index);
    }

    public static defaultName(leftDim: string, rightDim: string, type: ClusterType = ClusterType.Dummy, index: number | any = 0): string {
        let name = "";
        if (leftDim || rightDim)
            name = `${leftDim || "#"}-${rightDim || "#"}`;

        switch (type) {
            case ClusterType.Regular:
                name += `-${index}`;
                break;
            default:
                name += `-${type}`;
                break;
        }

        return name;
    }

    public static flip(cluster: Cluster, index?: number): Cluster {
        let flipped = new Cluster();

        flipped.leftDim = cluster.rightDim;
        flipped.rightDim = cluster.leftDim;
        flipped.type = cluster.type;
        flipped.classification = cluster.classification;

        flipped.name = flipped.getDefaultName(index);
        return flipped;
    }
}

export interface IndexedClusters extends Map<string, Map<string, Cluster[]>> { };


export interface IDataRow { };

export type Normalized<T> = {
    readonly [P in keyof T]: T[P];
};
export interface INormalizedDataRow extends Normalized<IDataRow> { };

export interface DataRange { min: number, max: number, range: number };


export class Data {
    public readonly info: DataInfo;
    public readonly normalizedRows = new Array<INormalizedDataRow>();
    public readonly dummyClassification: Map<IDataRow, Classification>;
    public readonly normalizedDummyClassification: Map<INormalizedDataRow, Classification>;

    public name: string = undefined;

    constructor(rows: IDataRow[]);
    constructor(public readonly rows: IDataRow[], public readonly clusters: IndexedClusters = undefined) {
        if (_.isNil(clusters))
            this.clusters = new Map<string, Map<string, Cluster[]>>();
        this.info = new DataInfo(rows);
        this._normalizeRows();
        
        // generate reusable dummy classifications
        // regular
        const dummyMap = rows.map(r => [r as IDataRow, { category: "", label: 1 } as Classification] as [IDataRow, Classification]);
        this.dummyClassification = new Map(dummyMap);
        // normalized
        const normalizedDummyMap = this.normalizedRows.map(r => [r as IDataRow, { category: "", label: 1 } as Classification] as [IDataRow, Classification]);
        this.normalizedDummyClassification = new Map(normalizedDummyMap);
    }

    private _normalizeRows = () => {
        this.normalizedRows.length = 0;

        for (let row of this.rows) {
            this.normalizedRows.push(Object.assign({}, row));
        }

        for (let i = 0; i < this.info.dimNames.length; i++) {
            const dim = this.info.dimNames[i];
            const range = this.info.valueRanges[i];

            switch (this.info.dimTypes[i]) {
                case typeof 0:
                    for (let row of this.normalizedRows)
                        row[dim] = (range.range === 0) ? 0 : (row[dim] - range.min) / range.range;
                    break;
                case typeof "":
                    const map = this.info.nominalMaps[i];
                    for (let row of this.normalizedRows)
                        row[dim] = (range.range === 0) ? 0 : (map.get(row[dim]) - range.min) / range.range;
                    break;
                default:
                    for (let row of this.normalizedRows)
                        row[dim] = 0;
                    break;
            }
        }
    }
}

class DataInfo {
    public readonly dimCount: number;
    public readonly dimNames: string[];
    public readonly dimTypes: string[];
    public readonly dimIndexByName: Map<string, number>;
    public readonly dimTypeByName: Map<string, string>;
    public readonly valueRanges: DataRange[];
    public readonly valueRangeByName: Map<string, DataRange>;
    public readonly nominalMaps: Map<string, number>[];

    constructor(rows: IDataRow[]) {
        // get first data row (or default to empty object)
        const dataRow = utils.ArrayHelper.firstOrEmpty(rows);

        // get the names of all string or number dimensions
        this.dimNames = utils.ArrayHelper.getPlottableDimensions(dataRow);

        // count the dimensions and create a map (name <=> index)
        this.dimCount = this.dimNames.length;
        this.dimIndexByName = new Map<string, number>();
        for (var i = 0; i < this.dimCount; i++) {
            this.dimIndexByName.set(this.dimNames[i], i);
        }

        // list the dimension types
        this.dimTypes = this.dimNames.map(dimName => typeof (dataRow[dimName]));
        this.dimTypeByName = new Map<string, string>();
        for (var i = 0; i < this.dimCount; i++) {
            this.dimTypeByName.set(this.dimNames[i], this.dimTypes[i]);
        }

        // calculate the value ranges for each dimension
        this.valueRanges = this.dimNames.map((dimName, dimIndex): DataRange => {
            switch (this.dimTypes[dimIndex]) {
                case typeof 0:
                    let allNumbers = rows.map(r => r[dimName]);
                    let min = _.min(allNumbers);
                    let max = _.max(allNumbers);
                    return { min: min, max: max, range: max - min };
                case typeof "":
                    let uniqueStrings = _.uniqBy(rows, r => r[dimName]);
                    return { min: 0, max: uniqueStrings.length - 1, range: uniqueStrings.length - 1 };
                default:
                    return null;
            }
        });
        this.valueRangeByName = new Map<string, DataRange>();
        for (var i = 0; i < this.dimCount; i++) {
            this.valueRangeByName.set(this.dimNames[i], this.valueRanges[i]);
        }

        // generate lookup tables for nominal values
        this.nominalMaps = this.dimNames.map((dimName, dimIndex): Map<string, number> => {
            if (this.dimTypes[dimIndex] !== typeof "")
                return null;

            let uniqueStrings = _.uniq(rows.map(r => r[dimName])).sort();
            let map = new Map<string, number>();
            for (let i = 0; i < uniqueStrings.length; i++) {
                map.set(uniqueStrings[i], i);
            }
            return map;
        });
    }
}