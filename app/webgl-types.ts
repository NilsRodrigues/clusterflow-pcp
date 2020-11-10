import THREE = require("three");

export interface IUniform<T> extends THREE.Uniform {
    value: T;
}