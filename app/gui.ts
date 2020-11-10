import Papa = require("papaparse");
import pcp = require("./clustered-pcp");
import style = require("./clustered-plot-style");
import clustering = require("./clustering");
import utils = require("./utils");
import _ = require("lodash");
import dat = require("dat.gui");
import events = require("./liteEvent");
//import dat = require('./dat-gui-extensions');




type ValuesOfStringKeys<T> = {
    readonly [P in keyof T]: T[P];
}
function getValuesOfStringKeys<T>(obj: T): ValuesOfStringKeys<T> {
    const stringKeys = Object.keys(obj).filter(k => Number.isNaN(Number.parseInt(k)));
    const mapped = stringKeys.reduce(
        (accumulator, current) => {
            accumulator[current] = obj[current];
            return accumulator;
        },
        {} as ValuesOfStringKeys<T>);
    return mapped;
}

const availablePlotStyles = getValuesOfStringKeys(style.PlotStyles);
const readingDirections = {
    "Left to Right": pcp.ReadingDirection.LTR,
    "Right to Left": pcp.ReadingDirection.RTL,
};
const connections = pcp.Connections;
const fuzzyness = pcp.FuzzyDisplay;
const lineMatching = pcp.LineMatching;
const densityMap = getValuesOfStringKeys(pcp.DensityMap);


export type AvailableDataList = { [key: string]: string };

export namespace GuiGroups {
    export const actions = "actions";
    export const clusterParams = "clusterParams";
    export const generalLayout = "generalLayout";
    export const axisStuff = "axisStuff";
    export const lineLayout = "lineLayout";
    export const lineRendering = "lineRendering";
};

export class Gui {
    private _actions: dat.GUI = null;
    public get actions(): dat.GUI {
        return this._actions;
    }

    private _clusterParams: dat.GUI = null;
    public get clusterParams(): dat.GUI {
        return this._clusterParams;
    }

    private _generalLayout: dat.GUI = null;
    public get generalLayout(): dat.GUI {
        return this._generalLayout;
    }

    private _axisStuff: dat.GUI = null;
    public get axisStuff(): dat.GUI {
        return this._axisStuff;
    }

    private _lineLayout: dat.GUI = null;
    public get lineLayout(): dat.GUI {
        return this._lineLayout;
    }

    private _lineRendering: dat.GUI = null;
    public get lineRendering(): dat.GUI {
        return this._lineRendering;
    }

    private _groups: dat.GUI[] = new Array<dat.GUI>(Object.keys(GuiGroups).length);

    //private static readonly groups = ["actions", "clusterParams", "generalLayout", "axisStuff", "lineLayout", "lineRendering"];


    private readonly _selectedDataController;
    private _selectedData: string = null;// = { data: null as string };// availableData["Paper_EColi"] };
    public get selectedData(): string {
        return this._selectedData;
    }
    public set selectedData(value: string) {
        if (this._selectedData === value)
            return;

        this._selectedData = value;
        if (this._selectedDataController)
            this._selectedDataController.updateDisplay();
        this.onSelectedDataChanged.trigger(this);
    }

    private onSelectedDataChanged = new events.LiteEvent<Gui>();
    public get selectedDataChanged(): events.ILiteEvent<Gui> {
        return this.onSelectedDataChanged;
    }

