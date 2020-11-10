import dt = require("./data-types");
import utils = require("./utils");
import SortedSet = require("collections/sorted-set");
import _ = require("lodash");




class Three<T> {
    public readonly size: number;
    protected readonly stride1: number;
    protected readonly stride2: number;
    protected readonly values: T[];

    constructor(
        public readonly dimCount: number) {

        if (dimCount < 3)
            throw "Can't use the Three class with less than 3 dimensions.";

        this.stride1 = (dimCount - 2) * (dimCount - 1);
        this.stride2 = (dimCount - 2);
        this.size = dimCount * (dimCount - 1) * (dimCount - 2);
        this.values = new Array<T>(this.size);
    }

    public indexOf = (dim1: number, dim2: number, dim3: number): number => {
        return this.stride1 * (dim1)
            + this.stride2 * (dim2 - ((dim2 > dim1) ? 1 : 0))
            + (dim3 - ((dim3 > dim1) ? 1 : 0) - ((dim3 > dim2) ? 1 : 0));
    }

    public getAt = (dim1: number, dim2: number, dim3: number): T => {
        const index = this.indexOf(dim1, dim2, dim3);
        return this.values[index];
    }
}

type ClusterLookup = (dim1: number, dim2: number) => dt.Cluster[];
type ClusterWeight = (left: dt.Cluster[], right: dt.Cluster[]) => number;
class ThreeWeights extends Three<number> {

    constructor(
        dimCount: number,
        public readonly clusterLookup: ClusterLookup,
        public readonly clusterWeight: ClusterWeight) {
        super(dimCount);
        ThreeWeights.initializeValues(this.values, dimCount, clusterLookup, clusterWeight);
    }

    private static initializeValues(
        weights: number[],
        dimCount: number,
        clusterLookup: ClusterLookup,
        clusterWeight: ClusterWeight): void {

        let index = 0;
        for (let dim1 = 0; dim1 < dimCount; dim1++) {
            for (let dim2 = 0; dim2 < dim1; dim2++) {
                const left = clusterLookup(dim1, dim2);
                for (let dim3 = 0; dim3 < dim2; dim3++) {
                    const right = clusterLookup(dim2, dim3);
                    weights[index++] = clusterWeight(left, right);
                }
                for (let dim3 = dim2 + 1; dim3 < dim1; dim3++) {
                    const right = clusterLookup(dim2, dim3);
                    weights[index++] = clusterWeight(left, right);
                }
                for (let dim3 = dim1 + 1; dim3 < dimCount; dim3++) {
                    const right = clusterLookup(dim2, dim3);
                    weights[index++] = clusterWeight(left, right);
                }
            }
            for (let dim2 = dim1 + 1; dim2 < dimCount; dim2++) {
                const left = clusterLookup(dim1, dim2);
                for (let dim3 = 0; dim3 < dim1; dim3++) {
                    const right = clusterLookup(dim2, dim3);
                    weights[index++] = clusterWeight(left, right);
                }
                for (let dim3 = dim1 + 1; dim3 < dim2; dim3++) {
                    const right = clusterLookup(dim2, dim3);
                    weights[index++] = clusterWeight(left, right);
                }
                for (let dim3 = dim2 + 1; dim3 < dimCount; dim3++) {
                    const right = clusterLookup(dim2, dim3);
                    weights[index++] = clusterWeight(left, right);
                }
            }
        }
    }


    private minDimStartingWith = (dim1: number, dim2: number): number => {
        const startIndex = this.indexOf(dim1, dim2, 0);

        let minDim = 0;
        let minWeight = this.values[startIndex];
        for (let i = 0; i < this.stride2; i++) {
            if (this.values[startIndex + i] < minWeight) {
                minDim = i;
                minWeight = this.values[startIndex + i];
            }
        }

        if (minDim >= dim1 || minDim >= dim2)
            minDim++;
        if (minDim >= dim1 || minDim >= dim2)
            minDim++;
        return minDim;
    }

