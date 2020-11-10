import _ = require("lodash");
import FileSaver = require("file-saver");

export namespace ArrayHelper {
    export function firstOrEmpty<T>(array: T[]): T {
        return (array || [] as T[])[0] || {} as T;
    }

    export function centerSorted<T>(source: T[]): T[] {
        if (_.isNil(source) || source.length === 0)
            return source;

        const target = new Array(source.length);
        let targetIndex = 0;
        let i = 0;
        for (; i < source.length; i += 2) {
            target[targetIndex] = source[i];
            targetIndex++
        }

        i = (source.length % 1 === 0) ? (source.length - 1) : (source.length - 2);
        for (; i > 0; i -= 2) {
            target[targetIndex] = source[i];
            targetIndex++;
        }

        return target;
    }

    /**
     * Moves an element from one location in the array to the other.
     * Doesn't handle indices outside the array or sparse arrays.
     */
    export function move(array: any[], source: number, target: number) {
        // get a copy of the element
        const element = array[source];

        // move other elements
        // up
        if (source > target) {
            for (let i = source; i > target; i--)
                array[i] = array[i - 1];
        }
        // down
        else {
            for (let i = source; i < target; i++)
                array[i] = array[i + 1];
        }

        // put the element where it is supposed to be
        array[target] = element;
    }

    export function getPlottableDimensions(element: object): string[];
    export function getPlottableDimensions(array: object[]): string[];
    /**
     * Gets the plottable own properties from the given object or from the first element of the array.
     */
    export function getPlottableDimensions(elementOrArray: object | object[]): string[] {
        // get first data row (or default to empty object)
        const element = Array.isArray(elementOrArray) ? ArrayHelper.firstOrEmpty(elementOrArray) : elementOrArray as object;

        // get the names of all string or number dimensions
        const allDims = Object.keys(element).filter(dimName => {
            if (!element.hasOwnProperty(dimName))
                return false;
            switch (typeof (element[dimName])) {
                case typeof "":
                case typeof 0:
                    return true;
                default:
                    return false;
            }
        });

        return allDims;
    }
}


//export type DoubleMap<TKey, TValue> = Map<TKey, Map<TKey, TValue>>;

export namespace MapHelper {

    function getOrCreate1D<TKey, TValue>(map: Map<TKey, TValue[]>, key: TKey): TValue[] {
        var values = map.get(key);

        if (_.isNil(values)) {
            values = new Array<TValue>();
            map.set(key, values);
        }

        return values;
    }
    export function getOrCreate<TKey1, TValue>(map: Map<TKey1, TValue[]>, key1: TKey1): TValue[];
    export function getOrCreate<TKey1, TKey2, TValue>(map: Map<TKey1, Map<TKey2, TValue[]>>, key1: TKey1, key2: TKey2): TValue[];
    export function getOrCreate<TValue>(map: Map<any, any>, ...keys: any[]): TValue[];
    export function getOrCreate<TValue>(map: Map<any, any>, ...keys: any[]): TValue[] {
        switch (keys.length) {
            case 0:
                return undefined;
            case 1:
                return getOrCreate1D(map, keys[0]);
            default:
                for (var i = 0; i < keys.length - 1; i++) {
                    var inner = map.get(keys[i]);
                    if (_.isNil(inner)) {
                        inner = new Map();
                        map.set(keys[i], inner);
                    }
                    map = inner;
                }
                return getOrCreate1D(map as Map<any, TValue[]>, _.last(keys));
        }
    }
    
    export function get<TKey1, TKey2, TValue>(map: Map<TKey1, Map<TKey2, TValue>>, key1: TKey1, key2: TKey2): TValue;
    export function get<TValue>(map: Map<any, any>, ...keys: any[]): any {
        if (_.isNil(keys))
            return undefined;

        switch (keys.length) {
            case 0:
                return undefined;
            case 1:
                return map.get(keys[0]);
            default:
                for (var i = 0; i < keys.length - 1; i++) {
                    var inner = map.get(keys[i]);
                    if (inner === undefined)
                        return inner;
                    if (!(inner instanceof Map))
                        throw `Tried accessing nested maps with ${keys.length} keys, but deepest nesting level only allows for ${i + 1}.`;
                    map = inner;
                }
                return map.get(_.last(keys));
        }
    }

    export function getOrSet<TKey1, TKey2, TValue>(map: Map<TKey1, Map<TKey2, TValue>>, generator: () => TValue, key1: TKey1, key2: TKey2): TValue;
    export function getOrSet<TValue>(map: Map<any, any>, generator: () => any, ...keys: any[]): any {
        if (_.isNil(keys))
            return undefined;

        switch (keys.length) {
            case 0:
                return undefined;
            case 1:
                return map.get(keys[0]);
            default:
                for (var i = 0; i < keys.length - 1; i++) {
                    var inner = map.get(keys[i]);
                    if (inner === undefined)
                        return inner;
                    if (!(inner instanceof Map))
                        throw `Tried accessing nested maps with ${keys.length} keys, but deepest nesting level only allows for ${i + 1}.`;
                    map = inner;
                }

                let existing = map.get(_.last(keys));
                if (existing === undefined) {
                    existing = generator();
                    map.set(_.last(keys), existing);
                }

                return existing;
        }
    }


