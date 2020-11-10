import THREE = require("three");

/*
 * From http://cubic.org/docs/hermite.htm
 */
function Hermite(t: number, p1: number, t1: number, p2: number, t2: number): number {
    let h1 = 2 * Math.pow(t, 3) - 3 * Math.pow(t, 2) + 1;
    let h2 = -2 * Math.pow(t, 3) + 3 * Math.pow(t, 2);
    let h3 = Math.pow(t, 3) - 2 * Math.pow(t, 2) + t;
    let h4 = Math.pow(t, 3) - Math.pow(t, 2);

    return h1 * p1 +
           h2 * p2 +
           h3 * t1 +
           h4 * t2;
}

function HermiteCurve3(p1, t1, p2, t2) {

    THREE.Curve.call(this);

    this.type = 'HermiteCurve3';

    this.p1 = p1 || new THREE.Vector3();
    this.t1 = t1 || new THREE.Vector3();
    this.p2 = p2 || new THREE.Vector3();
    this.t2 = t2 || new THREE.Vector3();

}

HermiteCurve3.prototype = Object.create(THREE.Curve.prototype);
HermiteCurve3.prototype.constructor = HermiteCurve3;

HermiteCurve3.prototype.isHermiteCurve3 = true;

HermiteCurve3.prototype.getPoint = function (t, optionalTarget) {

    var point = optionalTarget || new THREE.Vector3();

    var p1 = this.p1, t1 = this.t1, p2 = this.p2, t2 = this.t2;

    point.set(
        Hermite(t, p1.x, t1.x, p2.x, t2.x),
        Hermite(t, p1.y, t1.y, p2.y, t2.y),
        Hermite(t, p1.z, t1.z, p2.z, t2.z)
    );

    return point;

};

HermiteCurve3.prototype.copy = function (source) {

    THREE.Curve.prototype.copy.call(this, source);

    this.p1.copy(source.p1);
    this.t1.copy(source.t1);
    this.p2.copy(source.p2);
    this.t2.copy(source.t2);

    return this;

};

HermiteCurve3.prototype.toJSON = function () {

    var data = THREE.Curve.prototype.toJSON.call(this);

    data.p1 = this.p1.toArray();
    data.t1 = this.t1.toArray();
    data.p2 = this.p2.toArray();
    data.t2 = this.t2.toArray();

    return data;

};

HermiteCurve3.prototype.fromJSON = function (json) {

    THREE.Curve.prototype.fromJSON.call(this, json);

    this.p1.fromArray(json.p1);
    this.t1.fromArray(json.t1);
    this.p2.fromArray(json.p2);
    this.t2.fromArray(json.t2);

    return this;

};


export { HermiteCurve3 };