    private minDimEndingWith = (dim2: number, dim3: number): number => {
        const lower = (dim2 < dim3) ? dim2 : dim3;
        const upper = (dim2 > dim3) ? dim2 : dim3;

        let minDim = 0;
        let minWeight = Number.POSITIVE_INFINITY;

        let index = this.indexOf(0, dim2, dim3);
        for (let i = 0; i < lower; i++ , index += this.stride1) {
            if (this.values[index] < minWeight) {
                minDim = i;
                minWeight = this.values[index];
            }
        }

        index = this.indexOf(lower + 1, dim2, dim3);
        for (let i = lower + 1; i < upper; i++ , index += this.stride1) {
            if (this.values[index] < minWeight) {
                minDim = i;
                minWeight = this.values[index];
            }
        }

        index = this.indexOf(upper + 1, dim2, dim3);
        for (let i = upper + 1; i < this.dimCount; i++ , index += this.stride1) {
            if (this.values[index] < minWeight) {
                minDim = i;
                minWeight = this.values[index];
            }
        }

        return minDim;
    }
}
class LazyThreeWeights extends Three<number> {

    constructor(
        dimCount: number,
        public readonly clusterLookup: ClusterLookup,
        public readonly clusterWeight: ClusterWeight) {
        super(dimCount);
    }

    public getAt = (dim1: number, dim2: number, dim3: number): number => {
        // get existing value
        const index = this.indexOf(dim1, dim2, dim3);
        let value = this.values[index];

        // initialize value
        if (value === undefined) {
            const left = this.clusterLookup(dim1, dim2);
            const right = this.clusterLookup(dim2, dim3);
            this.values[index] = value = this.clusterWeight(left, right);
        }

        return value;
    }
}

type Lookup<T> = (dim1: number, dim2: number) => T;
class Two<T> {
    public readonly size: number;
    protected readonly stride1: number;
    protected readonly values: T[];

    constructor(
        public readonly dimCount: number) {

        if (dimCount < 2)
            throw "Can't use the Two class with less than 2 dimensions.";

        this.stride1 = (dimCount - 1);
        this.size = dimCount * (dimCount - 1);
        this.values = new Array<T>(this.size);
    }

    public indexOf = (dim1: number, dim2: number): number => {
        return this.stride1 * (dim1)
            + dim2 - ((dim2 > dim1) ? 1 : 0);
    }

    public getAt = (dim1: number, dim2: number): T => {
        const index = this.indexOf(dim1, dim2);
        return this.values[index];
    }
}
class EagerTwo<T> extends Two<T> {
    constructor(
        dimCount: number,
        public readonly lookup: Lookup<T>) {
        super(dimCount);
        EagerTwo.initializeValues(this.values, dimCount, lookup);
    }

    private static initializeValues<T>(
        weights: T[],
        dimCount: number,
        lookup: Lookup<T>): void {

        let index = 0;
        for (let dim1 = 0; dim1 < dimCount; dim1++) {
            for (let dim2 = 0; dim2 < dim1; dim2++) {
                weights[index++] = lookup(dim1, dim2);
            }
            for (let dim2 = dim1 + 1; dim2 < dimCount; dim2++) {
                weights[index++] = lookup(dim1, dim2);
            }
        }
    }
}
class EagerTwoNumber extends EagerTwo<number> {
    constructor(
        dimCount: number,
        lookup: Lookup<number>) {
        super(dimCount, lookup);
    }

    private minDimStartingWith = (dim1: number): number => {
        const startIndex = this.indexOf(dim1, 0);

        let minDim = 0;
        let minWeight = this.values[startIndex];
        for (let i = 0; i < this.stride1; i++) {
            if (this.values[startIndex + i] < minWeight) {
                minDim = i;
                minWeight = this.values[startIndex + i];
            }
        }

        if (minDim >= dim1)
            minDim++;
        return minDim;
    }