    constructor(containerPrefix: string, legend: HTMLElement, plot: pcp.ClusteredPCP, clusterAlgo: clustering.ClusterAlgorithm, availableData: AvailableDataList) {
        // get current settings
        legend.innerHTML = "";
        legend.appendChild(plot.styling.fuzzyGradient.canvas);

        // create GUI containers
        for (let group in GuiGroups) {
            this[`_${group}`] = new dat.GUI({
                autoPlace: false,
                closed: false
            } as dat.GUIParams);
            //this[group].close();
        }

        // Create custom actions
        const uiActions = {
            saveSvg: () => plot.exportSvg(clusterAlgo),
            saveCsv: () => {
                const csv = Papa.unparse(plot.data.normalizedRows);
                let fileName = this.selectedData;
                fileName = _.last(fileName.split(/[\\\/]/));
                fileName = _.first(fileName.split("."));
                utils.FileHelper.saveCsv(csv, `${fileName}_normalized`);
            }
        }

        // Actions
        const actionGui = this.actions.addFolder("File");
        this._selectedDataController = actionGui.add(this, "selectedData", availableData);
        //actionGui.add(this._selectedData, "data", availableData).listen().onChange(() => this.onSelectedDataChanged.trigger(this));
        actionGui.add(plot, "styling", availablePlotStyles).name("Styling").onChange((newValue) => {
            legend.innerHTML = "";
            legend.appendChild(newValue.fuzzyGradient.canvas);
        });
        actionGui.add(uiActions, "saveSvg").name("Export SVG");
        actionGui.add(uiActions, "saveCsv").name("Normalized CSV");
        actionGui.open();

        // Cluster parameters
        // TODO: choose parameters using histogram-like approach (count neighbor points, estimate distance to nearest neighbor)
        const clusterGui = this.clusterParams.addFolder("Clustering");
        clusterGui.add(clusterAlgo.settings, "enabled");
        clusterGui.add(clusterAlgo.settings, "epsMin").min(0).max(1);
        clusterGui.add(clusterAlgo.settings, "epsMax").min(0).max(1);
        clusterGui.add(clusterAlgo.settings, "mPtsMin").min(1);
        clusterGui.add(clusterAlgo.settings, "mPtsMax").min(1);
        clusterGui.open();

        // General Layout
        const generalLayoutGui = this.generalLayout.addFolder("View");
        generalLayoutGui.add(plot.margin, "left", 0, 100, 10).name("Margin left");
        generalLayoutGui.add(plot.margin, "right", 0, 100, 10).name("Margin right");
        generalLayoutGui.add(plot.margin, "top", 0, 100, 10).name("Margin top");
        generalLayoutGui.add(plot.margin, "bottom", 0, 100, 10).name("Margin bottom");
        generalLayoutGui.add(plot.dimSize, "width").name("Dim width");
        generalLayoutGui.add(plot.dimSize, "height").name("Dim height");
        generalLayoutGui.add(plot, "labelSize", 0, 50, 1).name("Font size");
        generalLayoutGui.add(plot, "clusterLabelSize", 0.05, 1, 0.05).name("Info F-size");
        generalLayoutGui.add(plot, "maxTickLabelSize", 0.05, 1, 0.05).name("Tick F-size");
        generalLayoutGui.open();

        // Axis Stuff
        const axisGui = this.axisStuff.addFolder("Axes");
        axisGui.add(plot, "shrinkFactor").min(0).max(1).step(0.05).name("Shrink factor");
        axisGui.add(plot, "spaceFactor").min(0).max(0.5).step(0.05).name("Space factor");
        axisGui.add(plot, "readingDirection", readingDirections).name("Reading direction");
        axisGui.add(plot, "displayFuzzyness", fuzzyness).name("Show Fuzzyness");
        axisGui.add(plot, "invertFuzzyLayerOrder").name("Reverse Layers");
        axisGui.add(plot, "showOnlyUsedConnections", connections).name("Connections");
        axisGui.add(plot, "lineMatching", lineMatching).name("Line Matching");
        axisGui.open();

        // Line Layout
        const lineLayoutGui = this.lineLayout.addFolder("Line Layout");
        lineLayoutGui.add(plot, "preserveAngles").name("Preserve angles");
        lineLayoutGui.add(plot, "fanoutLines").name("Fan out lines");
        lineLayoutGui.add(plot, "crossCurves").name("Cross curves");
        lineLayoutGui.add(plot, "curveLinear").min(0).max(0.5).step(0.05).name("Linear length");
        lineLayoutGui.add(plot, "curveControl").min(0).max(2).step(0.05).name("Bendyness");
        lineLayoutGui.add(plot, "curveControlVariance").min(0).max(1).step(0.05).name("Bend variance");
        lineLayoutGui.open();

        // Line Rendering
        const lineRenderGui = this.lineRendering.addFolder("Line Rendering");
        lineRenderGui.add(plot, "superSampling").min(1).max(8).step(1).name("SSAA");
        lineRenderGui.add(plot, "densityMap", densityMap).name("Density Map");
        lineRenderGui.add(plot, "minSourceDensity").min(0.0).max(1.0).name("Min Source");
        lineRenderGui.add(plot, "minTargetDensity").min(0.0).max(1.0).name("Min Target");
        lineRenderGui.add(plot, "maxSourceDensity").min(0.0).max(1.0).name("Max Source");
        lineRenderGui.add(plot, "maxTargetDensity").min(0.0).max(1.0).name("Max Target");
        lineRenderGui.open();

        // Add GUI containers to website
        for (let group in GuiGroups) {
            const domHostId = containerPrefix + group;
            let domHost = document.getElementById(domHostId);
            if (domHost)
                domHost.appendChild(this[group].domElement);
            else
                console.error(`Can't find host for gui group "${group}" ("${domHostId}").`);
        }

        // Allow saving the plot with Ctrl+S
        document.body.onkeypress = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.key === "s") {
                event.preventDefault();
                uiActions.saveSvg();
            }
        };
    }
}
