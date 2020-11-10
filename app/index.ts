import Papa = require("papaparse");
import freezable = require("./freezable");
import pcp = require("./clustered-pcp");
import style = require("./clustered-plot-style");
import clustering = require("./clustering");
import utils = require("./utils");
import _ = require("lodash");
import gui = require("./gui");
import $ = require("jquery");



const availableData = {
    "None":                 null as string,
    "FAQ Intra":            "data/faq.csv",
    "FAQ Inter":            "data/faq_inter.csv",
    "Generative":           "data/generative.csv",
    "Soft Generative":      "data/soft_generative.csv",
    "Teaser":               "data/soft_generative_2000.csv",
    "Brushed Teaser":       "data/soft_generative_2000_brushed.csv",
    "Brushed Generative":   "data/soft_generative_brushed.csv",
    /* Add data set here */
};
const availableDataKeys = utils.KeyHelper.ObjectKeysAsValues(availableData);

const initialDataSelection = availableDataKeys["Brushed Teaser"];


type DataKeys<T> = {
    [prop in keyof typeof availableData]: T
}
const defaultClusterSettings: Partial<DataKeys<Partial<clustering.IClusterSettings>>> = {
    /* Add cluster settings here */
    /* Example
    Teaser: {
        epsMin: 0.01,
        epsMax: 0.05,
        mPtsMin: 5,
        mPtsMax: 20
    },*/
};
const npf = 0.5;
const defaultPlotSettings: Partial<DataKeys<Partial<pcp.PlotSettings>>> = {
    /* Add plot settings here */
    /* Example
    Teaser: {
        optimizeDimOrder: true,
        overrideOptimalDimOrder: ["class", "alm2", "chg", "alm1", "lip", "aac", "mcg", "gvh", "name"],
        optimizeClusterOrder: pcp.ClusterOrderMethod.Crossings,
        overrideOptimalClusterOrder: [
            [0], // import balance
            [0, 1, 2], // hydro power
            [0, 2, 3, 1], // biomass
            [2, 1, 0, 4, 3], // uranium
            [3, 2, 1, 0], // brown coal
            [3, 0, 2, 1], // hard coal
            [1, 0], // oil
            [0, 2, 1], // gas
            [2, 0, 1], // others
            [0, 1], // pumped storage
            [0, 1], // seasonal storage
            [0, 1], // wind
            [0, 1, 2] // solar
        ]
    },*/
    
    "FAQ Intra": {
        labelSize: 18,
        optimizeDimOrder: false,
        optimizeClusterOrder: pcp.ClusterOrderMethod.None,
        dimSizeWidth: 150,
        dimSizeHeight: 300,
        superSampling: 4,
    },
    "FAQ Inter": {
        labelSize: 18,
        optimizeDimOrder: false,
        optimizeClusterOrder: pcp.ClusterOrderMethod.None,
        dimSizeWidth: 150,
        dimSizeHeight: 200,
        superSampling: 4,
    },
    "Generative": {
        labelSize: 14,
        optimizeDimOrder: false,
        optimizeClusterOrder: pcp.ClusterOrderMethod.None
    },
    "Soft Generative": {
        labelSize: 14,
        optimizeDimOrder: false,
        optimizeClusterOrder: pcp.ClusterOrderMethod.None,
        minTargetDensity: 0.2,
        minSourceDensity: 0,
        maxTargetDensity: 1,
        maxSourceDensity: 1,
        dimSizeWidth: 300,
        dimSizeHeight: 250,
        styling: style.PlotStyles.Bright,
    },
    "Brushed Generative": {
        labelSize: 14,
        optimizeDimOrder: false,
        optimizeClusterOrder: pcp.ClusterOrderMethod.None,
        minTargetDensity: 0.2,
        minSourceDensity: 0,
        maxTargetDensity: 1,
        maxSourceDensity: 1,
        dimSizeWidth: 300,
        dimSizeHeight: 250,
        styling: style.PlotStyles.Teaser,
        invertFuzzyLayerOrder: true,
    },
    "Teaser": {
        labelSize: 14,
        optimizeDimOrder: false,
        optimizeClusterOrder: pcp.ClusterOrderMethod.None,
        minTargetDensity: 0.2,
        minSourceDensity: 0,
        maxTargetDensity: 1,
        maxSourceDensity: 1,
        dimSizeWidth: 300,
        dimSizeHeight: 250,
        styling: style.PlotStyles.Bright,
        densityMap: pcp.DensityMap.LogLogistic,
    },
    "Brushed Teaser": {
        labelSize: 14,
        optimizeDimOrder: false,
        optimizeClusterOrder: pcp.ClusterOrderMethod.None,
        minTargetDensity: 0.2,
        minSourceDensity: 0,
        maxTargetDensity: 1,
        maxSourceDensity: 1,
        dimSizeWidth: 300,
        dimSizeHeight: 250,
        styling: style.PlotStyles.Teaser,
        invertFuzzyLayerOrder: true,
        densityMap: pcp.DensityMap.LogLogistic,
    },
};