    private minDimEndingWith = (dim2: number): number => {

        let minDim = 0;
        let minWeight = Number.POSITIVE_INFINITY;

        let index = this.indexOf(0, dim2);
        for (let i = 0; i < dim2; i++ , index += this.stride1) {
            if (this.values[index] < minWeight) {
                minDim = i;
                minWeight = this.values[index];
            }
        }

        index = this.indexOf(dim2 + 1, dim2);
        for (let i = dim2 + 1; i < this.dimCount; i++ , index += this.stride1) {
            if (this.values[index] < minWeight) {
                minDim = i;
                minWeight = this.values[index];
            }
        }

        return minDim;
    }
}
class LazyTwo<T> extends Two<T> {
    constructor(
        dimCount: number,
        public readonly lookup: Lookup<T>) {
        super(dimCount);
    }

    public getAt = (dim1: number, dim2: number): T => {
        // get existing value
        const index = this.indexOf(dim1, dim2);
        let value = this.values[index];

        // initialize value
        if (value === undefined) {
            this.values[index] = value = this.lookup(dim1, dim2);
        }

        return value;
    }
}




class TreeNode<TValue> {
    public Cost: number = 0;
    public AccumulatedCost: number = 0;

    constructor(public Value: TValue, public SourceIndex: number, public Parent: TreeNode<TValue> = null, public Level: number = 0) {
    }

    public createChild = (childValue: TValue, sourceIndex: number): TreeNode<TValue> => {
        return new TreeNode<TValue>(childValue, sourceIndex, this, this.Level + 1);
    }

    public static compareCosts(left: TreeNode<any>, right: TreeNode<any>): number {
        // compare costs, less is better.
        if (left.AccumulatedCost !== right.AccumulatedCost)
            return left.AccumulatedCost - right.AccumulatedCost;

        // same costs? compare levels. higher is better (= deeper in the tree)
        if (right.Level !== left.Level)
            return (right.Level - left.Level) / Math.max(right.Level, left.Level);
        
        // same cost and level? use the source index as a tie breaker
        if (left === right)
            return 0;
        // go up the tree until we find a pair where the source index is different
        while (left.SourceIndex === right.SourceIndex && left.Parent !== null && right.Parent !== null) {
            left = left.Parent;
            right = right.Parent;
        }
        // make the index difference smaller than 1 (assumed to be the smallest cost)
        const indexDiff = (left.SourceIndex - right.SourceIndex) / (left.SourceIndex + right.SourceIndex + 1);
        return indexDiff;
    }

    /**
     * Compares node costs under the assumption that the minimum cost from one level to the next is at least 1.
     */
    public static compareCostsMin1(left: TreeNode<any>, right: TreeNode<any>): number {
        // cost difference
        // higher cost => bad
        const costDiff = (left.AccumulatedCost - right.AccumulatedCost);

        // level difference
        // higher level => good
        const levelDiff = left.Level - right.Level;

        // the minimum cost from one level to the next is 1
        // the level difference from one level to the next is also 1
        // therefore, we can just substract the levelDiff from the costDiff without ever getting A* costs beneath 0
        const diff = costDiff - levelDiff;
        if (Math.abs(diff) > Number.EPSILON)
            return diff;

        // use the source index as a tie breaker
        // go up the tree until we find a pair where the source index is different
        if (left === right)
            return 0;
        while (left.SourceIndex === right.SourceIndex && left.Parent !== null && right.Parent !== null) {
            left = left.Parent;
            right = right.Parent;
        }
        // make the index difference smaller than the smallest cost (1)
        const indexDiff = (left.SourceIndex - right.SourceIndex) / (left.SourceIndex + right.SourceIndex + 1);
        return indexDiff;
    }
}


type ClusterSet = Set<dt.IDataRow>;
class DimNode extends TreeNode<string> {
    public Clusters: dt.Cluster[] = null;
    public ClusterCosts: number[][] = null;