    export function appendMany<TKey, TValue>(map: Map<TKey, TValue[]>, value: TValue, key: TKey);
    export function appendMany<TKey1, TKey2, TValue>(map: Map<TKey1, Map<TKey2, TValue[]>>, value: TValue, key1: TKey1, key2: TKey2);
    export function appendMany<TValue>(map: Map<any, any>, values: Iterable<TValue>, ...keys: any[]);
    export function appendMany<TValue>(map: Map<any, any>, values: Iterable<TValue>, ...keys: any[]) {
        const existing = getOrCreate(map, ...keys);
        for (var value of values)
            existing.push(value);
    }

    export function append<TKey, TValue>(map: Map<TKey, TValue[]>, value: TValue, key: TKey);
    export function append<TKey1, TKey2, TValue>(map: Map<TKey1, Map<TKey2, TValue[]>>, value: TValue, key1: TKey1, key2: TKey2);
    export function append<TValue>(map: Map<any, any>, value: TValue, ...keys: any[]);
    export function append<TValue>(map: Map<any, any>, value: TValue, ...keys: any[]) {
        const existing = getOrCreate(map, ...keys);
        existing.push(value);
    }


    export function intersectionSize<T>(left: Map<T, any>, right: SetHelper.ValueCollection<T>): number {
        let intersection = 0;

        for (let element of left.keys())
            if (right.has(element))
                intersection++;

        return intersection;
    }
}


export namespace SetHelper {
    export interface ValueCollection<T> {
        has(value: T): boolean;
    }
    export function intersectionSize<T>(left: Iterable<T>, right: ValueCollection<T>): number {
        let intersection = 0;

        for (let element of left)
            if (right.has(element))
                intersection++;

        return intersection;
    }
}


export namespace FileHelper {

    export function saveString(text: any, fileName: string, mimetype: string): void {
        const blob = new Blob([text], { type: mimetype, endings: "transparent" });
        FileSaver.saveAs(blob, fileName);
    }

    export function saveJSON(data: any, fileName: string): void {
        const json = JSON.stringify(data);
        FileHelper.saveString(json, `${fileName}.json`, "application/json");
    }

    export function saveJavaScript(code: string, fileName: string): void {
        FileHelper.saveString(code, `${fileName}.js`, "application/javascript");
    }

    export function saveSvg(markup: string, fileName: string): void {
        FileHelper.saveString(markup, `${fileName}.svg`, "image/svg+xml");
    }

    export function saveCsv(data: string, fileName: string): void {
        FileHelper.saveString(data, `${fileName}.csv`, "text/csv");
    }
}


export namespace MathHelper {
    
    export function factorial(num: number): number {
        if (num < 0)
            return 1;

        let fact = 1;
        for (let i = num; i > 1; i--)
            fact *= i;

        return fact;
    }

    /**
     * Calculates the factorial of num. If the value goes over limit, +infinity is returned.
     */
    export function limitedFactorial(num: number, limit: number): number {
        let fact = 1;
        for (let i = num; i > 1; i--) {
            fact *= i;
            if (fact > limit)
                return Number.POSITIVE_INFINITY;
        }

        return fact;
    }

    export function getAllPermutations(array: any[]) {
        var length = array.length,
            result = [array.slice()],
            c = new Array(length).fill(0),
            i = 1, k, p;

        while (i < length) {
            if (c[i] < i) {
                k = i % 2 && c[i];
                p = array[i];
                array[i] = array[k];
                array[k] = p;
                ++c[i];
                i = 1;
                result.push(array.slice());
            } else {
                c[i] = 0;
                ++i;
            }
        }
        return result;
    }

    export function getLimitedPermutations(array: any[], limit: number) {
        const length = array.length;

        // If getting all permutations would go over the limit,
        // we should just return the original order.
        const possiblePermutations = MathHelper.limitedFactorial(length, limit);
        if (!Number.isFinite(possiblePermutations))
            return [array];

        // First permutation does not have any change
        let result = [array.slice()];

        // Get all other permutations
        let c = new Array(length).fill(0);
        let temp; // temp variable for swapping
        let i = 1, k;
        while (i < length) {
            if (c[i] < i) {
                k = i % 2 && c[i];

                // swap
                temp = array[i];
                array[i] = array[k];
                array[k] = temp;

                c[i]++;
                i = 1;
                // add current permutation to results
                result.push(array.slice());
            } else {
                c[i] = 0;
                i++;
            }
        }
        return result;
    }


    export function medianOfSorted(values: number[]): number {
        if (values === undefined || values === null || values.length < 1)
            return undefined;

        let center = Math.floor(values.length / 2);
        if (values.length % 2 === 0)
            return (values[center - 1] + values[center]) / 2;
        else
            return values[center];
    }
}

export namespace DOMHelper {
    export function clearClone<T extends HTMLElement>(element: T): T {
        const clone = element.cloneNode(false) as T;
        if (element.parentNode) {
            element.parentNode.replaceChild(element, clone);
        }
        return clone;
    }
    export function clearRemove(element: HTMLElement) {
        while (element.lastChild) {
            element.removeChild(element.lastChild);
        }
    }
}

export namespace KeyHelper {
    export type KeysAsValues<T> = {
        readonly [P in keyof T]: P;
    }

    /**
     * Get a new object that has the same keys as obj but their values are the same string as the key.
     * Example: {foo: "bar"} => {foo: "foo"}
     */
    export function ObjectKeysAsValues<T>(obj: T): KeysAsValues<T> {
        return Object.keys(obj).reduce(
            (accumulator, current) => {
                accumulator[current] = current;
                return accumulator;
            },
            {} as KeysAsValues<T>);
    }

}

