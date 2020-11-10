# Cluster-Flow Parallel Coordinates (CF-PCP)

This is a sample implementation of the visualization and algorithms described in "Cluster-Flow Parallel Coordinates: Tracing Clusters Across Subspaces" by
[Nils Rodrigues](https://www.visus.uni-stuttgart.de/institut/team/Rodrigues-00001/),
[Christoph Schulz](https://www.visus.uni-stuttgart.de/en/institute/team/Schulz-00019/),
[Antoine Lhuillier](https://www.visus.uni-stuttgart.de/en/institute/team/Lhuillier-00001/) and
[Daniel Weiskopf](https://www.vis.uni-stuttgart.de/en/institute/team/Weiskopf-00007/).

# Citation

If you use this code in either its current form or with your own changes, please cite our paper "Cluster-Flow Parallel Coordinates: Tracing Clusters Across Subspaces":
[https://doi.org/10.20380/GI2020.38](https://doi.org/10.20380/GI2020.38)
[https://graphicsinterface.org/proceedings/gi2020/gi2020-38/](https://graphicsinterface.org/proceedings/gi2020/gi2020-38/)
[https://openreview.net/forum?id=oVHjlwLkl-](https://openreview.net/forum?id=oVHjlwLkl-)

If you are not able to find the citation info on either website, use the data from this BibTex entry:
```tex
@inproceedings{rodrigues2020cfpcp,
 author = {Rodrigues, Nils and Schulz, Christoph and Lhuillier, Antoine and Weiskopf, Daniel},
 title = {Cluster-Flow Parallel Coordinates: Tracing Clusters Across Subspaces},
 booktitle = {Proceedings of Graphics Interface 2020},
 series = {GI 2020},
 year = {2020},
 isbn = {978-0-9947868-5-2},
 location = {University of Toronto},
 pages = {382 -- 392},
 numpages = {11},
 doi = {10.20380/GI2020.38},
 publisher = {Canadian Human-Computer Communications Society / Société canadienne du dialogue humain-machine},
}
```

# Paper presentation
[https://www.youtube.com/watch?v=0MXzi1uYN4o](https://www.youtube.com/watch?v=0MXzi1uYN4o)

# Paper Download
To read the article, please download it from the links above or from the authors' websites:
[Nils Rodrigues](https://www.visus.uni-stuttgart.de/en/institute/team/Rodrigues-00001/),
[Christoph Schulz](https://www.visus.uni-stuttgart.de/en/institute/team/Schulz-00019/),
[Antoine Lhuillier](https://www.visus.uni-stuttgart.de/en/institute/team/Lhuillier-00001/),
[Daniel Weiskopf](https://www.vis.uni-stuttgart.de/en/institute/team/Weiskopf-00007/).


# Instructions for using the code

## Running the code(#npm)

### Prerequisites

This software was written to run in Mozilla Firefox and Google Chrome browsers.
It requires WebGL for line rendering.
However, if running on Windows, both browsers translate WebGL calls to DirectX by default.
This is done through [ANGLE](http://angleproject.org/).

[Disable ANGLE](https://github.com/mrdoob/three.js/wiki/How-to-use-OpenGL-or-ANGLE-rendering-on-Windows) to support native WebGL.

For Firefox, see [about:config](about:config). For Chrome, see [chrome://flags/](chrome://flags/).

### Setup
1. Download the content of this repository.
2. Install [Node.js](https://nodejs.org/).
3. Install the program dependencies.
	1. Open a shell.
	2. Navigate to the directory that contains the [package.json](package.json) file.
	3. Run this command: `npm install`.
4. Remove the directory "node\_modules/typescript-brunch/node\_modules" because package typescript-brunch depends on a version of typescript that is too old for our code.

### Usage

1. Open a shell.
2. Navigate to the directory that contains the [package.json](package.json) file.
3. Compile the website and start the web server:
	- To develop, run `npm run watch`.
	- To deploy, run: `npm run build`.
4. Open your web browser and navigate to [http://localhost:9000](http://localhost:9000).

## Adding your own data(#own-data)

1. Put the CSV file in [app/assets/data](app/assets/data). Let's assume it's called 'new.csv'.
2. Open [app/index.ts](app/index.ts) and add an entry to
```javascript
const availableData = { ... }
```
3. (optional) You can apply cluster and plot settings without going through the GUI. This also works for tweaking advanced settings that are not part of the GUI. Just add entries to these objects using the same key that contains the path to the CSV file in `availableData`:
```javascript
const defaultClusterSettings = { ... }
const defaultPlotSettings = { ... }
```
4. Run the code (see [Running the code](#npm)).

## Using custom clustering(#custom-clusters)

This sample code only provides full functionality when used with the default clustering method (Fuzzy DBSCAN).
However, you can provide cluster info as part of the data file itself.
This will disable live clustering and horizontal dimension order optimization.

If you need dimension ordering, you have to replace the code responsible for clustering in class `ClusterAlgorithm` in [app/clustering.ts](app/clustering.ts) (advanced users).
Be careful to keep the code responsible for extracting the static cluster information from the CSV files.

There are two options for including simple static clusters and a fixed dimension order in the CSV files:

### Hard clusters

The plot will use the same order of dimensions that you put in your CSV file.
Information on clusters is stored in a column between two data dimensions.
As an example, let's have a look at the column headers in [app/assets/data/generative.csv](app/assets/data/generative.csv):

```
Sensor1,!clusters!2,Sensor2,!clusters!3,Sensor3
```
|Sensor1|!clusters!2|Sensor2|!clusters!3|Sensor3|
|-|-|-|-|-|

Columns containing cluster info start with `!clusters!` and an arbitrary suffix without an exclamation mark `!`.
All columns must have unique names, so the suffix can't be empty.

The actual data values inside these cluster columns are the name of the cluster. This can be arbitrary. For example a number or a string.

Sensor1|!clusters!2|Sensor2|!clusters!3|Sensor3
-|:-:|-|:-:|-
-0.5681927494482461|-0.59643911112522|1|-0.59643911112522
-0.417270192094088|1|-0.383002383646938|1|-0.383002383646938
...|...|...|...|...
-1.04671372900305|2|-1.06606318910513|1|-0.8747884600152
-1.11069309993024|2|-1.15654368318247|1|-0.837018973096927

```
-0.568192749448246,1,-0.59643911112522,1,-0.59643911112522
-0.417270192094088,1,-0.383002383646938,1,-0.383002383646938
...
-1.04671372900305,2,-1.06606318910513,1,-0.8747884600152
-1.11069309993024,2,-1.15654368318247,1,-0.837018973096927
```

### Soft clusters

Soft clusters work similarly to hard clusters but require a column for each cluster between two neighboring data dimensions.
Let's take a look inside [app/assets/data/soft_generative_2000.csv](app/assets/data/soft_generative_2000.csv):

D1|!clusters!1!12|!clusters!2!12|D2|!clusters!1!23|!clusters!2!23|!clusters!3!23|!clusters!noise!23|D3|!clusters!1!34|!clusters!2!34|D4
-|:-:|:-:|-|:-:|:-:|:-:|:-:|-|:-:|:-:|-
0.215922197747607|1||0.8572976682091|1||||0.756570493141303|1||0.636757769525481
0.239188192856289|1||0.535381071495672|1||||0.670006545934217|1||0.481651004731127
0.196293924823055|1||0.413717026118851|1||||0.65139521416482|1||0.494824215094403
0.387270382026708|1||0.956903319230375|1||||0.548294474654293|1||0.325222152715976
0.322130473928404|1||0.905566111340457|0.222222222222222||||0.487238122961969||0.894375443405131|0.217507763484627
0.66158913134462|1||0.973576683128719|0.75633804959048||||0.777118274676885|1||0.633116350683104
0.127359957083704|1||0.755149045582339|1||||0.520707055973916||1|0.134837070543837

```
"D1","!clusters!1!12","!clusters!2!12","D2","!clusters!1!23","!clusters!2!23","!clusters!3!23","!clusters!noise!23","D3","!clusters!1!34","!clusters!2!34","D4"
0.215922197747607,1,,0.8572976682091,1,,,,0.756570493141303,1,,0.636757769525481
0.239188192856289,1,,0.535381071495672,1,,,,0.670006545934217,1,,0.481651004731127
0.196293924823055,1,,0.413717026118851,1,,,,0.65139521416482,1,,0.494824215094403
0.387270382026708,1,,0.956903319230375,1,,,,0.548294474654293,1,,0.325222152715976
0.322130473928404,1,,0.905566111340457,0.222222222222222,,,,0.487238122961969,,0.894375443405131,0.217507763484627
0.66158913134462,1,,0.973576683128719,0.75633804959048,,,,0.777118274676885,1,,0.633116350683104
0.127359957083704,1,,0.755149045582339,1,,,,0.520707055973916,,1,0.134837070543837
```

The column title now contains the name of the cluster and a suffix that makes this column name unique: `!clusters!<name>!<suffix>`.
Again, the suffix can't be empty.
The data rows now contain the label that assigns each data point (or row) to a cluster.
This can be a number between 0 and 1.
0 can be omitted.

If a row is not assigned to any cluster between two data dimensions, the program will put it in a noise cluster.
If there already is a cluster named "noise", it will be reused.
Otherwise, the program will create a new cluster named "noise", that was not specified in the CSV file.