    constructor(value: string, sourceIndex: number, public Parent: DimNode = null, level: number = 0) {
        super(value, sourceIndex, Parent, level);
    }
    
    public createChild = (childValue: string, sourceIndex: number): DimNode => {
        return new DimNode(childValue, sourceIndex, this, this.Level + 1);
    }
}
export class AxisOrder {
    private readonly twoCosts: LazyTwo<number>;
    private readonly threeCosts: LazyThreeWeights;
    private dimTree: DimNode = new DimNode("", -1);
    private deepestDimNodes: SortedSet<DimNode> = new SortedSet<DimNode>(null, null, TreeNode.compareCostsMin1, null);
    private clusterSimilarity = new Map<dt.Cluster, Map<dt.Cluster, number>>();

    public constructor(public readonly data: dt.Data, public readonly maxDims: number = -1) {
        if (data.info.dimCount >= 2)
            this.twoCosts = new LazyTwo<number>(
                data.info.dimCount,
                (dim1, dim2) => {
                    const left = utils.MapHelper.get(data.clusters, data.info.dimNames[dim1], data.info.dimNames[dim1]);
                    const right = utils.MapHelper.get(data.clusters, data.info.dimNames[dim1], data.info.dimNames[dim2]);
                    return AxisOrder.DimDistance(data, left, right);
                }
            );

        if (data.info.dimCount >= 3)
            this.threeCosts = new LazyThreeWeights(
                data.info.dimCount,
                (dim1, dim2) => utils.MapHelper.get(data.clusters, data.info.dimNames[dim1], data.info.dimNames[dim2]),
                (left, right) => AxisOrder.DimDistance(data, left, right)
            );
    }


    private _dimOrder: string[] = null;
    public get dimOrder(): string[] {
        // sort only once
        if (_.isNil(this._dimOrder))
            this._dimOrder = this.getDimOrder();
        return this._dimOrder.slice();
    }
    public set dimOrder(value: string[]) {
        this._dimOrder = value;
    }


    public getDimOrder = (): string[] => {
        // create the first tree level
        this.data.info.dimNames.map((dim, index) => {
            // Create a child
            let child = this.dimTree.createChild(dim, index);
            child.Clusters = utils.MapHelper.get(this.data.clusters, dim, dim);
            child.ClusterCosts = [[0]];

            // add the child to the list of deepest nodes
            this.deepestDimNodes.add(child);
            return child;
        });

        // Get the node with the smallest accumulated cost
        let currentNode = this.deepestDimNodes.min();
        // extend the path through the dimensions one node at a time
        let end = this.data.info.dimCount;
        if (this.maxDims > 0 && this.maxDims < end)
            end = this.maxDims;
        while (currentNode.Level < end) {
            this.ExpandDimPath(currentNode);
            currentNode = this.deepestDimNodes.min();
        }

        // shortest path is stored in tree => extract to list
        let dimOrder = new Array<string>(end);
        for (let i = end - 1; i >= 0; i--) {
            dimOrder[i] = currentNode.Value;
            currentNode = currentNode.Parent;
        }

        console.log(dimOrder);
        return dimOrder;
    }

    private ExpandDimPath = (node: DimNode): void => {
        // remove the current node from the list of farthest dims
        this.deepestDimNodes.remove(node);

        // Get all dimensions that haven't been used yet
        let remainingDims = this.data.info.dimNames.slice();
        let remainingIndices = remainingDims.map((d, i) => i);
        let parent = node;
        while (parent !== null) {
            const parentIndex = remainingDims.indexOf(parent.Value);
            if (parentIndex > -1) {
                remainingDims.splice(parentIndex, 1);
                remainingIndices.splice(parentIndex, 1);
            }
            parent = parent.Parent;
        }

        // Create a child for each remaining dimension
        for (let i = 0; i < remainingDims.length; i++) {
            // Create the tree node
            let child = node.createChild(remainingDims[i], remainingIndices[i]);
            // Get all child clusters between the parent and the current dimension
            child.Clusters = utils.MapHelper.get(this.data.clusters, node.Value, child.Value);

            // get the distance between the current dimension and the child dimension
            if (this.threeCosts && child.Level >= 3)
                child.Cost = this.threeCosts.getAt(node.Parent.SourceIndex, node.SourceIndex, child.SourceIndex);
            else if (this.twoCosts && child.Level >= 2)
                    child.Cost = this.twoCosts.getAt(node.SourceIndex, child.SourceIndex);
            else
                child.Cost = AxisOrder.DimDistance(this.data, node.Clusters, child.Clusters);

            // Set the accumulated cost
            child.AccumulatedCost = node.AccumulatedCost + child.Cost;

            // Insert all children into the deepest nodes list
            this.deepestDimNodes.add(child);
        }
    }


