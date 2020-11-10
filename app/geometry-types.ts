import events = require("./liteEvent");

export interface IMargin { left: number, top: number, right: number, bottom: number };
export interface IPoint { x: number, y: number };
export interface IArea { width: number, height: number };
export interface IRect extends IPoint, IArea { };

export type ArrayPoint = [number, number];

export class Margin implements IMargin {
    private readonly onChanged = new events.LiteEvent<IMargin>();
    public get Changed(): events.ILiteEvent<IMargin> { return this.onChanged; }

    private _left: number = 0;
    public get left(): number {
        return this._left;
    }
    public set left(value: number) {
        if (this._left === value)
            return;

        this._left = value;
        this.onChanged.trigger(this);
    }

    private _top: number = 0;
    public get top(): number {
        return this._top;
    }
    public set top(value: number) {
        if (this._top === value)
            return;

        this._top = value;
        this.onChanged.trigger(this);
    }

    private _right: number = 0;
    public get right(): number {
        return this._right;
    }
    public set right(value: number) {
        if (this._right === value)
            return;

        this._right = value;
        this.onChanged.trigger(this);
    }

    private _bottom: number = 0;
    public get bottom(): number {
        return this._bottom;
    }
    public set bottom(value: number) {
        if (this._bottom === value)
            return;

        this._bottom = value;
        this.onChanged.trigger(this);
    }
}

export class Area implements IArea {
    private readonly onChanged = new events.LiteEvent<IArea>();
    public get Changed(): events.ILiteEvent<IArea> { return this.onChanged; }

    constructor(width?: number, height?: number) {
        if (typeof(width) !== "undefined")
            this.width = width;
        if (typeof (height) !== "undefined")
            this.height = height;
    }

    private _width: number = 0;
    public get width(): number {
        return this._width;
    }
    public set width(value: number) {
        if (this._width === value)
            return;

        this._width = value;
        this.onChanged.trigger(this);
    }

    private _height: number = 0;
    public get height(): number {
        return this._height;
    }
    public set height(value: number) {
        if (this._height === value)
            return;

        this._height = value;
        this.onChanged.trigger(this);
    }
}