let parsedData: Papa.ParseResult = null;

function loadAndParseCsv(path: string, selectedDataKey: string, plot: pcp.ClusteredPCP, clusterAlgo: clustering.ClusterAlgorithm) {
    // load the data and show it in the plot
    Papa.parse(path, {
        download: true,
        header: true,
        skipEmptyLines: true,
        comments: "#",
        dynamicTyping: clustering.ClusterAlgorithm.getTypeForDataParsing,
        complete: results => {
            // stop all updates
            plot.freeze();
            parsedData = null;
            plot.data = null;

            // apply default cluster settings
            if (!_.isNil(selectedDataKey)) {
                const clusterSettings = defaultClusterSettings[selectedDataKey] as clustering.ClusterSettings;
                if (clusterSettings) {
                    Object.assign(clusterAlgo.settings, clusterSettings);
                }
            }

            // apply default plot settings
            const plotSettings = _.isNil(selectedDataKey) ? null : defaultPlotSettings[selectedDataKey] as pcp.PlotSettings;
            if (plotSettings)
                Object.assign(plot, plotSettings);
            if (_.isNil(plotSettings) || _.isNil(plotSettings.overrideOptimalDimOrder))
                    plot.overrideOptimalDimOrder = null;

            // calculate clusters and render plot
            parsedData = results;
            clusterAndRenderData(plot, clusterAlgo, results);
            plot.data.name = selectedDataKey || "null";

            plot.unFreeze();
        }
    });
}

let firstRender = true;
function clusterAndRenderData(plot: pcp.ClusteredPCP, clusterAlgo: clustering.ClusterAlgorithm, parsedData: Papa.ParseResult) {
    console.log(parsedData);

    // get clusters (including pre-computed ones, real ones, and dummies)
    const renderData = clusterAlgo.getRenderData($.extend(true, [], parsedData.data), plot.optimizeClusterOrder === pcp.ClusterOrderMethod.Crossings);

    // render
    plot.data = renderData;

    // workaround for wrong plotting after first load (reason unknown)
    if (firstRender) {
        setTimeout(() => {
            console.log("Update plot after first run.")
            plot.freeze();
            plot.preserveAngles = !plot.preserveAngles;
            plot.preserveAngles = !plot.preserveAngles;
            plot.unFreeze();
            firstRender = false;
        }, 2000);
    }
}


function initialize() {
    // create the plot and cluster algorithm
    const plot = new pcp.ClusteredPCP("visualization");
    const clusterAlgo = new clustering.ClusterAlgorithm();
    clusterAlgo.settings.Changed.on(() => {
        if (!_.isNil(parsedData))
            clusterAndRenderData(plot, clusterAlgo, parsedData);
    });

    // add legend
    const legend = document.getElementById("legend");

    // set up GUI
    const menu = new gui.Gui("gui_", legend, plot, clusterAlgo, availableDataKeys);
    menu.selectedDataChanged.on((g) => loadAndParseCsv(availableData[g.selectedData], g.selectedData, plot, clusterAlgo));

    // load the data and show it in the plot
    menu.selectedData = initialDataSelection;
}

window.addEventListener("load", initialize);