    /**
     * Calculates the distance between two sets. The result is alway between 0 and 1.
     * 0 means they are equal, 1 means there are no common values.
     * @param left
     * @param right
     */
    public static ClusterDistance(left: Map<dt.IDataRow, any>, right: Map<dt.IDataRow, any>): number {
        let intersection = utils.MapHelper.intersectionSize(left, right);
        let union = left.size + right.size - intersection;
        return 1 - (intersection / union);
    }
    /**
     * Calculates the distances between all left and right clusters.
     * Returns a result matrix where the left clusters represend the first dimension and the right clusters are on the second.
     * @param left All left clusters.
     * @param right All right clusters.
     */
    public static AllClusterDistances(left: dt.Cluster[], right: dt.Cluster[]): number[][] {
        return left.map(
            (l) => right.map((r) =>
                AxisOrder.ClusterDistance(l.classification, r.classification)
            )
        );
    }
    /**
     * Calculates the distance between two sets of clusters (a.k.a. dimensions).
     * @param left The clusters of the dimension to the left.
     * @param right The clusters of the dimension to the right.
     * @param node Optional. A TreeNode in which to store the intermediate cluster distances.
     */
    public static DimDistance(data: dt.Data, left: dt.Cluster[], right: dt.Cluster[], node: DimNode = undefined): number {
        // Get the cost between each cluster pair
        let distanceMatrix = AxisOrder.AllClusterDistances(left, right);
        if (!_.isNil(node))
            node.ClusterCosts = distanceMatrix;

        // Get the mean cost
        let mean = _.meanBy(distanceMatrix, (row) => _.mean(row));

        // map the distances to squared difference from the mean
        let squared = distanceMatrix.map(row => row.map(
            distance => Math.pow(distance - mean, 2)
        ));

        // sum up all squared distances
        let sumOfSquared = _.sumBy(squared, (row) => _.sum(row));

        // small sum => close to mean => rows are distributed all over the place
        // large sum => far from mean => there are high matches between clusters => rows are only between a small number of clusters

        return(
            1.0 / // we prefer seeing the close matches => prefer large sum => invert to get a low cost (meaning good match)
            (sumOfSquared + 1.0) // ensure we don't devide by zero
        )
        + 1.0 // ensure the cost is at least 1.0 (inversion of large simimlarity => cost would be smaller than 1) ;
        
        
    }
}



class ClusterNode extends TreeNode<number[]> {
    constructor(value: number[], sourceIndex: number, public Parent: ClusterNode = null, level: number = 0) {
        super(value, sourceIndex, Parent, level);
    }

    public createChild = (childValue: number[], sourceIndex: number): ClusterNode => {
        return new ClusterNode(childValue, sourceIndex, this, this.Level + 1);
    }
}
export class ClusterOrder {

    private unsortedClusters: dt.Cluster[][];
    private clusterTree: ClusterNode;
    private deepestClusterNodes: SortedSet<ClusterNode> = new SortedSet<ClusterNode>(null, null, TreeNode.compareCostsMin1, null);

    public constructor(public readonly data: dt.Data, public readonly dimOrder: string[]) {}

    private _clusterOrder: dt.Cluster[][] = null;
    public get clusterOrder(): dt.Cluster[][] {
        // sort only once
        if (_.isNil(this._clusterOrder))
            this._clusterOrder = this.getClusterOrder();
        return this._clusterOrder.slice();
    }
    
    public getClusterOrder = (): dt.Cluster[][] => {
        // get the order of dimensions
        let dimOrder = this.dimOrder;

        // get the unsorted list of clusters
        let unsortedClusters = new Array<dt.Cluster[]>(dimOrder.length);
        unsortedClusters[0] = utils.MapHelper.get(this.data.clusters, dimOrder[0], dimOrder[0]);
        for (let i = 1; i < dimOrder.length; i++) {
            unsortedClusters[i] = utils.MapHelper.get(this.data.clusters, dimOrder[i - 1], dimOrder[i]);
        }
        this.unsortedClusters = unsortedClusters;

        // create the tree root
        // the first dimension always has a single dummy cluster
        this.clusterTree = new ClusterNode([0], -1, null, 0);

        // extend the path through the cluster tree one node at a time
        let currentNode = this.clusterTree;
        while (currentNode.Level < dimOrder.length - 1) {
            this.ExpandClusterPath(currentNode, unsortedClusters);
            currentNode = this.deepestClusterNodes.min();
        }

        // shortest path is stored in tree => extract to list
        const clusterOrder = new Array<number[]>(dimOrder.length);
        const sortedClusters = new Array<dt.Cluster[]>(dimOrder.length);
        const totalCost = currentNode.AccumulatedCost;
        const costs = [];
        for (let i = dimOrder.length - 1; i >= 0; i--) {
            clusterOrder[i] = currentNode.Value;
            sortedClusters[i] = currentNode.Value.map(c => unsortedClusters[i][c]);
            if (i > 0)
                costs[i - 1] = {
                    label: `${this.dimOrder[i - 1]}-${this.dimOrder[i]}`, cost: currentNode.Cost
                };
            currentNode = currentNode.Parent;
        }

        console.log(totalCost);
        console.log(costs);
        console.log(clusterOrder);
        return sortedClusters;
    }

    /**
     * Uses actual layout logic to only consider the crossings that will be drawn
     */
    private ExpandClusterPath = (node: ClusterNode, unsortedClusters: dt.Cluster[][]): void => {
        // remove the current node from the list of farthest dims
        this.deepestClusterNodes.remove(node);

        // get the unsorted clusters for the next tree level
        const currentUnsortedClusters = unsortedClusters[node.Level];
        const currentClusters = node.Value.map(i => currentUnsortedClusters[i]);
        const nextUnsortedClusters = unsortedClusters[node.Level + 1];

        // Get an array with the indices of the unsorted clusters for the next level
        let nextSortOrder = new Array<number>(nextUnsortedClusters.length);
        for (let i = 0; i < nextSortOrder.length; i++)
            nextSortOrder[i] = i;

        // Get all permutations of the cluster sort order
        let orderPermutations: number[][];
        if (ClusterOrder.TryPermutation)
            orderPermutations = utils.MathHelper.getLimitedPermutations(nextSortOrder, 10e6);

        // Revert to "biggest first, noise last" if there are too many permutations or we shouldn't try permutating
        if (_.isNil(orderPermutations) || orderPermutations.length < nextUnsortedClusters.length) {
            ClusterOrder.sortByClusterSize(nextSortOrder, nextUnsortedClusters)
            orderPermutations = [nextSortOrder];
        }

        // Create a child tree node for each permutation of possible sort orders
        orderPermutations.forEach((order, index) => {
            // Create the tree node
            let child = node.createChild(order, index);

            const nextClusters = order.map((i) => nextUnsortedClusters[i]);
            const orderedConnections = ClusterOrder.getAllRenderedConnections(this.data.normalizedRows, currentClusters, nextClusters);

            // get the distance between the current dimension and the child dimension
            let cost = ClusterOrder.getCrossings(orderedConnections);

            // penalize high costs to keep the tree narrower and grow higher more quickly
            // cost = Math.pow(child.Cost, 3);

            // +1 is our heuristic. we assume a minimum cost of 1 per tree level.
            // this way we expand the tree levels that are further ahead, if the costs are similar.
            child.Cost = cost += 1;

            // Set the accumulated cost
            child.AccumulatedCost = node.AccumulatedCost + child.Cost;

            // Insert all children into the deepest nodes list
            this.deepestClusterNodes.add(child);
        });
    }
    
    /**
     * Calculates the number of crossings between clusters.
     * @param connections A matrix that contains the number of lines between clusters. Has to be formatted as matrix[to cluster][from cluster].
     */
    private static getCrossings(connections: number[][]): number {
        let crossings = 0;

        let toLength = connections.length;
        let fromLength = connections[0].length;

        // lines can cross on two occasions:
        // A) a line starts lower than <from> and goes higher than <to>
        // B) a line starts higher than <from> and goes lower than <to>
        // Since we are interested in the sum of this, we only need to
        // care for one case. Whether line I crosses line J or J crosses I
        // is irrelevant for the total sum.
        function addCrossings(from: number, to: number): void {
            // the first and last connection don't have any crossings
            if (from === 0 || to === toLength - 1)
                return;

            // if the current connection has no lines, then there will be no additional crossings
            let currentConnections = connections[to][from];
            if (currentConnections == 0)
                return;

            // case A)
            for (let otherTo = 0; otherTo < toLength; otherTo++) {
                for (let otherFrom = from + 1; otherFrom < fromLength; otherFrom++)
                    crossings += connections[otherTo][otherFrom] * currentConnections;
            }
        }

        // iterate over the entire matrix and sum up the crossings
        for (let to = 0; to < toLength; to++) {
            for (let from = 0; from < fromLength; from++)
                addCrossings(from, to);
        }

        return crossings;
    }

    private static getAllRenderedConnections(rows: dt.IDataRow[], fromClusters: dt.Cluster[], toClusters: dt.Cluster[]): number[][] {
        // create the matrix for the connections and initialize all elements with 0
        const connections = new Array<number[]>(toClusters.length);
        for (let to = 0; to < toClusters.length; to++) {
            connections[to] = new Array<number>(fromClusters.length);

            for (let from = 0; from < fromClusters.length; from++)
                connections[to][from] = 0;
        }

        // count the actual rendered connections
        for (const row of rows)
            ClusterOrder.getWeightedConnections(connections, row, fromClusters, toClusters);

        return connections;
    }

    private static getWeightedConnections(connections: number[][], row: dt.IDataRow, fromClusters: dt.Cluster[], toClusters: dt.Cluster[]): void {
        // get the weights of connections
        const fromWeights = fromClusters.map(cluster => cluster.classification.get(row)?.label ?? 0);
        const toWeights = toClusters.map(cluster => cluster.classification.get(row)?.label ?? 0);

        // add the weights of this row to the accumulated weights of other rows
        for (let from = 0; from < fromClusters.length; from++) {
            for (let to = 0; to < toClusters.length; to++)
                connections[to][from] += fromWeights[from] * toWeights[to];
        }
    }

    private static sortByClusterSize(sortOrder: number[], clusters: dt.Cluster[]): void {
        // sort by size: large clusters first
        sortOrder = sortOrder.sort((ix1, ix2) => clusters[ix1].classification.size - clusters[ix2].classification.size).reverse();

        // put the noise cluster at the bottom
        const noise = clusters.findIndex(c => c.type === dt.ClusterType.Noise);
        if (noise > -1) {
            const noiseIndex = sortOrder.indexOf(noise);
            if (noiseIndex < sortOrder.length - 1)
                utils.ArrayHelper.move(sortOrder, noiseIndex, sortOrder.length - 1);
        }
    }
}

export namespace ClusterOrder {
    export const TryPermutation = true;
}